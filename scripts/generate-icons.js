/**
 * Generates PNG toolbar icons using node-canvas.
 * Run: npm run generate-icons  (requires: npm i -D canvas)
 * Output: public/icons/icon-{16,48,128}.png
 */
import { createCanvas } from 'canvas';
import { mkdirSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, '..', 'public', 'icons');
const SIZES = [16, 48, 128];

function roundRectPath(ctx, x, y, w, h, radius) {
  const r = Math.min(radius, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawIcon(canvas, label) {
  const ctx = canvas.getContext('2d');
  const size = canvas.width;
  const corner = Math.max(2, Math.round(size * 0.22));

  const g = ctx.createLinearGradient(0, 0, size, size);
  g.addColorStop(0, '#2563eb');
  g.addColorStop(1, '#0d9488');
  ctx.fillStyle = g;
  roundRectPath(ctx, 0, 0, size, size, corner);
  ctx.fill();

  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const fontSize = Math.round(size * 0.42);
  ctx.font = `700 ${fontSize}px system-ui, -apple-system, "Segoe UI", sans-serif`;
  ctx.fillText(label, size / 2, size / 2 + size * 0.02);
}

mkdirSync(OUT_DIR, { recursive: true });

for (const size of SIZES) {
  const canvas = createCanvas(size, size);
  drawIcon(canvas, 'PL');
  const buf = canvas.toBuffer('image/png');
  writeFileSync(join(OUT_DIR, `icon-${size}.png`), buf);
  console.log(`Wrote icon-${size}.png`);
}
