// Sample source: ZettelmitSchrift.goodnotes notes/3AD0D5D2…
import test from 'node:test';
import assert from 'node:assert/strict';
import * as lz4 from '../src/lz4.js';
import { parse, parseDelimited } from '../src/pb.js';
import { load, ZETTEL_MIT, STROKE_NOTE } from './helpers.mjs';

function sampleBlob() {
  const rec = parseDelimited(load(ZETTEL_MIT)[STROKE_NOTE])[1];
  return parse(parse(rec).find((f) => f.no === 7).value).find((f) => f.no === 2).value;
}

test('decodes the sample stroke to 576 bytes', () => {
  const blob = sampleBlob();
  const { data, end } = lz4.decode(blob);
  assert.equal(data.length, 576);
  assert.equal(end, blob.length);
  assert.deepEqual([...data.subarray(0, 4)], [0x74, 0x70, 0x6c, 0]);
});

test('encode→decode roundtrip: sample and random data', () => {
  const sample = lz4.decode(sampleBlob()).data;
  assert.deepEqual(lz4.decode(lz4.encode(sample)).data, sample);
  for (const n of [0, 1, 14, 15, 16, 269, 270, 271, 5000]) {
    const r = Uint8Array.from({ length: n }, () => (Math.random() * 256) | 0);
    assert.deepEqual(lz4.decode(lz4.encode(r)).data, r, `n=${n}`);
  }
});

test('payload above block limit is split into several blocks', () => {
  const big = Uint8Array.from({ length: lz4.BLOCK_LIMIT * 2 + 123 }, (_, i) => i * 7);
  const enc = lz4.encode(big);
  const blocks = Buffer.from(enc).toString('latin1').split('bv41').length - 1;
  assert.equal(blocks, 3);
  assert.deepEqual(lz4.decode(enc).data, big);
});
