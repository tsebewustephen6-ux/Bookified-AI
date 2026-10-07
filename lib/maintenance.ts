import mongoose from "mongoose";
import { del } from "@vercel/blob";
import { Account, Book, Job, Segment, VoiceSession } from "../database/models";
import { accountSession } from "./sessions";
import { reconcileCall, recoverCall, stopCall } from "./vapi";
import { failJob } from "./processing";
export async function maintenance() {
  // Bounded scans; no collection resets or deletion of user books.
  const abandoned = await Book.find({
    status: "uploading",
    uploadExpiresAt: { $lt: new Date() },
  }).limit(25);
  for (const book of abandoned) {
    if (book.pdfComplete && (!book.expectedCoverType || book.coverComplete)) {
      await mongoose.connection.transaction(async (session) => {
        const changed = await Book.updateOne(
          { _id: book._id, status: "uploading" },
          { $set: { status: "processing" } },
          { session },
        );
        if (changed.modifiedCount)
          await Job.updateOne(
            { bookId: book._id },
            {
              $set: {
                ownerId: book.ownerId,
                status: "queued",
                stage: "Queued",
                leaseUntil: new Date(0),
              },
            },
            { upsert: true, session },
          );
      });
      continue;
    }
    const expired = await mongoose.connection.transaction(async (session) => {
      const current = await Book.findOne({
        _id: book._id,
        status: "uploading",
      }).session(session);
      if (!current) return false;
      if (
        current.pdfComplete &&
        (!current.expectedCoverType || current.coverComplete)
      )
        return false;
      if (current.slotHeld)
        await Account.updateOne(
          { ownerId: current.ownerId },
          { $inc: { bookSlots: -1 } },
          { session },
        );
      current.status = "failed";
      current.slotHeld = false;
      current.processingError =
        "Upload expired before all files were confirmed. Add the PDF again to begin a new upload.";
      current.cleanupKeys.push(
        current.fileKey,
        ...(current.coverKey ? [current.coverKey] : []),
      );
      await current.save({ session });
      return true;
    });
    if (!expired) continue;
  }
  const cleanup = await Book.find({
    status: { $in: ["failed", "ready"] },
    "cleanupKeys.0": { $exists: true },
  }).limit(25);
  for (const book of cleanup) {
    // Generated files belong to an obsolete job version; unfinished uploads cannot retry.
    const keys = book.cleanupKeys.filter(
      (key) =>
        (key.startsWith(`books/${book._id}/generated-`) &&
          key !== book.coverKey) ||
        (book.status === "failed" &&
          (!book.pdfComplete ||
            (book.expectedCoverType && !book.coverComplete)) &&
          (key === book.fileKey || key === book.coverKey)),
    );
    if (!keys.length) continue;
    try {
      await del(keys);
      await Book.updateOne(
        { _id: book._id, ownerId: book.ownerId },
        { $pull: { cleanupKeys: { $in: keys } } },
      );
    } catch {
      console.error("orphan_cleanup_pending", { bookId: book._id.toString() });
    }
  }
  const exhausted = await Job.find({
    status: "running",
    attempts: { $gte: 3 },
    leaseUntil: { $lt: new Date() },
  }).limit(25);
  for (const job of exhausted)
    if (job.leaseToken)
      await failJob(
        job._id.toString(),
        job.leaseToken,
        "Processing repeatedly exceeded its resource limits. Please upload a smaller readable PDF.",
      );
  const sessions = await VoiceSession.find({
    status: { $in: ["reserved", "active"] },
  })
    .sort({ updatedAt: 1 })
    .limit(25);
  for (const record of sessions) {
    try {
      if (
        !record.providerCallId &&
        record.reservedAt.getTime() < Date.now() - 180000
      ) {
        if (!record.capabilityHash) {
          await accountSession(
            record._id.toString(),
            undefined,
            new Date(),
            "reservation-expired",
          );
          continue;
        }
        await recoverCall(record._id.toString());
      }
      if (record.providerCallId) {
        const call = await reconcileCall(record._id.toString());
        if (
          call &&
          !call.startedAt &&
          !call.endedAt &&
          record.reservedAt.getTime() < Date.now() - 180000
        )
          await stopCall(record._id.toString());
        if (record.expiresAt && record.expiresAt < new Date())
          await stopCall(record._id.toString());
      }
    } catch {
      console.error("session_reconciliation_pending", {
        sessionId: record._id.toString(),
      });
    }
  }
  const failed = await Book.find({
    status: "failed",
    updatedAt: { $lt: new Date(Date.now() - 3600000) },
  }).limit(25);
  for (const book of failed) {
    await mongoose.connection.transaction(async (session) => {
      const stillFailed = await Book.findOne({
        _id: book._id,
        ownerId: book.ownerId,
        status: "failed",
      }).session(session);
      if (stillFailed)
        await Segment.deleteMany({
          bookId: book._id,
          ownerId: book.ownerId,
        }).session(session);
    });
  }
}
