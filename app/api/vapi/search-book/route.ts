import { z } from "zod";
import { body, rateLimit } from "@/lib/security";
import { webhookSession } from "@/lib/vapi";
import { retrieve } from "@/lib/retrieval";
import { VoiceSession } from "@/database/models";
import { AppError, failure } from "@/lib/errors";
const schema = z.object({
  message: z.object({
    type: z.literal("tool-calls"),
    call: z.object({ id: z.string().uuid() }),
    toolCallList: z
      .array(
        z.object({
          id: z.string().min(1).max(200),
          name: z.string().max(100),
          parameters: z.unknown(),
        }),
      )
      .min(1)
      .max(8),
  }),
});
export async function POST(request: Request) {
  try {
    const input = schema.safeParse(await body(request, 32768));
    if (!input.success)
      throw new AppError("VALIDATION", "Invalid provider tool request.");
    const record = await webhookSession(request, input.data.message.call.id);
    if (
      !record.expiresAt ||
      record.expiresAt < new Date() ||
      record.status !== "active"
    )
      throw new AppError(
        "UNAUTHORIZED",
        "Conversation authorization expired.",
        403,
      );
    await rateLimit(record._id.toString(), "retrieval", 40);
    const results = [];
    for (const call of input.data.message.toolCallList) {
      try {
        const params = z
          .object({
            query: z.string().trim().min(1).max(500),
            bookId: z.string().optional(),
          })
          .strict()
          .parse(call.parameters);
        if (
          call.name !== "search_book" ||
          (params.bookId && params.bookId !== record.bookId.toString())
        )
          throw new AppError("UNAUTHORIZED", "Tool binding mismatch.", 403);
        const result = await retrieve(
          record.ownerId,
          record.bookId.toString(),
          params.query,
        );
        await VoiceSession.updateOne(
          { _id: record._id },
          {
            $set: {
              references: result.passages.map(
                ({ segmentId, pageStart, pageEnd }) => ({
                  segmentId,
                  pageStart,
                  pageEnd,
                }),
              ),
            },
          },
        );
        results.push({
          name: call.name,
          toolCallId: call.id,
          result: JSON.stringify(result),
        });
      } catch (error) {
        results.push({
          name: call.name,
          toolCallId: call.id,
          result: JSON.stringify({
            evidence: false,
            error: error instanceof AppError ? error.code : "VALIDATION",
            passages: [],
          }),
        });
      }
    }
    return Response.json({ results });
  } catch (error) {
    return failure(error);
  }
}
