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
| `search`     | When present, the category is dropped entirely                |
| `categories` | One of the ten known categories; unknown values fall back to `tech` |

`language=en` and `limit=3` are fixed here rather than accepted from the client,
so a crafted request cannot widen the query and burn the daily quota faster.

## Caching

Responses are cached in memory for `CACHE_TTL_MS`, keyed by query and page (the
key never contains the token). TheNewsApi's free tier is metered per day and this
app pages three articles at a time, so a reader flicking back and forth would
otherwise exhaust it quickly. The client caches too; this also survives a page
reload, which the client's cache does not.

## Errors

| Status  | Returned as                                                       |
| ------- | ----------------------------------------------------------------- |
| 429     | `rate_limited` — daily request limit reached                       |
| 401/403 | `auth_failed` — check `THENEWSAPI_TOKEN`                           |
| 502     | `upstream_timeout` / `upstream_unreachable`                        |
| 500     | `missing_token` — no token configured                              |

Errors are logged without the request URL, because the request URL carries the
token.
