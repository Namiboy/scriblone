// Offline cache, one complete snapshot per app version: install downloads every file fresh, requests are
// answered from that snapshot only, so old and new modules are never mixed. A new deploy changes CACHE
// (tools/dist.mjs writes a content hash), the browser installs it in the background, next start uses it.
const CACHE = 'scriblone-dev';
const FILES = ['./', 'index.html', 'manifest.webmanifest', 'src/app.js', 'src/goodnotes.js', 'src/layout.js',
  'src/lz4.js', 'src/pb.js', 'src/tpl.js', 'vendor/fflate.mjs', 'template/notebook.goodnotes',
  'icons/apple-touch-icon.png', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png'];

const FILE_URLS = new Set(FILES.map((f) => new URL(f, location).href));

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE)
    .then((c) => c.addAll(FILES.map((f) => new Request(f, { cache: 'reload' }))))
    .then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  // only the app's own files are served from the cache (Pages answers unknown paths with index.html)
  const u = new URL(e.request.url); u.search = '';
  if (e.request.method !== 'GET' || !FILE_URLS.has(u.href)) return;
  e.respondWith(caches.match(u.href, { cacheName: CACHE }).then((hit) => hit ?? fetch(e.request)));
});
