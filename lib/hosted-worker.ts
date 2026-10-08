import { randomUUID } from "node:crypto";
import { z } from "zod";
import { connect } from "../database/connection";
import { Job } from "../database/models";
import { processJob, failJob } from "./processing";
import { jobSignature } from "./job-dispatch";
import { secretEqual } from "./security";
const messageSchema = z.object({
  jobId: z.string().regex(/^[a-f0-9]{24}$/),
  signature: z.string().regex(/^[a-f0-9]{64}$/),
});
export async function consumeProcessingMessage(input: unknown) {
  const parsed = messageSchema.safeParse(input);
  if (
    !parsed.success ||
    !secretEqual(parsed.data.signature, jobSignature(parsed.data.jobId))
  )
    throw new Error("Invalid processing message");
  await connect();
  const token = randomUUID();
  const job = await Job.findOneAndUpdate(
    {
      _id: parsed.data.jobId,
      attempts: { $lt: 3 },
      $or: [
        { status: "queued" },
        { status: "running", leaseUntil: { $lt: new Date() } },
      ],
    },
    {
      $set: {
        status: "running",
        leaseUntil: new Date(Date.now() + 180000),
        leaseToken: token,
      },
      $inc: { attempts: 1, version: 1 },
    },
    { returnDocument: "after" },
  );
  if (job) {
    await processJob(job._id.toString(), token);
    return;
  }
  const current = await Job.findById(parsed.data.jobId);
  if (current?.status !== "running") return;
  if (
    current.attempts >= 3 &&
    current.leaseUntil &&
    current.leaseUntil < new Date() &&
    current.leaseToken
  ) {
    await failJob(
      current._id.toString(),
      current.leaseToken,
      "Processing exceeded its resource limits. Please upload a smaller readable PDF.",
    );
    return;
  }
  // A duplicate delivery cannot steal a live lease. Retry after it expires,
  // so an interrupted function or local worker cannot strand the durable job.
  throw new Error("Processing lease is active");
}
