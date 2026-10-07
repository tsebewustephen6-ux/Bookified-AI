import { PDFDocument, StandardFonts } from "pdf-lib";
import { mkdir, writeFile } from "node:fs/promises";
const doc = await PDFDocument.create();
const font = await doc.embedFont(StandardFonts.Helvetica);
for (const text of [
  "Velorinth guards exactly 739 zirconium moths beneath the ultramarine lantern.",
  "The secret harbor code is BERYL-2468. The lantern keeper is named Talvora.",
]) {
  const page = doc.addPage();
  page.drawText(text, { x: 50, y: 700, size: 14, font, maxWidth: 480 });
}
await mkdir(".test-data", { recursive: true });
await writeFile(".test-data/bookified-synthetic.pdf", await doc.save());
console.log("Synthetic PDF created: .test-data/bookified-synthetic.pdf");
