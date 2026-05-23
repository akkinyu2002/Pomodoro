const CACHE_VERSION = 'v3';
const SHELL_CACHE = `focus-forge-shell-${CACHE_VERSION}`;
const RUNTIME_CACHE = `focus-forge-runtime-${CACHE_VERSION}`;
const APP_SHELL = [
  './',
  './index.html',
  './offline.html',
  './styles.css',
  './app.js',
  './scripts/range-fill.js',
  './manifest.webmanifest',
  './icons/focus-forge.svg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => (
      Promise.all(keys.filter((key) => ![SHELL_CACHE, RUNTIME_CACHE].includes(key)).map((key) => caches.delete(key)))
    ))
  );
  self.clients.claim();
});

// Helper: stale-while-revalidate by default for GET requests
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // Always serve navigation requests from cache first, fallback to network and offline page
  if (event.request.mode === 'navigate') {
    event.respondWith(
      caches.match(event.request).then((cached) => cached || fetch(event.request).then((response) => {
        const copy = response.clone();
        caches.open(RUNTIME_CACHE).then((cache) => cache.put(event.request, copy));
        return response;
      }).catch(() => caches.match('./offline.html')))
    );
    return;
  }

  // For same-origin static assets: try cache, then network and update cache
  if (url.origin === location.origin) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        const networkFetch = fetch(event.request).then((response) => {
          if (!response || response.status !== 200) return response;
          const copy = response.clone();
          caches.open(RUNTIME_CACHE).then((cache) => cache.put(event.request, copy));
          return response;
        }).catch(() => null);

        // Return cached immediately if available, otherwise wait for network
        return cached || networkFetch.then((r) => r) || caches.match('./offline.html');
      })
    );
    return;
  }

  // For cross-origin requests: try network, fallback to cache
  event.respondWith(
    fetch(event.request).then((response) => {
      // Optionally cache cross-origin responses in runtime
      return response;
    }).catch(() => caches.match(event.request))
  );
});
