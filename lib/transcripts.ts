import { z } from "zod";
export type TranscriptMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  final: boolean;
};
const schema = z.object({
  type: z.literal("transcript"),
  role: z.enum(["user", "assistant"]),
  transcriptType: z.enum(["partial", "final"]),
  transcript: z.string().max(30000),
  id: z.string().optional(),
  timestamp: z.union([z.string(), z.number()]).optional(),
});
export function appendTranscript(
  messages: TranscriptMessage[],
  event: unknown,
) {
  const parsed = schema.safeParse(event);
  if (!parsed.success) return messages;
  const data = parsed.data;
  if (!data.transcript.trim()) return messages;
  const final = data.transcriptType === "final";
  const eventId =
    data.id ||
    (data.timestamp !== undefined
      ? `${data.role}:${data.timestamp}`
      : undefined);
  const lastFinal = messages.findLast((m) => m.final);
  if (
    final &&
    (eventId
      ? messages.some((m) => m.final && m.id === eventId)
      : lastFinal?.role === data.role && lastFinal.text === data.transcript)
  )
    return messages;
  const identity = eventId || `${data.role}:${Date.now()}:${messages.length}`;
  const withoutPartial = messages.filter(
    (m) => m.final || m.role !== data.role,
  );
  return [
    ...withoutPartial.slice(-199),
    {
      id: final ? identity : `${data.role}:partial`,
      role: data.role,
      text: data.transcript,
      final,
    },
  ];
}
