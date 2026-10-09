import { timingSafeEqual } from "node:crypto";
import { AppError } from "./errors";
import { baseUrl } from "./env";
import { connect } from "../database/connection";
import { Rate } from "../database/models";
export function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const referer = request.headers.get("referer");
  const base = baseUrl().origin;
  
  if (origin === base) return;
  // Some mobile browsers send a null Origin. Require an exact first-party
  // Referer in that case; a missing header or a prefix lookalike is not proof.
  if ((!origin || origin === "null") && referer) {
    try { if (new URL(referer).origin === base) return; } catch { /* reject invalid URLs */ }
  }
  throw new AppError("UNAUTHORIZED", "Please submit this request from Bookified.", 403);
}
export function secretEqual(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
export async function body(request: Request, max = 16384): Promise<unknown> {
  if (Number(request.headers.get("content-length")) > max)
    throw new AppError("VALIDATION", "Request is too large.", 413);
  const reader = request.body?.getReader();
  if (!reader) throw new AppError("VALIDATION", "Request body is required.");
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const part = await reader.read();
    if (part.done) break;
    length += part.value.length;
    if (length > max) {
      await reader.cancel();
      throw new AppError("VALIDATION", "Request is too large.", 413);
    }
    chunks.push(part.value);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new AppError("VALIDATION", "Invalid JSON.");
  }
}
export async function rateLimit(
  owner: string,
  action: string,
  limit: number,
  seconds = 60,
) {
  await connect();
  const window = Math.floor(Date.now() / (seconds * 1000));
  const key = `${owner}:${action}:${window}`;
  try {
    const record = await Rate.findOneAndUpdate(
      { key },
      {
        $inc: { count: 1 },
        $setOnInsert: { expiresAt: new Date((window + 2) * seconds * 1000) },
      },
      { upsert: true, returnDocument: "after" },
    );
    if (record.count > limit)
      throw new AppError(
        "QUOTA_REACHED",
        "Too many requests. Try again shortly.",
        429,
      );
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === 11000)
      throw new AppError("CONFLICT", "Please retry your request.", 409);
    throw error;
  }
}
