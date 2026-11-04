// Sample source: index.*.pb, notes/* and index.events.pb of both Zettel files.
import test from 'node:test';
import assert from 'node:assert/strict';
import { parse, serialize, parseDelimited, serializeDelimited, field, writeVarint, readVarint } from '../src/pb.js';
import { load, ZETTEL_MIT, ZETTEL_OHNE } from './helpers.mjs';

for (const path of [ZETTEL_MIT, ZETTEL_OHNE]) {
  const files = load(path);
  for (const name of Object.keys(files).filter((n) => n.startsWith('index.') || n.startsWith('notes/'))) {
    test(`${path.split('/').pop()} ${name}: parse→serialize byte-identical`, () => {
      const buf = files[name];
      const msgs = parseDelimited(buf).map((m) => serialize(parse(m)));
      assert.deepEqual(serializeDelimited(msgs), buf);
    });
  }
}

test('varint roundtrip incl. 64-bit', () => {
  for (const v of [0n, 1n, 127n, 128n, 300n, 2663414261n, 326628743063646315n]) {
    assert.equal(readVarint(writeVarint(v), 0)[0], v);
  }
});

test('field() builds string and varint fields', () => {
  const f = parse(serialize([field(1, 'abc'), field(2, 24)]));
  assert.equal(new TextDecoder().decode(f[0].value), 'abc');
  assert.equal(f[1].value, 24n);
});
