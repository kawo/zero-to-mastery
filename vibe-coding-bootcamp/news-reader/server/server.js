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

/* Fixed by the brief: English only, three articles per page. Sending them from
   here rather than trusting the client means a crafted request cannot widen
   the query and burn the daily quota faster. */
const LANGUAGE = 'en';
const LIMIT = 3;

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

  const params = new URLSearchParams({
    api_token: TOKEN,
    language: LANGUAGE,
    limit: String(LIMIT),
    page: String(page),
  });

  /* The brief's rule, enforced server-side so the two can never both be sent:
     a search replaces the category filter entirely. */
  if (search) {
    params.set('search', search);
  } else {
    const categories = requested
      .split(',')
      .map((c) => c.trim().toLowerCase())
      .filter((c) => CATEGORIES.has(c));
    params.set('categories', categories.length ? categories.join(',') : 'tech');
  }

  // Cache key deliberately excludes the token.
  const key = `${search ? `s:${search}` : `c:${params.get('categories')}`}|p:${page}`;
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

/** Human-readable messages for the statuses the brief calls out. */
function describeUpstreamError(status) {
  if (status === 429) {
    return {
      error: 'rate_limited',
      message: 'Daily request limit reached. TheNewsApi free plan allows a limited number of requests per day — try again tomorrow, or upgrade your plan.',
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
