import { db } from '@/db/indexedDb';

/* ------------------------------------------------------------------ */
/* Time formatting                                                     */
/* ------------------------------------------------------------------ */

/** 3:07, 1:02:45. Unknown or invalid durations render as --:--. */
export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '--:--';
  const s = Math.floor(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}

/** "1 hr 12 min" style total for playlists. */
export function formatTotalDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)} sec`;
  const mins = Math.round(seconds / 60);
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h} hr ${m} min` : `${h} hr`;
}

/** Spoken form for aria-valuetext: "2 minutes 5 seconds". */
export function spokenTime(seconds: number): string {
  if (!Number.isFinite(seconds)) return 'unknown';
  const s = Math.floor(seconds);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return m
    ? `${m} minute${m === 1 ? '' : 's'} ${r} second${r === 1 ? '' : 's'}`
    : `${r} second${r === 1 ? '' : 's'}`;
}

/* ------------------------------------------------------------------ */
/* Object URLs for blobs stored in IndexedDB                           */
/* ------------------------------------------------------------------ */

interface UrlEntry {
  url: string;
  refs: number;
  revokeTimer?: ReturnType<typeof setTimeout>;
}
const urlCache = new Map<string, UrlEntry>();
const pending = new Map<string, Promise<string | null>>();

/**
 * Returns a shared object URL for a stored blob and bumps its ref count.
 * Always pair with `releaseBlobUrl(id)`; the URL is revoked shortly after the
 * last user releases it (the delay avoids churn while lists re-render).
 */
export async function acquireBlobUrl(id: string): Promise<string | null> {
  const hit = urlCache.get(id);
  if (hit) {
    hit.refs++;
    if (hit.revokeTimer) clearTimeout(hit.revokeTimer);
    hit.revokeTimer = undefined;
    return hit.url;
  }
  let p = pending.get(id);
  if (!p) {
    p = db.blobs.get(id).then((doc) => {
      pending.delete(id);
      if (!doc) return null;
      const url = URL.createObjectURL(doc.blob);
      urlCache.set(id, { url, refs: 0 });
      return url;
    });
    pending.set(id, p);
  }
  const url = await p;
  const entry = urlCache.get(id);
  if (url && entry) {
    entry.refs++;
    if (entry.revokeTimer) clearTimeout(entry.revokeTimer);
    entry.revokeTimer = undefined;
  }
  return url;
}

export function releaseBlobUrl(id: string): void {
  const entry = urlCache.get(id);
  if (!entry) return;
  entry.refs = Math.max(0, entry.refs - 1);
  if (entry.refs === 0 && !entry.revokeTimer) {
    entry.revokeTimer = setTimeout(() => {
      if (entry.refs === 0) {
        URL.revokeObjectURL(entry.url);
        urlCache.delete(id);
      }
    }, 30_000);
  }
}

/** Forget a URL immediately (after its blob is deleted). */
export function evictBlobUrl(id: string): void {
  const entry = urlCache.get(id);
  if (!entry) return;
  if (entry.revokeTimer) clearTimeout(entry.revokeTimer);
  URL.revokeObjectURL(entry.url);
  urlCache.delete(id);
}

/**
 * URL served by the service worker: a resized, cache-first thumbnail read from IndexedDB.
 * Only valid while a service worker controls the page (see Artwork component).
 */
export function artworkThumbUrl(blobId: string, size: number): string {
  return `/artwork/${encodeURIComponent(blobId)}?s=${size}`;
}

/* ------------------------------------------------------------------ */
/* Placeholder artwork and colours                                     */
/* ------------------------------------------------------------------ */

/** Stable 0–359 hue from any string (track hash or id). */
export function hueFrom(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (Math.imul(h, 31) + seed.charCodeAt(i)) | 0;
  return Math.abs(h) % 360;
}

export function placeholderGradient(seed: string): string {
  const hue = hueFrom(seed);
  return `linear-gradient(135deg, hsl(${hue} 65% 45%), hsl(${(hue + 50) % 360} 70% 22%))`;
}

export function initials(text: string): string {
  const words = text
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return '♪';
  const first = words[0]!;
  const second = words[1];
  return (second ? first[0]! + second[0]! : first.slice(0, 2)).toUpperCase();
}

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

const colorCache = new Map<string, Rgb | null>();

/**
 * Dominant colour of an image, favouring saturated pixels so album art
 * with a white border still yields its "real" colour. Cached per key.
 */
export async function dominantColor(key: string, url: string): Promise<Rgb | null> {
  if (colorCache.has(key)) return colorCache.get(key)!;
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    const size = 24;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, size, size);
    const { data } = ctx.getImageData(0, 0, size, size);
    let r = 0;
    let g = 0;
    let b = 0;
    let total = 0;
    for (let i = 0; i < data.length; i += 4) {
      const pr = data[i]!;
      const pg = data[i + 1]!;
      const pb = data[i + 2]!;
      const max = Math.max(pr, pg, pb);
      const min = Math.min(pr, pg, pb);
      const weight = 0.15 + (max - min) / 255; // saturation weight
      r += pr * weight;
      g += pg * weight;
      b += pb * weight;
      total += weight;
    }
    const rgb = total
      ? { r: Math.round(r / total), g: Math.round(g / total), b: Math.round(b / total) }
      : null;
    colorCache.set(key, rgb);
    return rgb;
  } catch {
    colorCache.set(key, null);
    return null;
  }
}

export function hslToRgb(h: number, s: number, l: number): Rgb {
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return { r: Math.round(f(0) * 255), g: Math.round(f(8) * 255), b: Math.round(f(4) * 255) };
}

/* ------------------------------------------------------------------ */
/* Audio probing                                                       */
/* ------------------------------------------------------------------ */

/** Duration via the browser's decoder; used when tags don't carry one. */
export function probeDuration(blob: Blob, timeoutMs = 8000): Promise<number> {
  return new Promise((resolve) => {
    const audio = new Audio();
    const url = URL.createObjectURL(blob);
    const done = (value: number) => {
      clearTimeout(timer);
      audio.removeAttribute('src');
      audio.load();
      URL.revokeObjectURL(url);
      resolve(value);
    };
    const timer = setTimeout(() => done(0), timeoutMs);
    audio.preload = 'metadata';
    audio.onloadedmetadata = () => done(Number.isFinite(audio.duration) ? audio.duration : 0);
    audio.onerror = () => done(0);
    audio.src = url;
  });
}

/** Whether this browser can decode the file at all. */
export function canPlay(mimeType: string): boolean {
  if (!mimeType) return true; // unknown: let the decoder decide
  return new Audio().canPlayType(mimeType) !== '';
}
