import { z } from "zod";
import { verifyPayment } from "./billing";
import { paymentSignature } from "./payment-dispatch";
import { secretEqual } from "./security";
import { AppError } from "./errors";
const schema = z
  .object({
    reference: z.string().regex(/^[a-f0-9]{32}$/),
    signature: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();
export async function consumePaymentMessage(input: unknown) {
  const parsed = schema.safeParse(input);
  if (
    !parsed.success ||
    !secretEqual(parsed.data.signature, paymentSignature(parsed.data.reference))
  )
    throw new Error("Invalid payment message");
  try {
    const payment = await verifyPayment(parsed.data.reference);
    if (payment.status === "pending") throw new Error("Payment is pending");
  } catch (error) {
    if (error instanceof AppError && error.status === 404) return;
    throw error;
  }
}
