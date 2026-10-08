import { identity } from "@/lib/auth";
import { verifyPayment } from "@/lib/billing";
import { rateLimit } from "@/lib/security";
import { failure } from "@/lib/errors";
export async function GET(
  _request: Request,
  context: { params: Promise<{ reference: string }> },
) {
  try {
    const owner = await identity();
    await rateLimit(owner, "payment-status", 12);
    const { reference } = await context.params;
    return Response.json(await verifyPayment(reference, owner), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return failure(error);
  }
}
