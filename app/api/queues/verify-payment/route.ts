import { handleCallback } from "@vercel/queue";
import { consumePaymentMessage } from "@/lib/payment-worker";
export const runtime = "nodejs";
export const maxDuration = 60;
export const POST = handleCallback(consumePaymentMessage, {
  visibilityTimeoutSeconds: 90,
  retry: (error, metadata) =>
    (error instanceof Error && error.message === "Invalid payment message") ||
    metadata.deliveryCount >= 32
      ? { acknowledge: true }
      : { afterSeconds: 300 },
});
