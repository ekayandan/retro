// Offline cache for the app itself. Games, saves and box art live in IndexedDB / OPFS, not here.
// Bump VERSION whenever any file changes so phones pick up the update.
const VERSION = 'retro-v12';
const FILES = [
  './', 'index.html', 'style.css', 'app.js', 'storage.js', 'art.js', 'lib/jsnes.min.js', 'manifest.webmanifest',
  'play.html', 'play.js', 'link.js', 'lib/peerjs.min.js', 'lib/qrcode.js', 'lib/nipplejs.min.js', 'pad.html', 'pad.js', 'pad.css', 'tilt.js', 'nav.js',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png', 'icons/favicon-32.png',
  'fonts/jersey10-latin.woff2', 'themes.css', 'theme.js',
];
// EmulatorJS and its cores are cached the first time a game for that system is opened, not on install.
const LAZY = /\/ejs\//;

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== VERSION && k !== 'retro-ejs').map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// PSP emulation uses threads (SharedArrayBuffer), which browsers only allow on "cross-origin isolated"
// pages. GitHub Pages can't send those headers, so the service worker adds them.
function isolate(res) {
  if (!res || res.status === 0 || res.type === 'opaque') return res;
  const headers = new Headers(res.headers);
  headers.set('Cross-Origin-Opener-Policy', 'same-origin');
  headers.set('Cross-Origin-Embedder-Policy', 'require-corp');
  headers.set('Cross-Origin-Resource-Policy', 'same-origin');
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return; // box art goes straight to the network
  if (LAZY.test(url.pathname)) {
    e.respondWith(caches.open('retro-ejs').then(async (c) => {
      const hit = await c.match(e.request, { ignoreSearch: true });
      if (hit) return isolate(hit);
      const res = await fetch(e.request);
      if (res.ok) c.put(e.request, res.clone());
      return isolate(res);
    }));
    return;
  }
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true })
      .then((hit) => hit || fetch(e.request))
      .catch(() => (e.request.mode === 'navigate' ? caches.match('index.html') : Response.error()))
      .then(isolate)
  );
});
