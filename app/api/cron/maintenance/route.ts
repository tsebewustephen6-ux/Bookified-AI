import { connect } from "@/database/connection";
import { Job, Payment } from "@/database/models";
import { maintenance } from "@/lib/maintenance";
import { dispatchBook } from "@/lib/job-dispatch";
import { secretEqual } from "@/lib/security";
import { dispatchPayment } from "@/lib/payment-dispatch";
import { paymentCatalog } from "@/lib/hubtel";
export const runtime = "nodejs";
export const maxDuration = 180;
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (
    !secret ||
    !secretEqual(request.headers.get("authorization") || "", "Bearer " + secret)
  )
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    await connect();
    await maintenance();
    const jobs = await Job.find({
      attempts: { $lt: 3 },
      $or: [
        { status: "queued" },
        { status: "running", leaseUntil: { $lt: new Date() } },
      ],
    })
      .sort({ createdAt: 1 })
      .limit(25);
    for (const job of jobs)
      await dispatchBook(job.bookId.toString(), job.ownerId);
    const payments = paymentCatalog().available
      ? await Payment.find({
          $or: [
            { status: "pending", open: true },
            { status: "paid", periodEnd: { $gt: new Date() } },
          ],
        })
          .sort({ verifiedAt: 1, createdAt: 1 })
          .limit(25)
      : [];
    for (const payment of payments) await dispatchPayment(payment.reference);
    return Response.json(
      { recovered: jobs.length, paymentsRecovered: payments.length },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json(
      { error: "Maintenance will be retried" },
      { status: 503 },
    );
  }
}
