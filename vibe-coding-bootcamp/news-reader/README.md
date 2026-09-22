# News Reader

A single-article news reader built on TheNewsApi: one story at a time in a large
featured card, with category and search filters, a circular pager, prefetching,
caching and favourites.

React + Vite + TypeScript on the front, a small Express proxy behind it so the
API token never reaches the browser.

## How to Run

```bash
npm run server:install
npm run dev
```

Set `THENEWSAPI_TOKEN` in `.env` before running:

```bash
cp server/.env.example server/.env   # then edit server/.env
```

Get a free token at <https://www.thenewsapi.com/>. **Never commit real tokens.**

| | |
| --- | --- |
| Web | <http://localhost:5176> |
| Proxy | <http://localhost:5177> |

`npm run dev` starts both and installs any missing workspace dependencies on
first run, so the two commands above are genuinely all you need. If you prefer
them apart: `npm run server:dev` and `npm run web:dev`.

## Why there is a server

TheNewsApi authenticates with a token in the query string. Anything the browser
sends is visible in devtools, so a token used directly from the client is a
published token. The Express process holds it and forwards requests; the bundle
has no notion of it, and `/api/health` reports only *whether* one is configured.

The proxy also fixes `language=en` and `limit=3` itself rather than trusting the
client, so a crafted request cannot widen the query and spend the daily quota
faster.

## Scripts

| Command | Does |
| --- | --- |
| `npm run dev` | Both servers, with prefixed output |
| `npm run server:install` | Install the proxy's dependencies |
| `npm run server:dev` | Proxy only, on 5177 |
| `npm run web:dev` | Web only, on 5176 |
| `npm run build` | Typecheck, then build the web app to `web/dist` |
| `npm run typecheck` | Types only |

## Layout

```
package.json          root scripts; no dependencies of its own
scripts/dev.mjs       runs both servers, zero-dependency
.gitignore            ignores every .env except .env.example
server/
  server.js           Express proxy: /api/health, /api/news/all
  .env.example        template — copy to .env
  README.md           routes, settings, error codes
web/
  vite.config.ts      dev server on 5176, /api → 5177
  index.html
  public/placeholder.png
  src/
    main.tsx
    App.tsx           query, paging, cache, prefetch, favourites
    styles.css
    lib/newsapi.ts    the only place that talks to the network
    components/HeadlinesList.tsx   featured card + pager
```

## How it behaves

**Searching is explicit.** Nothing happens while you type — the query runs on
Enter, or on the button beside the field. Live search would spend a daily-metered
quota on half-typed words, and having results rearrange under you mid-word is its
own kind of unpleasant. A committed search shows what it matched, with a Clear
link beside it; picking a category also clears it.

**Search beats category.** Typing a search sends `search=` and drops the
category entirely; clearing it goes back to `categories=`. The rule is applied in
the client *and* again in the proxy, so the two can never both be sent.

**Search matches headlines only.** The proxy pins `search_fields=title`.
TheNewsApi otherwise searches the description, keywords and body too, which turns
a search for "climate" into every article that mentions it in passing — matches
drop from ~463,000 to ~44,000 once the title is the only field, and the results
are about the thing you asked for rather than merely adjacent to it.

**Newest first, always.** The proxy pins `sort=published_at`. TheNewsApi
switches to relevance ordering the moment `search` is present, which is how a
search for "climate" came back led by an article from 2023 while the same query
sorted by date leads with this morning's. Category browsing already defaulted to
date, so this makes the ordering one rule rather than two.

**Paging.** Three articles arrive per request and the reader sees one, so a
position is `(page, indexInPage)`. The pager shows « ‹ then three numbered dots
carrying **absolute** article numbers — page 3 is labelled 7, 8, 9 — then ›.
Stepping past either end of a page moves to the far edge of the next.

**Prefetch and cache.** Reaching the second article of a page fetches the next
one in the background; sitting on the first article of any page but the first
fetches the previous one. Pages already fetched are kept in memory keyed by page
number, so moving onto one is an instant swap with no spinner and no flash of the
previous article. Jumping back to page 1 is free. Changing category or search
clears the cache, resets to article 1 and shows a full-height skeleton.

A failed *prefetch* is deliberately silent: the reader has not asked for that
page, and there is nothing useful to say about it. Only a failed foreground load
shows an error.

**Errors.** `429` reports the daily request limit; `401`/`403` reports an
authentication failure naming `THENEWSAPI_TOKEN`. Both come from the server with
a client-side fallback for when the server itself cannot be reached.

**Favourites** persist in `localStorage` and have their own view in the sidebar,
with the same pager. Live results are untouched while you are in it, so leaving
restores exactly where you were.

## Responsive

Below 54rem the layout is one column with a **Show/Hide Filters** toggle, and the
card is taller so the text has room without pushing the pager off screen. At
54rem and above the sidebar becomes a sticky rail with the filters always
visible — no collapsing — and the card fills the viewport height minus the
header, pager and padding, so a whole article and its controls fit one screen.

## Notes

- **Node 18+.** The brief said 16, but the proxy uses the global `fetch` and
  `AbortSignal.timeout`, and Node 16 went end-of-life in September 2023.
- The proxy caches responses for five minutes (`CACHE_TTL_MS`) on top of the
  client's cache. The client's does not survive a reload; this one does.
- `Ctrl+C` stops both servers and, on Windows, everything they started:
  each child is `npm.cmd` under a shell, and the node/vite process doing the
  work is its *grandchild*, so a plain signal would orphan it still holding the
  port. The shutdown handler uses `taskkill /T` there. If the parent is killed
  outright rather than signalled, nothing can run that handler — recover with
  `Get-NetTCPConnection -LocalPort 5176,5177 -State Listen | Stop-Process -Id { $_.OwningProcess } -Force`.
- `placeholder.png` is generated, not photographed — see the comment at the top
  of the script that made it. Articles frequently arrive with no image, and a
  broken one swaps to the placeholder exactly once so a failing fallback cannot
  loop.
