import { Segment } from "../database/models";
import { ownedBook } from "./books";
import { querySchema, queryTerms, escapeRegex } from "./validation";
import { AppError } from "./errors";
export async function retrieve(
  ownerId: string,
  bookId: string,
  input: unknown,
) {
  const query = querySchema.safeParse(input);
  if (!query.success)
    throw new AppError(
      "VALIDATION",
      "Ask a question of at most 500 characters.",
    );
  const book = await ownedBook(ownerId, bookId);
  if (book.status !== "ready")
    throw new AppError("CONFLICT", "This book is still processing.", 409);
  const scope = {
    ownerId,
    bookId: book._id,
    processingVersion: book.processingVersion,
  };
  const terms = queryTerms(query.data);
  if (!terms.length) return { evidence: false, passages: [] };
  let segments = await Segment.find(
    { ...scope, $text: { $search: terms.join(" ") } },
    { score: { $meta: "textScore" } },
  )
    .sort({ score: { $meta: "textScore" } })
    .limit(3)
    .lean();
  if (!segments.length)
    segments = await Segment.find({
      ...scope,
      content: {
        $regex: `\\b(?:${terms.map(escapeRegex).join("|")})\\b`,
        $options: "i",
      },
    })
      .limit(3)
      .lean();
  let budget = 9000;
  const passages = segments
    .map((s) => {
      const content = s.content.slice(0, Math.min(3500, budget));
      budget -= content.length;
      return {
        segmentId: s._id.toString(),
        pageStart: s.pageStart,
        pageEnd: s.pageEnd,
        content,
        score: "score" in s && typeof s.score === "number" ? s.score : null,
      };
    })
    .filter((p) => p.content);
  return { evidence: passages.length > 0, passages };
}
