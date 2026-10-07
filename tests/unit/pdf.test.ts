import { it, expect } from "vitest";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { extractPdf } from "../../lib/pdf";
it("extracts and renders a real multi-page synthetic PDF with unique facts", async () => {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (const text of [
    "Velorinth keeps exactly 739 zirconium moths.",
    "AI finds the ultramarine lantern on the second page.",
  ]) {
    const page = doc.addPage();
    page.drawText(text, { x: 50, y: 700, font, size: 14 });
  }
  const pages: number[] = [];
  const result = await extractPdf(await doc.save(), async (done) => {
    pages.push(done);
  });
  expect(result.pageCount).toBe(2);
  expect(result.segments[0].content).toContain("739");
  expect(result.segments[0].pageEnd).toBe(2);
  expect(pages).toEqual([1, 2]);
  expect(result.cover?.subarray(1, 4).toString()).toBe("PNG");
});
it("rejects corrupted and image-only PDFs with safe errors", async () => {
  await expect(extractPdf(Buffer.from("bad"), async () => {})).rejects.toThrow(
    "not a PDF",
  );
  const doc = await PDFDocument.create();
  doc.addPage();
  await expect(extractPdf(await doc.save(), async () => {})).rejects.toThrow(
    "OCR",
  );
});
it("enforces configured page limits and rejects invalid limits", async () => {
  const doc = await PDFDocument.create();
  doc.addPage();
  doc.addPage();
  const bytes = await doc.save();
  const previous = process.env.PDF_MAX_PAGES;
  try {
    process.env.PDF_MAX_PAGES = "1";
    await expect(extractPdf(bytes, async () => {})).rejects.toThrow("1-page");
    process.env.PDF_MAX_PAGES = "NaN";
    await expect(extractPdf(bytes, async () => {})).rejects.toThrow("integer");
  } finally {
    if (previous === undefined) delete process.env.PDF_MAX_PAGES;
    else process.env.PDF_MAX_PAGES = previous;
  }
});
