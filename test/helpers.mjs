import { fileURLToPath } from 'node:url';
import { readGoodnotes } from '../tools/inspect.mjs';

export const root = fileURLToPath(new URL('..', import.meta.url));
export const ZETTEL_MIT = root + 'ZettelmitSchrift.goodnotes';
export const ZETTEL_OHNE = root + 'ZettelohneSchrift.goodnotes';
export const STROKE_NOTE = 'notes/3AD0D5D2-5A71-482B-8467-8E1D06107D2F';
export const load = (p) => readGoodnotes(p).files;
