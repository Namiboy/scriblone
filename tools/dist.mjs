// Copies only the public app files into dist/ (never samples/, out/ or .omc/) and stamps the service
// worker cache name with a hash of the content, so every deploy is a new offline snapshot.
// Usage: node tools/dist.mjs
import { cpSync, rmSync, mkdirSync, readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';

const root = new URL('..', import.meta.url), dist = new URL('dist/', root);
rmSync(dist, { recursive: true, force: true });
mkdirSync(new URL('template/', dist), { recursive: true });
for (const f of ['index.html', 'manifest.webmanifest', 'sw.js', 'src', 'vendor', 'icons', '_headers', 'template/notebook.goodnotes'])
  cpSync(new URL(f, root), new URL(f, dist), { recursive: true });

const hash = createHash('sha256');
const walk = (dir) => readdirSync(dir).sort().forEach((n) => {
  const p = new URL(n, dir);
  if (statSync(p).isDirectory()) walk(new URL(n + '/', dir));
  else if (n !== 'sw.js') hash.update(n).update(readFileSync(p));
});
walk(dist);
const sw = new URL('sw.js', dist), version = hash.digest('hex').slice(0, 12);
const src = readFileSync(sw, 'utf8');
if (!src.includes("'scriblone-dev'")) throw new Error('sw.js: cache name placeholder missing');
writeFileSync(sw, src.replace("'scriblone-dev'", `'scriblone-${version}'`));
console.log(`dist/ ready, cache scriblone-${version}`);
