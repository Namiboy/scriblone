// GoodNotes stroke payload ("tpl\0"), found inside notes/<UUID> after Apple-LZ4 decompression.
// Layout observed in ZettelmitSchrift notes/3AD0D5D2… (signature "vuA(v)A(S(uu))A(S(uuuu))vA(f)"):
//   v  u16      version? (2)
//   u  f32      pen width? (4.677)
//   A(v)        u32 count + u16[] per point (0 for first, 1 after) — meaning unknown
//   A(S(uu))    u32 count + (x,y) f32 pairs: start point(s)
//   A(S(uuuu))  u32 count + 4×f32 per segment: (cx, cy, x, y) control+end, assumed quadratic
//   v  u16      (1)
//   A(f)        u32 count + f32[] (empty in sample) — pressure?
// Field meanings are hypotheses until the sample sweep (plan 1.2.3); byte layout is verified by test.
export const SIGNATURE = 'vuA(v)A(S(uu))A(S(uuuu))vA(f)';

export function decode(buf) {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  if (String.fromCharCode(...buf.subarray(0, 3)) !== 'tpl' || buf[3] !== 0) throw new Error('tpl: bad magic');
  const total = dv.getUint32(4, true);
  if (total !== buf.length) throw new Error(`tpl: length ${total} != ${buf.length}`);
  let p = 8;
  while (buf[p] !== 0) p++;
  const sig = new TextDecoder().decode(buf.subarray(8, p));
  if (sig !== SIGNATURE) throw new Error(`tpl: unknown signature ${sig}`);
  p++;
  const u16 = () => { const v = dv.getUint16(p, true); p += 2; return v; };
  const u32 = () => { const v = dv.getUint32(p, true); p += 4; return v; };
  const f32 = () => { const v = dv.getFloat32(p, true); p += 4; return v; };
  const arr = (fn) => Array.from({ length: u32() }, fn);
  const s = {
    version: u16(),
    width: f32(),
    flags: arr(u16),
    starts: arr(() => [f32(), f32()]),
    segments: arr(() => [f32(), f32(), f32(), f32()]),
    v2: u16(),
    extra: arr(f32),
  };
  if (p !== buf.length) throw new Error(`tpl: ${buf.length - p} trailing bytes`);
  return s;
}

export function encode(s) {
  const sig = new TextEncoder().encode(SIGNATURE);
  const len = 8 + sig.length + 1 + 2 + 4 + 4 + s.flags.length * 2 + 4 + s.starts.length * 8
    + 4 + s.segments.length * 16 + 2 + 4 + s.extra.length * 4;
  const buf = new Uint8Array(len), dv = new DataView(buf.buffer);
  buf.set([0x74, 0x70, 0x6c, 0]);
  dv.setUint32(4, len, true);
  buf.set(sig, 8);
  let p = 8 + sig.length + 1;
  const u16 = (v) => { dv.setUint16(p, v, true); p += 2; };
  const u32 = (v) => { dv.setUint32(p, v, true); p += 4; };
  const f32 = (v) => { dv.setFloat32(p, v, true); p += 4; };
  u16(s.version); f32(s.width);
  u32(s.flags.length); s.flags.forEach(u16);
  u32(s.starts.length); s.starts.forEach(([x, y]) => { f32(x); f32(y); });
  u32(s.segments.length); s.segments.forEach((seg) => seg.forEach(f32));
  u16(s.v2);
  u32(s.extra.length); s.extra.forEach(f32);
  return buf;
}
