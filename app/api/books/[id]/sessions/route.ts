import { z } from "zod";
import { identity, entitlement } from "@/lib/auth";
import { ownedBook } from "@/lib/books";
import { reserveSession } from "@/lib/sessions";
import { createCall, validateVapiConfiguration } from "@/lib/vapi";
import { sameOrigin, body, rateLimit } from "@/lib/security";
import { failure, AppError } from "@/lib/errors";
export const runtime = "nodejs";
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    sameOrigin(request);
    const owner = await identity();
    await rateLimit(owner, "call-admission", 8);
    const id = (await context.params).id;
    const book = await ownedBook(owner, id);
    validateVapiConfiguration(book.personaId);
    const input = z
      .object({ idempotencyKey: z.string().uuid() })
      .strict()
      .safeParse(await body(request));
    if (!input.success)
      throw new AppError("VALIDATION", "Invalid conversation admission.");
    const record = await reserveSession(
      owner,
      id,
      await entitlement(owner),
      input.data.idempotencyKey,
    );
    return Response.json(await createCall(record._id.toString()), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return failure(error);
  }
}
