// Minimal schemaless protobuf. Fields keep their raw bytes so parse→serialize is byte-identical.

export function readVarint(buf, pos) {
  let v = 0n, shift = 0n, b;
  do {
    if (pos >= buf.length) throw new Error('pb: truncated varint');
    b = buf[pos++];
    v |= BigInt(b & 0x7f) << shift; shift += 7n;
  } while (b & 0x80);
  return [v, pos];
}

export function writeVarint(v) {
  v = BigInt(v);
  const out = [];
  do { let b = Number(v & 0x7fn); v >>= 7n; if (v) b |= 0x80; out.push(b); } while (v);
  return Uint8Array.from(out);
}

/** Parse one message. Each field: { no, wire, raw (whole field incl. key), value }.
 *  value: BigInt (varint), Uint8Array (len/fixed). */
export function parse(buf) {
  const fields = [];
  let pos = 0;
  while (pos < buf.length) {
    const start = pos;
    let key; [key, pos] = readVarint(buf, pos);
    const no = Number(key >> 3n), wire = Number(key & 7n);
    let value;
    if (wire === 0) [value, pos] = readVarint(buf, pos);
    else if (wire === 2) { let n; [n, pos] = readVarint(buf, pos); value = buf.subarray(pos, pos + Number(n)); pos += Number(n); }
    else if (wire === 1) { value = buf.subarray(pos, pos + 8); pos += 8; }
    else if (wire === 5) { value = buf.subarray(pos, pos + 4); pos += 4; }
    else throw new Error(`pb: wire type ${wire} at ${start}`);
    if (pos > buf.length) throw new Error('pb: truncated field');
    fields.push({ no, wire, value, raw: buf.subarray(start, pos) });
  }
  return fields;
}

export function field(no, value) {
  const wire = typeof value === 'bigint' || typeof value === 'number' ? 0 : 2;
  const key = writeVarint((BigInt(no) << 3n) | BigInt(wire));
  if (wire === 0) return { no, wire, value: BigInt(value), raw: cat(key, writeVarint(value)) };
  const v = typeof value === 'string' ? new TextEncoder().encode(value) : value;
  return { no, wire, value: v, raw: cat(key, writeVarint(v.length), v) };
}

export const serialize = (fields) => cat(...fields.map((f) => f.raw));

/** Stream of varint-length-prefixed messages (index.*.pb, notes/*). */
export function parseDelimited(buf) {
  const msgs = [];
  let pos = 0;
  while (pos < buf.length) {
    let n; [n, pos] = readVarint(buf, pos);
    msgs.push(buf.subarray(pos, pos + Number(n)));
    pos += Number(n);
  }
  if (pos !== buf.length) throw new Error('pb: delimited overrun');
  return msgs;
}

export const serializeDelimited = (msgs) => cat(...msgs.flatMap((m) => [writeVarint(m.length), m]));

export function cat(...parts) {
  const out = new Uint8Array(parts.reduce((s, p) => s + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}
