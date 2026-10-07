export type PageText = { page: number; text: string };
export function chunkPages(pages: PageText[], size = 500, overlap = 75) {
  if (size < 2 || overlap < 0 || overlap >= size)
    throw new Error("Invalid chunk bounds");
  const words = pages.flatMap((p) =>
    p.text
      .normalize("NFKC")
      .trim()
      .split(/\s+/u)
      .filter(Boolean)
      .map((word) => ({ word, page: p.page })),
  );
  const chunks = [];
  for (let start = 0; start < words.length; start += size - overlap) {
    const slice = words.slice(start, start + size);
    chunks.push({
      segmentIndex: chunks.length,
      pageStart: slice[0].page,
      pageEnd: slice.at(-1)!.page,
      content: slice.map((w) => w.word).join(" "),
      wordCount: slice.length,
    });
    if (start + size >= words.length) break;
  }
  return chunks;
}
