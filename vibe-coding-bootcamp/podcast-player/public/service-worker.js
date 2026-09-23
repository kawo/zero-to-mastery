const cacheName = 'podcast-player-v6';
const assetsToCache = [
  '/',
  '/index.html',
  '/style.css',
  '/script.js',
  '/downloads.js',
  '/subscriptions.js',
  '/queue.js',
  '/podcast-icon-192.png',
  '/podcast-icon-512.png',
  '/default-podcast.png',
  '/favicon.png'
];

// Install event - caching assets
self.addEventListener('install', event => {
    event.waitUntil(
      caches.open(cacheName)
        .then(cache => {
          return cache.addAll(assetsToCache);
        })
    );
    self.skipWaiting();
});
  
// Fetch event - network first so code changes show up, cache as offline fallback
self.addEventListener('fetch', event => {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          if (response.ok && assetsToCache.includes(new URL(event.request.url).pathname)) {
            const copy = response.clone();
            caches.open(cacheName).then(cache => cache.put(event.request, copy));
          }
          return response;
        })
        .catch(() => caches.match(event.request))
    );
});

// Activate event - clean up old caches
self.addEventListener('activate', event => {
  const cacheWhitelist = [cacheName];
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cache => {
          if (!cacheWhitelist.includes(cache)) {
            return caches.delete(cache);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});
