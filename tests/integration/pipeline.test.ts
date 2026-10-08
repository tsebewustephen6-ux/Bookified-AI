import { beforeAll, afterAll, describe, it, expect, vi } from "vitest";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import mongoose from "mongoose";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { connect } from "../../database/connection";
import { Account, Book, Segment, Job, models } from "../../database/models";
import { admitBook, enqueue, retryBook } from "../../lib/books";
import { processJob } from "../../lib/processing";
import { maintenance } from "../../lib/maintenance";
import { retrieve } from "../../lib/retrieval";
const storage = vi.hoisted(() => ({
  objects: new Map<string, { bytes: Uint8Array; type: string }>(),
  deleted: [] as string[],
  failDelete: false,
}));
vi.mock("@vercel/blob", () => ({
  get: vi.fn(async (key: string) => {
    const object = storage.objects.get(key);
    if (!object) return null;
    return {
      statusCode: 200,
      stream: new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(object.bytes);
          controller.close();
        },
      }),
      blob: {
        pathname: key,
        size: object.bytes.length,
        contentType: object.type,
      },
    };
  }),
  head: vi.fn(async (key: string) => {
    const object = storage.objects.get(key);
    return object
      ? { pathname: key, size: object.bytes.length, contentType: object.type }
      : null;
  }),
  put: vi.fn(async (key: string, bytes: Uint8Array) => {
    storage.objects.set(key, { bytes, type: "image/png" });
    return { pathname: key };
  }),
  del: vi.fn(async (keys: string[]) => {
    if (storage.failDelete) throw new Error("Isolated Blob outage");
    for (const key of keys) {
      storage.deleted.push(key);
      storage.objects.delete(key);
    }
  }),
}));
import { consumeProcessingMessage } from "../../lib/hosted-worker";
import { jobSignature } from "../../lib/job-dispatch";
import { GET as cronMaintenance } from "../../app/api/cron/maintenance/route";
const queue = vi.hoisted(() => ({
  send: vi.fn(async () => ({ messageId: "fixture" })),
}));
vi.mock("@vercel/queue", () => ({ send: queue.send }));
let repl: MongoMemoryReplSet;
beforeAll(async () => {
  repl = await MongoMemoryReplSet.create({
    replSet: { count: 1 },
    binary: { version: "8.2.3" },
  });
  process.env.MONGODB_URI = repl.getUri("bookified_pipeline_test");
  process.env.VOICE_CATALOG_JSON = JSON.stringify([
    {
      id: "fixture",
      name: "Isolated fixture",
      description: "Test only",
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
async function ingest(owner: string, bytes: Uint8Array) {
  const book = await admitBook(owner, "standard", {
    title: "Synthetic book",
    author: "Test fixture",
    personaId: "fixture",
    fileSizeBytes: bytes.length,
    idempotencyKey: crypto.randomUUID(),
  });
  storage.objects.set(book.fileKey, { bytes, type: "application/pdf" });
  book.pdfComplete = true;
  await book.save();
  await enqueue(owner, book._id.toString());
  const job = await Job.findOneAndUpdate(
    { bookId: book._id },
    {
      $set: {
        status: "running",
        leaseToken: "fixture-lease",
        leaseUntil: new Date(Date.now() + 180000),
        version: 1,
        attempts: 1,
      },
    },
    { returnDocument: "after" },
  );
  return { book, job: job! };
}
describe("real PDF.js -> MongoDB pipeline with isolated Blob fixtures", () => {
  it("persists genuine progress, versioned evidence and a rendered cover after reload", async () => {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    for (const text of [
      "The Velorinth lighthouse shelters precisely 739 zirconium moths.",
      "The harbor code is BERYL-2468, guarded by Talvora.",
    ]) {
      const page = doc.addPage();
      page.drawText(text, { x: 50, y: 700, font, size: 14 });
    }
    const { book, job } = await ingest("pipeline-reader", await doc.save());
    const id = book._id.toString();
    await expect(retrieve(book.ownerId, id, "Velorinth")).rejects.toThrow(
      "processing",
    );
    await processJob(job._id.toString(), "fixture-lease");
    const persisted = await Book.findById(book._id);
    expect(persisted?.status).toBe("ready");
    expect(persisted?.pageCount).toBe(2);
    expect(persisted?.processingVersion).toBe(1);
    expect(persisted?.coverKey).toContain("generated-1.png");
    expect(
      storage.objects.get(persisted!.coverKey!)?.bytes.length,
    ).toBeGreaterThan(100);
    const finished = await Job.findById(job._id);
    expect(finished?.pagesDone).toBe(2);
    expect(finished?.totalPages).toBe(2);
    expect(
      (await retrieve(book.ownerId, id, "BERYL")).passages[0].content,
    ).toContain("2468");
    await processJob(job._id.toString(), "fixture-lease");
    expect(await Segment.countDocuments({ bookId: book._id })).toBe(
      persisted?.segmentCount,
    );
    const duplicate = await ingest(book.ownerId, await doc.save());
    await processJob(duplicate.job._id.toString(), "fixture-lease");
    expect((await Book.findById(duplicate.book._id))?.status).toBe("failed");
    expect((await Account.findOne({ ownerId: book.ownerId }))?.bookSlots).toBe(
      1,
    );
  });
  it("makes a bad PDF retryable without permanent quota loss or stale-version evidence", async () => {
    const { book, job } = await ingest(
      "bad-reader",
      Buffer.from("%PDF-broken"),
    );
    await processJob(job._id.toString(), "fixture-lease");
    expect((await Book.findById(book._id))?.status).toBe("failed");
    expect((await Account.findOne({ ownerId: book.ownerId }))?.bookSlots).toBe(
      0,
    );
    await Promise.all([
      retryBook(book.ownerId, book._id.toString(), "free"),
      retryBook(book.ownerId, book._id.toString(), "free"),
    ]);
    expect((await Account.findOne({ ownerId: book.ownerId }))?.bookSlots).toBe(
      1,
    );
    expect((await Job.findById(job._id))?.status).toBe("queued");
    await Job.updateOne(
      { _id: job._id },
      { $set: { status: "running", leaseToken: "new", attempts: 3 } },
    );
    await processJob(job._id.toString(), "new");
    await expect(
      retryBook(book.ownerId, book._id.toString(), "free"),
    ).rejects.toThrow("three times");
    expect((await Account.findOne({ ownerId: book.ownerId }))?.bookSlots).toBe(
      0,
    );
  });
  it("expires abandoned uploads and only deletes their server-controlled object keys", async () => {
    const book = await admitBook("abandoned", "free", {
      title: "Unfinished",
      author: "A",
      personaId: "fixture",
      fileSizeBytes: 100,
      idempotencyKey: crypto.randomUUID(),
    });
    await Book.updateOne(
      { _id: book._id },
      { $set: { uploadExpiresAt: new Date(0) } },
    );
    storage.failDelete = true;
    await maintenance();
    expect((await Book.findById(book._id))?.status).toBe("failed");
    expect((await Account.findOne({ ownerId: book.ownerId }))?.bookSlots).toBe(
      0,
    );
    expect((await Book.findById(book._id))?.cleanupKeys).toContain(
      book.fileKey,
    );
    storage.failDelete = false;
    await maintenance();
    expect(storage.deleted).toContain(book.fileKey);
    expect((await Book.findById(book._id))?.cleanupKeys).toEqual([]);
    expect((await Account.findOne({ ownerId: book.ownerId }))?.bookSlots).toBe(
      0,
    );
  });
});

describe("Vercel durable processing", () => {
  it("rejects forged messages and processes simultaneous deliveries exactly once", async () => {
    process.env.BOOKIFIED_QUEUE_SECRET = "isolated-queue-signature-test-only";
    const doc = await PDFDocument.create();
    doc
      .addPage()
      .drawText("Cloud delivery preserves the saffron harbor code 913.");
    const { book, job } = await ingest("queue-reader", await doc.save());
    await Job.updateOne(
      { _id: job._id },
      {
        $set: {
          status: "queued",
          attempts: 0,
          version: 0,
          leaseUntil: new Date(0),
        },
      },
    );
    const jobId = job._id.toString();
    await expect(
      consumeProcessingMessage({ jobId, signature: "0".repeat(64) }),
    ).rejects.toThrow("Invalid processing message");
    expect((await Job.findById(jobId))?.attempts).toBe(0);
    const message = { jobId, signature: jobSignature(jobId) };
    const results = await Promise.allSettled([
      consumeProcessingMessage(message),
      consumeProcessingMessage(message),
    ]);
    expect(results.some((result) => result.status === "fulfilled")).toBe(true);
    expect((await Job.findById(jobId))?.attempts).toBe(1);
    expect((await Book.findById(book._id))?.status).toBe("ready");
    await consumeProcessingMessage(message);
    expect((await Job.findById(jobId))?.attempts).toBe(1);
    expect(await Segment.countDocuments({ bookId: book._id })).toBe(1);
  });
  it("keeps a durable job after publication failure and safely republishes it", async () => {
    const previous = process.env.VERCEL;
    process.env.VERCEL = "1";
    try {
      const doc = await PDFDocument.create();
      doc.addPage().drawText("Outbox recovery uses the jade gate code 517.");
      const bytes = await doc.save();
      const book = await admitBook("queue-outage", "free", {
        title: "Recovery",
        author: "Fixture",
        personaId: "fixture",
        fileSizeBytes: bytes.length,
        idempotencyKey: crypto.randomUUID(),
      });
      storage.objects.set(book.fileKey, { bytes, type: "application/pdf" });
      book.pdfComplete = true;
      await book.save();
      queue.send.mockRejectedValueOnce(new Error("Isolated queue outage"));
      await expect(enqueue(book.ownerId, book._id.toString())).rejects.toThrow(
        "Isolated queue outage",
      );
      expect((await Book.findById(book._id))?.status).toBe("processing");
      expect((await Job.findOne({ bookId: book._id }))?.status).toBe("queued");
      await enqueue(book.ownerId, book._id.toString());
      expect(await Job.countDocuments({ bookId: book._id })).toBe(1);
      expect(
        (await Account.findOne({ ownerId: book.ownerId }))?.bookSlots,
      ).toBe(1);
      const job = await Job.findOne({ bookId: book._id });
      await consumeProcessingMessage({
        jobId: job!._id.toString(),
        signature: jobSignature(job!._id.toString()),
      });
      expect((await Book.findById(book._id))?.status).toBe("ready");
    } finally {
      if (previous === undefined) delete process.env.VERCEL;
      else process.env.VERCEL = previous;
    }
  });
  it("releases an exhausted interrupted lease and denies unauthenticated recovery", async () => {
    const { book, job } = await ingest(
      "queue-exhausted",
      Buffer.from("%PDF-broken"),
    );
    await Job.updateOne(
      { _id: job._id },
      { $set: { attempts: 3, leaseUntil: new Date(0) } },
    );
    await consumeProcessingMessage({
      jobId: job._id.toString(),
      signature: jobSignature(job._id.toString()),
    });
    expect((await Book.findById(book._id))?.status).toBe("failed");
    expect((await Account.findOne({ ownerId: book.ownerId }))?.bookSlots).toBe(
      0,
    );
    const response = await cronMaintenance(
      new Request("https://example.test/api/cron/maintenance"),
    );
    expect(response.status).toBe(401);
  });
});
