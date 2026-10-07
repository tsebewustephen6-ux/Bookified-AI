import { identity } from "@/lib/auth";
import { ownedBook, dto } from "@/lib/books";
import { Job } from "@/database/models";
import { failure } from "@/lib/errors";
export const runtime = "nodejs";
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const owner = await identity();
    const { id } = await context.params;
    const book = await ownedBook(owner, id);
    const job = await Job.findOne({ bookId: book._id, ownerId: owner });
    return Response.json(
      {
        book: dto(book),
        progress: job
          ? {
              stage: job.stage,
              pagesDone: job.pagesDone,
              totalPages: job.totalPages,
            }
          : null,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return failure(error);
  }
}
