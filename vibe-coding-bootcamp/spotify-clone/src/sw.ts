/// <reference lib="webworker" />
/**
 * Tunebox service worker (compiled by vite-plugin-pwa, injectManifest strategy).
 *
 * - Precaches the app shell and every build asset (JS/CSS/icons/lazy route chunks).
 * - Serves every in-app navigation from the cached index.html (SPA offline).
 * - `/artwork/<blobId>?s=<px>`: reads artwork from IndexedDB, resizes it, and
 *   caches the thumbnail cache-first with an entry cap.
 * - Unmatched navigations with no cached response fall back to /offline.html.
 *
 * Audio is never cached here: IndexedDB is the source of truth and playback
 * uses blob: URLs, which work offline by definition.
 */
import { clientsClaim } from 'workbox-core';
import { CacheExpiration } from 'workbox-expiration';
import {
  cleanupOutdatedCaches,
  createHandlerBoundToURL,
  matchPrecache,
  precacheAndRoute,
} from 'workbox-precaching';
import {
  NavigationRoute,
  registerRoute,
  setCatchHandler,
  setDefaultHandler,
} from 'workbox-routing';
import { NetworkOnly } from 'workbox-strategies';

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: (string | { url: string; revision: string | null })[];
};

const DB_NAME = 'tunebox'; // keep in sync with src/db/indexedDb.ts
const ARTWORK_CACHE = 'tunebox-artwork-thumbs-v1';
const ARTWORK_MAX_ENTRIES = 400;
const ALLOWED_SIZES = [96, 192, 384];

precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

// The page asks us to activate a waiting update (via the "Reload" toast).
self.addEventListener('message', (event) => {
  if ((event.data as { type?: string } | null)?.type === 'SKIP_WAITING') void self.skipWaiting();
});
// Control the page on first install so artwork thumbnails work without a reload.
clientsClaim();

/* ------------------------------ Navigation ------------------------------ */

registerRoute(
  new NavigationRoute(createHandlerBoundToURL('/index.html'), {
    // Don't hijack virtual artwork URLs or real files.
    denylist: [/^\/artwork\//, /\/[^/?]+\.[^/]+$/],
  }),
);

// Everything else goes to the network; routing it through Workbox lets the
// catch handler below answer failed navigations with the offline page.
setDefaultHandler(new NetworkOnly());

setCatchHandler(async ({ request }) => {
  if (request.mode === 'navigate') {
    return (await matchPrecache('/offline.html')) ?? Response.error();
  }
  return Response.error();
});

/* ------------------------------- Artwork -------------------------------- */

let dbPromise: Promise<IDBDatabase | null> | null = null;

/** Opens the app's database read-only-ish without ever creating or upgrading it. */
function openDb(): Promise<IDBDatabase | null> {
  dbPromise ??= new Promise((resolve) => {
    const req = indexedDB.open(DB_NAME);
    // No database yet: abort so we don't create an empty one that would confuse Dexie.
    req.onupgradeneeded = () => req.transaction?.abort();
    req.onsuccess = () => {
      const db = req.result;
      // Let the page upgrade the schema: close and reopen lazily next time.
      db.onversionchange = () => {
        db.close();
        dbPromise = null;
      };
      resolve(db);
    };
    req.onerror = () => {
      dbPromise = null;
      resolve(null);
    };
    req.onblocked = () => {
      dbPromise = null;
      resolve(null);
    };
  });
  return dbPromise;
}

async function readBlob(id: string): Promise<Blob | null> {
  const db = await openDb();
  if (!db || !db.objectStoreNames.contains('blobs')) return null;
  return new Promise((resolve) => {
    try {
      const req = db.transaction('blobs', 'readonly').objectStore('blobs').get(id);
      req.onsuccess = () => resolve((req.result as { blob?: Blob } | undefined)?.blob ?? null);
      req.onerror = () => resolve(null);
    } catch {
      dbPromise = null; // connection was closed underneath us
      resolve(null);
    }
  });
}

/** Square, cover-cropped thumbnail. Falls back to the original image if the browser can't resize in a worker. */
async function makeThumbnail(blob: Blob, size: number): Promise<Blob> {
  if (typeof OffscreenCanvas === 'undefined' || typeof createImageBitmap === 'undefined')
    return blob;
  try {
    const bitmap = await createImageBitmap(blob);
    const side = Math.min(bitmap.width, bitmap.height);
    if (side <= size) {
      bitmap.close();
      return blob;
    }
    const canvas = new OffscreenCanvas(size, size);
    const ctx = canvas.getContext('2d');
    if (!ctx) return blob;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(
      bitmap,
      (bitmap.width - side) / 2,
      (bitmap.height - side) / 2,
      side,
      side,
      0,
      0,
      size,
      size,
    );
    bitmap.close();
    // Safari can't encode WebP and silently returns PNG; either is fine.
    return await canvas.convertToBlob({ type: 'image/webp', quality: 0.85 });
  } catch {
    return blob;
  }
}

const expiration = new CacheExpiration(ARTWORK_CACHE, { maxEntries: ARTWORK_MAX_ENTRIES });

registerRoute(
  ({ url, sameOrigin }) => sameOrigin && url.pathname.startsWith('/artwork/'),
  async ({ url, request }) => {
    const requested = Number(url.searchParams.get('s')) || 192;
    const size = ALLOWED_SIZES.find((s) => s >= requested) ?? ALLOWED_SIZES.at(-1)!;
    const id = decodeURIComponent(url.pathname.slice('/artwork/'.length));
    const key = `/artwork/${encodeURIComponent(id)}?s=${size}`;

    // Cache-first: artwork IDs are content hashes, so a cached thumbnail never goes stale.
    const cache = await caches.open(ARTWORK_CACHE);
    const hit = await cache.match(key);
    if (hit) {
      void expiration.updateTimestamp(key);
      return hit;
    }

    const original = await readBlob(id);
    if (!original) return new Response('Artwork not found', { status: 404 });
    const thumb = await makeThumbnail(original, size);
    const response = new Response(thumb, {
      headers: {
        'Content-Type': thumb.type || original.type || 'image/jpeg',
        'Cache-Control': 'private, max-age=31536000, immutable',
      },
    });
    if (request.method === 'GET') {
      await cache.put(key, response.clone());
      await expiration.updateTimestamp(key);
      void expiration.expireEntries();
    }
    return response;
  },
);
