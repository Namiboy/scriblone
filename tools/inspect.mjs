#!/usr/bin/env node
// Usage: node tools/inspect.mjs <file.goodnotes> [entry-filter]
//        node tools/inspect.mjs --diff <a.goodnotes> <b.goodnotes>
import { readFileSync } from 'node:fs';
import { unzipSync } from '../vendor/fflate.mjs';
import { parse, parseDelimited } from '../src/pb.js';
import * as lz4 from '../src/lz4.js';
import * as tpl from '../src/tpl.js';

export function readGoodnotes(path) {
  const meta = {};
  const files = unzipSync(readFileSync(path), {
    filter: (f) => { meta[f.name] = { size: f.originalSize, method: f.compression }; return true; },
  });
  return { files, meta };
}

const printable = (b) => b.length > 0 && b.every((c) => c >= 0x20 && c < 0x7f);
const hex = (b, max = 48) => Buffer.from(b.subarray(0, max)).toString('hex') + (b.length > max ? `…(${b.length}B)` : '');
const BV41 = [0x62, 0x76, 0x34, 0x31];
const startsWith = (b, m) => m.every((c, i) => b[i] === c);

function tryParse(b) {
  try { const f = parse(b); return f.length ? f : null; } catch { return null; }
}

function fmtStroke(data) {
  try {
    const s = tpl.decode(data);
    const r = (v) => Math.round(v * 10) / 10;
    return [`tpl v${s.version} width=${r(s.width)} flags[${s.flags.length}]=${s.flags.join('')} v2=${s.v2} extra[${s.extra.length}]`,
      `starts=${JSON.stringify(s.starts.map((p) => p.map(r)))}`,
      `segments[${s.segments.length}] first=${JSON.stringify(s.segments.slice(0, 3).map((p) => p.map(r)))}`];
  } catch (e) { return [`payload ${data.length}B (${e.message}) ${hex(data)}`]; }
}

/** Render a message as indented lines "path: value". */
export function dumpMessage(buf, ind = '') {
  const out = [];
  for (const f of parse(buf)) {
    const k = `${ind}${f.no}`;
    if (f.wire === 0) out.push(`${k}: ${f.value}`);
    else if (f.wire === 5) out.push(`${k}: f32 ${new DataView(f.value.buffer, f.value.byteOffset, 4).getFloat32(0, true)}`);
    else if (f.wire === 1) out.push(`${k}: f64 ${new DataView(f.value.buffer, f.value.byteOffset, 8).getFloat64(0, true)}`);
    else if (startsWith(f.value, BV41)) {
      const { data, end } = lz4.decode(f.value);
      out.push(`${k}: bv41 ${f.value.length}B→${data.length}B${end !== f.value.length ? ` (+${f.value.length - end} trailing)` : ''}`);
      out.push(...fmtStroke(data).map((l) => `${ind}  ${l}`));
    } else if (printable(f.value)) out.push(`${k}: "${new TextDecoder().decode(f.value)}"`);
    else if (tryParse(f.value)) { out.push(`${k}: {`); out.push(...dumpMessage(f.value, ind + '  ')); out.push(`${ind}}`); }
    else out.push(`${k}: bytes ${hex(f.value)}`);
  }
  return out;
}

export function dumpEntry(name, data) {
  if (!data.length) return ['(empty)'];
  if (name.endsWith('.jpg')) return [`jpeg ${data.length}B`];
  let msgs;
  try { msgs = parseDelimited(data); } catch { msgs = null; }
  if (msgs) {
    try { return msgs.flatMap((m, i) => [`#${i} (${m.length}B)`, ...dumpMessage(m, '  ')]); } catch { /* fall through */ }
  }
  try { return dumpMessage(data); } catch { return [`raw ${hex(data, 96)}`]; }
}

function inspect(path, filter) {
  const { files, meta } = readGoodnotes(path);
  for (const name of Object.keys(files)) {
    if (filter && !name.includes(filter)) continue;
    console.log(`== ${name}  ${meta[name].size}B  method=${meta[name].method === 8 ? 'deflate' : meta[name].method}`);
    for (const l of dumpEntry(name, files[name])) console.log('  ' + l);
  }
}

function diff(a, b) {
  const A = readGoodnotes(a).files, B = readGoodnotes(b).files;
  for (const name of new Set([...Object.keys(A), ...Object.keys(B)])) {
    if (!(name in B)) { console.log(`- only in A: ${name}`); continue; }
    if (!(name in A)) { console.log(`+ only in B: ${name}`); continue; }
    if (Buffer.compare(A[name], B[name]) === 0) continue;
    console.log(`~ ${name} (${A[name].length}B → ${B[name].length}B)`);
    const la = dumpEntry(name, A[name]), lb = dumpEntry(name, B[name]);
    const sb = new Set(lb), sa = new Set(la);
    for (const l of la) if (!sb.has(l)) console.log(`    - ${l}`);
    for (const l of lb) if (!sa.has(l)) console.log(`    + ${l}`);
  }
}

if (process.argv[1]?.endsWith('inspect.mjs')) {
  const [x, y, z] = process.argv.slice(2);
  if (!x) { console.error('usage: inspect.mjs <file> [filter] | --diff <a> <b>'); process.exit(2); }
  if (x === '--diff') diff(y, z); else inspect(x, y);
}
