import { createHmac } from "node:crypto";
import { send } from "@vercel/queue";
import { required } from "./env";
export const PAYMENT_TOPIC = "bookified-payments";
export function paymentSignature(reference: string) {
  return createHmac("sha256", required("BOOKIFIED_QUEUE_SECRET"))
    .update(PAYMENT_TOPIC + ":" + reference)
    .digest("hex");
}
export async function dispatchPayment(reference: string) {
  if (process.env.VERCEL !== "1") return;
  await send(
    PAYMENT_TOPIC,
    { reference, signature: paymentSignature(reference) },
    {
      delaySeconds: 300,
      retentionSeconds: 86400,
      idempotencyKey: reference + ":" + Math.floor(Date.now() / 86400000),
    },
  );
}
