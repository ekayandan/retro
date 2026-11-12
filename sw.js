// Offline cache for the app itself. Games, saves and box art live in IndexedDB, not here.
// Bump VERSION whenever any file changes so phones pick up the update.
const VERSION = 'retro-v1';
const FILES = [
  './', 'index.html', 'style.css', 'app.js', 'storage.js', 'art.js', 'lib/jsnes.min.js', 'manifest.webmanifest',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png', 'icons/favicon-32.png',
];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return; // box art goes straight to the network
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then((hit) => hit ||
      fetch(e.request).catch(() => (e.request.mode === 'navigate' ? caches.match('index.html') : Response.error())))
  );
});
