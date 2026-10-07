import { identity, entitlement } from "@/lib/auth";
import { retryBook } from "@/lib/books";
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
    await rateLimit(owner, "retry", 3, 300);
    const { id } = await context.params;
    return Response.json(await retryBook(owner, id, await entitlement(owner)));
  } catch (error) {
    return failure(error);
  }
}
