import { z } from "zod";
import { identity, entitlement } from "@/lib/auth";
import { ownedBook } from "@/lib/books";
import { reserveSession } from "@/lib/sessions";
import { createCall, validateVapiConfiguration } from "@/lib/vapi";
import { sameOrigin, body, rateLimit } from "@/lib/security";
import { failure, AppError } from "@/lib/errors";
import { VoiceSession, Book } from '@/database/models';
import { connect } from "@/database/connection";
import { idSchema } from '@/lib/validation';
import { conversationName } from '@/lib/conversation-history';
export const runtime = "nodejs";
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    sameOrigin(request);
    const owner = await identity();
    await rateLimit(owner, "call-admission", 8);
    const id = (await context.params).id;
    const book = await ownedBook(owner, id);
    validateVapiConfiguration(book.personaId);
    const input = z
      .object({ idempotencyKey: z.string().uuid(), resumeFrom: idSchema.optional() })
      .strict()
      .safeParse(await body(request));
    if (!input.success)
      throw new AppError("VALIDATION", "Invalid conversation admission.");
    const record = await reserveSession(
      owner,
      id,
      await entitlement(owner),
      input.data.idempotencyKey,
      input.data.resumeFrom,
    );
    return Response.json(await createCall(record._id.toString()), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return failure(error);
  }
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const ownerId = await identity();
    const idOrSlug = (await context.params).id;
    await connect();
    const isId = idSchema.safeParse(idOrSlug).success;
    const book = await Book.findOne(
      isId ? { _id: idOrSlug, ownerId } : { slug: idOrSlug, ownerId }
    );
    if (!book) throw new AppError('NOT_FOUND', 'Book not found.', 404);
    await rateLimit(ownerId, 'conversation-history', 60);
    const url = new URL(request.url);
    const selected = url.searchParams.get('session');
    const cursor = url.searchParams.get('cursor');
    if ((selected && !idSchema.safeParse(selected).success) || (cursor && !idSchema.safeParse(cursor).success))
      throw new AppError('VALIDATION', 'Invalid history selection.');
    const scope = { ownerId, bookId: book._id, deletedAt: { $exists: false } };
    if (selected) {
      const record = await VoiceSession.findOne({ ...scope, _id: selected }).select('transcript resumeFrom').lean();
      if (!record) throw new AppError('NOT_FOUND', 'Conversation not found.', 404);
      return Response.json({ id: selected, messages: record.transcript || [], resumeFrom: record.resumeFrom?.toString() || null }, { headers: { 'Cache-Control': 'no-store' } });
    }
    const records = await VoiceSession.find({ ...scope, ...(cursor ? { _id: { $lt: cursor } } : {}) }).select('name reservedAt status durationSeconds transcript').slice('transcript', 1).sort({ _id: -1 }).limit(21).lean();
    return Response.json({
      book: {
        id: book._id.toString(),
        title: book.title,
        author: book.author,
        slug: book.slug,
        coverKey: book.coverKey ?? null,
        status: book.status,
      },
      items: records.slice(0, 20).map(record => ({
        id: record._id.toString(),
        name: record.name || conversationName((record.transcript || []).map(turn => ({ role: turn.role as 'user' | 'assistant', text: turn.text }))),
        date: record.reservedAt.toISOString(),
        status: record.status,
        durationSeconds: record.durationSeconds,
        preview: record.transcript?.[0]?.text.slice(0, 140) || '',
        hasTranscript: !!record.transcript?.length,
        book: {
          id: book._id.toString(),
          title: book.title,
          author: book.author,
          slug: book.slug,
          coverKey: book.coverKey ?? null,
          status: book.status,
        }
      })),
      nextCursor: records.length > 20 ? records[19]._id.toString() : null
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return failure(error); }
}
