// Text → handwritten strokes on ruled A4 pages.
// Glyph set: { [char]: [variant, …] }; variant = { strokes: [[[x, y], …], …], width } in line-spacing
// units, x from 0, y relative to the baseline (negative = up).
import { PAGE } from './goodnotes.js';

/** Max relative deviation (spec AC 5): size, letter gap, word gap, baseline (of line spacing). */
export const JITTER = { size: 0.06, gap: 0.25, word: 0.15, base: 0.015 };
export const GAP = 0.12, WORD = 0.45; // in line-spacing units

/** Returns { pages: [[points[], …], …], skipped: [chars], placements: [{ch, variant, scale, dx, dy}] }. */
export function layout(text, glyphs, { rng = Math.random, page = PAGE } = {}) {
  const u = page.lineSpacing, j = () => rng() * 2 - 1;
  const left = page.margin.left + 16, right = page.margin.right - 8;
  const lastLine = Math.floor((page.margin.bottom - page.firstLine) / u) + 1;
  const pages = [[]], skipped = new Set(), placements = [];
  let line = 1, x = left;
  const newLine = () => {
    x = left;
    if (++line > lastLine) { line = 1; pages.push([]); }
  };

  for (const para of text.replace(/\r/g, '').split('\n')) {
    for (const word of para.split(/[ \t]+/).filter(Boolean)) {
      // place the word at x = 0, then shift it to its line
      const placed = [];
      let w = 0;
      for (const ch of word) {
        const vars = glyphs[ch];
        if (!vars?.length) { skipped.add(ch); continue; }
        const variant = Math.floor(rng() * vars.length), g = vars[variant];
        const scale = 1 + JITTER.size * j(), dy = JITTER.base * u * j(), dx = GAP * u * JITTER.gap * j();
        placements.push({ ch, variant, scale, dx, dy });
        placed.push(g.strokes.map((s) => s.map(([px, py]) => [w + px * u * scale, dy + py * u * scale])));
        w += g.width * u * scale + GAP * u + dx;
      }
      if (!placed.length) continue;
      // shortcut: a single word wider than a line overflows the right margin; split such words if it matters
      if (x > left && x + w > right) newLine();
      const y = page.firstLine + (line - 1) * u;
      for (const strokes of placed) for (const s of strokes) pages.at(-1).push(s.map(([px, py]) => [x + px, y + py]));
      x += w + WORD * u * (1 + JITTER.word * j());
    }
    newLine(); // paragraph end (an empty paragraph = empty line)
  }
  while (pages.length > 1 && !pages.at(-1).length) pages.pop();
  return { pages, skipped: [...skipped], placements };
}
