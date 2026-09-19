# Compliment Generator: sync server

A small API that keeps each person's favorites on a server, so every device signed in to the same account has the same list. It also serves the app itself, so one address gives both the page and its API.

- **No dependencies:** only Node.js 18 or later. Nothing to install.
- **No personal data:** an account is a username (any nickname) and a password. There's no email and no real name.
- **Storage:** one JSON file (`data/db.json`), rewritten atomically after each change.

## Run

From the `compliment-generator` folder:

```
node server/server.js
```

Then open <http://localhost:8787/>. The page finds the API next to it (`/api/`), and a **Sync** button appears under the card.

Run the tests (they use a temporary data folder, never `data/`):

```
node --test "server/test/*.test.js"
```

## Settings

All settings are environment variables and all are optional.

| Variable | Default | What it does |
|----------|---------|--------------|
| `PORT` | `8787` | Port to listen on. |
| `HOST` | `127.0.0.1` | Address to listen on. Use `0.0.0.0` on a hosting platform. |
| `DATA_DIR` | `server/data` | Where `db.json` is kept. It must be a persistent disk. |
| `SERVE_APP` | `true` | Also serve the app (`index.html`, `css/`, `js/`, `images/`…). Set it to `false` to serve only the API. |
| `ALLOWED_ORIGINS` | *(none)* | Other sites allowed to call the API when the page is hosted elsewhere, comma-separated, e.g. `https://me.github.io`. Same-origin calls always work. |
| `TRUST_PROXY` | `false` | Set to `true` behind a reverse proxy (most hosts), so rate limiting uses the visitor's IP from `X-Forwarded-For` instead of the proxy's. |
| `SESSION_DAYS` | `90` | How long a sign-in lasts on a device. |

## Deploying

The API needs a host that runs Node.js and keeps files on disk: Render, Railway or Fly.io (each with a persistent volume), or any VPS. Always use **https**, since passwords and session tokens travel in requests. Most hosts provide https automatically.

**One server for everything (simplest).** Deploy the whole `compliment-generator` folder with the start command `node server/server.js` and these variables:

```
HOST=0.0.0.0
TRUST_PROXY=true
DATA_DIR=/path/to/persistent/volume
```

The page and the API then share one address, and nothing else needs configuring.

**Page on GitHub Pages, API elsewhere.** Deploy the server as above with `SERVE_APP=false` and `ALLOWED_ORIGINS=https://YOUR-NAME.github.io`. Then, in `index.html`, point the page to it:

```html
<meta name="sync-api" content="https://your-sync-server.example.com/api/" />
```

**Backups.** Everything is in `db.json`. Copy it while the server runs (writes are atomic, so a copy is never half-written).

## API

Every request and response body is JSON. Signed-in routes need the header `Authorization: Bearer <token>`. Errors look like `{ "error": "<code>" }`.

| Route | Body | Answer |
|-------|------|--------|
| `GET /api/health` | | `{ ok, service: "compliment-generator-sync", version }` |
| `POST /api/register` | `{ username, password }` | `201 { token, user: { username, createdAt } }` |
| `POST /api/login` | `{ username, password }` | `200 { token, user }` |
| `POST /api/logout` 🔒 | | `204`: ends this session only |
| `GET /api/account` 🔒 | | `{ user, favorites: <count> }` |
| `DELETE /api/account` 🔒 | `{ password }` | `204`: deletes the account, its favorites and every session |
| `GET /api/favorites` 🔒 | | `{ entries, updatedAt }` |
| `POST /api/favorites/sync` 🔒 | `{ entries }` | `{ entries, updatedAt }`: the merged list |

🔒 = needs a token.

**Rules:**
- **Usernames:** 3 to 32 characters (letters, digits, `.`, `-`, `_`). They're unique regardless of case, and signing in ignores case.
- **Passwords:** 8 to 200 characters, and not the same as the username.

**Error codes:** `invalid_username`, `invalid_password`, `username_taken` (409), `wrong_credentials` (401), `wrong_password` (403, deleting the account), `unauthorized` (401), `rate_limited` (429, with `Retry-After`), `bad_request` (400/415), `too_large` (413), `not_found`, `method_not_allowed`, `server_error`.

### How sync works

A device sends **everything it knows** and gets back the merged list:

```json
{ "entries": [
  { "type": "joke", "en": "Why don’t penguins like parties?\nThey find it hard to break the ice.", "updated": "2026-09-19T18:02:11.000Z" },
  { "type": "compliment", "en": "Your kindness is a gift…", "updated": "2026-09-19T18:05:40.000Z", "removed": true }
] }
```

- **One entry per item:** each compliment or joke is identified by its type and English text, as in the app.
- **Removals are kept:** a removed favorite stays in the list with `removed: true`. Without that marker, another device that still had the favorite would bring it back.
- **Merging:** for each item, the most recent change wins, whether it was an add or a removal. So devices can change favorites offline and sync later, in any order, and they all end up with the same list. The same rules run on the server and in the page ([`js/sync.js`](../js/sync.js)).
- **Wrong clocks:** a date more than 5 minutes in the future is pulled back to "now", so a device with a wrong clock can't win every merge.

The page syncs when you sign in, 1.5 s after each change, when the connection comes back, when you return to the tab, and when you press **Sync now**.

## Privacy and security

**What's stored** (in `db.json`):
- the username;
- the password, hashed with scrypt (N=16384, r=8, p=1) and a random salt per account;
- the account's creation date;
- the favorites (type, English text, date) and removals;
- for each signed-in device, a SHA-256 hash of its session token and the session's dates.

**What isn't stored:** no email, no name, no IP address, no device or browser details, no logs of requests. Rate limiting counts attempts in memory only, and forgets them within 15 minutes.

**Protections:**
- **Tokens:** a copy of `db.json` can't be used to sign in, because only hashes of the session tokens are kept.
- **Timing:** a wrong username takes as long to answer as a wrong password, and gets the same error, so accounts can't be discovered that way.
- **Rate limits:**
  - 20 sign-up or sign-in attempts per IP every 15 minutes;
  - 10 failed sign-ins per username every 15 minutes;
  - 120 syncs per account per minute.
- **Request size:** request bodies are limited to 256 KB.
- **Private responses:** API responses are marked `no-store`, so they're never cached, and the page's service worker never caches them either.
- **Served files:** only the app's own files are served. Nothing in `server/` (and so not `db.json`) is ever reachable, and paths with `..` are refused.
- **Tokens stay out of cookies:** the page sends the token in the `Authorization` header, never as a cookie, so other sites can't make requests as the user (no CSRF).

**Forgotten passwords:** since there's no email, a forgotten password can't be reset. The favorites are still on each device, and signing out never deletes them.

**Deleting an account** (from the Sync dialog, with the password) removes the account, its favorites and all its sessions from the server immediately.
