import { identity } from "@/lib/auth";
import { rateLimit } from "@/lib/security";
import { failure } from "@/lib/errors";
import { allUserConversations } from "@/lib/sessions";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const ownerId = await identity();
    await rateLimit(ownerId, "conversation-history", 60);
    const url = new URL(request.url);
    const cursor = url.searchParams.get("cursor") || undefined;
    const limit = Math.min(
      50,
      Math.max(1, parseInt(url.searchParams.get("limit") || "20", 10))
    );

    const result = await allUserConversations(ownerId, limit, cursor);
    return Response.json(result, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return failure(error);
  }
}
