import { Segment } from "../database/models";
import { ownedBook } from "./books";
import { querySchema, escapeRegex } from "./validation";
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
  const terms = retrievalTerms(query.data);
  if (!terms.length) return { evidence: false, passages: [] };
  let segments = await Segment.find(
    { ...scope, $text: { $search: terms.join(" ") } },
    { score: { $meta: "textScore" } },
  )
    .sort({ score: { $meta: "textScore" } })
    .limit(18)
    .lean();
  if (!segments.length)
    segments = await Segment.find({
      ...scope,
      content: {
        $regex: `\\b(?:${terms.map(escapeRegex).join("|")})\\b`,
        $options: "i",
      },
    })
      .limit(64)
      .lean();
  const ranked = segments.sort((a, b) => passageScore(b.content, terms) - passageScore(a.content, terms));
  const anchors = ranked.slice(0, 3);
  const indices = [...new Set(anchors.flatMap(s => [s.segmentIndex - 1, s.segmentIndex, s.segmentIndex + 1]).filter(i => i >= 0))];
  const neighbours = indices.length ? await Segment.find({ ...scope, segmentIndex: { $in: indices } }).sort({ segmentIndex: 1 }).limit(9).lean() : [];
  // Preserve each anchor's surrounding explanation instead of cutting off its steps.
  const expanded = anchors.flatMap(anchor => neighbours.filter(s => Math.abs(s.segmentIndex - anchor.segmentIndex) <= 1));
  const unique = [...new Map(expanded.map(s => [s._id.toString(), s])).values()];
  let budget = 24000;
  const passages = unique
    .map((s) => {
      const content = s.content.slice(0, Math.min(5000, budget));
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

const stopWords = new Set('the a an and or to of in on for with is are was were it its this that those these them me my you your please teach explain tell about what how why could would should can do does give more detail details'.split(' '));
export function retrievalTerms(query: string) { return [...new Set((query.toLowerCase().match(/[\p{L}\p{N}]{2,}/gu) || []).filter(term => !stopWords.has(term)))].slice(0, 16); }
export function passageScore(content: string, terms: string[]) {
  const lower = content.toLowerCase();
  return terms.reduce((sum, term) => sum + (lower.match(new RegExp(`\\b${escapeRegex(term)}\\b`, 'g'))?.length ? 10 : 0), 0)
    + (terms.length > 1 && lower.includes(terms.join(' ')) ? 25 : 0);
}
