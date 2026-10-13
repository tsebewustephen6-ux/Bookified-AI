import { z } from "zod";
import { webhookSession, reconcileCall } from "@/lib/vapi";
import { body } from "@/lib/security";
import { failure, AppError } from "@/lib/errors";
import { providerTurns, conversationName } from '@/lib/conversation-history';
import { VoiceSession } from '@/database/models';
export async function POST(request: Request) {
  try {
    const input = z
      .object({
        message: z.object({
          type: z.enum(["status-update", "end-of-call-report", 'conversation-update']),
          call: z.object({ id: z.string().uuid() }),
          timestamp: z.number().finite().nonnegative().optional(),
          messagesOpenAIFormatted: z.unknown().optional(),
          messages: z.unknown().optional(),
          artifact: z.object({ messages: z.unknown().optional(), messagesOpenAIFormatted: z.unknown().optional() }).optional(),
        }),
      })
      .safeParse(await body(request, 1048576));
    if (!input.success)
      throw new AppError("VALIDATION", "Invalid provider lifecycle event.");
    const record = await webhookSession(request, input.data.message.call.id);
    const event = input.data.message;
    const messages = providerTurns(event.messagesOpenAIFormatted ?? event.artifact?.messagesOpenAIFormatted ?? event.messages ?? event.artifact?.messages);
    if (messages.length) {
      // Set the first user topic once; subsequent transcript updates preserve it.
      if (messages.some(turn => turn.role === 'user')) await VoiceSession.updateOne({ _id: record._id, ownerId: record.ownerId, name: { $exists: false } }, { $set: { name: conversationName(messages) } });
      const revision = event.timestamp ?? messages.length;
      await VoiceSession.updateOne({ _id: record._id, ownerId: record.ownerId, providerCallId: event.call.id,
        ...(event.type === 'end-of-call-report' ? {} : { transcriptComplete: { $ne: true }, transcriptRevision: { $lte: revision }, $expr: { $lte: [{ $size: { $ifNull: ['$transcript', []] } }, messages.length] } }) },
      { $set: { transcript: messages, transcriptRevision: revision, transcriptComplete: event.type === 'end-of-call-report' } });
    }
    if (event.type !== 'conversation-update') await reconcileCall(record._id.toString());
    return Response.json({ accepted: true });
  } catch (error) {
    return failure(error);
  }
}
