// Generates media/icon.png (128x128) — a simple "todo list" marketplace icon.
// Pure Node (zlib only), no external deps.
const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

const W = 128, H = 128;
const buf = Buffer.alloc(W * H * 4);

function px(x, y, r, g, b, a = 255) {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const i = (y * W + x) * 4;
  // simple alpha-over compositing
  const sa = a / 255, da = buf[i + 3] / 255;
  const oa = sa + da * (1 - sa);
  if (oa === 0) return;
  buf[i] = Math.round((r * sa + buf[i] * da * (1 - sa)) / oa);
  buf[i + 1] = Math.round((g * sa + buf[i + 1] * da * (1 - sa)) / oa);
  buf[i + 2] = Math.round((b * sa + buf[i + 2] * da * (1 - sa)) / oa);
  buf[i + 3] = Math.round(oa * 255);
}

function rrect(x0, y0, x1, y1, rad, r, g, b, a = 255) {
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      // rounded corners
      let cx = null, cy = null;
      if (x < x0 + rad && y < y0 + rad) { cx = x0 + rad; cy = y0 + rad; }
      else if (x >= x1 - rad && y < y0 + rad) { cx = x1 - rad; cy = y0 + rad; }
      else if (x < x0 + rad && y >= y1 - rad) { cx = x0 + rad; cy = y1 - rad; }
      else if (x >= x1 - rad && y >= y1 - rad) { cx = x1 - rad; cy = y1 - rad; }
      if (cx !== null) {
        const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
        if (d > rad) continue;
        if (d > rad - 1) { px(x, y, r, g, b, Math.round(a * (rad - d))); continue; }
      }
      px(x, y, r, g, b, a);
    }
  }
}

// Background: rounded square, VS Code blue-ish gradient
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const t = y / H;
    const r = Math.round(0x1e + (0x25 - 0x1e) * t);
    const g = Math.round(0x66 + (0x9e * 0 + 0x8a - 0x66) * t);
    const b = Math.round(0xb8 + (0xd4 - 0xb8) * t);
    // store directly (opaque base inside rounded mask, handled below)
    const i = (y * W + x) * 4;
    buf[i] = r; buf[i + 1] = g; buf[i + 2] = b; buf[i + 3] = 0;
  }
}
// Paint rounded background mask on top of transparency
rrect(8, 8, 120, 120, 22, 0x21, 0x88, 0xcc, 255);

// Three list rows: check box + line
const rows = [40, 66, 92];
rows.forEach((cy, idx) => {
  // checkbox
  rrect(26, cy - 9, 44, cy + 9, 4, 0xff, 0xff, 0xff, 255);
  if (idx === 1) {
    // a check mark (drawn as two thick strokes) on the 2nd box -> "done"
    for (let t = 0; t < 6; t++) { px(30 + t, cy + t - 2, 0x21, 0x88, 0xcc, 255); px(30 + t, cy + t - 1, 0x21, 0x88, 0xcc); px(30 + t, cy + t, 0x21, 0x88, 0xcc); }
    for (let t = 0; t < 9; t++) { px(35 + t, cy + 3 - t, 0x21, 0x88, 0xcc, 255); px(35 + t, cy + 4 - t, 0x21, 0x88, 0xcc); px(35 + t, cy + 5 - t, 0x21, 0x88, 0xcc); }
  }
  // text line
  rrect(54, cy - 5, 100, cy + 5, 5, 0xff, 0xff, 0xff, idx === 1 ? 140 : 235);
});

// ---- PNG encode ----
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const t = Buffer.from(type, 'ascii');
  const body = Buffer.concat([t, data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body) >>> 0, 0);
  return Buffer.concat([len, body, crc]);
}
function crc32(b) {
  let c = ~0;
  for (let i = 0; i < b.length; i++) {
    c ^= b[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xEDB88320 & -(c & 1));
  }
  return ~c;
}
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4);
ihdr[8] = 8; ihdr[9] = 6; // 8-bit, RGBA
// add filter byte (0) per scanline
const raw = Buffer.alloc((W * 4 + 1) * H);
for (let y = 0; y < H; y++) {
  raw[y * (W * 4 + 1)] = 0;
  buf.copy(raw, y * (W * 4 + 1) + 1, y * W * 4, (y + 1) * W * 4);
}
const idat = zlib.deflateSync(raw, { level: 9 });
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', idat),
  chunk('IEND', Buffer.alloc(0)),
]);
const out = path.join(__dirname, '..', 'media', 'icon.png');
fs.writeFileSync(out, png);
console.log('wrote', out, png.length, 'bytes');
