import { createHmac } from "node:crypto";
import { send } from "@vercel/queue";
import { Job } from "../database/models";
import { required } from "./env";
export const PROCESSING_TOPIC = "bookified-processing";
export function jobSignature(jobId: string) {
  return createHmac("sha256", required("BOOKIFIED_QUEUE_SECRET"))
    .update("bookified-processing:" + jobId)
    .digest("hex");
}
export async function dispatchBook(bookId: string, ownerId: string) {
  if (process.env.VERCEL !== "1") return;
  const job = await Job.findOne({
    bookId,
    ownerId,
    attempts: { $lt: 3 },
    $or: [
      { status: "queued" },
      { status: "running", leaseUntil: { $lt: new Date() } },
    ],
  });
  if (!job) return;
  const jobId = job._id.toString();
  await send(
    PROCESSING_TOPIC,
    { jobId, signature: jobSignature(jobId) },
    {
      idempotencyKey:
        jobId + ":" + job.version + ":" + Math.floor(Date.now() / 300000),
      retentionSeconds: 604800,
    },
  );
}
