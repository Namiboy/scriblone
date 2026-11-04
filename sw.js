// Offline cache: all app files are stored on install; every request is answered from the cache at once
// and refreshed from the network in the background, so an update shows up on the next start.
const CACHE = 'scriblone-v1';
const FILES = ['./', 'index.html', 'manifest.webmanifest', 'src/app.js', 'src/goodnotes.js', 'src/layout.js',
  'src/lz4.js', 'src/pb.js', 'src/tpl.js', 'vendor/fflate.mjs', 'template/notebook.goodnotes'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(caches.open(CACHE).then(async (c) => {
    const hit = await c.match(e.request, { ignoreSearch: true });
    const net = fetch(e.request).then((r) => { if (r.ok) c.put(e.request, r.clone()); return r; });
    if (hit) { e.waitUntil(net.catch(() => {})); return hit; }
    return net;
  }));
});
