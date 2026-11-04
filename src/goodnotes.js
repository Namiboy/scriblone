// GoodNotes notebook model, decoded from the sample sweep (samples/, see .omc/spike-log.md).
//
// index.events.pb = event log (one varint-delimited record per event: 1=entity UUID, <evNo>=payload).
//   ev 30  document create     (document UUID, e.g. F5C1B3F3… in template)
//   ev 6   attachment (paper PDF, attachments/<UUID>)     ev 105  attachment/notes link
//   ev 2   paper/page style: size, line spacing, margins (UUID C5F51A8C… in template)
//   ev 54  page: 3=paper ref, 4.1=sort key (ASCII-sortable fractional index, e.g. "S0rK0" < "V1K6C")
//   ev 104 notes file for a page (UUID = page UUID with last hex digit +1), ev 102 notes changed
//   ev 10  document "current page" (PagingViewServiceUpdater), ev 55 page update
// notes/<pageUUID+1>: per stroke TWO records: header (1=stroke UUID, 2={1:version,2:rand u32},
//   8=device id, 9=counter, 14=5381, 16=24) and body (7={1=stroke UUID, 2=bv41(tpl), …, 15=header.2}).
// Erasing a stroke rewrites it in place (header version 3 + field 3=1, empty payload) — never generated here.
// {1:version, 2:u32} registers: u32 is not CRC32/FNV/djb2 of the value → treated as random tiebreaker.
// Export is deterministic: s6a and s6b are byte-identical in content.

/** Page geometry in GoodNotes units (origin top-left, = PDF pt × PAGE.scale). Source: template ev 2 + paper PDF. */
export const PAGE = {
  width: 1091.3466796875,
  height: 1543.4649658203125,
  scale: 1091.3466796875 / 595.28,
  lineSpacing: 32.083335876464844, // ev 2 field 7; PDF ruling 17.5 pt
  firstLine: 92.13,                // y of ruled line 1 (PDF y 791.64 from bottom)
  lineCount: 45,                   // last line y 1503.79
  margin: { left: 44, top: 60.5, right: 1003.3467407226562, bottom: 1422.465087890625 }, // ev 2 field 18.1
};

/** Pen as written by the user in all samples. */
export const PEN = { width: 4.677, schema: 24 };

import { unzipSync, zipSync } from '../vendor/fflate.mjs';
import { parse, serialize, parseDelimited, serializeDelimited, field } from './pb.js';
import * as lz4 from './lz4.js';
import * as tpl from './tpl.js';

const td = new TextDecoder(), te = new TextEncoder();
const UUID_RE = /[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}/g;
const latin1 = (b) => Array.from(b, (c) => String.fromCharCode(c)).join('');
const fromLatin1 = (s) => Uint8Array.from(s, (c) => c.charCodeAt(0));

export const readZip = (bytes) => unzipSync(bytes);
// Template entries are all Deflate (plan 3); fflate keeps insertion order = template order.
export const writeZip = (files) => zipSync(files, { level: 6 });

const randomUuid = () => crypto.randomUUID().toUpperCase();
const randU32 = () => crypto.getRandomValues(new Uint32Array(1))[0];

/** Give every document/page/notes/event/stroke UUID a fresh value (entry contents and file names).
 *  Keeps paired IDs (page …X / notes …X+1) paired by mapping the first 35 chars and keeping the last.
 *  Skips UUIDs followed by "_" (built-in paper catalog id) or preceded by ":" (view-service id). */
export function renewIds(files) {
  const map = new Map();
  const sub = (u) => {
    const p = u.slice(0, 35);
    if (!map.has(p)) map.set(p, randomUuid().slice(0, 35));
    return map.get(p) + u.slice(35);
  };
  const rewrite = (s) => s.replace(UUID_RE, (u, i, all) => (all[i + 36] === '_' || all[i - 1] === ':' ? u : sub(u)));
  const out = {};
  for (const [name, data] of Object.entries(files)) {
    const keep = name.endsWith('.jpg') || name.startsWith('attachments/');
    out[rewrite(name)] = keep ? data : fromLatin1(rewrite(latin1(data)));
  }
  return out;
}

/** Polyline → tpl stroke. Segments are (cx, cy, x, y); control = midpoint gives straight pieces. */
export function strokeFromPoints(points, width = PEN.width) {
  const segments = [];
  for (let i = 1; i < points.length; i++) {
    const [ax, ay] = points[i - 1], [bx, by] = points[i];
    segments.push([(ax + bx) / 2, (ay + by) / 2, bx, by]);
  }
  return { version: 2, width, flags: points.map((_, i) => (i ? 1 : 0)), starts: [points[0]], segments, v2: 1, extra: [] };
}

const replaceField = (fields, no, f) => fields.map((x) => (x.no === no ? f : x));
const fieldOf = (fields, no) => fields.find((x) => x.no === no);

/** Decode a notes file into prototype record pair + stroke list. */
export function readNotes(buf) {
  const recs = parseDelimited(buf);
  const strokes = [];
  for (let i = 0; i < recs.length; i += 2) {
    const body = parse(fieldOf(parse(recs[i + 1]), 7).value);
    strokes.push(tpl.decode(lz4.decode(fieldOf(body, 2).value).data));
  }
  return { proto: recs.length ? [recs[0], recs[1]] : null, strokes };
}

/** Build a notes file: one header+body record pair per stroke, cloned from `proto`.
 *  `fresh` = false keeps the prototype's ids (used by the byte-identity test). */
export function writeNotes(proto, strokes, { fresh = true } = {}) {
  const [h0, b0] = [parse(proto[0]), parse(proto[1])];
  const counter = fieldOf(h0, 9).value;
  const msgs = strokes.flatMap((s, i) => {
    const id = fresh ? randomUuid() : td.decode(fieldOf(h0, 1).value);
    const reg = fresh ? serialize([field(1, 2), field(2, randU32())]) : fieldOf(h0, 2).value;
    let h = replaceField(h0, 1, field(1, id));
    h = replaceField(h, 2, field(2, reg));
    h = replaceField(h, 9, field(9, counter + BigInt(fresh ? i : 0)));
    let b = parse(fieldOf(b0, 7).value);
    b = replaceField(b, 1, field(1, id));
    b = replaceField(b, 2, field(2, lz4.encode(tpl.encode(s))));
    b = replaceField(b, 15, field(15, reg));
    return [serialize(h), serialize([field(7, serialize(b))])];
  });
  return serializeDelimited(msgs);
}

/** Events log helpers (each record: 1=entity UUID, <evNo>=payload). */
export function readEvents(buf) {
  return parseDelimited(buf).map((m) => {
    const f = parse(m);
    return { entity: td.decode(f[0].value), ev: f[1].no, raw: m };
  });
}

/** Clone `events` for another entity: entity UUID swapped, every UUID that is not an entity of
 *  `allEvents` (event ids, operation ids) renewed, Lamport counters moved after `counterAfter`. */
export function cloneEvents(events, allEvents, fromEntity, toEntity, counterAfter) {
  const entities = new Set(allEvents.map((e) => e.entity));
  let c = counterAfter;
  return events.map((e) => {
    const s = latin1(e.raw).split(fromEntity).join(toEntity)
      .replace(UUID_RE, (u) => (u === toEntity || entities.has(u) ? u : randomUuid()));
    const f = parse(fromLatin1(s));
    const p = parse(f[1].value).map((x) => (x.wire === 0 && isCounter(x.value) ? field(x.no, ++c) : x));
    return serialize([f[0], field(f[1].no, serialize(p))]);
  });
}

// Lamport counters sit as top-level varints of the event payload (fields 14/16/18 depending on ev type).
const isCounter = (v) => typeof v === 'bigint' && v > 1_700_000_000_000n && v < 1_800_000_000_000n;

export const maxCounter = (events) => events
  .flatMap((e) => parse(parse(e.raw)[1].value))
  .reduce((m, x) => (x.wire === 0 && isCounter(x.value) && x.value > m ? x.value : m), 0n);
