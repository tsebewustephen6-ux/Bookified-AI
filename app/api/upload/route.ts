import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { z } from "zod";
import { identity } from "@/lib/auth";
import { ownedBook } from "@/lib/books";
import { sameOrigin, body, rateLimit } from "@/lib/security";
import { AppError, failure } from "@/lib/errors";
import { required } from "@/lib/env";
import { Book } from "@/database/models";
import { connect } from "@/database/connection";
import { verifyStored } from "@/lib/storage";
const payloadSchema = z.object({
  id: z.string().regex(/^[a-f\d]{24}$/i),
  purpose: z.enum(["pdf", "cover"]),
});
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    const raw = await body(request);
    const parsed = z
      .discriminatedUnion("type", [
        z.object({
          type: z.literal("blob.generate-client-token"),
          payload: z.object({
            pathname: z.string().max(250),
            clientPayload: z.string().max(200).nullable().optional(),
            multipart: z.boolean().optional(),
          }),
        }),
        z.object({
          type: z.literal("blob.upload-completed"),
          payload: z.unknown(),
        }),
      ])
      .safeParse(raw);
    if (!parsed.success)
      throw new AppError("VALIDATION", "Invalid upload request.");
    const response = await handleUpload({
      body: raw as HandleUploadBody,
      request,
      token: required("BLOB_READ_WRITE_TOKEN"),
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        sameOrigin(request);
        const owner = await identity();
        await rateLimit(owner, "upload-grant", 15);
        const payload = payloadSchema.safeParse(
          JSON.parse(clientPayload || "{}"),
        );
        if (!payload.success)
          throw new AppError("VALIDATION", "Invalid upload purpose.");
        const book = await ownedBook(owner, payload.data.id);
        const isPdf = payload.data.purpose === "pdf";
        if (
          book.status !== "uploading" ||
          book.uploadExpiresAt < new Date() ||
          pathname !== (isPdf ? book.fileKey : book.coverKey) ||
          (isPdf ? book.pdfComplete : book.coverComplete)
        )
          throw new AppError(
            "UNAUTHORIZED",
            "Upload grant is unavailable.",
            403,
          );
        return {
          allowedContentTypes: [
            isPdf ? "application/pdf" : book.expectedCoverType!,
          ],
          maximumSizeInBytes: isPdf
            ? book.fileSizeBytes
            : book.expectedCoverSize!,
          validUntil: book.uploadExpiresAt.getTime(),
          addRandomSuffix: false,
          allowOverwrite: false,
          tokenPayload: JSON.stringify({ ...payload.data, owner }),
        };
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        const payload = payloadSchema
          .extend({ owner: z.string().min(1) })
          .parse(JSON.parse(tokenPayload || "{}"));
        await connect();
        const book = await Book.findOne({
          _id: payload.id,
          ownerId: payload.owner,
        });
        if (!book) throw new AppError("NOT_FOUND", "Upload not found.", 404);
        const isPdf = payload.purpose === "pdf";
        const key = isPdf ? book.fileKey : book.coverKey;
        if (!key || blob.pathname !== key)
          throw new AppError(
            "UNAUTHORIZED",
            "Object does not match upload.",
            403,
          );
        await verifyStored(
          key,
          isPdf ? book.fileSizeBytes : book.expectedCoverSize!,
          isPdf ? "application/pdf" : book.expectedCoverType!,
        );
        await Book.updateOne(
          { _id: book._id, ownerId: payload.owner, status: "uploading" },
          { $set: isPdf ? { pdfComplete: true } : { coverComplete: true } },
        );
      },
    });
    return Response.json(response);
  } catch (error) {
    return failure(error);
  }
}
