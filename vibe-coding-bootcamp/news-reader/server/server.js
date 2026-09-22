// server/server.js
/* ==========================================================================
   news-reader: TheNewsApi proxy
   --------------------------------------------------------------------------
   The browser never sees the API token. The client calls /api/news/all with
   the parameters it cares about; this process adds the token, forwards the
   request to TheNewsApi and passes the answer back.

     node server/server.js        → http://localhost:5177

   Two routes:
     GET /api/health     liveness, and whether a token is configured
     GET /api/news/all   proxied TheNewsApi /v1/news/all

   Nothing here ever logs the token, including on error paths.
   ========================================================================== */
'use strict';

const path = require('path');
const express = require('express');

require('dotenv').config({ path: path.join(__dirname, '.env') });

const PORT = Number(process.env.PORT) || 5177;
const TOKEN = process.env.THENEWSAPI_TOKEN || '';
const UPSTREAM = 'https://api.thenewsapi.com/v1/news/all';

/* Three articles per page, fixed here rather than trusted from the client: a
   crafted request cannot widen the query and burn the daily quota faster. */
const LIMIT = 3;

/* Language is no longer pinned to English as the original brief had it — the
   app offers the four languages TheNewsApi carries real volume in. It is still
   validated rather than forwarded: an unknown value falls back to English. */
const LANGUAGE = 'en';
const LANGUAGES = new Set(['en', 'fr', 'es', 'de']);
/* published_at | relevance_score — see the note where this is used. */
const SORT = 'published_at';
/* Which parts of an article a search term has to match. TheNewsApi also offers
   description, keywords and main_text; restricting to the title is what makes a
   search behave like "find me headlines about X" rather than "find me anything
   that mentions X in passing". */
const SEARCH_FIELDS = 'title';

/* A calendar date, as TheNewsApi wants it. Anything else is dropped rather than
   forwarded: the upstream ignores parameters it does not understand, so junk
   would silently widen the query instead of failing. */
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/* Domains only: letters, digits, dots and hyphens, comma separated. A pasted
   URL is reduced to its host rather than rejected. */
const DOMAIN = /^[a-z0-9.-]+$/;

function cleanDomains(raw) {
  return raw
    .split(',')
    .map((d) => d.trim().toLowerCase()
      .replace(/^https?:\/\//, '')   // a pasted URL
      .replace(/^www\./, '')
      .replace(/\/.*$/, ''))         // anything after the host
    .filter((d) => d && DOMAIN.test(d))
    .slice(0, 10)                     // a longer list is a mistake, not a filter
    .join(',');
}

const CATEGORIES = new Set([
  'tech', 'general', 'science', 'sports', 'business',
  'health', 'entertainment', 'politics', 'food', 'travel',
]);

/* --------------------------------------------------------------------------
   A small response cache.

   TheNewsApi's free tier is measured in requests per day, and this app paginates
   by three, so a reader flicking back and forth would burn through it in
   minutes. The client caches too; this is the second line of defence, and it
   also covers a page reload, which clears the client's cache but not this one.
   -------------------------------------------------------------------------- */
const CACHE_TTL_MS = Number(process.env.CACHE_TTL_MS) || 5 * 60 * 1000;
const CACHE_MAX = 200;
const cache = new Map(); // key → { at, payload }

function cacheGet(key) {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  // Refresh insertion order so the least recently used falls off the end.
  cache.delete(key);
  cache.set(key, hit);
  return hit.payload;
}

function cacheSet(key, payload) {
  cache.set(key, { at: Date.now(), payload });
  while (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value);
}

/* -------------------------------------------------------------------------- */

const app = express();
app.disable('x-powered-by');

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    // Whether a token exists, never what it is.
    tokenConfigured: Boolean(TOKEN),
    upstream: UPSTREAM,
    cached: cache.size,
    uptimeSeconds: Math.round(process.uptime()),
  });
});

app.get('/api/news/all', async (req, res) => {
  if (!TOKEN) {
    return res.status(500).json({
      error: 'missing_token',
      message: 'THENEWSAPI_TOKEN is not set. Copy server/.env.example to server/.env and add your token.',
    });
  }

  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
  const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
  const requested = typeof req.query.categories === 'string' ? req.query.categories.trim() : '';

  /* Optional filters. Each is validated here rather than trusted, for the same
     reason language and limit are pinned: TheNewsApi silently ignores anything
     it cannot parse, so an unchecked value produces a query that looks filtered
     and is not. */
  const after = DATE.test(String(req.query.published_after ?? '')) ? String(req.query.published_after) : '';
  const before = DATE.test(String(req.query.published_before ?? '')) ? String(req.query.published_before) : '';
  const domains = typeof req.query.domains === 'string' ? cleanDomains(req.query.domains) : '';

  const requestedLanguage = String(req.query.language ?? '').toLowerCase();
  const language = LANGUAGES.has(requestedLanguage) ? requestedLanguage : LANGUAGE;

  const params = new URLSearchParams({
    api_token: TOKEN,
    language,
    limit: String(LIMIT),
    page: String(page),
    /* Newest first, always.

       TheNewsApi sorts by relevance_score as soon as `search` is present, which
       is how a search for "climate" comes back led by an article from 2023
       while the same query sorted by date leads with this morning's. A news
       reader that answers a search with three-year-old stories reads as broken,
       so recency is pinned here rather than left to the upstream default.

       Category browsing already defaults to published_at, so this changes
       nothing there — it just makes the ordering one rule instead of two. */
    sort: SORT,
  });

  if (after) params.set('published_after', after);
  if (before) params.set('published_before', before);
  if (domains) params.set('domains', domains);

  /* The brief's rule, enforced server-side so the two can never both be sent:
     a search replaces the category filter entirely. */
  if (search) {
    params.set('search', search);
    // Only meaningful alongside `search`, so it is set here rather than above.
    params.set('search_fields', SEARCH_FIELDS);
  } else {
    const categories = requested
      .split(',')
      .map((c) => c.trim().toLowerCase())
      .filter((c) => CATEGORIES.has(c));
    params.set('categories', categories.length ? categories.join(',') : 'tech');
  }

  // Cache key deliberately excludes the token.
  /* Every parameter that changes the answer belongs in the key, or a filtered
     request would be served an unfiltered response from a moment earlier. */
  const key = [
    search ? `s:${search}:${SEARCH_FIELDS}` : `c:${params.get('categories')}`,
    `p:${page}`,
    `o:${SORT}`,
    `l:${language}`,
    after ? `a:${after}` : '',
    before ? `b:${before}` : '',
    domains ? `d:${domains}` : '',
  ].filter(Boolean).join('|');
  const cached = cacheGet(key);
  if (cached) {
    res.set('X-Cache', 'HIT');
    return res.json(cached);
  }

  try {
    const upstream = await fetch(`${UPSTREAM}?${params.toString()}`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(12_000),
    });

    if (!upstream.ok) {
      return res.status(upstream.status).json(describeUpstreamError(upstream.status));
    }

    const payload = await upstream.json();
    cacheSet(key, payload);
    res.set('X-Cache', 'MISS');
    return res.json(payload);
  } catch (err) {
    const timedOut = err && (err.name === 'TimeoutError' || err.name === 'AbortError');
    // `err` here is a network/abort error and never contains the token, but the
    // request URL would, so it is deliberately not included.
    console.error('[news-reader] upstream request failed:', timedOut ? 'timeout' : err && err.message);
    return res.status(502).json({
      error: timedOut ? 'upstream_timeout' : 'upstream_unreachable',
      message: timedOut
        ? 'TheNewsApi took too long to respond. Try again in a moment.'
        : 'Could not reach TheNewsApi. Check your connection and try again.',
    });
  }
});

/**
 * Human-readable messages for the statuses that actually occur.
 *
 * Note the 402. The brief specified 429 for "daily request limit reached", but
 * TheNewsApi answers an exhausted quota with `402 usage_limit_reached` — 429 is
 * for hitting the per-second rate, which is a different and much shorter
 * problem. Handling only 429 meant the one error a free-plan user is certain to
 * see eventually fell through to the generic "responded with 402".
 */
function describeUpstreamError(status) {
  if (status === 402) {
    return {
      error: 'quota_exhausted',
      message: 'Daily request limit reached. TheNewsApi’s free plan allows a limited number of requests per day — the count resets tomorrow, or you can upgrade your plan.',
    };
  }
  if (status === 429) {
    return {
      error: 'rate_limited',
      message: 'Too many requests at once. Wait a moment and try again.',
    };
  }
  if (status === 401 || status === 403) {
    return {
      error: 'auth_failed',
      message: 'TheNewsApi authentication failed. Check THENEWSAPI_TOKEN in server/.env.',
    };
  }
  return {
    error: 'upstream_error',
    message: `TheNewsApi responded with ${status}.`,
  };
}

/* Anything else under /api is a mistake worth naming rather than a 404 page. */
app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'not_found', message: 'No such API route.' });
});

app.listen(PORT, () => {
  console.log(`[news-reader] proxy listening on http://localhost:${PORT}`);
  console.log(`[news-reader] token ${TOKEN ? 'loaded' : 'MISSING — see server/.env.example'}`);
});
