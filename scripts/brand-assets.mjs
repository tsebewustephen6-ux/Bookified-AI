import { createCanvas, loadImage } from "@napi-rs/canvas";
import { mkdir, writeFile } from "node:fs/promises";

// Format/size derivatives of the generated artwork, preserving transparent alpha.
const source = await loadImage("assets/brand/bookified-logo-source.png");
const scan = createCanvas(source.width, source.height);
const context = scan.getContext("2d");
context.drawImage(source, 0, 0);
const { data } = context.getImageData(0, 0, source.width, source.height);
let left = source.width,
  top = source.height,
  right = 0,
  bottom = 0;
for (let y = 0; y < source.height; y++)
  for (let x = 0; x < source.width; x++) {
    if (data[(y * source.width + x) * 4 + 3] > 10) {
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x);
      bottom = Math.max(bottom, y);
    }
  }
if (right <= left || bottom <= top)
  throw new Error("Generated logo has no visible artwork.");
const width = right - left + 1,
  height = bottom - top + 1;
function render(size, backdrop = false) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext("2d");
  if (backdrop) {
    ctx.fillStyle = "#f8f5ef";
    ctx.fillRect(0, 0, size, size);
  }
  const scale = (size * 0.86) / Math.max(width, height);
  ctx.drawImage(
    source,
    left,
    top,
    width,
    height,
    (size - width * scale) / 2,
    (size - height * scale) / 2,
    width * scale,
    height * scale,
  );
  return canvas.toBuffer("image/png");
}
await mkdir("public/brand", { recursive: true });
await writeFile("public/brand/bookified-mark.png", render(256));
await writeFile("app/apple-icon.png", render(180, true));
const sizes = [16, 32, 48, 64];
const images = sizes.map((size) => render(size, true));
const header = Buffer.alloc(6 + images.length * 16);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(images.length, 4);
let offset = header.length;
images.forEach((png, index) => {
  const entry = 6 + index * 16;
  header[entry] = sizes[index];
  header[entry + 1] = sizes[index];
  header.writeUInt16LE(1, entry + 4);
  header.writeUInt16LE(32, entry + 6);
  header.writeUInt32LE(png.length, entry + 8);
  header.writeUInt32LE(offset, entry + 12);
  offset += png.length;
});
await writeFile("app/favicon.ico", Buffer.concat([header, ...images]));
console.log(
  "Created logo PNG, Apple icon and 16/32/48/64px favicon from the generated mark.",
);
