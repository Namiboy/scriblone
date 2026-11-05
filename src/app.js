import * as g from './goodnotes.js';
import { layout, normalizeText, LINES, CAP, DESC } from './layout.js';

const $ = (id) => document.getElementById(id);
const CHARS = [...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZäöüÄÖÜß0123456789.,!?-:;()"\''];
const VARIANTS = 3, KEY = 'scriblone.glyphs';
// Pad geometry in line-spacing units: 2 wide, from 1.0 above to 0.6 below the baseline.
const PAD = { w: 2, top: -1, h: 1.6, cap: -CAP, x: -0.4, desc: DESC };
const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;

// ---------- glyph store (localStorage; shortcut: ~0.5 MB for 240 variants, move to IndexedDB if it ever hits the 5 MB quota)
let glyphs = {};
try { glyphs = JSON.parse(localStorage.getItem(KEY)) ?? {}; } catch { glyphs = {}; }
const save = () => localStorage.setItem(KEY, JSON.stringify(glyphs));
navigator.storage?.persist?.();
// Backup files are untrusted: known characters only, bounded sizes, coordinates inside the pad.
const okPt = (p) => Array.isArray(p) && p.length === 2 && p.every((n) => Number.isFinite(n) && Math.abs(n) < 10);
const validGlyphs = (o) => o && typeof o === 'object' && !Array.isArray(o) &&
  Object.entries(o).every(([k, vs]) => CHARS.includes(k) && Array.isArray(vs) && vs.length <= VARIANTS &&
    vs.every((v) => v === null || (v && Number.isFinite(v.width) && v.width > 0 && v.width < 10 &&
      Array.isArray(v.strokes) && v.strokes.length > 0 && v.strokes.length <= 200 &&
      v.strokes.every((s) => Array.isArray(s) && s.length > 1 && s.length <= 5000 && s.every(okPt)))));

// ---------- tabs
const glyphCount = () => Object.values(glyphs).reduce((n, vs) => n + vs.filter(Boolean).length, 0);
const show = (tab) => {
  $('write').hidden = tab !== 'write'; $('setup').hidden = tab !== 'setup';
  $('empty').hidden = glyphCount() > 0;
  $('tabWrite').classList.toggle('on', tab === 'write'); $('tabSetup').classList.toggle('on', tab === 'setup');
  if (tab === 'setup') drawPad();
};
$('tabWrite').onclick = () => show('write');
$('tabSetup').onclick = () => show('setup');
$('startSetup').onclick = () => show('setup');

// ---------- setup: write each character VARIANTS times
const slots = CHARS.flatMap((ch) => Array.from({ length: VARIANTS }, (_, v) => ({ ch, v })));
let slot = 0, strokes = [], current = null;
const pad = $('pad'), ctx = pad.getContext('2d');
$('pwaWarn').hidden = standalone;
const fillJump = () => {
  $('jump').replaceChildren(...CHARS.map((c, i) =>
    new Option(c + ((glyphs[c] ?? []).filter(Boolean).length === VARIANTS ? '  ✓' : ''), i * VARIANTS)));
};
$('jump').onchange = () => { commit(); go(+$('jump').value); };

/** Store the pad drawing into the current slot (empty pad = variant removed). */
function commit() {
  const { ch, v } = slots[slot];
  if (strokes.length) {
    const xs = strokes.flat().map((p) => p[0]), min = Math.min(...xs);
    const r3 = (n) => Math.round(n * 1000) / 1000;
    // a dot needs ≥1 segment
    (glyphs[ch] ??= [])[v] = { strokes: strokes.map((s) => (s.length > 1 ? s : [s[0], [s[0][0] + 0.01, s[0][1]]]).map(([x, y]) => [r3(x - min), r3(y)])), width: r3(Math.max(Math.max(...xs) - min, 0.08)) };
  } else if (glyphs[ch]?.[v]) {
    delete glyphs[ch][v];
  } else return;
  save();
  resetExport(); // the font changed, an earlier export is outdated
}

function go(i) {
  slot = Math.max(0, Math.min(slots.length - 1, i));
  const { ch, v } = slots[slot], stored = glyphs[ch]?.[v];
  strokes = stored ? stored.strokes.map((s) => s.map(([x, y]) => [x + 0.3, y])) : [];
  $('target').textContent = ch;
  $('which').textContent = `Variante ${v + 1} von ${VARIANTS}${stored ? ' ✓' : ''}`;
  fillJump();
  $('jump').value = CHARS.indexOf(ch) * VARIANTS;
  const done = glyphCount();
  $('count').textContent = done === slots.length ? 'Alle Zeichen eingerichtet ✓' : `${done} von ${slots.length} gespeichert`;
  $('progress').max = slots.length; $('progress').value = done;
  drawPad();
}

function drawPad() {
  const r = devicePixelRatio || 1, w = pad.clientWidth, h = pad.clientHeight;
  if (!w) return;
  // resizing the backing store is expensive: only when the size really changed, not on every pen move
  if (pad.width !== Math.round(w * r) || pad.height !== Math.round(h * r)) { pad.width = Math.round(w * r); pad.height = Math.round(h * r); }
  ctx.setTransform(r, 0, 0, r, 0, 0);
  ctx.clearRect(0, 0, w, h);
  const Y = (u) => ((u - PAD.top) / PAD.h) * h, s = w / PAD.w;
  const guide = (u, width, dash) => { ctx.beginPath(); ctx.setLineDash(dash); ctx.lineWidth = width; ctx.strokeStyle = '#9ab'; ctx.moveTo(0, Y(u)); ctx.lineTo(w, Y(u)); ctx.stroke(); };
  guide(PAD.cap, 1, []); guide(PAD.x, 1, [6, 6]); guide(0, 2.5, []); guide(PAD.desc, 1, [2, 6]);
  // pen drawn true to the export scale
  ctx.setLineDash([]); ctx.strokeStyle = '#111'; ctx.lineWidth = (g.PEN.width / (g.PAGE.lineSpacing * LINES)) * s; ctx.lineCap = ctx.lineJoin = 'round';
  for (const st of strokes) {
    ctx.beginPath();
    st.forEach(([x, y], i) => (i ? ctx.lineTo : ctx.moveTo).call(ctx, x * s, Y(y)));
    if (st.length === 1) ctx.lineTo(st[0][0] * s + 0.1, Y(st[0][1]));
    ctx.stroke();
  }
}

const toUnits = (e) => {
  const b = pad.getBoundingClientRect();
  return [((e.clientX - b.left) / b.width) * PAD.w, ((e.clientY - b.top) / b.height) * PAD.h + PAD.top];
};
let activeId = null; // the pen pointer; a palm or finger touching meanwhile is ignored
pad.onpointerdown = (e) => {
  const dev = location.search.includes('dev');
  if (!standalone && !dev) return;
  if (e.pointerType !== 'pen' && !dev) return; // Apple Pencil only: palm and finger touches are ignored
  if (current) return;
  activeId = e.pointerId;
  pad.setPointerCapture(e.pointerId);
  current = [toUnits(e)]; strokes.push(current); drawPad();
};
pad.onpointermove = (e) => {
  if (!current || e.pointerId !== activeId) return;
  for (const ev of e.getCoalescedEvents?.() ?? [e]) {
    const p = toUnits(ev), q = current.at(-1);
    if (Math.hypot(p[0] - q[0], p[1] - q[1]) > 0.008) current.push(p);
  }
  drawPad();
};
pad.onpointerup = pad.onpointercancel = (e) => { if (e.pointerId === activeId) { current = null; activeId = null; } };

$('clear').onclick = () => { current = null; strokes = []; drawPad(); };
$('undo').onclick = () => { current = null; strokes.pop(); drawPad(); };
$('prev').onclick = () => { commit(); go(slot - 1); };
$('next').onclick = () => {
  commit();
  // after the last slot continue with the first one still missing
  const missing = slots.findIndex(({ ch: c, v: w }) => !glyphs[c]?.[w]);
  go(slot + 1 < slots.length ? slot + 1 : missing >= 0 ? missing : slot);
};
addEventListener('resize', drawPad);

// Backup: share sheet (save to Files / iCloud) where possible, a download link otherwise.
$('backup').onclick = async (e) => {
  const f = new File([JSON.stringify(glyphs)], 'scriblone-schrift.json', { type: 'application/json' });
  if (navigator.canShare?.({ files: [f] })) {
    e.preventDefault();
    try { await navigator.share({ files: [f] }); } catch (err) { if (err.name !== 'AbortError') alert('Backup fehlgeschlagen: ' + err.message); }
    return;
  }
  if ($('backup').href) URL.revokeObjectURL($('backup').href);
  $('backup').href = URL.createObjectURL(f);
  $('backup').download = f.name;
};
$('restore').onchange = async (e) => {
  const f = e.target.files[0];
  e.target.value = ''; // allow choosing the same file again
  if (!f) return;
  try {
    if (f.size > 5e6) throw new Error('Datei zu groß');
    const o = JSON.parse(await f.text());
    if (!validGlyphs(o)) throw new Error('kein gültiges scriblone-Backup');
    if (glyphCount() && !confirm('Deine aktuelle Schrift durch das Backup ersetzen?')) return;
    localStorage.setItem(KEY, JSON.stringify(o)); // save first: memory only changes if storage succeeded
    glyphs = o; resetExport(); go(0); show('setup');
    alert('Backup geladen.');
  } catch (err) { alert('Backup konnte nicht geladen werden: ' + err.message); }
};

// ---------- write: text → .goodnotes
let file, template;
const status = (msg, error = false) => { $('info').textContent = msg; $('info').classList.toggle('error', error); };
const resetExport = () => {
  file = null; $('share').disabled = true; $('preview').hidden = true;
};
$('text').oninput = () => { if (file) { resetExport(); status(''); } };
$('make').onclick = async () => {
  const text = normalizeText($('text').value);
  if (!text.trim()) return status('Tippe zuerst einen Text ein.', true);
  if (!glyphCount()) return status('Richte zuerst deine Schrift ein.', true);
  resetExport();
  $('make').disabled = true; $('make').textContent = 'Wird erzeugt …';
  try {
    const set = Object.fromEntries(Object.entries(glyphs).map(([c, vs]) => [c, vs.filter(Boolean)]));
    const { pages, skipped } = layout(text, set);
    if (!pages.flat().length) return status(`Keines dieser Zeichen ist eingerichtet: ${skipped.join(' ')}`, true);
    template ??= g.readZip(new Uint8Array(await (await fetch('template/notebook.goodnotes')).arrayBuffer()));
    const title = text.trim().split(/\s+/).slice(0, 4).join(' ').slice(0, 40);
    const zip = g.writeZip(g.buildNotebook(template, pages.map((p) => p.map((pts) => g.strokeFromPoints(pts))), { title }));
    const name = `${title.replace(/[\\/:*?"<>|\u0000-\u001f\u007f\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, '').replace(/^\.+|\.+$/g, '').trim() || 'Notiz'}.goodnotes`;
    if (normalizeText($('text').value) !== text) return status('Der Text wurde geändert – bitte erneut erzeugen.', true);
    file = new File([zip], name, { type: 'application/octet-stream' });
    $('share').disabled = !navigator.canShare?.({ files: [file] });
    status(`Fertig: ${pages.length === 1 ? '1 Seite' : `${pages.length} Seiten`}.` + (skipped.length ? ` Noch nicht eingerichtet und übersprungen: ${skipped.join(' ')}` : ''));
    drawPreview(pages[0]);
  } catch (e) {
    status(`Erzeugen fehlgeschlagen: ${e.message}`, true);
  } finally {
    $('make').disabled = false; $('make').textContent = 'Erzeugen';
  }
};
$('share').onclick = async () => {
  try { await navigator.share({ files: [file] }); }
  catch (e) { if (e.name !== 'AbortError') status(`Teilen fehlgeschlagen: ${e.message}`, true); }
};

function drawPreview(strokes) {
  const c = $('preview'), P = g.PAGE, r = devicePixelRatio || 1;
  c.hidden = false;
  const w = c.clientWidth, s = w / P.width, h = P.height * s;
  c.style.height = h + 'px'; c.width = w * r; c.height = h * r;
  const x = c.getContext('2d');
  x.setTransform(r * s, 0, 0, r * s, 0, 0);
  x.strokeStyle = '#bcd'; x.lineWidth = 1;
  for (let i = 0; i < P.lineCount; i++) { const y = P.firstLine + i * P.lineSpacing; x.beginPath(); x.moveTo(0, y); x.lineTo(P.width, y); x.stroke(); }
  x.strokeStyle = '#111'; x.lineWidth = g.PEN.width; x.lineCap = x.lineJoin = 'round';
  for (const st of strokes) { x.beginPath(); st.forEach(([px, py], i) => (i ? x.lineTo(px, py) : x.moveTo(px, py))); x.stroke(); }
}

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');
go(0);
show(glyphCount() ? 'write' : 'setup');
