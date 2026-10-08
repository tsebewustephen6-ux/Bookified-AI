import { handleCallback } from "@vercel/queue";
import { consumeProcessingMessage } from "@/lib/hosted-worker";
export const runtime = "nodejs";
export const maxDuration = 180;
export const POST = handleCallback(consumeProcessingMessage, {
  visibilityTimeoutSeconds: 240,
  retry: (error, metadata) =>
    (error instanceof Error &&
      error.message === "Invalid processing message") ||
    metadata.deliveryCount >= 32
      ? { acknowledge: true }
      : { afterSeconds: 60 },
});
