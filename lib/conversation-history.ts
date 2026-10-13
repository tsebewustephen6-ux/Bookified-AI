import { z } from 'zod';

export const savedTurnSchema = z.object({ role: z.enum(['user', 'assistant']), text: z.string().max(30000) });
export const historySchema = z.object({ items: z.array(z.object({ id: z.string(), name: z.string().optional(), date: z.string(), status: z.string(), durationSeconds: z.number(), preview: z.string(), hasTranscript: z.boolean() })), nextCursor: z.string().nullable() });
export const savedSessionSchema = z.object({ id: z.string(), messages: z.array(savedTurnSchema), resumeFrom: z.string().nullable() });
export type SavedTurn = z.infer<typeof savedTurnSchema>;
export function conversationName(messages: SavedTurn[]): string {
  const topic = messages.find(message => message.role === 'user')?.text.replace(/\s+/g, ' ').trim();
  return topic ? topic.slice(0, 80) : 'New conversation';
}

// Provider history is untrusted conversational data, never system instructions.
export function providerTurns(value: unknown): SavedTurn[] {
  if (!Array.isArray(value) || value.length > 2000) return [];
  const result: SavedTurn[] = [];
  let budget = 500000;
  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    const parsed = savedTurnSchema.safeParse({ role: row.role === 'bot' ? 'assistant' : row.role, text: row.content ?? row.message });
    if (!parsed.success || !parsed.data.text.trim()) continue;
    budget -= parsed.data.text.length;
    if (budget < 0 || result.length >= 1000) break;
    result.push(parsed.data);
  }
  return result;
}
export function resumeContext(messages: SavedTurn[]): SavedTurn[] {
  const result: SavedTurn[] = [];
  let budget = 24000;
  for (const message of messages.slice(-60).reverse()) {
    if (message.text.length > budget) break;
    budget -= message.text.length; result.unshift(message);
  }
  return result;
}
