const CACHE_NAME = 'stc-v4';
const PRECACHE = [
  '/',
  '/logo-mark.webp',
  '/logo192.png',
  '/logo512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    // Per-entry so one missing asset cannot reject the whole install and
    // leave the site without a service worker.
    caches.open(CACHE_NAME).then((cache) =>
      Promise.all(PRECACHE.map((url) => cache.add(url).catch(() => {})))
    )
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  const req = e.request;

  // Only handle same-origin GET requests. Let the browser handle everything
  // else natively (RPC, CORS requests, chrome-extension, POST, etc.) —
  // intercepting them breaks CORS and wallet providers.
  if (req.method !== 'GET') return;

  let url;
  try { url = new URL(req.url); } catch { return; }
  if (url.origin !== self.location.origin) return;
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res && res.status === 200 && res.type === 'basic') {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, clone)).catch(() => {});
        }
        return res;
      })
      .catch(async () => (await caches.match(req)) || Response.error())
  );
});
