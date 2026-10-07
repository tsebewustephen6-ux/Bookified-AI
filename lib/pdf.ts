import { createCanvas, DOMMatrix, ImageData, Path2D } from "@napi-rs/canvas";
import { AppError } from "./errors";
import { chunkPages, type PageText } from "./chunks";
import { pdfSignature } from "./storage";
export async function extractPdf(
  bytes: Uint8Array,
  progress: (done: number, total: number) => Promise<void>,
) {
  if (!pdfSignature(bytes))
    throw new AppError("PROCESSING_FAILED", "This file is not a PDF.");
  Object.assign(globalThis, { DOMMatrix, ImageData, Path2D });
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const task = pdfjs.getDocument({
    data: new Uint8Array(bytes),
    useSystemFonts: true,
    maxImageSize: 16_000_000,
    disableFontFace: true,
  });
  try {
    const doc = await task.promise;
    const maxPages = Number(process.env.PDF_MAX_PAGES || 1000);
    if (!Number.isInteger(maxPages) || maxPages < 1 || maxPages > 1000)
      throw new AppError(
        "PROCESSING_FAILED",
        "PDF_MAX_PAGES must be an integer between 1 and 1000.",
      );
    if (doc.numPages > maxPages)
      throw new AppError(
        "PROCESSING_FAILED",
        `PDF exceeds the ${maxPages}-page processing limit.`,
      );
    const pages: PageText[] = [];
    let cover: Buffer | undefined;
    let chars = 0;
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      const text = content.items
        .map((item) =>
          "str" in item ? item.str + (item.hasEOL ? "\n" : " ") : "",
        )
        .join("")
        .replace(/\s+/g, " ")
        .trim();
      chars += text.length;
      if (chars > 12_000_000)
        throw new AppError(
          "PROCESSING_FAILED",
          "PDF text exceeds the processing resource limit.",
        );
      pages.push({ page: i, text });
      if (i === 1) {
        try {
          const initial = page.getViewport({ scale: 1 });
          const viewport = page.getViewport({
            scale: Math.min(1.5, 600 / initial.width),
          });
          if (
            !Number.isFinite(viewport.width * viewport.height) ||
            viewport.width * viewport.height > 16_000_000
          )
            throw new Error("Cover rendering resource limit");
          const canvas = createCanvas(
            Math.ceil(viewport.width),
            Math.ceil(viewport.height),
          );
          const context = canvas.getContext("2d");
          await page.render({
            canvas: canvas as unknown as HTMLCanvasElement,
            canvasContext: context as unknown as CanvasRenderingContext2D,
            viewport,
          }).promise;
          cover = canvas.toBuffer("image/png");
        } catch {
          /* Text remains authoritative; local fallback cover is used. */
        }
      }
      await progress(i, doc.numPages);
      page.cleanup();
    }
    const segments = chunkPages(pages);
    if (!segments.length)
      throw new AppError(
        "PROCESSING_FAILED",
        "No readable text was found. Image-only PDFs need OCR, which is not included.",
      );
    return { pageCount: doc.numPages, segments, cover };
  } catch (error) {
    if (error instanceof AppError) throw error;
    if (error instanceof Error && error.name === "PasswordException")
      throw new AppError(
        "PROCESSING_FAILED",
        "Password-protected PDFs are not supported. Upload an unlocked copy.",
      );
    throw new AppError(
      "PROCESSING_FAILED",
      "The PDF could not be read. Upload a valid, unencrypted PDF.",
    );
  } finally {
    await task.destroy();
  }
}
