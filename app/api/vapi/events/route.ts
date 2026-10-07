import { z } from "zod";
import { webhookSession, reconcileCall } from "@/lib/vapi";
import { body } from "@/lib/security";
import { failure, AppError } from "@/lib/errors";
export async function POST(request: Request) {
  try {
    const input = z
      .object({
        message: z.object({
          type: z.enum(["status-update", "end-of-call-report"]),
          call: z.object({ id: z.string().uuid() }),
        }),
      })
      .safeParse(await body(request, 262144));
    if (!input.success)
      throw new AppError("VALIDATION", "Invalid provider lifecycle event.");
    const record = await webhookSession(request, input.data.message.call.id);
    await reconcileCall(record._id.toString());
    return Response.json({ accepted: true });
  } catch (error) {
    return failure(error);
  }
}
