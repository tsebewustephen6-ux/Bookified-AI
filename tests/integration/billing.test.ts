import {
  beforeAll,
  beforeEach,
  afterAll,
  afterEach,
  describe,
  it,
  expect,
  vi,
} from "vitest";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import mongoose from "mongoose";
import { connect } from "../../database/connection";
import { Payment, Rate } from "../../database/models";
import {
  createCheckout,
  verifyPayment,
  paidEntitlement,
  nextBillingMonth,
} from "../../lib/billing";
import { paymentCatalog } from "../../lib/hubtel";
import { consumePaymentMessage } from "../../lib/payment-worker";
import { dispatchPayment, paymentSignature } from "../../lib/payment-dispatch";
import { POST as callback } from "../../app/api/billing/hubtel/callback/[reference]/route";
import { POST as checkoutRoute } from "../../app/api/billing/checkout/route";
const fixture = vi.hoisted(() => ({ owner: "reader", send: vi.fn() }));
vi.mock("@/lib/auth", () => ({ identity: async () => fixture.owner }));
vi.mock("@vercel/queue", () => ({ send: fixture.send }));
let repl: MongoMemoryReplSet;
beforeAll(async () => {
  repl = await MongoMemoryReplSet.create({
    replSet: { count: 1 },
    binary: { version: "8.2.3" },
  });
  process.env.MONGODB_URI = repl.getUri("billing_isolated");
  await connect();
  await Payment.createIndexes();
  await Rate.createIndexes();
});
beforeEach(() => {
  vi.stubEnv("APP_BASE_URL", "https://bookified.example");
  vi.stubEnv("HUBTEL_PAYMENTS_ENABLED", "true");
  vi.stubEnv("HUBTEL_STATUS_ACCESS_CONFIRMED", "true");
  vi.stubEnv("HUBTEL_CLIENT_ID", "isolated-client");
  vi.stubEnv("HUBTEL_CLIENT_SECRET", "isolated-secret");
  vi.stubEnv("HUBTEL_MERCHANT_ACCOUNT", "123456");
  vi.stubEnv("BILLING_STANDARD_AMOUNT_MINOR", "2500");
  vi.stubEnv("BILLING_PRO_AMOUNT_MINOR", "5000");
  vi.stubEnv(
    "BOOKIFIED_QUEUE_SECRET",
    "isolated-queue-secret-32bytes-test-only",
  );
  vi.stubEnv("VERCEL", "0");
  fixture.owner = "reader";
  fixture.send.mockReset().mockResolvedValue({ messageId: "fixture" });
});
afterEach(async () => {
  await Payment.deleteMany({});
  await Rate.deleteMany({});
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
afterAll(async () => {
  await mongoose.disconnect();
  await repl.stop();
});
const input = (plan: "standard" | "pro" = "standard") => ({
  plan,
  idempotencyKey: crypto.randomUUID(),
});
function initiate() {
  const fetcher = vi.fn(async (_url: string, init?: RequestInit) => {
    const sent = JSON.parse(String(init?.body));
    return Response.json({
      responseCode: "0000",
      data: {
        checkoutUrl: "https://pay.hubtel.com/checkout/fixture",
        checkoutId: "isolated-checkout",
        clientReference: sent.clientReference,
      },
    });
  });
  vi.stubGlobal("fetch", fetcher);
  return fetcher;
}
function status(reference: string, state = "Paid", overrides = {}) {
  const fetcher = vi.fn(async () =>
    Response.json({
      responseCode: "0000",
      data: {
        clientReference: reference,
        status: state,
        amount: 25,
        currencyCode: "GHS",
        transactionId: "txn-" + reference,
        ...overrides,
      },
    }),
  );
  vi.stubGlobal("fetch", fetcher);
  return fetcher;
}
describe("Hubtel payment authority", () => {
  it("stays disabled without explicit approval and never creates a charge", async () => {
    const fetcher = initiate();
    vi.stubEnv("HUBTEL_PAYMENTS_ENABLED", "false");
    expect(paymentCatalog().available).toBe(false);
    await expect(createCheckout("reader", input())).rejects.toMatchObject({
      status: 503,
    });
    vi.stubEnv("HUBTEL_PAYMENTS_ENABLED", "true");
    vi.stubEnv("HUBTEL_STATUS_ACCESS_CONFIRMED", "false");
    await expect(createCheckout("reader", input())).rejects.toMatchObject({
      status: 503,
    });
    expect(fetcher).not.toHaveBeenCalled();
    expect(await Payment.countDocuments()).toBe(0);
  });
  it("binds prices on the server and rejects client price overrides", async () => {
    const fetcher = initiate();
    await expect(
      createCheckout("reader", { ...input(), amountMinor: 1 }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
    const result = await createCheckout("reader", input());
    expect(result.amountMinor).toBe(2500);
    const sent = JSON.parse(String(fetcher.mock.calls[0][1]?.body));
    expect(sent.totalAmount).toBe(25);
    expect(sent.merchantAccountNumber).toBe("123456");
    expect(sent.clientReference).toMatch(/^[a-f0-9]{32}$/);
    expect(JSON.stringify(result)).not.toContain("isolated-secret");
    expect(await paidEntitlement("reader")).toBe("free");
  });
  it("admits one provider request for simultaneous retries and blocks a second open order", async () => {
    const fetcher = initiate();
    const body = input();
    const results = await Promise.all([
      createCheckout("reader", body),
      createCheckout("reader", body),
    ]);
    expect(results[0].reference).toBe(results[1].reference);
    expect(fetcher).toHaveBeenCalledTimes(1);
    await expect(createCheckout("reader", input("pro"))).rejects.toMatchObject({
      status: 409,
    });
    expect(await Payment.countDocuments()).toBe(1);
  });
  it("retains ambiguous initiation without recharging, but permits a fresh key after definitive rejection", async () => {
    const fetcher = vi.fn(async () => new Response("", { status: 500 }));
    vi.stubGlobal("fetch", fetcher);
    const body = input();
    const first = await createCheckout("reader", body);
    expect(first.status).toBe("pending");
    expect(first.checkoutUrl).toBeUndefined();
    await createCheckout("reader", body);
    expect(fetcher).toHaveBeenCalledTimes(1);
    await expect(createCheckout("reader", input())).rejects.toMatchObject({
      status: 409,
    });
    await Payment.deleteMany({});
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("", { status: 401 })),
    );
    expect((await createCheckout("reader", input())).status).toBe("failed");
    initiate();
    expect((await createCheckout("reader", input())).status).toBe("pending");
  });
  it("rejects cross-origin checkout and foreign-owner status before provider access", async () => {
    const fetcher = initiate();
    const response = await checkoutRoute(
      new Request("https://bookified.example/api/billing/checkout", {
        method: "POST",
        headers: { origin: "https://foreign.example" },
        body: JSON.stringify(input()),
      }),
    );
    expect(response.status).toBe(403);
    expect(fetcher).not.toHaveBeenCalled();
    const order = await createCheckout("reader", input());
    const lookup = status(order.reference);
    await expect(
      verifyPayment(order.reference, "foreign"),
    ).rejects.toMatchObject({ status: 404 });
    expect(lookup).not.toHaveBeenCalled();
  });
  it("treats a forged paid callback as a wake-up and does not trust its body", async () => {
    initiate();
    const order = await createCheckout("reader", input());
    status(order.reference, "Unpaid");
    const response = await callback(
      new Request("https://bookified.example/callback", {
        method: "POST",
        body: JSON.stringify({ status: "Paid", amount: 25, plan: "pro" }),
      }),
      { params: Promise.resolve({ reference: order.reference }) },
    );
    expect(response.status).toBe(200);
    expect(await paidEntitlement("reader")).toBe("free");
    const unknown = await callback(
      new Request("https://bookified.example/callback", {
        method: "POST",
        body: "{}",
      }),
      { params: Promise.resolve({ reference: "b".repeat(32) }) },
    );
    expect(unknown.status).toBe(404);
    expect(await Rate.countDocuments()).toBe(1);
  });
  it("rejects reference, amount, currency and transaction substitution", async () => {
    initiate();
    const order = await createCheckout("reader", input());
    for (const replacement of [
      { amount: 0.01 },
      { currencyCode: "USD" },
      { clientReference: "foreign" },
    ]) {
      status(order.reference, "Paid", replacement);
      await expect(
        verifyPayment(order.reference, "reader"),
      ).rejects.toMatchObject({ status: 403 });
      expect(await paidEntitlement("reader")).toBe("free");
    }
    status(order.reference);
    await verifyPayment(order.reference);
    status(order.reference, "Refunded", { transactionId: "different" });
    await expect(verifyPayment(order.reference)).rejects.toMatchObject({
      status: 403,
    });
  });
  it("grants once under concurrent verification, extends a renewal, then revokes refunds and expires", async () => {
    initiate();
    const order = await createCheckout("reader", input());
    const fetcher = status(order.reference);
    const [first, duplicate] = await Promise.all([
      verifyPayment(order.reference),
      verifyPayment(order.reference),
    ]);
    expect(first.periodEnd).toBe(duplicate.periodEnd);
    expect(await paidEntitlement("reader")).toBe("standard");
    expect(fetcher).toHaveBeenCalledWith(
      "https://api-txnstatus.hubtel.com/transactions/123456/status?clientReference=" +
        order.reference,
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization:
            "Basic " +
            Buffer.from("isolated-client:isolated-secret").toString("base64"),
        }),
        redirect: "error",
        cache: "no-store",
      }),
    );
    initiate();
    await expect(createCheckout("reader", input("pro"))).rejects.toMatchObject({
      status: 409,
    });
    const renewal = await createCheckout("reader", input());
    status(renewal.reference);
    const renewed = await verifyPayment(renewal.reference);
    const stored = await Payment.findOne({ reference: renewal.reference });
    expect(stored?.periodStart?.toISOString()).toBe(first.periodEnd);
    expect(renewed.periodEnd).toBe(
      nextBillingMonth(new Date(first.periodEnd!)).toISOString(),
    );
    expect(await paidEntitlement("reader", new Date(renewed.periodEnd!))).toBe(
      "free",
    );
    status(order.reference, "Refunded");
    await verifyPayment(order.reference);
    // Future renewal does not grant early access after the current period is refunded.
    expect(await paidEntitlement("reader")).toBe("free");
  });
  it("does not grant access during a provider or IP-whitelist failure", async () => {
    initiate();
    const order = await createCheckout("reader", input());
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("", { status: 403 })),
    );
    await expect(verifyPayment(order.reference)).rejects.toMatchObject({
      status: 503,
    });
    expect(await paidEntitlement("reader")).toBe("free");
    expect(
      (await Payment.findOne({ reference: order.reference }))?.status,
    ).toBe("pending");
  });
  it("reconciles signed delayed queue deliveries and rejects forged messages", async () => {
    initiate();
    const order = await createCheckout("reader", input());
    vi.stubEnv("VERCEL", "1");
    await dispatchPayment(order.reference);
    expect(fixture.send).toHaveBeenCalledWith(
      "bookified-payments",
      {
        reference: order.reference,
        signature: paymentSignature(order.reference),
      },
      expect.objectContaining({ delaySeconds: 300, retentionSeconds: 86400 }),
    );
    const fetcher = status(order.reference, "Unpaid");
    await expect(
      consumePaymentMessage({
        reference: order.reference,
        signature: "a".repeat(64),
      }),
    ).rejects.toThrow("Invalid payment message");
    expect(fetcher).not.toHaveBeenCalled();
    const message = {
      reference: order.reference,
      signature: paymentSignature(order.reference),
    };
    await expect(consumePaymentMessage(message)).rejects.toThrow(
      "Payment is pending",
    );
    status(order.reference);
    await consumePaymentMessage(message);
    await consumePaymentMessage(message);
    expect(await paidEntitlement("reader")).toBe("standard");
  });
  it("clamps calendar-month expiry without skipping February", () => {
    expect(
      nextBillingMonth(new Date("2027-01-31T12:30:00Z")).toISOString(),
    ).toBe("2027-02-28T12:30:00.000Z");
    expect(
      nextBillingMonth(new Date("2028-01-31T12:30:00Z")).toISOString(),
    ).toBe("2028-02-29T12:30:00.000Z");
  });
});
