// Source: synthetic glyph set (every char a 0.4 × 0.6 box, 3 variants).
import test from 'node:test';
import assert from 'node:assert/strict';
import { layout, JITTER, GAP, WORD, LINES } from '../src/layout.js';
import { PAGE } from '../src/goodnotes.js';

const U = PAGE.lineSpacing * LINES;
const box = (w) => ({ strokes: [[[0, 0], [w, 0], [w, -0.6], [0, -0.6], [0, 0]]], width: w });
const chars = 'abcdefghijklmnopqrstuvwxyzäöüßABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÜ0123456789.,!?-:;()"\'';
const glyphs = Object.fromEntries([...chars].map((c) => [c, [box(0.4), box(0.38), box(0.42)]]));
const words = 'Hallo Welt, das ist ein Test mit Umlauten äöü und Zahlen 123!'.split(' ');
const text = (n) => Array.from({ length: n }, (_, i) => words[i % words.length]).join(' ');
const all = (r) => r.pages.flat().flat();

test('~1800 chars wrap inside the margins; paragraphs keep an empty line', () => {
  const t = text(300).slice(0, 1800);
  const r = layout(t, glyphs);
  for (const [x, y] of all(r)) {
    assert.ok(x >= PAGE.margin.left && x <= PAGE.margin.right, `x ${x}`);
    assert.ok(y >= PAGE.margin.top && y <= PAGE.margin.bottom, `y ${y}`);
  }
  const ys = (r) => new Set(r.pages[0].map((s) => Math.round(s[0][1] / U)));
  const one = layout('ab\n\ncd', glyphs, { rng: () => 0.5 });
  assert.equal(ys(one).size, 2);
  const base = (s) => s[0][1];
  assert.equal(Math.round((base(one.pages[0].at(-1)) - base(one.pages[0][0])) / U), 2, 'blank line between paragraphs');
});

test('overflow creates further pages', () => {
  const r = layout(text(2000), glyphs);
  assert.ok(r.pages.length >= 2);
  assert.ok(r.pages.every((p) => p.length));
});

test('jitter stays in bounds and no character repeats a (variant, scale, dx, dy) tuple', () => {
  const r = layout(text(300), glyphs);
  const seen = new Map();
  for (const p of r.placements) {
    assert.ok(Math.abs(p.scale - 1) <= JITTER.size + 1e-9);
    assert.ok(p.dy >= -JITTER.up * U - 1e-9 && p.dy <= JITTER.down * U + 1e-9, `dy ${p.dy}`);
    assert.ok(Math.abs(p.dx) <= GAP * JITTER.gap * U + 1e-9);
    const k = `${p.variant}|${p.scale}|${p.dx}|${p.dy}`, s = seen.get(p.ch) ?? new Set();
    assert.ok(!s.has(k), `repeat for ${p.ch}`);
    s.add(k); seen.set(p.ch, s);
  }
  const variants = new Set(r.placements.filter((p) => p.ch === 'a').map((p) => p.variant));
  assert.equal(variants.size, 3);
  // word gap: extreme rng values stay within ±15 %
  for (const v of [0, 0.9999]) {
    const [a, b] = layout('a a', glyphs, { rng: () => v }).pages[0];
    const gap = b[0][0] - a[0][0];
    const p = layout('a', glyphs, { rng: () => v }).placements[0];
    const word = gap - (glyphs.a[p.variant].width * p.scale + GAP + GAP * JITTER.gap * (v * 2 - 1)) * U;
    assert.ok(Math.abs(word / (WORD * U) - 1) <= JITTER.word + 1e-6, `word gap ${word}`);
  }
});

test('unknown characters are skipped and listed', () => {
  const r = layout('a € b @ é', glyphs);
  assert.deepEqual(r.skipped.sort(), ['@', 'é', '€'].sort());
  assert.equal(r.pages[0].length, 2);
});

test('a word longer than a line is broken inside the margins', () => {
  const r = layout('a'.repeat(120) + ' b', glyphs);
  for (const [x] of all(r)) assert.ok(x >= PAGE.margin.left && x <= PAGE.margin.right, `x ${x}`);
  assert.ok(new Set(r.pages[0].map((s) => Math.round(s[0][1]))).size >= 2, 'spans several lines');
});
