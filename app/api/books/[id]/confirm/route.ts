import { identity } from "@/lib/auth";
import { ownedBook, enqueue } from "@/lib/books";
import { sameOrigin, rateLimit } from "@/lib/security";
import { failure } from "@/lib/errors";
export const runtime = "nodejs";
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    sameOrigin(request);
    const owner = await identity();
    await rateLimit(owner, "ingestion", 15);
    const { id } = await context.params;
    await ownedBook(owner, id);
    return Response.json(await enqueue(owner, id));
  } catch (error) {
    return failure(error);
  }
}
