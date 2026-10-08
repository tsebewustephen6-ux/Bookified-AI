import { createHmac } from "node:crypto";
import { z } from "zod";
import {
  beforeAll,
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
import {
  Account,
  Book,
  Segment,
  VoiceSession,
  Usage,
  Job,
  models,
} from "../../database/models";
import { admitBook, ownedBook, retryBook, library } from "../../lib/books";
import { reserveSession, accountSession } from "../../lib/sessions";
import { retrieve } from "../../lib/retrieval";
import { failJob } from "../../lib/processing";
import {
  createCall,
  webhookSession,
  recoverCall,
  stopCall,
} from "../../lib/vapi";
import { GET as processingStatus } from "../../app/api/books/[id]/processing/route";
import { POST as retryRoute } from "../../app/api/books/[id]/retry/route";
import { POST as confirmRoute } from "../../app/api/books/[id]/confirm/route";
import { GET as coverRoute } from "../../app/api/books/[id]/cover/route";
import {
  GET as sessionStatus,
  POST as sessionStop,
} from "../../app/api/sessions/[id]/route";
import { POST as admissionRoute } from "../../app/api/books/[id]/sessions/route";
import { POST as bookAdmissionRoute } from "../../app/api/books/route";
import { POST as toolRoute } from "../../app/api/vapi/search-book/route";
import { POST as eventsRoute } from "../../app/api/vapi/events/route";
import { POST as uploadRoute } from "../../app/api/upload/route";
import { utcPeriod } from "../../lib/plans";
import { AppError } from "../../lib/errors";
const browser = vi.hoisted(() => ({
  owner: "foreign",
  plan: "free",
  entitlementError: false,
}));
vi.mock("@/lib/auth", () => ({
  identity: async () => browser.owner,
  entitlement: async () => {
    if (browser.entitlementError)
      throw new AppError(
        "PROVIDER_UNAVAILABLE",
        "Entitlement service is unavailable.",
        503,
      );
    return browser.plan;
  },
}));
afterEach(() => {
  vi.unstubAllGlobals();
  browser.entitlementError = false;
  browser.owner = "foreign";
  browser.plan = "free";
});
function configureVapi() {
  process.env.BLOB_READ_WRITE_TOKEN = "vercel_blob_rw_isolatedfixture_testonly";
  process.env.VAPI_PRIVATE_KEY = "isolated-test-only";
  process.env.VAPI_ASSISTANT_ID = "7041a72a-0ff1-49c3-b6f1-7a7896315984";
  process.env.VAPI_MODEL_ID = "gpt-4.1-mini";
  process.env.VAPI_WEBHOOK_SECRET = "isolated-webhook-fixture-secret-32bytes";
  process.env.APP_BASE_URL = "https://bookified.example";
}
function request(path: string, data?: unknown) {
  return new Request(`https://bookified.example${path}`, {
    method: "POST",
    headers: {
      origin: "https://bookified.example",
      "Content-Type": "application/json",
    },
    body: data === undefined ? undefined : JSON.stringify(data),
  });
}
function providerRequest(
  path: string,
  data: unknown,
  capability: string,
  authorized = true,
) {
  return new Request(`https://bookified.example${path}`, {
    method: "POST",
    headers: {
      Authorization: authorized
        ? `Bearer ${process.env.VAPI_WEBHOOK_SECRET}`
        : "Bearer forged",
      "x-bookified-capability": capability,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  });
}
let repl: MongoMemoryReplSet;
beforeAll(async () => {
  repl = await MongoMemoryReplSet.create({
    replSet: { count: 1 },
    binary: { version: "8.2.3" },
  });
  process.env.MONGODB_URI = repl.getUri("bookified_test");
  process.env.VOICE_CATALOG_JSON = JSON.stringify([
    {
      id: "fixture",
      name: "Test fixture only",
      description: "Isolated test",
      provider: "openai",
      voiceId: "fixture-only",
    },
  ]);
  await connect();
  for (const model of models) await model.createIndexes();
});
afterAll(async () => {
  await mongoose.disconnect();
  await repl?.stop();
});
async function admit(
  owner: string,
  plan: "free" | "standard" | "pro" = "free",
) {
  return admitBook(owner, plan, {
    title: "Same title",
    author: "Test Author",
    personaId: "fixture",
    fileSizeBytes: 100,
    idempotencyKey: crypto.randomUUID(),
  });
}
async function ready(owner: string) {
  const book = await admit(owner, "standard");
  book.status = "ready";
  book.processingVersion = 1;
  book.segmentCount = 1;
  book.pageCount = 3;
  await book.save();
  await Segment.create({
    ownerId: owner,
    bookId: book._id,
    processingVersion: 1,
    segmentIndex: 0,
    pageStart: 2,
    pageEnd: 2,
    content:
      "The ultramarine lantern contains precisely 739 zirconium moths. AI remembers the codename Velorinth.",
    wordCount: 16,
  });
  return book;
}
describe("real MongoDB transactions and scoped text index", () => {
  it("rejects an unconfigured persona before taking a slot", async () => {
    await expect(
      admitBook("unconfigured", "free", {
        title: "T",
        author: "A",
        personaId: "invented",
        fileSizeBytes: 100,
        idempotencyKey: crypto.randomUUID(),
      }),
    ).rejects.toThrow("available voice");
    expect(await Account.findOne({ ownerId: "unconfigured" })).toBeNull();
  });
  it("admits only one concurrent free book and allows same titles across owners", async () => {
    const results = await Promise.allSettled(
      Array.from({ length: 8 }, () => admit("concurrent")),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await Book.countDocuments({ ownerId: "concurrent" })).toBe(1);
    const a = await admit("owner-a");
    const b = await admit("owner-b");
    expect(a.title).toBe(b.title);
    expect(a.slug).not.toBe(b.slug);
    await expect(ownedBook("owner-a", b._id.toString())).rejects.toThrow(
      "not found",
    );
    expect((await library("owner-a", "same")).total).toBe(1);
  });
  it("keeps retrieval within owner, book and completed version", async () => {
    const book = await ready("retriever");
    await Segment.create({
      ownerId: "retriever",
      bookId: book._id,
      processingVersion: 2,
      segmentIndex: 0,
      pageStart: 99,
      pageEnd: 99,
      content: "Velorinth is actually a foreign fabricated secret.",
      wordCount: 8,
    });
    const result = await retrieve(
      "retriever",
      book._id.toString(),
      "Velorinth",
    );
    expect(result.passages).toHaveLength(1);
    expect(result.passages[0].pageStart).toBe(2);
    expect(result.passages[0].content).toContain("739");
    expect(
      (await retrieve("retriever", book._id.toString(), "AI")).evidence,
    ).toBe(true);
    expect(
      (await retrieve("retriever", book._id.toString(), ".*[]")).evidence,
    ).toBe(false);
    expect(
      (await retrieve("retriever", book._id.toString(), "unfindabletaxonomyz"))
        .evidence,
    ).toBe(false);
    await expect(
      retrieve("foreign", book._id.toString(), "Velorinth"),
    ).rejects.toThrow("not found");
  });
  it("enforces one call at a time, idempotence, monthly quotas and early-stop accounting", async () => {
    const book = await ready("speaker");
    const id = book._id.toString();
    const starts = await Promise.allSettled(
      Array.from({ length: 6 }, () =>
        reserveSession("speaker", id, "free", crypto.randomUUID()),
      ),
    );
    const successful = starts.filter(
      (
        r,
      ): r is PromiseFulfilledResult<
        Awaited<ReturnType<typeof reserveSession>>
      > => r.status === "fulfilled",
    );
    expect(successful).toHaveLength(1);
    const first = successful[0].value;
    expect(
      (
        await reserveSession("speaker", id, "free", first.idempotencyKey)
      )._id.toString(),
    ).toBe(first._id.toString());
    const start = new Date();
    const end = new Date(start.getTime() + 1000);
    await Promise.all([
      accountSession(first._id.toString(), start, end),
      accountSession(first._id.toString(), start, end),
    ]);
    const usage = await Usage.findOne({ ownerId: "speaker" });
    expect(usage?.connected).toBe(1);
    expect(usage?.reserved).toBe(0);
    for (let i = 0; i < 4; i++) {
      const s = await reserveSession(
        "speaker",
        id,
        "free",
        crypto.randomUUID(),
      );
      await accountSession(s._id.toString(), start, end);
    }
    await expect(
      reserveSession("speaker", id, "free", crypto.randomUUID()),
    ).rejects.toThrow("monthly");
    const upgraded = await reserveSession(
      "speaker",
      id,
      "standard",
      crypto.randomUUID(),
    );
    expect(upgraded.maxDurationSeconds).toBe(900);
    await accountSession(upgraded._id.toString(), undefined, end);
    expect((await Usage.findOne({ ownerId: "speaker" }))?.reserved).toBe(0);
    expect(
      (await Account.findOne({ ownerId: "speaker" }))?.activeSessionId,
    ).toBeNull();
  });
  it("processing failures release slots and retry under a protected lease", async () => {
    const book = await admit("failed-job");
    book.status = "processing";
    book.pdfComplete = true;
    await book.save();
    const job = await Job.create({
      bookId: book._id,
      ownerId: book.ownerId,
      status: "running",
      leaseToken: "lease",
      attempts: 1,
      version: 1,
    });
    await failJob(job._id.toString(), "wrong-token", "ignored");
    expect((await Book.findById(book._id))?.status).toBe("processing");
    await failJob(job._id.toString(), "lease", "bad PDF");
    expect((await Account.findOne({ ownerId: book.ownerId }))?.bookSlots).toBe(
      0,
    );
    await retryBook(book.ownerId, book._id.toString(), "free");
    expect((await Book.findById(book._id))?.status).toBe("processing");
    expect((await Account.findOne({ ownerId: book.ownerId }))?.bookSlots).toBe(
      1,
    );
  });
  it("unique segment indexes reject duplicate writes", async () => {
    const book = await ready("segments");
    const segment = await Segment.findOne({ bookId: book._id });
    await expect(
      Segment.create({
        ownerId: book.ownerId,
        bookId: book._id,
        processingVersion: 1,
        segmentIndex: 0,
        pageStart: 1,
        pageEnd: 1,
        content: "duplicate",
        wordCount: 1,
      }),
    ).rejects.toThrow();
    expect(segment?.content).toContain("739");
    expect(
      await VoiceSession.countDocuments({
        status: "reserved",
        ownerId: "speaker",
      }),
    ).toBe(0);
  });
});
describe("provider fixtures with real admission and endpoint authorization", () => {
  it("rejects foreign books, sessions, object grants and all first-party entry points", async () => {
    configureVapi();
    const book = await ready("endpoint-owner");
    const id = book._id.toString();
    const params = { params: Promise.resolve({ id }) };
    for (const response of [
      await processingStatus(new Request("https://bookified.example"), params),
      await coverRoute(new Request("https://bookified.example"), params),
      await retryRoute(request("/retry"), params),
      await confirmRoute(request("/confirm"), params),
      await admissionRoute(
        request("/start", { idempotencyKey: crypto.randomUUID() }),
        params,
      ),
    ])
      expect(response.status).toBe(404);
    const session = await reserveSession(
      "endpoint-owner",
      id,
      "free",
      crypto.randomUUID(),
    );
    const sessionParams = {
      params: Promise.resolve({ id: session._id.toString() }),
    };
    expect(
      (
        await sessionStatus(
          new Request("https://bookified.example"),
          sessionParams,
        )
      ).status,
    ).toBe(404);
    expect((await sessionStop(request("/stop"), sessionParams)).status).toBe(
      404,
    );
    const upload = await uploadRoute(
      request("/api/upload", {
        type: "blob.generate-client-token",
        payload: {
          pathname: book.fileKey,
          clientPayload: JSON.stringify({ id, purpose: "pdf" }),
        },
      }),
    );
    expect(upload.status).toBe(404);
    expect(
      (
        await bookAdmissionRoute(
          new Request("https://bookified.example/api/books", {
            method: "POST",
            headers: { origin: "https://evil.example" },
            body: "{}",
          }),
        )
      ).status,
    ).toBe(403);
  });
  it("creates one server-capped call, protects tool IDs and reconciles repeated/out-of-order callbacks", async () => {
    configureVapi();
    const book = await ready("provider-owner");
    const record = await reserveSession(
      book.ownerId,
      book._id.toString(),
      "free",
      crypto.randomUUID(),
    );
    const sessionId = record._id.toString();
    const callId = crypto.randomUUID();
    let capability = "";
    let created = 0;
    const lifecycle: { started?: string; ended?: string } = {};
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url.includes("/assistant/"))
          return Response.json({
            id: process.env.VAPI_ASSISTANT_ID,
            orgId: "c4613cc0-3c78-4f55-b9d9-b75a09fd97f1",
          });
        if (url.endsWith("/call/web")) {
          created++;
          const headers = init?.headers as Record<string, string>;
          expect(headers.Origin).toBe("https://bookified.example");
          expect(headers.Authorization).not.toBe(
            "Bearer " + process.env.VAPI_PRIVATE_KEY,
          );
          const [header, claims, signature] =
            headers.Authorization.slice(7).split(".");
          expect(signature).toBe(
            createHmac("sha256", process.env.VAPI_PRIVATE_KEY!)
              .update(header + "." + claims)
              .digest("base64url"),
          );
          const token = JSON.parse(Buffer.from(claims, "base64url").toString());
          expect(token.exp - token.iat).toBe(60);
          expect(token.orgId).toBe("c4613cc0-3c78-4f55-b9d9-b75a09fd97f1");
          expect(token.token).toEqual({
            tag: "public",
            restrictions: {
              enabled: true,
              allowedOrigins: ["https://bookified.example"],
              allowedAssistantIds: [process.env.VAPI_ASSISTANT_ID],
              allowTransientAssistant: false,
            },
          });
          const payload: unknown = JSON.parse(String(init?.body));
          const parsed = z
            .object({
              assistantOverrides: z.object({
                maxDurationSeconds: z.number(),
                server: z.object({ headers: z.record(z.string(), z.string()) }),
              }),
            })
            .parse(payload);
          expect(parsed.assistantOverrides.maxDurationSeconds).toBe(300);
          capability =
            parsed.assistantOverrides.server.headers["x-bookified-capability"];
          return Response.json({
            id: callId,
            status: "queued",
            webCallUrl: "https://fixture.daily.co/private-join",
          });
        }
        return Response.json({
          id: callId,
          status: lifecycle.ended
            ? "ended"
            : lifecycle.started
              ? "in-progress"
              : "queued",
          startedAt: lifecycle.started,
          endedAt: lifecycle.ended,
          assistantOverrides: { metadata: { bookifiedSessionId: sessionId } },
        });
      }),
    );
    const admitted = await createCall(sessionId);
    expect(Object.keys(admitted).sort()).toEqual([
      "id",
      "maxDurationSeconds",
      "sessionId",
      "webCallUrl",
    ]);
    expect(JSON.stringify(admitted)).not.toContain(
      process.env.VAPI_PRIVATE_KEY,
    );
    await createCall(sessionId);
    expect(created).toBe(1);
    await expect(
      webhookSession(providerRequest("/api/vapi/events", {}, "wrong"), callId),
    ).rejects.toThrow("mismatched");
    await expect(
      webhookSession(
        providerRequest("/api/vapi/events", {}, capability, false),
        callId,
      ),
    ).rejects.toThrow("authentication");
    await expect(
      webhookSession(
        providerRequest("/api/vapi/events", {}, capability),
        crypto.randomUUID(),
      ),
    ).rejects.toThrow("Unknown");
    lifecycle.started = new Date().toISOString();
    const toolBody = {
      message: {
        type: "tool-calls",
        call: { id: callId },
        toolCallList: [
          {
            id: "tool-one",
            name: "search_book",
            parameters: { query: "Velorinth" },
          },
          {
            id: "tool-two",
            name: "search_book",
            parameters: {
              query: "Velorinth",
              bookId: new mongoose.Types.ObjectId().toString(),
            },
          },
        ],
      },
    };
    const result = await toolRoute(
      providerRequest("/api/vapi/search-book", toolBody, capability),
    );
    expect(result.status).toBe(200);
    const parsed: unknown = await result.json();
    const resultSchema = z.object({
      results: z.array(
        z.object({ toolCallId: z.string(), result: z.string() }),
      ),
    });
    const tools = resultSchema.parse(parsed).results;
    expect(tools.map((t) => t.toolCallId)).toEqual(["tool-one", "tool-two"]);
    expect(tools[0].result).toContain("739");
    expect(tools[1].result).toContain("UNAUTHORIZED");
    expect((await VoiceSession.findById(record._id))?.status).toBe("active");
    const nested = await toolRoute(
      providerRequest(
        "/api/vapi/search-book",
        {
          message: {
            type: "tool-calls",
            call: { id: callId },
            toolCallList: [
              {
                id: "nested-object",
                type: "function",
                function: {
                  name: "search_book",
                  arguments: { query: "Velorinth" },
                },
              },
              {
                id: "nested-json",
                type: "function",
                function: {
                  name: "search_book",
                  arguments: JSON.stringify({ query: "Velorinth" }),
                },
              },
              {
                id: "nested-invalid",
                type: "function",
                function: { name: "search_book", arguments: "{" },
              },
              {
                id: "nested-foreign",
                type: "function",
                function: {
                  name: "search_book",
                  arguments: {
                    query: "Velorinth",
                    bookId: new mongoose.Types.ObjectId().toString(),
                  },
                },
              },
            ],
          },
        },
        capability,
      ),
    );
    expect(nested.status).toBe(200);
    const nestedResults = resultSchema.parse(await nested.json()).results;
    expect(nestedResults.map((t) => t.toolCallId)).toEqual([
      "nested-object",
      "nested-json",
      "nested-invalid",
      "nested-foreign",
    ]);
    expect(nestedResults[0].result).toContain("739");
    expect(nestedResults[1].result).toContain("739");
    expect(nestedResults[2].result).toContain("VALIDATION");
    expect(nestedResults[3].result).toContain("UNAUTHORIZED");
    lifecycle.ended = new Date(Date.now() + 2000).toISOString();
    for (const type of [
      "end-of-call-report",
      "status-update",
      "end-of-call-report",
    ])
      expect(
        (
          await eventsRoute(
            providerRequest(
              "/api/vapi/events",
              { message: { type, call: { id: callId } } },
              capability,
            ),
          )
        ).status,
      ).toBe(200);
    expect((await Usage.findOne({ ownerId: book.ownerId }))?.connected).toBe(1);
    expect((await VoiceSession.findById(record._id))?.status).toBe("ended");
    expect(
      (
        await toolRoute(
          providerRequest("/api/vapi/search-book", toolBody, capability),
        )
      ).status,
    ).toBe(403);
  });
  it("confirms a concurrent browser disconnect after rejected stop control without hiding an active call", async () => {
    configureVapi();
    const book = await ready("stop-race-owner");
    const record = await reserveSession(
      book.ownerId,
      book._id.toString(),
      "free",
      crypto.randomUUID(),
    );
    record.providerCallId = crypto.randomUUID();
    await record.save();
    let ended = false;
    let disconnectOnControl = false;
    const startedAt = new Date().toISOString();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (String(url).includes("control.vapi.ai")) {
          ended = disconnectOnControl;
          return new Response(null, { status: 410 });
        }
        return Response.json({
          id: record.providerCallId,
          status: ended ? "ended" : "in-progress",
          startedAt,
          endedAt: ended
            ? new Date(Date.now() + 2000).toISOString()
            : undefined,
          monitor: { controlUrl: "https://control.vapi.ai/end" },
          assistantOverrides: {
            metadata: { bookifiedSessionId: record._id.toString() },
          },
        });
      }),
    );
    await expect(stopCall(record._id.toString())).rejects.toThrow(
      "stop is pending",
    );
    expect((await VoiceSession.findById(record._id))?.status).toBe("active");
    disconnectOnControl = true;
    await expect(stopCall(record._id.toString())).resolves.toBeUndefined();
    await expect(stopCall(record._id.toString())).resolves.toBeUndefined();
    expect((await VoiceSession.findById(record._id))?.status).toBe("ended");
    expect((await Usage.findOne({ ownerId: book.ownerId }))?.connected).toBe(1);
    expect((await Usage.findOne({ ownerId: book.ownerId }))?.reserved).toBe(0);
  });
  it("expires tool authorization and releases startup failure without counting it", async () => {
    configureVapi();
    const book = await ready("expiry-owner");
    const record = await reserveSession(
      book.ownerId,
      book._id.toString(),
      "free",
      crypto.randomUUID(),
    );
    record.providerCallId = crypto.randomUUID();
    record.capabilityHash = (await import("node:crypto"))
      .createHash("sha256")
      .update("cap")
      .digest("hex");
    record.expiresAt = new Date(0);
    await record.save();
    const response = await toolRoute(
      providerRequest(
        "/api/vapi/search-book",
        {
          message: {
            type: "tool-calls",
            call: { id: record.providerCallId },
            toolCallList: [
              {
                id: "expired",
                name: "search_book",
                parameters: { query: "AI" },
              },
            ],
          },
        },
        "cap",
      ),
    );
    expect(response.status).toBe(403);
    await accountSession(
      record._id.toString(),
      undefined,
      new Date(),
      "failed-to-connect",
    );
    expect((await Usage.findOne({ ownerId: book.ownerId }))?.connected).toBe(0);
    expect((await Usage.findOne({ ownerId: book.ownerId }))?.reserved).toBe(0);
  });

  it("refunds rejected web calls immediately, but retains ambiguous creation for reconciliation", async () => {
    configureVapi();
    for (const status of [401, 400, 503]) {
      const book = await ready("rejected-provider-" + status);
      const record = await reserveSession(
        book.ownerId,
        book._id.toString(),
        "free",
        crypto.randomUUID(),
      );
      vi.stubGlobal(
        "fetch",
        vi.fn(async (url: string) =>
          url.includes("/assistant/")
            ? Response.json({
                id: process.env.VAPI_ASSISTANT_ID,
                orgId: "c4613cc0-3c78-4f55-b9d9-b75a09fd97f1",
              })
            : Response.json({ message: "Isolated failure" }, { status }),
        ),
      );
      await expect(createCall(record._id.toString())).rejects.toMatchObject({
        code: status === 503 ? "PROVIDER_UNAVAILABLE" : "CALL_REJECTED",
      });
      const current = await VoiceSession.findById(record._id);
      const usage = await Usage.findOne({ ownerId: book.ownerId });
      expect(current?.status).toBe(status === 503 ? "reserved" : "failed");
      expect(usage?.reserved).toBe(status === 503 ? 1 : 0);
      expect(usage?.connected).toBe(0);
      if (status !== 503) {
        expect(
          (await Account.findOne({ ownerId: book.ownerId }))?.activeSessionId,
        ).toBeNull();
        await expect(
          reserveSession(
            book.ownerId,
            book._id.toString(),
            "free",
            crypto.randomUUID(),
          ),
        ).resolves.toBeDefined();
      }
    }
  });
  it("refunds unknown creation only after checking the provider, and retains reservations during outages", async () => {
    configureVapi();
    const book = await ready("recovery-owner");
    const record = await reserveSession(
      book.ownerId,
      book._id.toString(),
      "free",
      crypto.randomUUID(),
    );
    record.capabilityHash = "fixture-hash";
    await record.save();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("provider offline");
      }),
    );
    await expect(recoverCall(record._id.toString())).rejects.toThrow("offline");
    expect((await Usage.findOne({ ownerId: book.ownerId }))?.reserved).toBe(1);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json([])),
    );
    await recoverCall(record._id.toString());
    expect((await Usage.findOne({ ownerId: book.ownerId }))?.reserved).toBe(0);
  });
  it("enforces Standard boundary, Pro unlimited policy and downgrade read access", async () => {
    const book = await ready("tier-boundary");
    await Usage.updateOne(
      { ownerId: book.ownerId, periodStart: utcPeriod().start },
      { $set: { connected: 99, reserved: 0 } },
      { upsert: true },
    );
    const s = await reserveSession(
      book.ownerId,
      book._id.toString(),
      "standard",
      crypto.randomUUID(),
    );
    await accountSession(s._id.toString(), new Date(), new Date());
    await expect(
      reserveSession(
        book.ownerId,
        book._id.toString(),
        "standard",
        crypto.randomUUID(),
      ),
    ).rejects.toThrow("monthly");
    const pro = await reserveSession(
      book.ownerId,
      book._id.toString(),
      "pro",
      crypto.randomUUID(),
    );
    expect(pro.maxDurationSeconds).toBe(3600);
    await accountSession(pro._id.toString(), undefined, new Date());
    await Account.updateOne(
      { ownerId: book.ownerId },
      { $set: { bookSlots: 10 } },
    );
    await expect(
      admitBook(book.ownerId, "free", {
        title: "Blocked",
        author: "A",
        personaId: "fixture",
        fileSizeBytes: 100,
        idempotencyKey: crypto.randomUUID(),
      }),
    ).rejects.toThrow("limit");
    expect((await ownedBook(book.ownerId, book._id.toString())).status).toBe(
      "ready",
    );
  });
  it("blocks chargeable requests during entitlement outages before reserving or contacting providers", async () => {
    configureVapi();
    const book = await ready("entitlement-outage");
    browser.owner = book.ownerId;
    browser.entitlementError = true;
    const provider = vi.fn();
    vi.stubGlobal("fetch", provider);
    const result = await admissionRoute(
      new Request(`https://bookified.example/api/books/${book._id}/sessions`, {
        method: "POST",
        headers: { origin: "https://bookified.example" },
        body: JSON.stringify({ idempotencyKey: crypto.randomUUID() }),
      }),
      { params: Promise.resolve({ id: book._id.toString() }) },
    );
    expect(result.status).toBe(503);
    expect(provider).not.toHaveBeenCalled();
    expect(await VoiceSession.countDocuments({ ownerId: book.ownerId })).toBe(
      0,
    );
  });
});
