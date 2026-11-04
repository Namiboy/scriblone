// Minimal service worker: network only, exists so iOS treats the page as an installable app.
self.addEventListener('fetch', () => {});
