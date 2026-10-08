import { z } from "zod";
import { body, rateLimit } from "@/lib/security";
import { reconcileCall, webhookSession } from "@/lib/vapi";
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
          name: z.string().max(100).optional(),
          parameters: z.unknown().optional(),
          function: z
            .object({
              name: z.string().min(1).max(100),
              arguments: z.unknown(),
            })
            .optional(),
        }),
      )
      .min(1)
      .max(8),
  }),
});
export async function POST(request: Request) {
  try {
    const input = schema.safeParse(await body(request, 262144));
    if (!input.success)
      throw new AppError("VALIDATION", "Invalid provider tool request.");
    let record = await webhookSession(request, input.data.message.call.id);
    // A tool can arrive before the status callback or browser's first poll.
    // Activate only from the bound provider call's authoritative timestamps.
    if (
      record.status === "reserved" &&
      record.expiresAt &&
      record.expiresAt > new Date()
    ) {
      await reconcileCall(record._id.toString());
      record = await webhookSession(request, input.data.message.call.id);
    }
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
      const name = call.function?.name ?? call.name ?? "unknown";
      try {
        const argumentsValue = call.function
          ? call.function.arguments
          : call.parameters;
        if (typeof argumentsValue === "string" && argumentsValue.length > 4096)
          throw new AppError("VALIDATION", "Tool arguments are too large.");
        const params = z
          .object({
            query: z.string().trim().min(1).max(500),
            bookId: z.string().optional(),
          })
          .strict()
          .parse(
            typeof argumentsValue === "string"
              ? JSON.parse(argumentsValue)
              : argumentsValue,
          );
        if (
          name !== "search_book" ||
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
          name,
          toolCallId: call.id,
          result: JSON.stringify(result),
        });
      } catch (error) {
        results.push({
          name,
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
