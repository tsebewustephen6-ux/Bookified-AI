import { z } from "zod";
import { AppError } from "./errors";
const catalogSchema = z
  .array(
    z
      .object({
        id: z.string().min(1).max(80),
        name: z.string().min(1).max(80),
        description: z.string().max(240),
        provider: z.enum(["openai", "11labs", "azure", "cartesia", "vapi"]),
        voiceId: z.string().min(1).max(200),
      })
      .strict(),
  )
  .max(20);
export function voices() {
  let input: unknown;
  try {
    input = JSON.parse(process.env.VOICE_CATALOG_JSON || "[]");
  } catch {
    throw new AppError(
      "PROVIDER_UNAVAILABLE",
      "Voice configuration is invalid.",
      503,
    );
  }
  const parsed = catalogSchema.safeParse(input);
  if (!parsed.success)
    throw new AppError(
      "PROVIDER_UNAVAILABLE",
      "Voice configuration is invalid.",
      503,
    );
  if (new Set(parsed.data.map((v) => v.id)).size !== parsed.data.length)
    throw new AppError(
      "PROVIDER_UNAVAILABLE",
      "Voice identifiers must be unique.",
      503,
    );
  return parsed.data;
}
export function voice(id: string) {
  const result = voices().find((v) => v.id === id);
  if (!result) throw new AppError("VALIDATION", "Select an available voice.");
  return result;
}
