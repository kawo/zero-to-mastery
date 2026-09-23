/**
 * TheMealDB client. This is the only place that knows the upstream base URL
 * and API key; routes hand it a path like "search.php?s=pie".
 */
import { TtlCache } from './ttlCache.js';

const API_BASE = (process.env.MEALDB_API_BASE || 'https://www.themealdb.com/api/json/v1').replace(/\/+$/, '');
const API_KEY = process.env.MEALDB_API_KEY || '1';
const TIMEOUT_MS = 8000;

/** Images live on the same host as the API: https://www.themealdb.com/images/... */
export const IMAGE_ORIGIN = new URL(API_BASE).origin;
const IMAGE_PREFIXES = [`${IMAGE_ORIGIN}/images/`, `${IMAGE_ORIGIN.replace(/^https:/, 'http:')}/images/`];

/** Where the browser fetches images from instead (see routes/mealdb.ts). */
export const IMAGE_PROXY_PREFIX = '/api/images/';

export class UpstreamError extends Error {
  constructor(message: string, readonly status = 502) {
    super(message);
  }
}

const jsonCache = new TtlCache<unknown>();

/**
 * Point every TheMealDB image URL at our /api/images proxy, so the browser
 * never contacts TheMealDB directly and images come from our own origin
 * (which also lets the service worker cache them as normal responses).
 * Works on the parsed JSON because TheMealDB escapes slashes ("https:\/\/").
 */
export function rewriteImageUrls(value: unknown): unknown {
  if (typeof value === 'string') {
    const prefix = IMAGE_PREFIXES.find(p => value.startsWith(p));
    return prefix ? IMAGE_PROXY_PREFIX + value.slice(prefix.length) : value;
  }
  if (Array.isArray(value)) return value.map(rewriteImageUrls);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, rewriteImageUrls(v)]));
  }
  return value;
}

/**
 * Fetches `${API_BASE}/${API_KEY}/${path}` and returns the JSON with image
 * URLs rewritten. With cacheMs, a successful response is kept in memory and
 * reused until it expires.
 */
export async function mealdb(path: string, cacheMs = 0): Promise<unknown> {
  if (cacheMs > 0) {
    const cached = jsonCache.get(path);
    if (cached !== undefined) return cached;
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE}/${encodeURIComponent(API_KEY)}/${path}`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(TIMEOUT_MS)
    });
  } catch (error) {
    const timedOut = error instanceof Error && error.name === 'TimeoutError';
    throw new UpstreamError(timedOut ? 'TheMealDB took too long to respond' : 'Could not reach TheMealDB', 504);
  }

  if (!response.ok) {
    throw new UpstreamError(`TheMealDB responded ${response.status}`);
  }

  let data: unknown;
  try {
    data = await response.json();
  } catch {
    throw new UpstreamError('TheMealDB sent a response that was not JSON');
  }

  const rewritten = rewriteImageUrls(data);
  if (cacheMs > 0) jsonCache.set(path, rewritten, cacheMs);
  return rewritten;
}
