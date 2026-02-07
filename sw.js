const CACHE_NAME = 'karticky-v8';
const ASSETS = ['./index.html', './app.js', './srs.js', './style.css', './manifest.json'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Stale-while-revalidate: serve from cache immediately, update in background
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;

  e.respondWith(
    caches.open(CACHE_NAME).then(cache =>
      cache.match(e.request).then(cached => {
        const fetchPromise = fetch(e.request).then(response => {
          if (response.ok) {
            cache.put(e.request, response.clone());
          }
          return response;
        }).catch(() => null);

        // If we have a cached version, return it and update in background
        if (cached) {
          // Check for updates in background
          fetchPromise.then(fresh => {
            if (fresh && cached.headers.get('content-length') !== fresh.headers.get('content-length')) {
              // Notify clients about the update
              self.clients.matchAll().then(clients => {
                clients.forEach(c => c.postMessage({ type: 'UPDATE_AVAILABLE' }));
              });
            }
          });
          return cached;
        }

        // No cache — wait for network
        return fetchPromise.then(r => r || new Response('Offline', { status: 503 }));
      })
    )
  );
});

// Allow clients to force-update
self.addEventListener('message', e => {
  if (e.data === 'SKIP_WAITING') self.skipWaiting();
});
