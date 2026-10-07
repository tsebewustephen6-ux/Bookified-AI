import { identity, entitlement } from "@/lib/auth";
import { admitBook } from "@/lib/books";
import { sameOrigin, body, rateLimit } from "@/lib/security";
import { failure } from "@/lib/errors";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const owner = await identity();
    await rateLimit(owner, "admit-book", 10);
    const book = await admitBook(
      owner,
      await entitlement(owner),
      await body(request),
    );
    return Response.json(
      {
        id: book._id.toString(),
        slug: book.slug,
        fileKey: book.fileKey,
        coverKey: book.coverKey,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return failure(error);
  }
}
