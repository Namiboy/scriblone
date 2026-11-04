import * as g from './goodnotes.js';
import { layout, LINES, CAP, DESC } from './layout.js';

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
const validGlyphs = (o) => o && typeof o === 'object' && Object.values(o).every((vs) => Array.isArray(vs) && vs.every((v) => v === null ||
  (v && typeof v.width === 'number' && Array.isArray(v.strokes) && v.strokes.every((s) => Array.isArray(s) && s.every((p) => p.length === 2 && p.every(Number.isFinite))))));

// ---------- tabs
const show = (tab) => {
  $('write').hidden = tab !== 'write'; $('setup').hidden = tab !== 'setup';
  $('tabWrite').classList.toggle('on', tab === 'write'); $('tabSetup').classList.toggle('on', tab === 'setup');
  if (tab === 'setup') drawPad();
};
$('tabWrite').onclick = () => show('write');
$('tabSetup').onclick = () => show('setup');

// ---------- setup: write each character VARIANTS times
const slots = CHARS.flatMap((ch) => Array.from({ length: VARIANTS }, (_, v) => ({ ch, v })));
let slot = 0, strokes = [], current = null;
const pad = $('pad'), ctx = pad.getContext('2d');
$('pwaWarn').hidden = standalone;
$('jump').innerHTML = CHARS.map((c) => `<option value="${CHARS.indexOf(c) * VARIANTS}">${c}</option>`).join('');
$('jump').onchange = () => go(+$('jump').value);

function go(i) {
  slot = Math.max(0, Math.min(slots.length - 1, i));
  const { ch, v } = slots[slot], stored = glyphs[ch]?.[v];
  strokes = stored ? stored.strokes.map((s) => s.map(([x, y]) => [x + 0.3, y])) : [];
  $('target').textContent = ch;
  $('which').textContent = `Variante ${v + 1} von ${VARIANTS}${stored ? ' ✔' : ''}`;
  $('jump').value = CHARS.indexOf(ch) * VARIANTS;
  $('count').textContent = `${Object.values(glyphs).reduce((n, vs) => n + vs.filter(Boolean).length, 0)} / ${slots.length}`;
  drawPad();
}

function drawPad() {
  const r = devicePixelRatio || 1, w = pad.clientWidth, h = pad.clientHeight;
  if (!w) return;
  pad.width = w * r; pad.height = h * r;
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

const toUnits = (e) => [(e.offsetX / pad.clientWidth) * PAD.w, (e.offsetY / pad.clientHeight) * PAD.h + PAD.top];
pad.onpointerdown = (e) => {
  const dev = location.search.includes('dev');
  if (!standalone && !dev) return;
  if (e.pointerType !== 'pen' && !dev) return; // Apple Pencil only: palm and finger touches are ignored
  pad.setPointerCapture(e.pointerId);
  current = [toUnits(e)]; strokes.push(current); drawPad();
};
pad.onpointermove = (e) => {
  if (!current) return;
  for (const ev of e.getCoalescedEvents?.() ?? [e]) {
    const p = toUnits(ev), q = current.at(-1);
    if (Math.hypot(p[0] - q[0], p[1] - q[1]) > 0.008) current.push(p);
  }
  drawPad();
};
pad.onpointerup = pad.onpointercancel = () => { current = null; };

$('clear').onclick = () => { strokes = []; drawPad(); };
$('prev').onclick = () => go(slot - 1);
$('next').onclick = () => {
  const { ch, v } = slots[slot];
  if (strokes.length) {
    const xs = strokes.flat().map((p) => p[0]), min = Math.min(...xs);
    const r3 = (n) => Math.round(n * 1000) / 1000;
    (glyphs[ch] ??= [])[v] = { strokes: strokes.map((s) => (s.length > 1 ? s : [s[0], [s[0][0] + 0.01, s[0][1]]]).map(([x, y]) => [r3(x - min), r3(y)])) /* a dot needs ≥1 segment */, width: r3(Math.max(Math.max(...xs) - min, 0.08)) };
  } else if (glyphs[ch]) {
    delete glyphs[ch][v]; // cleared = variant removed
  }
  save();
  go(slot + 1);
};
addEventListener('resize', drawPad);

$('backup').onclick = () => {
  $('backup').href = URL.createObjectURL(new Blob([JSON.stringify(glyphs)], { type: 'application/json' }));
  $('backup').download = 'scriblone-schrift.json';
};
$('restore').onchange = async (e) => {
  try {
    const o = JSON.parse(await e.target.files[0].text());
    if (!validGlyphs(o)) throw new Error('kein scriblone-Backup');
    glyphs = o; save(); go(0);
    alert('Backup geladen.');
  } catch (err) { alert('Backup konnte nicht geladen werden: ' + err.message); }
};

// ---------- write: text → .goodnotes
let file, template;
$('make').onclick = async () => {
  const set = Object.fromEntries(Object.entries(glyphs).map(([c, vs]) => [c, vs.filter(Boolean)]));
  const { pages, skipped } = layout($('text').value, set);
  template ??= g.readZip(new Uint8Array(await (await fetch('template/notebook.goodnotes')).arrayBuffer()));
  const zip = g.writeZip(g.buildNotebook(template, pages.map((p) => p.map((pts) => g.strokeFromPoints(pts)))));
  const name = `${($('text').value.trim().split(/\s+/).slice(0, 3).join(' ') || 'Notiz').replace(/[\\/:*?"<>|]/g, '')}.goodnotes`;
  file = new File([zip], name, { type: 'application/octet-stream' });
  $('share').disabled = !navigator.canShare?.({ files: [file] });
  const a = $('download');
  a.href = URL.createObjectURL(file); a.download = name; a.hidden = false;
  $('info').textContent = `${pages.length} Seite(n), ${pages.flat().length} Striche.` + (skipped.length ? ` Übersprungen (noch nicht eingerichtet): ${skipped.join(' ')}` : '');
  drawPreview(pages[0]);
};
$('share').onclick = async () => {
  try { await navigator.share({ files: [file] }); }
  catch (e) { if (e.name !== 'AbortError') $('info').textContent += ` Teilen fehlgeschlagen: ${e.message}`; }
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
show(Object.keys(glyphs).length ? 'write' : 'setup');
