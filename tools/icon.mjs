#!/usr/bin/env node
// Renders the app icon (blue gradient, white handwriting stroke on a ruled line) to icons/*.png.
// No image library: distance-field rasterizer + minimal PNG encoder. Usage: node tools/icon.mjs
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';

const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = (b) => { let c = ~0; for (const x of b) c = crcTable[(c ^ x) & 255] ^ (c >>> 8); return ~c >>> 0; };
function png(size, rgb) {
  const chunk = (type, data) => {
    const t = Buffer.from(type), len = Buffer.alloc(4), crc = Buffer.alloc(4);
    len.writeUInt32BE(data.length); crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
    return Buffer.concat([len, t, data, crc]);
  };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 2; // 8-bit RGB
  const raw = Buffer.alloc(size * (size * 3 + 1));
  for (let y = 0; y < size; y++) { raw[y * (size * 3 + 1)] = 0; rgb.copy(raw, y * (size * 3 + 1) + 1, y * size * 3, (y + 1) * size * 3); }
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

// Handwriting-like stroke: Catmull-Rom through control points (unit square).
const ctrl = [[0.17, 0.60], [0.27, 0.36], [0.35, 0.62], [0.45, 0.34], [0.53, 0.62], [0.63, 0.36], [0.71, 0.60], [0.83, 0.42]];
const curve = [];
for (let i = 0; i < ctrl.length - 1; i++) {
  const p0 = ctrl[Math.max(i - 1, 0)], p1 = ctrl[i], p2 = ctrl[i + 1], p3 = ctrl[Math.min(i + 2, ctrl.length - 1)];
  for (let s = 0; s < 24; s++) {
    const t = s / 24, t2 = t * t, t3 = t2 * t;
    curve.push([0, 1].map((k) => 0.5 * (2 * p1[k] + (-p0[k] + p2[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3)));
  }
}
curve.push(ctrl.at(-1));
const segDist = (px, py, [ax, ay], [bx, by]) => {
  const dx = bx - ax, dy = by - ay, t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
};

function render(size, pad = 0) {
  // dark style: graphite gradient, white ink, blue ruled line
  const rgb = Buffer.alloc(size * size * 3), top = [58, 58, 60], bottom = [18, 18, 20], blue = [10, 132, 255];
  const inner = 1 - 2 * pad; // maskable icons keep the motif inside the safe zone
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = (x + 0.5) / size, v = (y + 0.5) / size, g = (u + v) / 2;
    let c = top.map((t, k) => t + (bottom[k] - t) * g);
    const mu = (u - pad) / inner, mv = (v - pad) / inner, px = 1 / (size * inner);
    // ruled line
    const line = Math.max(0, Math.min(1, (0.012 - Math.abs(mv - 0.68)) / px + 0.5)) * (mu > 0.1 && mu < 0.9 ? 0.45 : 0);
    // stroke
    let d = Infinity;
    for (let i = 1; i < curve.length; i++) d = Math.min(d, segDist(mu, mv, curve[i - 1], curve[i]));
    const ink = Math.max(0, Math.min(1, (0.035 - d) / px + 0.5));
    c = c.map((t, k) => t + (blue[k] - t) * Math.min(1, line * 2));
    c = c.map((t) => t + (255 - t) * ink);
    rgb.set(c.map(Math.round), (y * size + x) * 3);
  }
  return png(size, rgb);
}

const dir = new URL('../icons/', import.meta.url);
mkdirSync(dir, { recursive: true });
for (const [name, size, pad] of [['apple-touch-icon.png', 180, 0], ['icon-192.png', 192, 0], ['icon-512.png', 512, 0], ['icon-maskable-512.png', 512, 0.1]])
  writeFileSync(new URL(name, dir), render(size, pad));
console.log('icons/ written');
