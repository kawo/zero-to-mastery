/* eslint-disable no-restricted-globals */
/**
 * Recipes service worker (hand-written, no Workbox).
 *
 * Built by the plugin in vite.config.ts, which replaces the two placeholders
 * below with the list of built files and a version hash of that list.
 *
 * Caches:
 *   precache  "recipes-precache-<version>"  app shell + static assets, cache-first
 *   api       "recipes-api-v1"               /api JSON responses
 *   images    "recipes-images-v1"            /api/images/* photos
 *
 * Strategies, by request:
 *   page navigations          network first -> cached app shell -> offline.html
 *   /api/images/*             stale-while-revalidate
 *   /api/categories, /filter  stale-while-revalidate (changes rarely)
 *   /api/search, /api/meal/*  network first (with timeout) -> cached copy
 *   /api/random               network only (a cached "random" would repeat)
 *   built assets & public/    cache first (precached; names change per build)
 *
 * To change a strategy, edit ROUTES below. Bump RUNTIME_VERSION to throw
 * away old runtime caches when their format changes.
 */

const VERSION = self.__SW_VERSION__;
const PRECACHE_URLS = self.__PRECACHE_MANIFEST__;
const RUNTIME_VERSION = 'v1';

const PRECACHE = `recipes-precache-${VERSION}`;
const API_CACHE = `recipes-api-${RUNTIME_VERSION}`;
const IMAGE_CACHE = `recipes-images-${RUNTIME_VERSION}`;
const KEEP = new Set([PRECACHE, API_CACHE, IMAGE_CACHE]);

// Every lookup matches by URL only (ignoreVary). Hosts often send
// "Vary: Origin", and module scripts are requested with an Origin header
// while the install step's requests aren't, so honouring Vary would make
// the precached bundle never match and the app fail to start offline.
const MATCH = { ignoreVary: true };

const APP_SHELL = '/index.html';
const OFFLINE_PAGE = '/offline.html';
const NETWORK_TIMEOUT_MS = 4000;
// Upper bounds so the caches don't grow forever; oldest entries go first
const MAX_API_ENTRIES = 150;
const MAX_IMAGE_ENTRIES = 300;

// ---------------------------------------------------------------------------
// Install: download the app shell and static assets for this version.
// skipWaiting activates the new worker straight away; the page shows a
// "new version available" toast so the user can reload onto the new files.
self.addEventListener('install', event => {
  event.waitUntil(
    caches
      .open(PRECACHE)
      // cache: 'reload' skips the HTTP cache so we store fresh copies
      .then(cache => cache.addAll(PRECACHE_URLS.map(url => new Request(url, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

// Activate: delete caches from older versions, then control open pages.
self.addEventListener('activate', event => {
  event.waitUntil(
    caches
      .keys()
      .then(keys => Promise.all(keys.filter(key => key.startsWith('recipes-') && !KEEP.has(key)).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

// ---------------------------------------------------------------------------
// Helpers

/** Deletes the oldest entries once a cache holds more than maxEntries. */
async function trimCache(cacheName, maxEntries) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  // cache.keys() returns entries in insertion order, oldest first
  await Promise.all(keys.slice(0, Math.max(0, keys.length - maxEntries)).map(key => cache.delete(key)));
}

/** Stores a successful response (never errors or partial content). */
async function put(cacheName, request, response, maxEntries) {
  if (!response || !response.ok || response.status === 206) return;
  const cache = await caches.open(cacheName);
  await cache.put(request, response);
  if (maxEntries) await trimCache(cacheName, maxEntries);
}

/** JSON error the client understands as "offline and not cached" (see lib/api.ts). */
function offlineResponse() {
  return new Response(JSON.stringify({ error: 'offline', offline: true }), {
    status: 503,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
  });
}

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms);
    promise.then(
      value => { clearTimeout(timer); resolve(value); },
      error => { clearTimeout(timer); reject(error); }
    );
  });
}

// ---------------------------------------------------------------------------
// Strategies

/**
 * Network first: fresh data when online; if the network fails or is slower
 * than the timeout, the last cached copy. A slow response that arrives after
 * the timeout still updates the cache for next time.
 */
async function networkFirst(event, cacheName, maxEntries) {
  const { request } = event;
  const network = fetch(request).then(response => {
    event.waitUntil(put(cacheName, request, response.clone(), maxEntries));
    return response;
  });
  try {
    return await withTimeout(network, NETWORK_TIMEOUT_MS);
  } catch {
    const cached = await caches.match(request, { cacheName, ignoreVary: true });
    if (cached) return cached;
    // No cached copy: wait for the network after all, or report offline
    try {
      return await network;
    } catch {
      return offlineResponse();
    }
  }
}

/**
 * Stale-while-revalidate: answer from the cache at once if possible, and
 * refresh the cached copy in the background for next time.
 */
async function staleWhileRevalidate(event, cacheName, maxEntries) {
  const { request } = event;
  const cached = await caches.match(request, { cacheName, ignoreVary: true });
  const network = fetch(request)
    .then(response => {
      event.waitUntil(put(cacheName, request, response.clone(), maxEntries));
      return response;
    });
  if (cached) {
    event.waitUntil(network.catch(() => undefined));
    return cached;
  }
  try {
    return await network;
  } catch {
    return request.destination === 'image' ? new Response(null, { status: 503 }) : offlineResponse();
  }
}

async function networkOnly(request) {
  try {
    return await fetch(request);
  } catch {
    return offlineResponse();
  }
}

/**
 * Page loads: try the network (so a new deploy's index.html is seen), fall
 * back to the precached app shell (the SPA then renders favorites etc. from
 * IndexedDB), and only show offline.html if even the shell isn't cached.
 */
async function navigation(event) {
  try {
    return await withTimeout(fetch(event.request), NETWORK_TIMEOUT_MS);
  } catch {
    return (await caches.match(APP_SHELL, MATCH)) || (await caches.match(OFFLINE_PAGE, MATCH)) || Response.error();
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request, { cacheName: PRECACHE, ignoreVary: true });
  return cached || fetch(request);
}

// ---------------------------------------------------------------------------
// Routing

const ROUTES = [
  { test: url => url.pathname.startsWith('/api/images/'), handle: event => staleWhileRevalidate(event, IMAGE_CACHE, MAX_IMAGE_ENTRIES) },
  { test: url => url.pathname === '/api/categories' || url.pathname === '/api/filter', handle: event => staleWhileRevalidate(event, API_CACHE, MAX_API_ENTRIES) },
  { test: url => url.pathname === '/api/search' || url.pathname.startsWith('/api/meal/'), handle: event => networkFirst(event, API_CACHE, MAX_API_ENTRIES) },
  { test: url => url.pathname.startsWith('/api/'), handle: event => networkOnly(event.request) }
];

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  // Only our own origin; anything else goes straight to the network
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(navigation(event));
    return;
  }

  const route = ROUTES.find(r => r.test(url));
  if (route) {
    event.respondWith(route.handle(event));
    return;
  }

  if (PRECACHE_URLS.includes(url.pathname)) {
    event.respondWith(cacheFirst(request));
  }
});
