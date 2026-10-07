import { createHash } from "node:crypto";
import mongoose from "mongoose";
import { put } from "@vercel/blob";
import { Book, Segment, Job, Account } from "../database/models";
import { storedBytes, coverSignature } from "./storage";
import { PDF_LIMIT, COVER_LIMIT } from "./validation";
import { extractPdf } from "./pdf";
import { AppError } from "./errors";
export async function failJob(id: string, token: string, message: string) {
  await mongoose.connection.transaction(async (session) => {
    const job = await Job.findOne({
      _id: id,
      status: "running",
      leaseToken: token,
    }).session(session);
    if (!job) return;
    const book = await Book.findOne({
      _id: job.bookId,
      ownerId: job.ownerId,
    }).session(session);
    if (!book) return;
    if (book.slotHeld) {
      await Account.updateOne(
        { ownerId: book.ownerId },
        { $inc: { bookSlots: -1 } },
        { session },
      );
      book.slotHeld = false;
    }
    book.status = "failed";
    book.processingError = message;
    await book.save({ session });
    job.status = "failed";
    job.stage = "Failed";
    await job.save({ session });
  });
}
export async function processJob(id: string, token: string) {
  const job = await Job.findOne({
    _id: id,
    status: "running",
    leaseToken: token,
  });
  if (!job) return;
  const book = await Book.findOne({
    _id: job.bookId,
    ownerId: job.ownerId,
    status: "processing",
  });
  if (!book) return;
  const version = job.version;
  const update = async (stage: string, pagesDone = 0, totalPages = 0) => {
    const changed = await Job.updateOne(
      { _id: id, status: "running", leaseToken: token },
      {
        $set: {
          stage,
          pagesDone,
          totalPages,
          leaseUntil: new Date(Date.now() + 180000),
        },
      },
    );
    if (!changed.matchedCount)
      throw new AppError("CONFLICT", "Processing lease lost.");
  };
  try {
    await update("Validating stored files");
    const { bytes, contentType } = await storedBytes(book.fileKey, PDF_LIMIT);
    if (
      bytes.length !== book.fileSizeBytes ||
      contentType !== "application/pdf"
    )
      throw new AppError(
        "PROCESSING_FAILED",
        "Stored PDF does not match its upload.",
      );
    if (book.expectedCoverType && book.coverKey) {
      const cover = await storedBytes(book.coverKey, COVER_LIMIT);
      if (
        cover.bytes.length !== book.expectedCoverSize ||
        !coverSignature(cover.bytes, book.expectedCoverType)
      )
        throw new AppError("PROCESSING_FAILED", "Cover image is invalid.");
    }
    const hash = createHash("sha256").update(bytes).digest("hex");
    const duplicate = await Book.findOne({
      ownerId: book.ownerId,
      fileHash: hash,
      _id: { $ne: book._id },
    });
    if (duplicate)
      throw new AppError(
        "PROCESSING_FAILED",
        "This PDF is already in your library. Open the existing book.",
      );
    const extracted = await extractPdf(bytes, async (done, total) =>
      update("Extracting pages", done, total),
    );
    await update("Storing passages", extracted.pageCount, extracted.pageCount);
    for (let start = 0; start < extracted.segments.length; start += 100) {
      await Segment.bulkWrite(
        extracted.segments.slice(start, start + 100).map((segment) => ({
          updateOne: {
            filter: {
              bookId: book._id,
              processingVersion: version,
              segmentIndex: segment.segmentIndex,
            },
            update: {
              $setOnInsert: {
                ...segment,
                ownerId: book.ownerId,
                bookId: book._id,
                processingVersion: version,
              },
            },
            upsert: true,
          },
        })),
      );
    }
    const count = await Segment.countDocuments({
      bookId: book._id,
      ownerId: book.ownerId,
      processingVersion: version,
    });
    if (count !== extracted.segments.length)
      throw new AppError(
        "PROCESSING_FAILED",
        "Passage storage did not complete. Retry processing.",
      );
    let coverKey = book.coverKey;
    if (!coverKey && extracted.cover) {
      try {
        coverKey = `books/${book._id}/generated-${version}.png`;
        // Persist before writing so a crashed subprocess cannot lose its cleanup work.
        await Book.updateOne(
          { _id: book._id, ownerId: book.ownerId },
          { $addToSet: { cleanupKeys: coverKey } },
        );
        await put(coverKey, extracted.cover, {
          access: "private",
          contentType: "image/png",
          addRandomSuffix: false,
          allowOverwrite: true,
        });
      } catch {
        coverKey = undefined;
      }
    }
    await mongoose.connection.transaction(async (session) => {
      const active = await Job.findOne({
        _id: id,
        status: "running",
        leaseToken: token,
      }).session(session);
      if (!active) throw new AppError("CONFLICT", "Processing lease expired.");
      await Book.updateOne(
        { _id: book._id, ownerId: book.ownerId, status: "processing" },
        {
          $set: {
            fileHash: hash,
            pageCount: extracted.pageCount,
            segmentCount: count,
            processingVersion: version,
            coverKey,
            status: "ready",
          },
          $unset: { processingError: 1 },
          ...(coverKey ? { $pull: { cleanupKeys: coverKey } } : {}),
        },
        { session },
      );
      active.status = "done";
      active.stage = "Ready";
      await active.save({ session });
    });
    await Segment.deleteMany({
      bookId: book._id,
      ownerId: book.ownerId,
      processingVersion: { $ne: version },
    });
  } catch (error) {
    await failJob(
      id,
      token,
      error instanceof AppError
        ? error.message
        : "Processing could not complete. Please retry.",
    );
  }
}
