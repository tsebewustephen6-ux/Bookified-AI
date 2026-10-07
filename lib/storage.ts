import { get, head } from "@vercel/blob";
import { AppError } from "./errors";
import { PDF_LIMIT, COVER_LIMIT } from "./validation";
export async function storedBytes(key: string, limit: number) {
  const result = await get(key, { access: "private" });
  if (!result || result.statusCode !== 200)
    throw new AppError("PROCESSING_FAILED", "Uploaded file is unavailable.");
  if (result.blob.size > limit) {
    await result.stream.cancel();
    throw new AppError("VALIDATION", "Uploaded file exceeds its size limit.");
  }
  const reader = result.stream.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const part = await reader.read();
    if (part.done) break;
    size += part.value.length;
    if (size > limit) {
      await reader.cancel();
      throw new AppError("VALIDATION", "Uploaded file exceeds its size limit.");
    }
    chunks.push(part.value);
  }
  return { bytes: Buffer.concat(chunks), contentType: result.blob.contentType };
}
export async function verifyStored(key: string, size: number, type: string) {
  const object = await head(key);
  if (
    object.pathname !== key ||
    object.size !== size ||
    object.contentType !== type
  )
    throw new AppError(
      "VALIDATION",
      "Stored file does not match the upload grant.",
    );
}
export function pdfSignature(bytes: Uint8Array) {
  return Buffer.from(bytes.subarray(0, 5)).toString("ascii") === "%PDF-";
}
export function coverSignature(bytes: Uint8Array, type: string) {
  const b = Buffer.from(bytes);
  return type === "image/jpeg"
    ? b[0] === 255 && b[1] === 216 && b[2] === 255
    : type === "image/png"
      ? b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      : type === "image/webp" &&
        b.subarray(0, 4).toString() === "RIFF" &&
        b.subarray(8, 12).toString() === "WEBP";
}
export const storageLimits = { pdf: PDF_LIMIT, cover: COVER_LIMIT };
