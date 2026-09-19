/*
 * Draws the app icon (512×512 PNG) from the logo in the game's header: the
 * hexagon and the lightning bolt, same geometry and colours as the inline SVG.
 * Pure Node (zlib only): polygons are filled with 4×4 supersampling for smooth
 * edges, then encoded as an RGBA PNG. electron-builder turns it into .ico/.icns.
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const SIZE = 512;
const VIEW = 36;                 // the SVG's viewBox is 0 0 36 36
const SCALE = SIZE / VIEW;
const SS = 4;                    // supersamples per axis

// Shapes from index.html's header logo (viewBox units).
const hexagon = [[18, 2], [32, 10], [32, 26], [18, 34], [4, 26], [4, 10]];
const bolt = [[19.5, 8], [11, 20], [17, 20], [15.5, 28], [24, 16], [18, 16]];
const scaleAbout = (poly, k) => poly.map(([x, y]) => [18 + (x - 18) * k, 18 + (y - 18) * k]);

// The SVG strokes the hexagon (1.5 units): stroke colour outside, fill inside.
const layers = [
  { poly: scaleAbout(hexagon, 1 + 0.75 / 16), rgb: [0x33, 0x41, 0x55] }, // #334155 stroke
  { poly: scaleAbout(hexagon, 1 - 0.75 / 16), rgb: [0x1e, 0x29, 0x3b] }, // #1E293B fill
  { poly: bolt, rgb: [0x10, 0xb9, 0x81] },                               // #10B981 bolt
];

function inside(poly, x, y) {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

// Rasterise: for each pixel, average the colour of its supersamples (topmost layer wins).
const pixels = Buffer.alloc(SIZE * SIZE * 4);
for (let py = 0; py < SIZE; py++) {
  for (let px = 0; px < SIZE; px++) {
    let r = 0, g = 0, b = 0, a = 0;
    for (let sy = 0; sy < SS; sy++) {
      for (let sx = 0; sx < SS; sx++) {
        const x = (px + (sx + 0.5) / SS) / SCALE;
        const y = (py + (sy + 0.5) / SS) / SCALE;
        for (let l = layers.length - 1; l >= 0; l--) {
          if (inside(layers[l].poly, x, y)) {
            const [lr, lg, lb] = layers[l].rgb;
            r += lr; g += lg; b += lb; a += 1;
            break;
          }
        }
      }
    }
    const i = (py * SIZE + px) * 4;
    if (a) {
      pixels[i] = Math.round(r / a);
      pixels[i + 1] = Math.round(g / a);
      pixels[i + 2] = Math.round(b / a);
    }
    pixels[i + 3] = Math.round((a / (SS * SS)) * 255);
  }
}

// PNG encoding.
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
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(SIZE, 0);
ihdr.writeUInt32BE(SIZE, 4);
ihdr[8] = 8;  // bit depth
ihdr[9] = 6;  // RGBA
const raw = Buffer.alloc(SIZE * (SIZE * 4 + 1));
for (let y = 0; y < SIZE; y++) {
  raw[y * (SIZE * 4 + 1)] = 0; // filter: none
  pixels.copy(raw, y * (SIZE * 4 + 1) + 1, y * SIZE * 4, (y + 1) * SIZE * 4);
}
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
]);

const out = path.resolve(__dirname, '..', 'build', 'icon.png');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, png);
console.log(`make-icon: wrote build/icon.png (${SIZE}×${SIZE}, ${Math.round(png.length / 1024)} KB)`);
