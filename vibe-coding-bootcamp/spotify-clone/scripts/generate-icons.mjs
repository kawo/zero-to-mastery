// Generates the PWA icons in public/icons with no image dependencies:
// pixels are rasterised by hand (4x supersampled) and encoded as PNG with zlib.
// Run with `npm run icons`. The design: an equalizer glyph on a green gradient.
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';

const OUT = new URL('../public/icons/', import.meta.url);
mkdirSync(OUT, { recursive: true });

const TOP = [30, 215, 96]; // #1ed760
const BOTTOM = [15, 122, 58]; // #0f7a3a
const BARS = [
  // [x, top, bottom] in a 0..1 unit box
  [0.28, 0.46, 0.72],
  [0.44, 0.3, 0.72],
  [0.6, 0.38, 0.72],
  [0.76, 0.52, 0.72],
].map(([x, t, b]) => [x - 0.06, t, b]);
const BAR_W = 0.1;

function roundedRectCoverage(x, y, r) {
  // Inside test for a rounded square spanning 0..1 with corner radius r.
  const cx = Math.min(Math.max(x, r), 1 - r);
  const cy = Math.min(Math.max(y, r), 1 - r);
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
}

function inBar(u, v) {
  for (const [x, t, b] of BARS) {
    const r = BAR_W / 2;
    if (u < x || u > x + BAR_W) continue;
    const cx = x + r;
    if (v >= t + r && v <= b - r) return true;
    if ((u - cx) ** 2 + (v - (t + r)) ** 2 <= r * r) return true;
    if ((u - cx) ** 2 + (v - (b - r)) ** 2 <= r * r) return true;
  }
  return false;
}

/**
 * @param {number} size
 * @param {{ maskable?: boolean, inset?: number }} opts `inset`: transparent margin (0..0.5),
 *   as macOS app icons have around their rounded square.
 */
function render(size, { maskable = false, inset = 0 } = {}) {
  const SS = 4;
  const px = Buffer.alloc(size * size * 4);
  // Maskable icons need full-bleed background and a glyph inside the 80% safe zone.
  const radius = maskable ? 0 : 0.22;
  const glyphScale = maskable ? 0.72 : 1;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let bg = 0;
      let fg = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const u = ((x + (sx + 0.5) / SS) / size - inset) / (1 - 2 * inset);
          const v = ((y + (sy + 0.5) / SS) / size - inset) / (1 - 2 * inset);
          if (u < 0 || u > 1 || v < 0 || v > 1) continue;
          if (maskable || roundedRectCoverage(u, v, radius)) {
            bg++;
            const gu = (u - 0.5) / glyphScale + 0.5;
            const gv = (v - 0.5) / glyphScale + 0.5;
            if (inBar(gu, gv)) fg++;
          }
        }
      }
      const n = SS * SS;
      const t = Math.min(1, Math.max(0, (y / (size - 1) - inset) / (1 - 2 * inset)));
      const base = TOP.map((c, i) => c + (BOTTOM[i] - c) * t);
      const f = fg / Math.max(bg, 1);
      const [r, g, b] = base.map((c) => Math.round(c + (18 - c) * f));
      const o = (y * size + x) * 4;
      px[o] = r;
      px[o + 1] = g;
      px[o + 2] = b;
      px[o + 3] = Math.round((bg / n) * 255);
    }
  }
  return encodePng(size, size, px);
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function encodePng(w, h, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0; // filter: none
    rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const files = {
  'icon-192.png': render(192),
  'icon-512.png': render(512),
  'icon-maskable-512.png': render(512, { maskable: true }),
  'apple-touch-icon.png': render(180, { maskable: true }),
  'favicon-32.png': render(32),
};
for (const [name, buf] of Object.entries(files)) writeFileSync(new URL(name, OUT), buf);

// Desktop app icon (electron-builder converts it to .ico and .icns). The 10% margin
// matches the macOS icon grid.
const BUILD = new URL('../build/', import.meta.url);
mkdirSync(BUILD, { recursive: true });
writeFileSync(new URL('icon.png', BUILD), render(1024, { inset: 0.1 }));

const bars = BARS.map(
  ([x, t, b]) =>
    `<rect x="${(x * 512).toFixed(1)}" y="${(t * 512).toFixed(1)}" width="${BAR_W * 512}" height="${((b - t) * 512).toFixed(1)}" rx="${(BAR_W * 256).toFixed(1)}"/>`,
).join('');
writeFileSync(
  new URL('icon.svg', OUT),
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1ed760"/><stop offset="1" stop-color="#0f7a3a"/></linearGradient></defs><rect width="512" height="512" rx="${0.22 * 512}" fill="url(#g)"/><g fill="#121212">${bars}</g></svg>\n`,
);
console.log('Icons written:', [...Object.keys(files), 'icon.svg'].join(', '));
