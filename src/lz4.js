// Apple "compression_lz4" container: blocks 'bv41' (LZ4), 'bv4-' (raw), terminated by 'bv4$'.
const MAGIC_LZ4 = 0x31347662, MAGIC_RAW = 0x2d347662, MAGIC_END = 0x24347662;
// shortcut: assumed per-block decoded limit, confirm against large samples (plan 1.4).
export const BLOCK_LIMIT = 0x10000;

function lz4BlockDecode(src, outLen) {
  const out = new Uint8Array(outLen);
  let i = 0, o = 0;
  while (i < src.length) {
    const t = src[i++];
    let l = t >> 4;
    if (l === 15) { let b; do { b = src[i++]; l += b; } while (b === 255); }
    out.set(src.subarray(i, i + l), o); i += l; o += l;
    if (i >= src.length) break;
    const off = src[i] | (src[i + 1] << 8); i += 2;
    if (off === 0 || off > o) throw new Error('lz4: bad offset');
    let m = t & 15;
    if (m === 15) { let b; do { b = src[i++]; m += b; } while (b === 255); }
    m += 4;
    for (let k = 0; k < m; k++, o++) out[o] = out[o - off];
  }
  if (o !== outLen) throw new Error(`lz4: decoded ${o} != ${outLen}`);
  return out;
}

// Literal-only LZ4 block: always valid, no compression (shortcut: add matching if files get too big).
function lz4BlockEncode(src) {
  const n = src.length, ext = [];
  let rest = n - 15;
  if (n >= 15) { while (rest >= 255) { ext.push(255); rest -= 255; } ext.push(rest); }
  const out = new Uint8Array(1 + ext.length + n);
  out[0] = (n >= 15 ? 15 : n) << 4;
  out.set(ext, 1);
  out.set(src, 1 + ext.length);
  return out;
}

/** Decode a container starting at `pos` in `buf`. Returns { data, end } (end = index after 'bv4$'). */
export function decode(buf, pos = 0) {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const parts = [];
  for (;;) {
    const magic = dv.getUint32(pos, true);
    if (magic === MAGIC_END) { pos += 4; break; }
    if (magic === MAGIC_LZ4) {
      const dn = dv.getUint32(pos + 4, true), en = dv.getUint32(pos + 8, true);
      parts.push(lz4BlockDecode(buf.subarray(pos + 12, pos + 12 + en), dn));
      pos += 12 + en;
    } else if (magic === MAGIC_RAW) {
      const n = dv.getUint32(pos + 4, true);
      parts.push(buf.slice(pos + 8, pos + 8 + n));
      pos += 8 + n;
    } else throw new Error(`lz4: unknown block magic at ${pos}`);
  }
  return { data: concat(parts), end: pos };
}

export function encode(data) {
  const parts = [];
  for (let p = 0; p < data.length || (p === 0 && !parts.length); p += BLOCK_LIMIT) {
    const chunk = data.subarray(p, p + BLOCK_LIMIT);
    const body = lz4BlockEncode(chunk);
    const head = new Uint8Array(12), dv = new DataView(head.buffer);
    dv.setUint32(0, MAGIC_LZ4, true); dv.setUint32(4, chunk.length, true); dv.setUint32(8, body.length, true);
    parts.push(head, body);
    if (!data.length) break;
  }
  parts.push(new Uint8Array([0x62, 0x76, 0x34, 0x24]));
  return concat(parts);
}

export function concat(parts) {
  const out = new Uint8Array(parts.reduce((s, p) => s + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}
