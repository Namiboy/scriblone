// Usage: node tools/events.mjs <file.goodnotes>... — compact event sequence per file
import { readGoodnotes } from './inspect.mjs';
import { parse, parseDelimited } from '../src/pb.js';
const td = new TextDecoder();
for (const path of process.argv.slice(2)) {
  const { files } = readGoodnotes(path);
  const ids = new Map(); const short = (u) => { if (!ids.has(u)) ids.set(u, 'U' + ids.size); return ids.get(u); };
  console.log(`== ${path}`);
  parseDelimited(files['index.events.pb']).forEach((m, i) => {
    const f = parse(m); const ent = td.decode(f[0].value); const ev = f[1];
    const inner = parse(ev.value).filter((x) => x.wire === 2 && x.value.length === 36).map((x) => `${x.no}=${short(td.decode(x.value))}`);
    console.log(`  #${i} ent=${short(ent)} ev=${ev.no} ${m.length}B  refs: ${inner.join(' ')}`);
  });
  for (const n of Object.keys(files).filter((n) => n.startsWith('notes/'))) {
    const recs = files[n].length ? parseDelimited(files[n]) : [];
    console.log(`  ${n.replace(/notes\/(.{8}).*/, 'notes/$1')}=${short(n.slice(6))} records=${recs.length} sizes=${recs.map((r) => r.length).join(',')}`);
  }
  console.log('  ids: ' + [...ids].map(([u, s]) => `${s}=${u.slice(0, 8)}…${u.slice(-2)}`).join(' '));
}
