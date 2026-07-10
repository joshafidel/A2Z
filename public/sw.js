/**
 * A2Z service worker — makes the app installable and resilient offline.
 *
 * Strategy:
 *  - App shell (navigations): network-first, falling back to the cached
 *    shell so the app still opens without a connection.
 *  - Static assets (JS bundles, fonts, icons): cache-first — hashed
 *    filenames make them safe to cache forever.
 *  - Cross-origin requests (live data APIs, booking sites): untouched.
 */

const CACHE = 'a2z-v1';
// The build step injects the hashed JS bundle paths here so the whole app
// shell is cached at install time — offline works after a single visit.
const BUNDLES = [];
const SHELL = ['/', '/manifest.json', '/icon-192.png', '/icon-512.png'].concat(BUNDLES);

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  // Never intercept cross-origin calls (live data, booking handoffs).
  if (url.origin !== self.location.origin) return;

  // Navigations: network-first with cached-shell fallback.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put('/', copy));
          return res;
        })
        .catch(() => caches.match('/').then((hit) => hit ?? Response.error())),
    );
    return;
  }

  // Static assets: cache-first, then network (and cache the result).
  event.respondWith(
    caches.match(request).then(
      (hit) =>
        hit ??
        fetch(request).then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return res;
        }),
    ),
  );
});
