#!/usr/bin/env node
// Builds the public web template template/notebook.goodnotes from samples/S52seiten (2 pages, events for
// both notes) without any of the user's handwriting: notes → one synthetic stroke, notes search removed,
// thumbnail from the blank s1leer. Usage: node tools/template.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import * as g from '../src/goodnotes.js';
import { parse, parseDelimited, serializeDelimited } from '../src/pb.js';

const root = new URL('..', import.meta.url);
const read = (p) => g.readZip(readFileSync(new URL(p, root)));
const f = read('samples/S52seiten.goodnotes');
const blank = read('samples/s1leer.goodnotes');
const td = new TextDecoder();

const notes = Object.keys(f).filter((n) => n.startsWith('notes/')).map((n) => n.slice(6));
const full = notes.find((id) => f['notes/' + id].length);
const { proto } = g.readNotes(f['notes/' + full]);
for (const id of notes) f['notes/' + id] = id === full ? g.writeNotes(proto, [g.strokeFromPoints([[100, 100], [110, 110]])]) : new Uint8Array();
for (const id of notes) delete f['search/' + id];
f['index.search.pb'] = serializeDelimited(parseDelimited(f['index.search.pb']).filter((m) => !notes.includes(td.decode(parse(m)[0].value))));
f['thumbnail.jpg'] = blank['thumbnail.jpg'];

writeFileSync(new URL('template/notebook.goodnotes', root), g.writeZip(f));
console.log('template/notebook.goodnotes written');
