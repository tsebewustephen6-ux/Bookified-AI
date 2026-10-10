import mongoose from "mongoose";
import { connect } from "../database/connection";
import { Account, Usage, VoiceSession } from "../database/models";
import { ownedBook } from "./books";
import { AppError } from "./errors";
import { plans, utcPeriod, type Plan } from "./plans";
import { idSchema } from './validation';
export async function reserveSession(
  ownerId: string,
  bookId: string,
  plan: Plan,
  idempotencyKey: string,
  resumeFrom?: string,
) {
  const book = await ownedBook(ownerId, bookId);
  if (book.status !== "ready")
    throw new AppError(
      "CONFLICT",
      "Wait for this book to finish processing.",
      409,
    );
  if (resumeFrom) {
    if (!idSchema.safeParse(resumeFrom).success || !await VoiceSession.exists({ _id: resumeFrom, ownerId, bookId: book._id, status: { $in: ['ended', 'failed', 'expired'] }, 'transcript.0': { $exists: true } }))
      throw new AppError('NOT_FOUND', 'Saved conversation is unavailable for this book.', 404);
  }
  const period = utcPeriod();
  await Account.updateOne(
    { ownerId },
    { $setOnInsert: { bookSlots: 0 } },
    { upsert: true },
  );
  await Usage.updateOne(
    { ownerId, periodStart: period.start },
    { $setOnInsert: { connected: 0, reserved: 0 } },
    { upsert: true },
  );
  return mongoose.connection.transaction(async (session) => {
    const prior = await VoiceSession.findOne({
      ownerId,
      idempotencyKey,
    }).session(session);
    if (prior) {
      if (prior.bookId.toString() !== bookId || (prior.resumeFrom?.toString() || undefined) !== resumeFrom)
        throw new AppError(
          "CONFLICT",
          "Submission key already belongs to another book.",
          409,
        );
      return prior;
    }
    const id = new mongoose.Types.ObjectId();
    const account = await Account.findOneAndUpdate(
      { ownerId, activeSessionId: null },
      { $set: { activeSessionId: id } },
      { session },
    );
    if (!account)
      throw new AppError(
        "CONFLICT",
        "End your current conversation before starting another.",
        409,
      );
    const cap = plans[plan].sessions;
    const usage = await Usage.findOneAndUpdate(
      {
        ownerId,
        periodStart: period.start,
        ...(cap !== null
          ? { $expr: { $lt: [{ $add: ["$connected", "$reserved"] }, cap] } }
          : {}),
      },
      { $inc: { reserved: 1 } },
      { session },
    );
    if (!usage)
      throw new AppError(
        "QUOTA_REACHED",
        "Your monthly conversations are used. Visit Plans to upgrade.",
        403,
      );
    const [record] = await VoiceSession.create(
      [
        {
          _id: id,
          ownerId,
          bookId: book._id,
          reservedAt: new Date(),
          maxDurationSeconds: plans[plan].duration,
          planAtStart: plan,
          usagePeriodStart: period.start,
          usagePeriodEnd: period.end,
          idempotencyKey,
          ...(resumeFrom ? { resumeFrom } : {}),
          expiresAt: new Date(Date.now() + (plans[plan].duration + 180) * 1000),
        },
      ],
      { session },
    );
    return record;
  });
}
export async function accountSession(
  id: string,
  startedAt?: Date,
  endedAt?: Date,
  reason?: string,
) {
  await connect();
  return mongoose.connection.transaction(async (session) => {
    const record = await VoiceSession.findById(id).session(session);
    if (!record)
      throw new AppError("NOT_FOUND", "Conversation not found.", 404);
    if (["ended", "failed", "expired"].includes(record.status)) return record;
    if (startedAt && !record.counted) {
      record.startedAt = startedAt;
      record.counted = true;
      record.status = "active";
      await Usage.updateOne(
        { ownerId: record.ownerId, periodStart: record.usagePeriodStart },
        { $inc: { reserved: -1, connected: 1 } },
        { session },
      );
    }
    if (endedAt) {
      if (!record.counted)
        await Usage.updateOne(
          { ownerId: record.ownerId, periodStart: record.usagePeriodStart },
          { $inc: { reserved: -1 } },
          { session },
        );
      record.endedAt = endedAt;
      record.providerJoinUrl = undefined;
      record.status = record.counted ? "ended" : "failed";
      record.endReason = reason?.slice(0, 120);
      record.durationSeconds = record.startedAt
        ? Math.max(
            0,
            Math.ceil((endedAt.getTime() - record.startedAt.getTime()) / 1000),
          )
        : 0;
      await Account.updateOne(
        { ownerId: record.ownerId, activeSessionId: record._id },
        { $set: { activeSessionId: null } },
        { session },
      );
    }
    await record.save({ session });
    return record;
  });
}
export async function usageSummary(ownerId: string) {
  await connect();
  const period = utcPeriod();
  const [account, usage] = await Promise.all([
    Account.findOne({ ownerId }),
    Usage.findOne({ ownerId, periodStart: period.start }),
  ]);
  return {
    books: account?.bookSlots ?? 0,
    connected: usage?.connected ?? 0,
    reserved: usage?.reserved ?? 0,
    resetAt: period.end.toISOString(),
  };
}
