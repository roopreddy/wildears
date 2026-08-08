/**
 * WildEars Service Worker
 * Caches the app shell for offline use.
 * The BirdNET model is large (~20MB) and fetched from a 3rd-party host,
 * so we let the browser's HTTP cache handle that separately.
 */

const CACHE_NAME = 'wildears-v1';

// App shell — everything needed to load the UI
const PRECACHE_URLS = [
  '/wildears/',
  '/wildears/index.html',
  '/wildears/css/styles.css',
  '/wildears/js/app.js',
  '/wildears/js/recorder.js',
  '/wildears/js/identifier.js',
  '/wildears/js/birdnet-worker.js',
  '/wildears/js/mel-spec-layer.js',
  '/wildears/js/species-db.js',
  '/wildears/js/storage.js',
  '/wildears/js/map.js',
  '/wildears/audio-processor.js',
  '/wildears/manifest.json',
  '/wildears/icons/icon.svg'
];

// ── Install: cache app shell ──────────────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

// ── Activate: remove old caches ───────────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

// ── Fetch: cache-first for app shell, network-first for everything else
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Only handle GET requests
  if (event.request.method !== 'GET') return;

  // Let 3rd-party requests (BirdNET model, Leaflet, Wikimedia) go straight
  // to network — browser HTTP cache handles those
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;

      // Not in cache — fetch from network and cache for next time
      return fetch(event.request).then(response => {
        if (!response || response.status !== 200 || response.type === 'opaque') {
          return response;
        }
        const clone = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        return response;
      });
    }).catch(() => {
      // Offline fallback for navigation requests
      if (event.request.mode === 'navigate') {
        return caches.match('/wildears/index.html');
      }
    })
  );
});
