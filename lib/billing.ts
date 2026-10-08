import { randomBytes } from "node:crypto";
import mongoose from "mongoose";
import { z } from "zod";
import { connect } from "../database/connection";
import { Payment } from "../database/models";
import { AppError } from "./errors";
import { dispatchPayment } from "./payment-dispatch";
import {
  definitelyRejected,
  hubtelSettings,
  hubtelStatus,
  initiateHubtel,
  paidPlanSchema,
  type PaidPlan,
} from "./hubtel";

export const checkoutSchema = z
  .object({ plan: paidPlanSchema, idempotencyKey: z.string().uuid() })
  .strict();
const referenceSchema = z.string().regex(/^[a-f0-9]{32}$/);
export function nextBillingMonth(start: Date) {
  const end = new Date(start);
  end.setUTCDate(1);
  end.setUTCMonth(end.getUTCMonth() + 1);
  const days = new Date(
    Date.UTC(end.getUTCFullYear(), end.getUTCMonth() + 1, 0),
  ).getUTCDate();
  end.setUTCDate(Math.min(start.getUTCDate(), days));
  return end;
}
export async function paidEntitlement(ownerId: string, now = new Date()) {
  await connect();
  const records = await Payment.find({
    ownerId,
    status: "paid",
    periodStart: { $lte: now },
    periodEnd: { $gt: now },
  })
    .select("plan")
    .lean();
  return records.some((p) => p.plan === "pro")
    ? ("pro" as const)
    : records.some((p) => p.plan === "standard")
      ? ("standard" as const)
      : ("free" as const);
}
function dto(record: mongoose.InferSchemaType<typeof Payment.schema>) {
  return {
    reference: record.reference,
    plan: record.plan,
    status: record.status,
    currency: record.currency,
    amountMinor: record.amountMinor,
    checkoutUrl: record.checkoutUrl,
    periodEnd: record.periodEnd?.toISOString(),
  };
}
export async function createCheckout(ownerId: string, input: unknown) {
  const parsed = checkoutSchema.safeParse(input);
  if (!parsed.success)
    throw new AppError("VALIDATION", "Choose a plan and retry checkout.");
  const { plan, idempotencyKey } = parsed.data;
  const config = hubtelSettings();
  await connect();
  const existing = await Payment.findOne({ ownerId, idempotencyKey });
  if (existing) {
    if (existing.plan !== plan)
      throw new AppError(
        "CONFLICT",
        "This checkout belongs to a different plan.",
        409,
      );
    if (existing.open) await recoverPayment(existing.reference);
    return dto(existing);
  }
  const active = await paidEntitlement(ownerId);
  if (active !== "free" && active !== plan)
    throw new AppError(
      "CONFLICT",
      "Change plans after your current paid access ends.",
      409,
    );
  let record;
  try {
    record = await Payment.create({
      ownerId,
      reference: randomBytes(16).toString("hex"),
      idempotencyKey,
      plan,
      amountMinor: config.prices[plan],
      currency: "GHS",
      merchantAccount: config.merchantAccount,
    });
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === 11000) {
      const raced = await Payment.findOne({ ownerId, idempotencyKey });
      if (raced && raced.plan === plan) return dto(raced);
      throw new AppError(
        "CONFLICT",
        "A payment is already pending. Check its status before starting another.",
        409,
      );
    }
    throw error;
  }
  try {
    const checkout = await initiateHubtel(
      record.reference,
      plan,
      record.amountMinor,
    );
    await Payment.updateOne(
      { _id: record._id },
      {
        $set: {
          checkoutUrl: checkout.checkoutUrl,
          checkoutId: checkout.checkoutId,
        },
      },
    );
    record.checkoutUrl = checkout.checkoutUrl;
  } catch (error) {
    if (definitelyRejected(error)) {
      await Payment.updateOne(
        { _id: record._id, status: "pending" },
        { $set: { status: "failed", open: false } },
      );
      record.status = "failed";
    }
    // An ambiguous request may have succeeded. Preserve its reference and never
    // create another charge on a retry, even if the checkout URL was lost.
  }
  if (record.status === "pending") await recoverPayment(record.reference);
  return dto(record);
}
export async function recoverPayment(reference: string) {
  try {
    await dispatchPayment(reference);
  } catch {
    console.error("payment_dispatch_failed");
  }
}
export async function verifyPayment(reference: string, ownerId?: string) {
  if (!referenceSchema.safeParse(reference).success)
    throw new AppError("NOT_FOUND", "Payment not found.", 404);
  await connect();
  const record = await Payment.findOne({
    reference,
    ...(ownerId ? { ownerId } : {}),
  });
  if (!record) throw new AppError("NOT_FOUND", "Payment not found.", 404);
  if (record.status === "failed" || record.status === "refunded")
    return dto(record);
  const result = (await hubtelStatus(reference, record.merchantAccount)).data;
  if (
    result.clientReference !== reference ||
    (result.currencyCode != null && result.currencyCode !== "GHS") ||
    !Number.isFinite(result.amount) ||
    Math.abs(result.amount * 100 - record.amountMinor) > 0.001
  )
    throw new AppError(
      "UNAUTHORIZED",
      "Payment details could not be verified.",
      403,
    );
  if (result.status === "Unpaid") {
    await Payment.updateOne(
      { _id: record._id },
      { $set: { verifiedAt: new Date() } },
    );
    return dto(record);
  }
  if (!result.transactionId)
    throw new AppError(
      "PROVIDER_UNAVAILABLE",
      "Payment confirmation is incomplete.",
      503,
    );
  if (record.transactionId && record.transactionId !== result.transactionId)
    throw new AppError(
      "UNAUTHORIZED",
      "Payment details could not be verified.",
      403,
    );
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const fresh = await Payment.findById(record._id).session(session);
      if (!fresh || fresh.status === "refunded" || fresh.status === "failed")
        return;
      if (fresh.transactionId && fresh.transactionId !== result.transactionId)
        throw new AppError(
          "UNAUTHORIZED",
          "Payment details could not be verified.",
          403,
        );
      if (result.status === "Refunded") {
        fresh.status = "refunded";
        fresh.open = false;
        fresh.transactionId = result.transactionId;
      } else if (fresh.status !== "paid") {
        const now = new Date();
        const latest = await Payment.findOne({
          ownerId: fresh.ownerId,
          plan: fresh.plan,
          status: "paid",
          periodEnd: { $gt: now },
        })
          .sort({ periodEnd: -1 })
          .session(session);
        // Serialize concurrent renewals through the account's pending-payment
        // unique index and this transaction; repeated verification grants once.
        fresh.periodStart = latest?.periodEnd ?? now;
        fresh.periodEnd = nextBillingMonth(fresh.periodStart);
        fresh.status = "paid";
        fresh.open = false;
        fresh.transactionId = result.transactionId;
      }
      fresh.verifiedAt = new Date();
      await fresh.save({ session });
    });
  } finally {
    await session.endSession();
  }
  const updated = await Payment.findById(record._id);
  if (!updated) throw new AppError("NOT_FOUND", "Payment not found.", 404);
  return dto(updated);
}
export async function billingSummary(ownerId: string) {
  await connect();
  const pending = await Payment.findOne({ ownerId, open: true }).lean();
  const access = await Payment.findOne({
    ownerId,
    status: "paid",
    periodEnd: { $gt: new Date() },
  })
    .sort({ periodEnd: -1 })
    .lean();
  return {
    pending: pending ? dto(pending) : null,
    paidUntil: access?.periodEnd?.toISOString() ?? null,
  };
}
export type BillingSummary = Awaited<ReturnType<typeof billingSummary>>;
export type CheckoutDTO = Awaited<ReturnType<typeof createCheckout>>;
export type { PaidPlan };
