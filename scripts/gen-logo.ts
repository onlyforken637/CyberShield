/**
 * gen-logo.ts — renders src/app/icon.svg to PNG favicon assets via sharp.
 * Run: bun scripts/gen-logo.ts
 */
import { readFileSync, writeFileSync } from "node:fs";
import sharp from "sharp";

const svgPath = "public/icon.svg";
const svg = readFileSync(svgPath);

// High-density vector render -> crisp downscale
async function emit(size: number, out: string) {
  const density = Math.ceil(72 * (size / 128) * 4); // render ~4x target
  const buf = await sharp(svg, { density }).resize(size, size).png().toBuffer();
  writeFileSync(out, buf);
  console.log(`✓ ${out} (${size}×${size})`);
}

await emit(180, "public/apple-touch-icon.png");
await emit(32, "public/favicon.png");
console.log("done");
