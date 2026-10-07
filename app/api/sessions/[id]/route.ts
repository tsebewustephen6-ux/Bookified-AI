import { identity } from "@/lib/auth";
import { connect } from "@/database/connection";
import { VoiceSession } from "@/database/models";
import { idSchema } from "@/lib/validation";
import { AppError, failure } from "@/lib/errors";
import { reconcileCall, stopCall } from "@/lib/vapi";
import { sameOrigin, rateLimit } from "@/lib/security";
async function owned(id: string) {
  const ownerId = await identity();
  if (!idSchema.safeParse(id).success)
    throw new AppError("NOT_FOUND", "Conversation not found.", 404);
  await connect();
  const record = await VoiceSession.findOne({ _id: id, ownerId });
  if (!record) throw new AppError("NOT_FOUND", "Conversation not found.", 404);
  return record;
}
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const id = (await context.params).id;
    const record = await owned(id);
    await rateLimit(record.ownerId, "call-status", 60);
    await reconcileCall(id);
    const latest = await owned(id);
    return Response.json(
      {
        status: latest.status,
        startedAt: latest.startedAt?.toISOString(),
        durationSeconds: latest.durationSeconds,
        maxDurationSeconds: latest.maxDurationSeconds,
        references: latest.references.map((r) => ({
          segmentId: r.segmentId,
          pageStart: r.pageStart,
          pageEnd: r.pageEnd,
        })),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return failure(error);
  }
}
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    sameOrigin(request);
    const id = (await context.params).id;
    const record = await owned(id);
    await rateLimit(record.ownerId, "stop-call", 15);
    await stopCall(id);
    return Response.json({ stopping: true });
  } catch (error) {
    return failure(error);
  }
}
