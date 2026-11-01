// Bump CACHE whenever any app file changes so old caches are dropped on activate.
const CACHE = 'liftlog-v2';
const ASSETS = ['./', 'index.html', 'style.css', 'app.js', 'manifest.json', 'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png', 'icons/apple-touch-icon.png'];
self.addEventListener('install', e => e.waitUntil(
  caches.open(CACHE).then(c => c.addAll(ASSETS.map(u => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil(
  caches.keys().then(k => Promise.all(k.filter(x => x !== CACHE).map(x => caches.delete(x)))).then(() => self.clients.claim())));
// Network first (revalidating past the HTTP cache) so updates show up on the next load; cache when offline.
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(fetch(req, { cache: 'no-cache' }).then(r => {
    if (r.ok && r.status === 200 && r.type === 'basic') { const copy = r.clone(); e.waitUntil(caches.open(CACHE).then(c => c.put(req, copy))); }
    return r;
  }).catch(async () => {
    const c = await caches.open(CACHE);
    return (await c.match(req, { ignoreSearch: true })) ||
      (req.mode === 'navigate' && ((await c.match('./')) || (await c.match('index.html')))) || Response.error();
  }));
});
