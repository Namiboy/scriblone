// Sample source: samples/s21strich.goodnotes (1 stroke), samples/S52seiten.goodnotes (2 pages).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as g from '../src/goodnotes.js';
import * as lz4 from '../src/lz4.js';
import { parse, parseDelimited, serializeDelimited } from '../src/pb.js';
import { root } from './helpers.mjs';

const S2 = () => g.readZip(readFileSync(root + 'samples/s21strich.goodnotes'));
const notesOf = (f) => Object.keys(f).find((n) => n.startsWith('notes/') && f[n].length);
const UUIDS = (f) => new Set(Object.entries(f).flatMap(([n, d]) => n.endsWith('.jpg') || n.startsWith('attachments/') ? [] : [...(n + Buffer.from(d).toString('latin1')).match(/[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}/g) ?? []]));

test('rebuilding the notes with the sample stroke differs only in LZ4 encoding', () => {
  const f = S2(), n = notesOf(f);
  const { proto, strokes } = g.readNotes(f[n]);
  const a = parseDelimited(f[n]), b = parseDelimited(g.writeNotes(proto, strokes, { fresh: false }));
  assert.deepEqual(b[0], a[0], 'header record identical');
  const fa = parse(parse(a[1])[0].value), fb = parse(parse(b[1])[0].value);
  assert.equal(fa.length, fb.length);
  fa.forEach((x, i) => {
    if (x.no === 2) assert.deepEqual(lz4.decode(fb[i].value).data, lz4.decode(x.value).data, 'decoded payload identical');
    else assert.deepEqual(fb[i].raw, x.raw, `body field ${x.no} identical`);
  });
});

test('renewIds: same entries/sizes, no template UUID left except paper catalog id', () => {
  const f = S2(), r = g.renewIds(f);
  assert.deepEqual(Object.values(r).map((d) => d.length), Object.values(f).map((d) => d.length));
  const before = UUIDS(f), after = UUIDS(r);
  const kept = [...after].filter((u) => before.has(u));
  assert.ok(kept.every((u) => u.startsWith('5BD99CB4') || u.startsWith('238EE861')), `kept: ${kept}`);
  // page …X and notes …X+1 stay paired
  const page = g.readEvents(r['index.events.pb']).find((e) => e.ev === 54).entity;
  assert.ok(Object.keys(r).some((n) => n === `notes/${page.slice(0, 35)}${(parseInt(page.at(-1), 16) + 1).toString(16).toUpperCase()}`));
});

test('generated notes: 2 records per stroke, fresh unique stroke ids, readable back', () => {
  const f = S2(), { proto } = g.readNotes(f[notesOf(f)]);
  const strokes = [g.strokeFromPoints([[0, 0], [10, 10], [20, 0]], 4.5), g.strokeFromPoints([[5, 5], [6, 6]], 4.5)]; // 4.5 is float32-exact
  const buf = g.writeNotes(proto, strokes);
  const recs = parseDelimited(buf);
  assert.equal(recs.length, 4);
  const ids = [0, 2].map((i) => new TextDecoder().decode(parse(recs[i])[0].value));
  assert.notEqual(ids[0], ids[1]);
  assert.deepEqual(g.readNotes(buf).strokes, strokes);
});

test('strokeFromPoints: segments end at the given points, controls are midpoints', () => {
  const s = g.strokeFromPoints([[0, 0], [10, 0], [10, 10]]);
  assert.deepEqual(s.starts, [[0, 0]]);
  assert.deepEqual(s.segments, [[5, 0, 10, 0], [10, 5, 10, 10]]);
  assert.deepEqual(s.flags, [0, 1, 1]);
});

test('cloneEvents: entity swapped, counters after max, non-entity UUIDs renewed', () => {
  const f = g.readZip(readFileSync(root + 'samples/S52seiten.goodnotes'));
  const ev = g.readEvents(f['index.events.pb']);
  const notes = Object.keys(f).filter((n) => n.startsWith('notes/')).map((n) => n.slice(6));
  const [full, empty] = notes.sort((a, b) => f['notes/' + b].length - f['notes/' + a].length);
  const src = ev.filter((e) => e.entity === full).slice(1);
  const max = g.maxCounter(ev);
  const clones = g.cloneEvents(src, ev, full, empty, max).map((raw) => g.readEvents(serializeDelimited([raw]))[0]);
  assert.equal(clones.length, 3);
  for (const [i, c] of clones.entries()) {
    assert.equal(c.entity, empty);
    assert.equal(c.ev, src[i].ev);
    const s = Buffer.from(c.raw).toString('latin1');
    assert.ok(!s.includes(full));
    assert.ok(g.maxCounter([c]) > max);
  }
});
