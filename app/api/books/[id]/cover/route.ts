import { get } from "@vercel/blob";
import { identity } from "@/lib/auth";
import { ownedBook } from "@/lib/books";
import { failure, AppError } from "@/lib/errors";
export const runtime = "nodejs";
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const book = await ownedBook(await identity(), (await context.params).id);
    if (!book.coverKey || book.status !== "ready")
      throw new AppError("NOT_FOUND", "Cover not found.", 404);
    const result = await get(book.coverKey, { access: "private" });
    if (!result || result.statusCode !== 200)
      throw new AppError("NOT_FOUND", "Cover not found.", 404);
    return new Response(result.stream, {
      headers: {
        "Content-Type": result.blob.contentType,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return failure(error);
  }
}
