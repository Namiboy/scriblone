// Copies only the public app files into dist/ (never samples/, out/ or .omc/). Usage: node tools/dist.mjs
import { cpSync, rmSync, mkdirSync } from 'node:fs';
const root = new URL('..', import.meta.url), dist = new URL('dist/', root);
rmSync(dist, { recursive: true, force: true });
mkdirSync(new URL('template/', dist), { recursive: true });
for (const f of ['index.html', 'manifest.webmanifest', 'sw.js', 'src', 'vendor', 'icons', 'template/notebook.goodnotes'])
  cpSync(new URL(f, root), new URL(f, dist), { recursive: true });
console.log('dist/ ready');
