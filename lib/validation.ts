import { z } from "zod";
export const PDF_LIMIT = 50 * 1024 * 1024;
export const COVER_LIMIT = 10 * 1024 * 1024;
export const metadataSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    author: z.string().trim().min(1).max(200),
    personaId: z.string().min(1).max(80),
    fileSizeBytes: z.number().int().positive().max(PDF_LIMIT),
    coverType: z.enum(["image/jpeg", "image/png", "image/webp"]).optional(),
    coverSizeBytes: z.number().int().positive().max(COVER_LIMIT).optional(),
    idempotencyKey: z.string().uuid(),
  })
  .strict();
export const querySchema = z.string().trim().min(1).max(500);
export const idSchema = z.string().regex(/^[a-f\d]{24}$/i);
export function escapeRegex(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
export function queryTerms(query: string) {
  return query.match(/[\p{L}\p{N}]{2,}/gu)?.slice(0, 16) ?? [];
}
