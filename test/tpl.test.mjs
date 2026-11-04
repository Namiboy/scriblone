// Sample source: ZettelmitSchrift.goodnotes notes/3AD0D5D2… (stroke E5063EBA…)
import test from 'node:test';
import assert from 'node:assert/strict';
import * as tpl from '../src/tpl.js';
import * as lz4 from '../src/lz4.js';
import { parse, parseDelimited } from '../src/pb.js';
import { load, ZETTEL_MIT, STROKE_NOTE } from './helpers.mjs';

const payload = () => {
  const rec = parseDelimited(load(ZETTEL_MIT)[STROKE_NOTE])[1];
  return lz4.decode(parse(parse(rec).find((f) => f.no === 7).value).find((f) => f.no === 2).value).data;
};

test('decode→encode is byte-identical', () => {
  const p = payload();
  assert.deepEqual(tpl.encode(tpl.decode(p)), p);
});

test('decoded fields match the observed sample', () => {
  const s = tpl.decode(payload());
  assert.equal(s.version, 2);
  assert.ok(Math.abs(s.width - 4.677) < 0.01);
  assert.equal(s.starts.length, 1);
  assert.ok(Math.abs(s.starts[0][0] - 323.8) < 0.1 && Math.abs(s.starts[0][1] - 363.6) < 0.1);
  assert.equal(s.segments.length, 28);
  assert.equal(s.flags.length, s.segments.length + 1);
});

test('generated stroke decodes float32-exact', () => {
  const s = { version: 2, width: 4.5, flags: [0, 1, 1], starts: [[10, 20]], segments: [[11, 21, 12, 22], [13, 23, 14, 24]], v2: 1, extra: [] };
  assert.deepEqual(tpl.decode(tpl.encode(s)), s);
});
