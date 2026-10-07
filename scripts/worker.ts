import "./environment";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import mongoose from "mongoose";
import { connect } from "../database/connection";
import { Job } from "../database/models";
import { failJob } from "../lib/processing";
import { maintenance } from "../lib/maintenance";
await connect();
let running = true;
let lastMaintenance = 0;
process.on("SIGINT", () => {
  running = false;
});
process.on("SIGTERM", () => {
  running = false;
});
while (running) {
  if (Date.now() - lastMaintenance > 30000) {
    try {
      await maintenance();
    } catch {
      console.error("maintenance_pending");
    }
    lastMaintenance = Date.now();
  }
  const token = randomUUID();
  const job = await Job.findOneAndUpdate(
    {
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
    { returnDocument: "after", sort: { createdAt: 1 } },
  );
  if (!job) {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    continue;
  }
  console.log("processing_job", job._id.toString());
  const child = spawn(
    process.execPath,
    [
      "--max-old-space-size=768",
      "--import",
      "tsx",
      "scripts/process-job.ts",
      job._id.toString(),
      token,
    ],
    { stdio: "inherit", windowsHide: true },
  );
  const result = await new Promise<number | null>((resolve) => {
    const timer = setTimeout(() => {
      child.kill();
    }, 120000);
    child.on("error", () => {
      clearTimeout(timer);
      resolve(1);
    });
    child.on("exit", (code) => {
      clearTimeout(timer);
      resolve(code);
    });
  });
  if (result !== 0)
    await failJob(
      job._id.toString(),
      token,
      "Processing exceeded its resource or time limit. Try a smaller readable PDF.",
    );
}
await mongoose.disconnect();
