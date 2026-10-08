import { verifyPayment } from "@/lib/billing";
import { body, rateLimit } from "@/lib/security";
import { AppError, failure } from "@/lib/errors";
import { connect } from "@/database/connection";
import { Payment } from "@/database/models";
export async function POST(
  request: Request,
  context: { params: Promise<{ reference: string }> },
) {
  try {
    const { reference } = await context.params;
    if (!/^[a-f0-9]{32}$/.test(reference))
      throw new AppError("NOT_FOUND", "Payment not found.", 404);
    await body(request, 16384);
    await connect();
    if (!(await Payment.exists({ reference })))
      throw new AppError("NOT_FOUND", "Payment not found.", 404);
    await rateLimit(reference, "payment-callback", 5);
    // Callback bodies are untrusted wake-ups. Authenticate a fresh Hubtel
    // status request and verify merchant, reference, amount and currency.
    await verifyPayment(reference);
    return Response.json({ accepted: true });
  } catch (error) {
    return failure(error);
  }
}
