import { randomUUID } from "node:crypto";
import mongoose from "mongoose";
import { connect } from "../database/connection";
import { Account, Book, Job } from "../database/models";
import { AppError } from "./errors";
import { plans, type Plan } from "./plans";
import { idSchema, metadataSchema, escapeRegex } from "./validation";
import { voice } from "./voices";
import { dispatchBook } from "./job-dispatch";
export type BookDTO = {
  id: string;
  title: string;
  author: string;
  slug: string;
  personaId: string;
  status: string;
  pageCount: number;
  segmentCount: number;
  createdAt: string;
  hasCover: boolean;
  processingError?: string;
};
export function slug(title: string) {
  return `${
    title
      .normalize("NFKD")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 60) || "book"
  }-${randomUUID().slice(0, 12)}`;
}
export async function ownedBook(ownerId: string, id: string) {
  if (!idSchema.safeParse(id).success)
    throw new AppError("NOT_FOUND", "Book not found.", 404);
  await connect();
  const book = await Book.findOne({ _id: id, ownerId });
  if (!book) throw new AppError("NOT_FOUND", "Book not found.", 404);
  return book;
}
export function dto(
  book: NonNullable<Awaited<ReturnType<typeof Book.findOne>>>,
): BookDTO {
  return {
    id: book._id.toString(),
    title: book.title,
    author: book.author,
    slug: book.slug,
    personaId: book.personaId,
    status: book.status,
    pageCount: book.pageCount,
    segmentCount: book.segmentCount,
    createdAt: book.createdAt.toISOString(),
    hasCover: Boolean(book.coverKey),
    processingError: book.processingError || undefined,
  };
}
export async function library(ownerId: string, q = "", page = 1) {
  await connect();
  const filter = {
    ownerId,
    ...(q
      ? {
          $or: [
            { title: { $regex: escapeRegex(q.slice(0, 200)), $options: "i" } },
            { author: { $regex: escapeRegex(q.slice(0, 200)), $options: "i" } },
          ],
        }
      : {}),
  };
  const [books, total] = await Promise.all([
    Book.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .skip((page - 1) * 12)
      .limit(12),
    Book.countDocuments(filter),
  ]);
  return { books: books.map(dto), total };
}
export async function admitBook(ownerId: string, plan: Plan, input: unknown) {
  const parsed = metadataSchema.safeParse(input);
  if (!parsed.success)
    throw new AppError(
      "VALIDATION",
      "Check title, author, file size and submission details.",
    );
  const data = parsed.data;
  voice(data.personaId);
  if (Boolean(data.coverType) !== Boolean(data.coverSizeBytes))
    throw new AppError(
      "VALIDATION",
      "Cover type and size must be provided together.",
    );
  await connect();
  await Account.updateOne(
    { ownerId },
    { $setOnInsert: { bookSlots: 0 } },
    { upsert: true },
  );
  return mongoose.connection.transaction(async (session) => {
    const previous = await Book.findOne({
      ownerId,
      admissionKey: data.idempotencyKey,
    }).session(session);
    if (previous) return previous;
    const account = await Account.findOneAndUpdate(
      { ownerId, bookSlots: { $lt: plans[plan].books } },
      { $inc: { bookSlots: 1 } },
      { session, returnDocument: "after" },
    );
    if (!account)
      throw new AppError(
        "QUOTA_REACHED",
        "Your library has reached its plan limit. Visit Plans to upgrade.",
        403,
      );
    const id = new mongoose.Types.ObjectId();
    const prefix = `books/${id}/${randomUUID()}`;
    const [book] = await Book.create(
      [
        {
          _id: id,
          ownerId,
          title: data.title,
          author: data.author,
          slug: slug(data.title),
          personaId: data.personaId,
          fileKey: `${prefix}/book.pdf`,
          coverKey: data.coverType
            ? `${prefix}/cover.${data.coverType.split("/")[1]}`
            : undefined,
          fileSizeBytes: data.fileSizeBytes,
          expectedCoverType: data.coverType,
          expectedCoverSize: data.coverSizeBytes,
          admissionKey: data.idempotencyKey,
          uploadExpiresAt: new Date(Date.now() + 30 * 60000),
        },
      ],
      { session },
    );
    return book;
  });
}
export async function enqueue(
  ownerId: string,
  id: string,
  retry = false,
  plan?: Plan,
) {
  await connect();
  const result = await mongoose.connection.transaction(async (session) => {
    const book = await Book.findOne({ _id: id, ownerId }).session(session);
    if (!book) throw new AppError("NOT_FOUND", "Book not found.", 404);
    if (book.status === "ready" || book.status === "processing")
      return dto(book);
    if (!book.pdfComplete || (book.expectedCoverType && !book.coverComplete)) {
      if (process.env.NODE_ENV !== "production") {
        // In local development, Vercel Blob cannot send webhooks to localhost.
        // We know the client upload finished because they called this route.
        book.pdfComplete = true;
        if (book.expectedCoverType) book.coverComplete = true;
      } else {
        throw new AppError(
          "CONFLICT",
          "Upload confirmation is pending. Try again shortly.",
          409,
        );
      }
    }
    const job = await Job.findOne({ bookId: book._id }).session(session);
    if (retry && job && job.attempts >= 3)
      throw new AppError(
        "PROCESSING_FAILED",
        "Processing has failed three times. Please upload a readable PDF.",
      );
    if (!book.slotHeld) {
      if (!retry || !plan)
        throw new AppError(
          "CONFLICT",
          "A book slot must be reserved before retry.",
          409,
        );
      const account = await Account.findOneAndUpdate(
        { ownerId, bookSlots: { $lt: plans[plan].books } },
        { $inc: { bookSlots: 1 } },
        { session },
      );
      if (!account)
        throw new AppError(
          "QUOTA_REACHED",
          "Your current plan cannot admit another book.",
          403,
        );
      book.slotHeld = true;
    }
    book.status = "processing";
    book.processingError = undefined;
    await book.save({ session });
    await Job.updateOne(
      { bookId: book._id },
      {
        $set: {
          ownerId,
          status: "queued",
          stage: "Queued",
          leaseUntil: new Date(0),
        },
      },
      { upsert: true, session },
    );
    return dto(book);
  });
  await dispatchBook(id, ownerId);
  return result;
}
export async function retryBook(ownerId: string, id: string, plan: Plan) {
  await ownedBook(ownerId, id);
  return enqueue(ownerId, id, true, plan);
}
