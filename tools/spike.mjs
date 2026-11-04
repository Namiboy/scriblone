#!/usr/bin/env node
// Generates the go/no-go spike files (plan 1.5) into out/. Usage: node tools/spike.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import * as g from '../src/goodnotes.js';
import { parseDelimited, serializeDelimited, parse } from '../src/pb.js';

const root = new URL('..', import.meta.url);
const S2 = readFileSync(new URL('samples/s21strich.goodnotes', root));
const S5 = readFileSync(new URL('samples/S52seiten.goodnotes', root));
const td = new TextDecoder();
const notesNames = (files) => Object.keys(files).filter((n) => n.startsWith('notes/'));
const strokeNotes = (files) => notesNames(files).find((n) => files[n].length);

/** Zigzag on ruled line `line` (1-based): known coordinates for the ±2 pt position check. */
export function zigzag(x0, line, n = 20, step = 20, h = 25) {
  const base = g.PAGE.firstLine + (line - 1) * g.PAGE.lineSpacing;
  return Array.from({ length: n }, (_, i) => [x0 + i * step, base - (i % 2 ? h : 0)]);
}

function withStrokes(files, notesName, strokes, proto) {
  return { ...files, [notesName]: g.writeNotes(proto, strokes) };
}

const out = {};
// A0: s2 re-zipped, content untouched (isolates ZIP writer)
out['spike-A0'] = g.readZip(S2);
// A1: like A0, only ids renewed (isolates UUID rule)
out['spike-A1'] = g.renewIds(g.readZip(S2));
// B: template stroke moved +100 x, ids renewed
{
  const f = g.renewIds(g.readZip(S2));
  const n = strokeNotes(f);
  const { proto, strokes } = g.readNotes(f[n]);
  const moved = strokes.map((s) => ({ ...s, starts: s.starts.map(([x, y]) => [x + 100, y]), segments: s.segments.map(([a, b, c, d]) => [a + 100, b, c + 100, d]) }));
  out['spike-B'] = withStrokes(f, n, moved, proto);
  // C: B + one fully generated zigzag on line 15, x 300…680
  out['spike-C'] = withStrokes(f, n, [...moved, g.strokeFromPoints(zigzag(300, 15))], proto);
}
// D: 2 pages, ≥3000 generated strokes (1600 per page = 40 lines × 40 small zigzags)
function grid() {
  const strokes = [];
  for (let line = 3; line <= 42; line++) for (let k = 0; k < 40; k++) strokes.push(g.strokeFromPoints(zigzag(60 + k * 23.5, line, 4, 5, 18)));
  return strokes;
}
{
  const f = g.renewIds(g.readZip(S5));
  const full = strokeNotes(f), empty = notesNames(f).find((n) => n !== full);
  const { proto } = g.readNotes(f[full]);
  // Page-1 notes only has its create event; clone page-2's notes events (102, 105, 104) for it.
  const events = g.readEvents(f['index.events.pb']);
  const fullId = full.slice(6), emptyId = empty.slice(6);
  const lastNotesEvents = events.filter((e) => e.entity === fullId).slice(1);
  const clones = g.cloneEvents(lastNotesEvents, events, fullId, emptyId, g.maxCounter(events));
  const d1 = {
    ...f,
    'index.events.pb': serializeDelimited([...parseDelimited(f['index.events.pb']), ...clones]),
    [full]: g.writeNotes(proto, grid()),
    [empty]: g.writeNotes(proto, grid()),
  };
  out['spike-D1'] = d1;
  // D2: without the notes' handwriting-search entries (stale OCR)
  const d2 = Object.fromEntries(Object.entries(d1).filter(([n]) => !(n.startsWith('search/') && n.slice(7) === fullId)));
  d2['index.search.pb'] = serializeDelimited(parseDelimited(d1['index.search.pb']).filter((m) => td.decode(parse(m)[0].value) !== fullId));
  out['spike-D2'] = d2;
}

mkdirSync(new URL('out/', root), { recursive: true });
for (const [name, files] of Object.entries(out)) {
  const zip = g.writeZip(files);
  writeFileSync(new URL(`out/${name}.goodnotes`, root), zip);
  const back = g.readZip(zip);
  const strokes = notesNames(back).reduce((s, n) => s + g.readNotes(back[n]).strokes.length, 0);
  console.log(`${name}.goodnotes  ${zip.length} B  notes=${notesNames(back).length} strokes=${strokes}`);
}
