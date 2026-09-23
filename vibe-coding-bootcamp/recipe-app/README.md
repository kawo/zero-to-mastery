# Recipes PWA

A Progressive Web App for browsing recipes from [TheMealDB](https://www.themealdb.com). You can search, browse by category, read full recipes, and save favorites. Favorites keep working offline.

It has two parts:

- **`client/`:** React, Vite, TypeScript, Tailwind CSS and shadcn/ui, with a hand-written service worker.
- **`server/`:** a small Node.js/Express proxy in TypeScript.

The browser only ever calls this app's own `/api/*` routes. The server adds the TheMealDB API key, so the key never reaches the browser.

## Features

- **Search** recipes by name. The search is part of the URL (`/?q=curry`), so you can share it and use the back button.
- **Browse categories** with filter chips (`/?c=Seafood`). A **Surprise me** button opens a random recipe.
- **Recipe page:** photo, category, cuisine and tags; ingredients with pictures; step-by-step method; YouTube and original-source links.
- **Favorites:** tap the heart on any card or recipe. Favorites are stored in IndexedDB with the full recipe and its photo. You can filter by name, ingredient or cuisine, filter by category, sort (recent, oldest, A to Z, Z to A, category), remove one, or remove all (with a confirmation dialog). Open tabs stay in sync.
- **Offline:**
  - the app opens offline
  - favorites can be viewed, added (from recipes you've opened before) and removed
  - recipes and searches you've already seen load from the cache
  - a banner and a toast tell you when you're offline
- **Installable:** it has a web app manifest and icons, and passes Chrome's installability check.
- **UX:** skeleton loaders, empty and error states with retry, error boundaries, toasts, light and dark themes, and a mobile-first layout.
- **Accessibility:**
  - skip link and semantic landmarks
  - labelled controls, with `aria-pressed` on toggles
  - visible focus rings, and everything reachable by keyboard
  - alt text on images, and reduced motion when the system asks for it
  - light-theme colours meet WCAG AA contrast, and axe-core reports no violations on any page in either theme

## Tech stack

| Area | Choice |
|---|---|
| Client | React 19, Vite, TypeScript, React Router |
| UI | Tailwind CSS v3, shadcn/ui (Button, Card, Input, Badge, Dialog, Skeleton, Sonner toasts), lucide icons, and a theme toggle component |
| Data | TanStack Query (caching, retries), `idb` for IndexedDB |
| PWA | Web app manifest and a hand-written service worker (no Workbox) |
| Server | Node.js 20+, Express 5, TypeScript, helmet, cors, compression, dotenv |

## Project structure

```
recipe-app/
├── package.json               Root scripts: run/build client and server together
├── server/
│   ├── .env.example
│   ├── package.json
│   ├── tsconfig.json
│   └── src/
│       ├── index.ts           Express app: helmet, CORS, compression, /api
│       ├── env.ts             Loads .env before anything reads it
│       ├── lib/mealdb.ts      TheMealDB client: adds the key, rewrites image URLs, TTL cache
│       ├── lib/ttlCache.ts    Small in-memory cache with expiry
│       └── routes/mealdb.ts   /api routes, input checks, cache headers, errors
└── client/
    ├── index.html
    ├── vite.config.ts         Dev/preview /api proxy and the service worker build step
    ├── package.json
    ├── postcss.config.cjs
    ├── tailwind.config.cjs
    ├── components.json        shadcn/ui settings
    ├── public/
    │   ├── manifest.webmanifest
    │   ├── offline.html
    │   ├── favicon.svg
    │   └── icons/             Placeholder PNG icons (192, 512, maskable, Apple touch)
    └── src/
        ├── main.tsx, App.tsx
        ├── sw.js              Service worker (precache and runtime caching)
        ├── styles/globals.css Tailwind layers and shadcn theme variables
        ├── lib/               api.ts (proxy client), queryClient.ts, meal.ts, utils.ts, …
        ├── features/favorites/db.ts           IndexedDB helpers
        ├── features/favorites/useFavorites.ts React hooks over the store
        ├── components/ui/     shadcn/ui components
        ├── components/        Layout, SearchBar, MealCard, FavoriteButton, ThemeToggle, …
        └── pages/             Home, Details, Favorites, NotFound
```

## Setup

Requires **Node.js 20 or later**.

Run these in two terminals:

```bash
cd server && cp .env.example .env && npm i && npm run dev
```

```bash
cd client && npm i && npm run dev
```

Then open http://localhost:5173. Vite forwards `/api/*` to the server on port 3001.

Or run both from the repo root with one command:

```bash
npm run setup   # installs root, server and client dependencies
npm run dev     # starts server and client together
```

### Scripts

| Where | Command | What it does |
|---|---|---|
| root | `npm run dev` | Server (watch mode) and client dev server together |
| root | `npm run build` | Builds the server to `server/dist` and the client to `client/dist` |
| root | `npm run preview` | Runs the built server and the built client, with the service worker active |
| root | `npm run typecheck` | Type-checks both |
| server | `npm run dev` / `build` / `start` | Watch mode with tsx / compile / run `dist/index.js` |
| client | `npm run dev` / `build` / `preview` | Vite dev server / production build / serve the build on port 4173 |

## Environment variables

These go in `server/.env`. Only the server reads them.

| Variable | Default | Purpose |
|---|---|---|
| `MEALDB_API_BASE` | `https://www.themealdb.com/api/json/v1` | TheMealDB base URL |
| `MEALDB_API_KEY` | `1` | TheMealDB key. `1` is the public development key; use your supporter key in production |
| `PORT` | `3001` | API port |
| `CORS_ORIGINS` | *(none)* | Comma-separated origins allowed to call the API directly. Not needed when the client reaches the API through a same-origin proxy, which is the case in dev, preview, and the deploy setups below |

For the client, `API_URL` (optional) is where `vite dev` and `vite preview` forward `/api` to. The default is `http://localhost:3001`.

## API (server)

| Route | TheMealDB call | Server cache | `Cache-Control` |
|---|---|---|---|
| `GET /api/search?q=` | `search.php?s=` | 5 min | 5 min |
| `GET /api/meal/:id` | `lookup.php?i=` | 30 min | 30 min |
| `GET /api/categories` | `categories.php` | 1 day | 1 hour |
| `GET /api/filter?c=` | `filter.php?c=` | 1 hour | 1 hour |
| `GET /api/random` | `random.php` | none | `no-store` |
| `GET /api/images/*` | TheMealDB image files | none | 1 week, immutable |

How the server handles requests:
- **Input checks:** inputs are validated, and bad input gets a 400 with a readable message.
- **Upstream failures:** a TheMealDB error or timeout (8 seconds) returns 502 or 504. Unknown recipe IDs return 404.
- **Response shape:** TheMealDB's `{ meals: null }` becomes an empty list.
- **Image proxy:** image URLs in responses are rewritten to `/api/images/…`, so the browser never contacts TheMealDB, not even for images. The proxy only serves TheMealDB's own image folders.

## shadcn/ui

The components in `client/src/components/ui/` are shadcn/ui components (new-york style), already included. `components.json` is set up so you can add more.

This project uses **Tailwind v3** (`tailwind.config.cjs`). Current shadcn CLI releases target Tailwind v4, so use the last v3-compatible CLI:

```bash
cd client
npx shadcn@2.3.0 add dropdown-menu   # or any other component
```

To set up shadcn in a new Vite and Tailwind v3 project from scratch:

1. `npm i -D tailwindcss@3 postcss autoprefixer`, then add `tailwind.config.cjs` and `postcss.config.cjs`.
2. Add the `@/*` path alias in `tsconfig.app.json` and in `vite.config.ts` under `resolve.alias`.
3. `npx shadcn@2.3.0 init`. Pick your style and base colour; it writes `components.json` and the CSS variables in `globals.css`.
4. `npx shadcn@2.3.0 add button card input badge dialog skeleton sonner`.

## PWA details

### Manifest

`public/manifest.webmanifest` sets:
- name "Recipes — browse & save meals", short name "Recipes"
- `display: standalone`, `start_url` and `scope` of `/`
- theme colour `#ea580c`
- icons at 192 px, 512 px, and 512 px maskable
- a Favorites shortcut

### Service worker

The service worker is `client/src/sw.js`, written by hand. At build time, a small plugin in `vite.config.ts`:
1. collects every built file (hashed JS and CSS, `index.html`) and everything in `public/`
2. writes that list into the worker as its precache list, with a version hash
3. writes `dist/sw.js`

Any change to the build gives the worker a new version. It installs, deletes the old precache, and the page shows a "New version available · Reload" toast.

The worker is only registered in production builds, so it doesn't interfere with Vite's hot reloading.

### Caching strategies

| Request | Strategy | Cache |
|---|---|---|
| Page navigations | Network first (4-second timeout), then the cached app shell, then `offline.html` | precache |
| Built assets and `public/` files | Cache first (precached at install) | `recipes-precache-<version>` |
| `/api/images/*` | Stale-while-revalidate (max 300 entries) | `recipes-images-v1` |
| `/api/categories`, `/api/filter` | Stale-while-revalidate | `recipes-api-v1` (max 150) |
| `/api/search`, `/api/meal/:id` | Network first (4-second timeout), then the cached copy | `recipes-api-v1` |
| `/api/random` | Network only | none |

When the app is offline and a response isn't cached, the worker answers `/api/*` with `503 {"offline": true}`. The client shows that as a friendly "You're offline" state. React Query runs in `offlineFirst` mode, so requests still reach the service worker when the browser reports being offline.

Every cache lookup ignores `Vary` headers. Hosts commonly send `Vary: Origin`, and Vite's module scripts carry an `Origin` header that the install step's requests don't. Honouring `Vary` would stop the precached bundle from matching, and the app would fail to start offline.

**To change a strategy**, edit the `ROUTES` table near the end of `src/sw.js`. Each entry pairs a URL test with a strategy (`networkFirst`, `staleWhileRevalidate`, `networkOnly`). Timeouts and cache sizes are constants at the top of the file. If you change what a runtime cache stores, bump `RUNTIME_VERSION` so old entries are thrown away.

### Offline favorites

Favorites live in IndexedDB. The database is `recipes`, the store is `favorites`, and records are keyed by meal ID. The helpers are in `src/features/favorites/db.ts`: `saveFavorite`, `removeFavorite`, `getFavorite`, `getAllFavorites` and `clearFavorites`.

- Each record stores the whole recipe, plus the card photo as a Blob. A favorite therefore opens with its picture even when nothing is in the service worker cache.
- Saving from a category card, which only has a name and photo, first loads the full recipe. Offline, that comes from the service worker cache if the recipe was opened before.

### Testing offline locally

1. `npm run build && npm run preview` at the repo root, then open http://localhost:4173.
2. Browse a little: search, open a couple of recipes, favorite one. A "Ready to work offline" toast appears once the worker is installed.
3. In DevTools, go to **Application → Service Workers** and tick **Offline**, or use the Network panel's **Offline** throttling.
4. Reload. The app still loads, Favorites works, and recipes you opened still open.
5. To see `offline.html`: in **Application → Cache storage**, delete `/index.html` and `/` from the precache, then navigate anywhere.
6. **Application → Manifest** shows installability. Use the install icon in the address bar to install the app.

## Deployment

**Server on Render (Web Service):**
- Root directory: `server`
- Build command: `npm ci && npm run build`
- Start command: `npm start`
- Environment: `MEALDB_API_KEY` (your key), and optionally `MEALDB_API_BASE`, `CORS_ORIGINS`. Render sets `PORT` itself.

**Client on Netlify or Vercel:**
- Base directory: `client`
- Build command: `npm run build`
- Output directory: `dist`

Forward `/api` to the Render server, so the client keeps calling same-origin `/api/*` and the service worker can cache it. Add an SPA fallback so deep links like `/meal/52771` work.

Netlify: create `client/public/_redirects`:

```
/api/*  https://YOUR-SERVER.onrender.com/api/:splat  200
/*      /index.html                                   200
```

Vercel: create `client/vercel.json`:

```json
{
  "rewrites": [
    { "source": "/api/:path*", "destination": "https://YOUR-SERVER.onrender.com/api/:path*" },
    { "source": "/(.*)", "destination": "/index.html" }
  ]
}
```

Serve `sw.js` with `Cache-Control: no-cache`, so browsers pick up new versions promptly. Netlify and Vercel do this for non-hashed files by default.

## Post-generation checklist

- [ ] Replace the placeholder icons in `client/public/icons/` and `favicon.svg`. Keep the sizes, and keep the artwork of the maskable icon inside the central 80%.
- [ ] Set your own theme colour in `manifest.webmanifest`, `index.html` (`theme-color`) and `src/styles/globals.css`.
- [ ] Use a TheMealDB supporter key in production (`MEALDB_API_KEY`). Key `1` is for development.
- [ ] Add more shadcn/ui components with `npx shadcn@2.3.0 add …` if you need them.
- [ ] Set up the `/api` forwarding and SPA fallback on your static host (see Deployment).
- [ ] Consider rate limiting on the server (for example `express-rate-limit`) before exposing it publicly.
- [ ] Run a Lighthouse audit on the deployed site: PWA installability, performance and accessibility.
