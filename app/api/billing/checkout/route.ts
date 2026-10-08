import { identity } from "@/lib/auth";
import { createCheckout } from "@/lib/billing";
import { body, rateLimit, sameOrigin } from "@/lib/security";
import { failure } from "@/lib/errors";
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const owner = await identity();
    await rateLimit(owner, "checkout", 5);
    return Response.json(
      await createCheckout(owner, await body(request, 4096)),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return failure(error);
  }
}
