// Text → handwritten strokes on ruled A4 pages.
// Glyph set: { [char]: [variant, …] }; variant = { strokes: [[[x, y], …], …], width } in text-line units
// (1 = LINES ruled lines), x from 0, y relative to the baseline (negative = up).
import { PAGE } from './goodnotes.js';

/** Max relative deviation (spec AC 5): size, letter gap, word gap; baseline shift up/down (of a text line,
 *  more above than below the ruled line, as in real handwriting). */
export const JITTER = { size: 0.06, gap: 0.25, word: 0.15, up: 0.04, down: 0.015 };
export const GAP = 0.12, WORD = 0.45; // in text-line units
// Text sits on every LINES-th ruled line: the user's real GoodNotes writing is ~3× a single line's x-height.
export const LINES = 2, CAP = 0.7, DESC = 0.35; // cap height / descender in text-line units (setup pad guides)

/** Returns { pages: [[points[], …], …], skipped: [chars], placements: [{ch, variant, scale, dx, dy}] }. */
export function layout(text, glyphs, { rng = Math.random, page = PAGE } = {}) {
  const u = page.lineSpacing * LINES, j = () => rng() * 2 - 1;
  const left = page.margin.left + 16, right = page.margin.right - 8;
  const ruled = (r) => page.firstLine + (r - 1) * page.lineSpacing;
  let firstLine = 1;
  while (ruled(firstLine) - CAP * u < page.margin.top) firstLine++;
  const lastLine = Math.floor((page.margin.bottom - DESC * u - page.firstLine) / page.lineSpacing) + 1;
  const pages = [[]], skipped = new Set(), placements = [];
  let line = firstLine, x = left;
  const newLine = () => {
    x = left;
    if ((line += LINES) > lastLine) { line = firstLine; pages.push([]); }
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
        const scale = 1 + JITTER.size * j(), dy = (rng() * (JITTER.up + JITTER.down) - JITTER.up) * u, dx = GAP * u * JITTER.gap * j();
        placements.push({ ch, variant, scale, dx, dy });
        placed.push(g.strokes.map((s) => s.map(([px, py]) => [w + px * u * scale, dy + py * u * scale])));
        w += g.width * u * scale + GAP * u + dx;
      }
      if (!placed.length) continue;
      if (x > left && x + w > right) newLine();
      // a word wider than a whole line is broken where its next glyph would cross the margin
      let shift = 0;
      for (const strokes of placed) {
        const minX = Math.min(...strokes.flat().map((p) => p[0])), maxX = Math.max(...strokes.flat().map((p) => p[0]));
        if (x + maxX - shift > right && x + minX - shift > left) { newLine(); shift = minX; }
        const y = ruled(line);
        for (const s of strokes) pages.at(-1).push(s.map(([px, py]) => [x + px - shift, y + py]));
      }
      x += w - shift + WORD * u * (1 + JITTER.word * j());
    }
    newLine(); // paragraph end (an empty paragraph = empty line)
  }
  while (pages.length > 1 && !pages.at(-1).length) pages.pop();
  return { pages, skipped: [...skipped], placements };
}

// iPad Smart Punctuation turns " ' -- ... into typographic characters the setup does not offer.
export const normalizeText = (t) => t.normalize('NFC').replace(/[‘’‚‛′]/g, "'").replace(/[“”„‟″«»]/g, '"')
  .replace(/[–—]/g, '-').replace(/…/g, '...').replace(/\u00a0/g, ' ');
