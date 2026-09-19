/* ==========================================================================
   Compliment Generator: service worker (offline support)
   --------------------------------------------------------------------------
   Loaded by the small sw.js at the site root (importScripts). The worker has
   to be registered from the root: a service worker only looks after pages in
   its own folder and below, and index.html is at the root. So every path
   here is relative to the root, not to this js/ folder.

   Keeps a copy of the whole app in the browser, so it opens and works with
   no connection. The compliments, jokes and interface text live in
   js/script.js and js/i18n.js, so caching those files caches the data too.
   Favorites and the language choice are in localStorage, which works
   offline anyway.

   - On install: every app file is downloaded and stored, plus the Google
     Fonts the page uses (if they can't be fetched, the page falls back to
     system fonts; the app still works).
   - App files are served "stale-while-revalidate": straight from the cache
     (instant, and offline too), while a fresh copy is fetched in the
     background for next time. After an update, the new version shows on the
     following visit.
   - Fonts are served from the cache first: their addresses change whenever
     Google changes the files, so a cached one never goes stale.

   When you change the list of files below, or want returning visitors to
   drop everything they have and download it all again, change VERSION.
   ========================================================================== */

const VERSION = 'v1';
const APP_CACHE = `compliment-generator-app-${VERSION}`;
const FONT_CACHE = 'compliment-generator-fonts-v1';

// Everything the app needs to run. Paths are relative to the site root (see above).
const APP_FILES = [
  './',
  'index.html',
  'css/style.css',
  'js/i18n.js',
  'js/script.js',
  'manifest.webmanifest',
  'favicon.png',
  'images/icons/icon.svg',
  'images/icons/icon-192.png',
  'images/icons/icon-512.png',
  'images/icons/icon-maskable-192.png',
  'images/icons/icon-maskable-512.png',
  'images/icons/apple-touch-icon.png',
];

// Same address as the stylesheet link in index.html: keep the two in sync.
const FONT_CSS = 'https://fonts.googleapis.com/css2?family=Lato:wght@400;700&family=Nunito:wght@600;800&display=swap';
const FONT_ORIGINS = ['https://fonts.googleapis.com', 'https://fonts.gstatic.com'];
// Google splits each font by alphabet. English and French only need these two
// (latin-ext has "œ", as in "cœur").
const FONT_SUBSETS = ['latin', 'latin-ext'];

/* ---------- Install: store the app ---------- */
self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(APP_CACHE);
    // cache: 'reload' skips the browser's HTTP cache, so the copies are fresh.
    await cache.addAll(APP_FILES.map((file) => new Request(file, { cache: 'reload' })));
    try {
      await cacheFonts();
    } catch (error) {
      // No fonts offline (e.g. Google Fonts is blocked): system fonts take over.
    }
    // Take over straight away instead of waiting for every tab to close:
    // the files are served stale-while-revalidate anyway, so nothing breaks.
    await self.skipWaiting();
  })());
});

/**
 * Downloads the Google Fonts stylesheet and the font files it points to, for
 * the alphabets the app uses. Done here rather than on first use, because on
 * a first visit the page loads its fonts before this worker is in charge.
 */
async function cacheFonts() {
  const cache = await caches.open(FONT_CACHE);
  const response = await fetch(FONT_CSS, { mode: 'cors' });
  if (!response.ok) return;
  const css = await response.clone().text();
  await cache.put(FONT_CSS, response);

  // Each block looks like: /* latin */ @font-face { … src: url(https://fonts.gstatic.com/…) … }
  const wanted = [];
  const blocks = [...css.matchAll(/\/\*\s*([\w-]+)\s*\*\/\s*@font-face\s*{([^}]*)}/g)];
  for (const [, subset, body] of blocks) {
    const url = body.match(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\)/);
    if (url && FONT_SUBSETS.includes(subset)) wanted.push(url[1]);
  }
  // Unexpected format: take every font file rather than none.
  if (!wanted.length) wanted.push(...[...css.matchAll(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\)/g)].map((m) => m[1]));
  await cache.addAll([...new Set(wanted)]);
}

/* ---------- Activate: remove the caches of older versions ---------- */
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keep = [APP_CACHE, FONT_CACHE];
    const names = await caches.keys();
    await Promise.all(names
      .filter((name) => name.startsWith('compliment-generator-') && !keep.includes(name))
      .map((name) => caches.delete(name)));
    await self.clients.claim(); // control the open page without a reload
  })());
});

/* ---------- Fetch: answer from the cache ---------- */
self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin === self.location.origin) {
    event.respondWith(appFile(event));
  } else if (FONT_ORIGINS.includes(url.origin)) {
    event.respondWith(fontFile(request));
  }
  // Anything else (share links open other sites) goes to the network as usual.
});

/**
 * App files: the cached copy at once, refreshed in the background.
 * A page request (index.html, with or without "?…") always gets the app's
 * page when offline.
 */
async function appFile(event) {
  const request = event.request;
  const cache = await caches.open(APP_CACHE);
  const isPage = request.mode === 'navigate';
  // A page address with a query string ("?utm_source=…") is still the same page.
  const key = isPage ? stripQuery(request.url) : request;
  const cached = (await cache.match(key)) || (isPage ? await cache.match('./') : undefined);

  const refresh = fetch(request).then(async (response) => {
    // Only store complete, same-origin answers (not errors or partial content).
    if (response.ok && response.status === 200 && response.type === 'basic') {
      await cache.put(key, response.clone());
    }
    return response;
  });

  if (cached) {
    event.waitUntil(refresh.catch(() => {})); // offline: keep the cached copy, no error
    return cached;
  }
  try {
    return await refresh;
  } catch (error) {
    // Offline and never stored (a file outside the app list, say).
    return new Response('Offline', { status: 503, statusText: 'Offline', headers: { 'Content-Type': 'text/plain' } });
  }
}

/** Fonts: from the cache if there, otherwise from the network (and kept). */
async function fontFile(request) {
  const cache = await caches.open(FONT_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    // The stylesheet link has no crossorigin attribute, so its answer is
    // "opaque" (status 0): still fine to store and reuse.
    if (response.ok || response.type === 'opaque') await cache.put(request, response.clone());
    return response;
  } catch (error) {
    return new Response('', { status: 503, statusText: 'Offline' });
  }
}

function stripQuery(address) {
  const url = new URL(address);
  url.search = '';
  url.hash = '';
  return url.href;
}
