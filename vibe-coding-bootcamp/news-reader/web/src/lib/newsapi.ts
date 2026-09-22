// web/src/lib/newsapi.ts
/*
 * The only place the app talks to the network.
 *
 * Every request goes to /api/news/all, which Vite proxies to the Express server
 * in development. The token lives on that server and is added there — nothing in
 * this file, or anywhere else in the browser bundle, has any notion of it.
 */

export const PAGE_SIZE = 3;

export const CATEGORIES = [
  'tech',
  'general',
  'science',
  'sports',
  'business',
  'health',
  'entertainment',
  'politics',
  'food',
  'travel',
] as const;

export type Category = (typeof CATEGORIES)[number];

export const DEFAULT_CATEGORY: Category = 'tech';

/** One article, narrowed to the fields this app actually renders. */
export interface Article {
  uuid: string;
  title: string;
  description: string | null;
  snippet: string | null;
  url: string;
  image_url: string | null;
  published_at: string;
  source: string;
  categories: string[];
}

export interface NewsMeta {
  found: number;
  returned: number;
  limit: number;
  page: number;
}

export interface NewsResponse {
  meta: NewsMeta;
  data: Article[];
}

/**
 * A request that failed in a way worth showing the reader.
 * `status` is the HTTP status when there was one.
 */
export class NewsError extends Error {
  readonly status: number | null;
  readonly code: string;

  constructor(message: string, code: string, status: number | null = null) {
    super(message);
    this.name = 'NewsError';
    this.code = code;
    this.status = status;
  }
}

/* The brief names these two exactly; they are the fallback for when the server
   could not be reached to supply its own wording. */
const MESSAGES: Record<number, string> = {
  429: 'Daily request limit reached. TheNewsApi free plan allows a limited number of requests per day — try again tomorrow, or upgrade your plan.',
  401: 'TheNewsApi authentication failed. Check THENEWSAPI_TOKEN in server/.env.',
  403: 'TheNewsApi authentication failed. Check THENEWSAPI_TOKEN in server/.env.',
};

export interface FetchNewsOptions {
  page: number;
  /** When set, the categories are not sent at all — the brief's search/category rule. */
  search?: string;
  /**
   * One category, or several as a comma list. TheNewsApi treats a list as OR,
   * which is what makes a reader's pinned topics a single combined feed rather
   * than several separate requests.
   */
  categories?: string;
  /** Optional filters. Validated again on the server before being forwarded. */
  filters?: Filters;
  /** Content language: 'en' | 'fr' | 'es' | 'de'. Validated on the server. */
  language?: string;
  signal?: AbortSignal;
}

/**
 * Filters that apply to a search and to category browsing alike.
 *
 * There is deliberately no author filter: TheNewsApi's articles carry no author
 * field, and the endpoint silently ignores parameters it does not recognise, so
 * an author control would look like it worked while changing nothing.
 */
export interface Filters {
  /** YYYY-MM-DD, inclusive. */
  from?: string;
  /** YYYY-MM-DD, inclusive. */
  to?: string;
  /** One domain, or several comma separated: "bbc.co.uk,reuters.com". */
  domains?: string;
}

export const EMPTY_FILTERS: Filters = {};

export const hasFilters = (f: Filters): boolean =>
  Boolean(f.from || f.to || f.domains);

/** Stable identity for a filter set, for cache keys. */
export const filterKey = (f: Filters): string =>
  [f.from ? `a:${f.from}` : '', f.to ? `b:${f.to}` : '', f.domains ? `d:${f.domains}` : '']
    .filter(Boolean)
    .join('|');

/**
 * Fetch one page of articles.
 *
 * The search/category rule is applied here and again on the server, so a stale
 * caller cannot produce a request carrying both.
 */
export async function fetchNews({
  page,
  search,
  categories = DEFAULT_CATEGORY,
  filters = EMPTY_FILTERS,
  language,
  signal,
}: FetchNewsOptions): Promise<NewsResponse> {
  const params = new URLSearchParams({ page: String(page) });
  if (language) params.set('language', language);

  const term = (search ?? '').trim();
  if (term) params.set('search', term);
  else params.set('categories', categories);

  if (filters.from) params.set('published_after', filters.from);
  if (filters.to) params.set('published_before', filters.to);
  if (filters.domains) params.set('domains', filters.domains);

  const url = `/api/news/all?${params.toString()}`;

  // Useful when something looks wrong, and safe to print: this URL is the
  // proxy's, not the upstream's, so it cannot contain a token.
  console.debug('[news-reader] GET', url);

  let response: Response;
  try {
    response = await fetch(url, { signal, headers: { Accept: 'application/json' } });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err;
    throw new NewsError(
      'Could not reach the news proxy. Is the server running on port 5177?',
      'network_error',
    );
  }

  if (!response.ok) {
    // Prefer the server's own explanation; fall back to the status map.
    const fallback = MESSAGES[response.status] ?? `Request failed (${response.status}).`;
    let message = fallback;
    let code = 'upstream_error';
    try {
      const body = await response.json();
      if (body && typeof body.message === 'string') message = body.message;
      if (body && typeof body.error === 'string') code = body.error;
    } catch {
      /* a non-JSON error body is not worth reporting over the status itself */
    }
    throw new NewsError(message, code, response.status);
  }

  const payload = (await response.json()) as Partial<NewsResponse>;
  return {
    meta: payload.meta ?? { found: 0, returned: 0, limit: PAGE_SIZE, page },
    data: Array.isArray(payload.data) ? payload.data : [],
  };
}

/** Page number an absolute article index (0-based) lives on. */
export const pageOf = (absoluteIndex: number): number =>
  Math.floor(absoluteIndex / PAGE_SIZE) + 1;

/** Absolute, 1-based article number, for the pager's labels. */
export const absoluteNumber = (page: number, indexInPage: number): number =>
  (page - 1) * PAGE_SIZE + indexInPage + 1;

/** A readable date, degrading to the raw string if the API sends something odd. */
export function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}
