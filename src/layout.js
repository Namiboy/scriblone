// Text → handwritten strokes on ruled A4 pages.
// Glyph set: { [char]: [variant, …] }; variant = { strokes: [[[x, y], …], …], width } in text-line units
// (1 = LINES ruled lines), x from 0, y relative to the baseline (negative = up).
import { PAGE } from './goodnotes.js';

/** Max relative deviation (spec AC 5): size, letter gap, word gap; baseline shift up/down (of a text line,
 *  more above than below the ruled line, as in real handwriting). */
// tilt: ± degrees per glyph; indent: ± line-start shift in text-line units
export const JITTER = { size: 0.06, gap: 0.25, word: 0.15, up: 0.04, down: 0.015, tilt: 3, indent: 0.12 };
export const GAP = 0.12, WORD = 0.45; // in text-line units
// Text sits on every LINES-th ruled line: the user's real GoodNotes writing is ~3× a single line's x-height.
export const LINES = 2, CAP = 0.7, DESC = 0.35; // cap height / descender in text-line units (setup pad guides)

/** Returns { pages: [[points[], …], …], skipped: [chars], placements: [{ch, variant, scale, dx, dy}] }. */
export function layout(text, glyphs, { rng = Math.random, page = PAGE } = {}) {
  const u = page.lineSpacing * LINES, j = () => rng() * 2 - 1;
  // people write almost to the paper edge; the template's right margin (88) is twice its left one
  const left = page.margin.left + 16, right = page.width - 40;
  const ruled = (r) => page.firstLine + (r - 1) * page.lineSpacing;
  let firstLine = 1;
  while (ruled(firstLine) - CAP * u < page.margin.top) firstLine++;
  const lastLine = Math.floor((page.margin.bottom - DESC * u - page.firstLine) / page.lineSpacing) + 1;
  const pages = [[]], skipped = new Set(), placements = [];
  // each line starts a little earlier or later, like a hand-kept left margin
  const indent = () => left + JITTER.indent * u * j();
  let line = firstLine, lineStart = indent(), x = lineStart, prev = null;
  const newLine = () => {
    x = lineStart = indent();
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
        // never the same variant twice in a row for a doubled letter ("ll", "ss"): it would look copied
        let variant = Math.floor(rng() * vars.length);
        if (prev?.ch === ch && prev.variant === variant && vars.length > 1) variant = (variant + 1 + Math.floor(rng() * (vars.length - 1))) % vars.length;
        prev = { ch, variant };
        const g = vars[variant];
        const scale = 1 + JITTER.size * j(), dy = (rng() * (JITTER.up + JITTER.down) - JITTER.up) * u, dx = GAP * u * JITTER.gap * j();
        // slant: shear around the baseline, positive = top leans right
        const tilt = JITTER.tilt * j(), k = Math.tan((tilt * Math.PI) / 180);
        placements.push({ ch, variant, scale, dx, dy, tilt });
        placed.push(g.strokes.map((s) => s.map(([px, py]) => [w + (px - py * k) * u * scale, dy + py * u * scale])));
        w += g.width * u * scale + GAP * u + dx;
      }
      if (!placed.length) continue;
      // fit by the ink, not by the gap after the last letter
      const ink = Math.max(...placed.flat(2).map((p) => p[0]));
      if (x > lineStart && x + ink > right) newLine();
      // a word wider than a whole line is broken where its next glyph would cross the margin
      let shift = 0;
      for (const strokes of placed) {
        const minX = Math.min(...strokes.flat().map((p) => p[0])), maxX = Math.max(...strokes.flat().map((p) => p[0]));
        if (x + maxX - shift > right && x + minX - shift > lineStart) { newLine(); shift = minX; }
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
