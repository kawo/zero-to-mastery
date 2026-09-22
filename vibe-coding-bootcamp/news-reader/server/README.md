# news-reader proxy

An Express server whose only job is to hold the TheNewsApi token. The browser
asks this process for news; this process asks TheNewsApi, adding the token on
the way past. Nothing token-shaped ever reaches the client bundle.

```
node server.js          # http://localhost:5177
npm run dev             # same, with --watch
```

## Setup

```
cp .env.example .env    # then edit .env and paste your token
```

Get a token from <https://www.thenewsapi.com/>. `.env` is git-ignored;
`.env.example` is committed as the template.

| Variable            | Required | Default  | Meaning                                  |
| ------------------- | -------- | -------- | ---------------------------------------- |
| `THENEWSAPI_TOKEN`  | yes      | —        | Your API token                            |
| `PORT`              | no       | `5177`   | Port to listen on                         |
| `CACHE_TTL_MS`      | no       | `300000` | How long a proxied response is reused     |

## Routes

### `GET /api/health`

```json
{ "ok": true, "tokenConfigured": true, "upstream": "…", "cached": 4, "uptimeSeconds": 12 }
```

Reports *whether* a token is configured, never what it is.

### `GET /api/news/all`

Proxies TheNewsApi `/v1/news/all`.

| Query        | Notes                                                        |
| ------------ | ------------------------------------------------------------ |
| `page`       | 1-based, defaults to 1                                        |
| `language`   | `en`, `fr`, `es` or `de`; anything else falls back to `en`     |
| `search`     | When present, the category is dropped entirely, and `search_fields=title` is added |
| `categories` | One of the ten known categories; unknown values fall back to `tech` |
| `published_after`  | `YYYY-MM-DD`, inclusive. Anything else is dropped |
| `published_before` | `YYYY-MM-DD`, inclusive. Anything else is dropped |
| `domains`    | Up to 10 comma-separated hosts. A pasted URL is reduced to its host; invalid entries are dropped |

`limit=3` and `sort=published_at` are fixed here rather than accepted from the
client, so a crafted request cannot widen the query and burn the daily quota
faster. `language` is now chosen by the reader — the original brief pinned it to
English — but it is validated against the four supported values rather than
forwarded.

The sort matters: TheNewsApi orders by `relevance_score` whenever `search` is
present, which returns years-old articles for a current topic. Pinning
`published_at` makes search and category browsing agree on newest-first.

`search_fields=title` is added alongside any `search`. Without it TheNewsApi also
matches the description, keywords and body, so a search returns everything that
mentions the term rather than everything about it.

Filters are validated here rather than passed through, because TheNewsApi
silently ignores parameters it cannot parse: `published_after=yesterday` does not
fail, it returns the whole unfiltered set. Dropping a bad value server-side is
what keeps "filtered" from quietly meaning "not filtered".

There is no author filter to add — the upstream returns no author field at all.

## Caching

Responses are cached in memory for `CACHE_TTL_MS`, keyed by query and page (the
key never contains the token). TheNewsApi's free tier is metered per day and this
app pages three articles at a time, so a reader flicking back and forth would
otherwise exhaust it quickly. The client caches too; this also survives a page
reload, which the client's cache does not.

## Errors

| Status  | Returned as                                                       |
| ------- | ----------------------------------------------------------------- |
| 402     | `quota_exhausted` — the daily limit, which is the one a free-plan user actually hits |
| 429     | `rate_limited` — too many requests at once                         |
| 401/403 | `auth_failed` — check `THENEWSAPI_TOKEN`                           |
| 502     | `upstream_timeout` / `upstream_unreachable`                        |
| 500     | `missing_token` — no token configured                              |

Errors are logged without the request URL, because the request URL carries the
token.

On 402 versus 429: the original brief specified 429 for "daily request limit
reached", but TheNewsApi answers an exhausted daily quota with
`402 usage_limit_reached`. 429 is the per-second rate limit — a different and
much shorter problem. Handling only 429 meant the one error a free-plan user is
certain to meet eventually fell through to a generic "responded with 402".
