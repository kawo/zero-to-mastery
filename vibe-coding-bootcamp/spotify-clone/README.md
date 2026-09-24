# Tunebox: an offline music player PWA

Import your own MP3s and play them in the browser, even offline. Tunebox reads ID3 tags and album art, keeps everything in IndexedDB on your device, and gives you playlists, a play queue, lock-screen controls and an installable app. There is no backend: a static Vercel deploy is the whole thing.

> Screenshots
>
> | Songs + queue (desktop, dark)          | Now Playing (mobile, light)                 | Playlist                          |
> | -------------------------------------- | ------------------------------------------- | --------------------------------- |
> | _screenshot: `docs/songs-desktop.png`_ | _screenshot: `docs/now-playing-mobile.png`_ | _screenshot: `docs/playlist.png`_ |

## Features

- **Import** (`/upload`): drag and drop files or a whole folder, or use the file and folder pickers. Files are hashed (SHA-256) for dedupe, then their tags are parsed with [`music-metadata`](https://github.com/Borewit/music-metadata), the maintained successor of `music-metadata-browser`. Embedded cover art is extracted. A per-file progress list shows the result: added, duplicate, relinked or failed (with a reason). When a file has no tags, the title and artist come from its file name (`01 - Artist - Title.mp3`).
- **Songs** (`/songs`): search, filter by artist or genre, and sort by date added, title, artist, album, duration or play count. These settings live in the URL, so they survive reloads and the Back button. You can multi-select (Shift-click selects a range), then Play, Play next, Add to queue, Add to playlist or Delete.
- **Playlists** (`/playlists`, `/playlists/:id`): create, rename and delete playlists. You can add songs from a picker or from any song list, remove them, and reorder them with drag and drop (mouse, touch long-press or keyboard). You can also search inside a playlist.
- **Now Playing** (`/now-playing`): large artwork on a backdrop tinted with the artwork's dominant colour, and a scrubbable timeline driven by `requestAnimationFrame`. It has play/pause, previous/next, shuffle, repeat (off, all, one), volume and an "Up next" preview.
- **Queue**: a collapsible panel (side panel on desktop, bottom sheet on mobile) with drag-to-reorder, remove, clear and jump-to. It restores after a reload, including the last position.
- **Media Session**: title, artist, album and artwork on the lock screen and in OS media controls, plus play, pause, previous, next and seek actions.
- **PWA**: installable, with the app shell and all code chunks precached. Artwork thumbnails are served and cached by the service worker. The library, playlists and playback work fully offline.
- **Backup**: export metadata as JSON, or a full `.zip` with the audio. Restore merges into the current library and relinks songs by content hash.
- **Accessible**: full keyboard use, visible focus rings, labelled controls, live-region announcements, keyboard drag and drop, and `prefers-reduced-motion` support.
- **Themes**: light, dark or follow the system, applied before first paint.

## Quick start

```bash
cd vibe-coding-bootcamp/spotify-clone
npm install
npm run dev          # http://localhost:5173
```

In dev mode, the empty Songs page and the Import page show a **Load demo songs** button. It creates 8 tiny generated WAV tracks with canvas artwork and a "Demo mix" playlist, so you can try the UI without any MP3s.

| Script              | What it does                                                                   |
| ------------------- | ------------------------------------------------------------------------------ |
| `npm run dev`       | Vite dev server with HMR (service worker disabled)                             |
| `npm run build`     | Type-checks (`tsc -b`), builds to `dist/`, compiles `src/sw.ts` → `dist/sw.js` |
| `npm run preview`   | Serves `dist/` at http://localhost:4173, with the service worker active        |
| `npm run typecheck` | TypeScript only                                                                |
| `npm run lint`      | ESLint (flat config)                                                           |
| `npm run format`    | Prettier (with the Tailwind class sorter)                                      |
| `npm run icons`     | Regenerates `public/icons/*` (no image dependencies)                           |

To include the demo button in a production build (for a staging deploy): `VITE_ENABLE_DEMO=true npm run build`. Otherwise the seed module is removed from the bundle.

## Deploy to Vercel

The app is a static SPA, so no server or environment variables are needed.

1. Push the repo to GitHub.
2. In Vercel, go to **Add New… → Project** and import the repository.
3. Set **Root Directory** to `vibe-coding-bootcamp/spotify-clone`. This folder lives inside a larger repo.
4. The framework preset is detected as **Vite**. `vercel.json` already sets the build command (`npm run build`) and the output directory (`dist`).
5. Click **Deploy**.

`vercel.json` also:

- rewrites every path to `/index.html`, so deep links such as `/playlists/abc` work. Vercel serves real files first, so `sw.js`, icons and assets are unaffected.
- serves `sw.js` with `Cache-Control: no-cache`, so app updates are picked up promptly.
- serves hashed `/assets/*` as immutable, for long-term caching.

From the CLI instead: `npx vercel` inside this folder, then `npx vercel --prod`.

## PWA: install and test offline

The service worker only runs in a production build (`npm run build && npm run preview`, or the deployed site), and only over HTTPS or on `localhost`.

**Install**

- Chrome, Edge (desktop or Android): use the **Install app** button in the top bar, or the install icon in the address bar.
- Safari on iOS or iPadOS: **Share → Add to Home Screen**. Safari has no install prompt event.
- Safari on macOS (Sonoma or later): **File → Add to Dock**.

**Offline test**

1. Open the site once while online and wait for the toast _"Tunebox is ready to work offline."_
2. Import a few songs.
3. In DevTools, go to **Application → Service Workers** and check that `sw.js` is _activated and running_. Go to **Application → Cache Storage** to see the precache and `tunebox-artwork-thumbs-v1`.
4. Go to **Network**, select **Offline**, and reload. The library, playlists, artwork and playback all still work, and the top bar shows an **Offline** badge.
5. While offline, open a URL the app doesn't know as a file (for example `/nothing.txt`). You'll get the offline fallback page (`public/offline.html`).
6. Updates: after a new deploy, a toast offers **Reload** to switch to the new version.

## How it works

### Project layout

```
spotify-clone/
├── index.html                 # app shell, pre-paint theme script, manifest link
├── vercel.json                # SPA rewrites + caching headers
├── vite.config.ts             # React, vite-plugin-pwa (injectManifest), chunking
├── tailwind.config.ts         # colours mapped to CSS variables (light/dark)
├── eslint.config.js           # ESLint 10 flat config
├── .prettierrc
├── tsconfig*.json             # app / service worker / node projects
├── public/
│   ├── manifest.webmanifest
│   ├── offline.html           # fallback for unmatched offline navigations
│   └── icons/                 # generated by scripts/generate-icons.mjs
├── scripts/generate-icons.mjs
└── src/
    ├── main.tsx, App.tsx      # providers + router (lazy route chunks)
    ├── sw.ts                  # service worker (Workbox)
    ├── types.ts               # Track, Playlist, BlobDoc, AppSettings, Queue…
    ├── styles/tailwind.css    # theme tokens, components, focus, reduced motion
    ├── db/
    │   ├── indexedDb.ts       # Dexie schema, versions/migrations, settings, error messages
    │   └── library.ts         # write operations (tracks, playlists, storage)
    ├── lib/
    │   ├── id3.ts             # tag + artwork extraction, file-name fallback
    │   ├── audio.ts           # time formatting, object URLs, placeholder + dominant colour
    │   ├── importer.ts        # hash → dedupe → parse → store pipeline
    │   ├── queue.ts           # pure queue reducer (shuffle, repeat, reorder…)
    │   ├── backup.ts          # JSON / zip export and restore
    │   └── utils.ts
    ├── hooks/
    │   ├── usePlayer.ts       # playback engine + Media Session + persistence
    │   ├── useIndexedDb.ts    # live queries (library, playlists, settings, blob URLs)
    │   ├── useProgress.ts     # rAF playback position, local to the component
    │   ├── useTrackActions.tsx, useTheme.ts, useBrowser.ts
    ├── state/contexts.ts      # React contexts (library, player, toasts, UI)
    ├── components/            # PlayerBar, QueueDrawer, SongList, Artwork, UploadDropzone,
    │   │                      # TopBar, SearchBar, PlaylistCard, AppShell, dialogs…
    │   ├── providers/         # Library, Player (<audio>), Toast, UI providers
    │   └── ui/                # Dialog (<dialog>), Menu, SortableList (dnd-kit)
    ├── pages/                 # Upload, Songs, Playlists, PlaylistDetail, NowPlaying
    └── dev/                   # demo seed (dev flag only)
```

### Data model

IndexedDB database `tunebox`, accessed through [Dexie](https://dexie.org):

```mermaid
erDiagram
    TRACKS ||--|| BLOBS : "audioBlobId"
    TRACKS }o--o| BLOBS : "artworkBlobId (shared per album)"
    PLAYLISTS }o--o{ TRACKS : "trackIds[] (ordered)"
    APP ||--|| SETTINGS : "key = 'settings'"

    TRACKS {
        string id PK
        string title
        string artist
        string album
        number duration "seconds"
        number year "optional"
        string genre "optional"
        string audioBlobId FK
        string artworkBlobId FK "optional"
        string hash "sha256:… (dedupe, relink)"
        string fileName
        boolean audioMissing "restored without audio"
        number playCount
        number createdAt
        number updatedAt
    }
    BLOBS {
        string id PK "audio-<trackId> | art-<contentHash>"
        string type "audio | artwork"
        Blob blob
        string mimeType
        number size
    }
    PLAYLISTS {
        string id PK
        string name
        string_array trackIds
        number createdAt
        number updatedAt
    }
    SETTINGS {
        string theme "light | dark | system"
        string repeat "off | all | one"
        boolean shuffle
        number volume
        string_array lastQueue
        number lastIndex
        string lastTrackId
        number lastPosition
    }
```

- Indexes: `tracks` on `title, artist, album, createdAt, hash, artworkBlobId, [fileName+duration], playCount`; `blobs` on `type`; `playlists` on `name, updatedAt`.
- **Migrations**: every schema change is a new `db.version(n)` block in `src/db/indexedDb.ts`, with an `.upgrade()` that fills in data. Version 2 added play counts and backfills `playCount = 0` for libraries created on v1. If another tab upgrades the schema, this tab closes its connection and reloads instead of blocking.
- Artwork blobs are **content-addressed**, so the tracks of one album share one image. Deleting a track deletes its artwork only when no other track still uses it.

### Playback and queue

```
 SongList / Playlist / Queue ──► usePlayer()  (context API)
                                     │
                     queueReducer (pure) ── items[{uid, trackId}], index, unshuffled[]
                                     │
               load effect: blob ─► object URL ─► <audio src>   (revoked when unused)
                                     │
      events: ended → next / repeat-one · error → toast + skip · timeupdate → play count, save position
                                     │
               Media Session metadata + handlers · settings persisted to IndexedDB
```

- The queue holds track IDs plus a per-slot `uid`, so the same song can be queued twice. It supports play-from-here, enqueue, **Play next**, remove, reorder, clear upcoming and jump.
- **Shuffle** keeps the current track and shuffles only what comes next, remembering the original order. Turning shuffle off restores that order.
- **Repeat** cycles off → all → one. With repeat one, a track loops when it ends naturally, but Next still skips.
- **Previous** restarts the track if you are more than 3 seconds in; otherwise it goes back one track.
- The timeline reads `audio.currentTime` on `requestAnimationFrame`, but only inside the timeline component, so the rest of the UI doesn't re-render every frame. Dragging previews the position and seeks on release. Arrow keys seek 5 s.
- A play counts after 30 s (or half of a short track). Play counts drive the "Most played" sort.

### Artwork

1. **Thumbnails**: small artwork is requested as `/artwork/<blobId>?s=96|192|384`. The service worker reads the image from IndexedDB, crops and resizes it with `OffscreenCanvas`, and caches it cache-first (400 entries max, LRU). IDs are content hashes, so cached entries never go stale.
2. **Full size**: large views and dev mode, where there's no service worker, use a shared, ref-counted object URL that is revoked 30 s after its last user unmounts.
3. **Placeholder**: when a song has no artwork, a deterministic gradient (hue from the file hash) is shown with the album's initials.

## Backup and restore

Backups live on the **Import** page, under _Backup & restore_.

- **Export metadata (.json)**: songs, playlists and settings, without audio. The file is small; keep it with your music folder.
- **Export with audio (.zip)**: the same JSON, plus `audio/` and `artwork/` folders. It shows the size first. The zip is built in memory, so very large libraries may fail on phones; if that happens, export metadata only.
- **Restore backup**: accepts either file and merges into the current library:
  - A song whose content hash already exists on this device links to it; nothing is duplicated.
  - A song from a zip gets its audio restored.
  - A song from a JSON-only backup with no local audio is kept and marked _audio missing_ (dimmed, with a warning icon). **Import the original file later and it relinks automatically**, and its playlists come back intact.
  - A playlist with the same ID and name is merged. A playlist with the same ID but a different name is kept alongside, so nothing is overwritten.

## Keyboard shortcuts

| Key                                       | Action                                               |
| ----------------------------------------- | ---------------------------------------------------- |
| `Space` / `K`                             | Play / pause (when focus isn't on a button or field) |
| `Shift` + `→` / `←`                       | Next / previous track                                |
| `Q`                                       | Show / hide the queue                                |
| `S` · `R` · `M`                           | Shuffle · cycle repeat · mute                        |
| `/`                                       | Focus the search box                                 |
| `←` / `→` on the timeline                 | Seek 5 seconds                                       |
| `Space`, arrows, `Space` on a drag handle | Pick up, move, drop (`Esc` cancels)                  |
| `Esc`                                     | Close menus, dialogs and the mobile queue sheet      |

## Acceptance test (manual script)

Run this against `npm run build && npm run preview`, or the deployed URL, in a fresh browser profile. Before a release, also run it on a phone.

1. **First run**: open `/`. You're redirected to `/songs`, which shows _"Your library is empty"_. Wait for the _"ready to work offline"_ toast.
2. **Upload**: on **Import**, choose 3–4 MP3s, including one exact duplicate and one file without tags. The progress bar fills; the list shows _Added_ for each new file and _Already in library_ for the duplicate. A toast summarises the import.
3. **Songs appear**: click **View songs**. Every imported song is listed with its title, artist, album and duration. The untagged file shows a title and artist taken from its file name.
4. **Artwork shows**: songs with embedded art show their thumbnail. The untagged song shows a gradient tile with initials.
5. **Add to queue**: click a song to play it, then open another song's **⋯** menu and choose **Add to queue**. A toast confirms it.
6. **Play**: time advances in the player bar. The OS media controls or lock screen show the title and artwork. Pause, Next and Previous work.
7. **Collapse and expand the queue**: click the queue button, or press `Q`. The panel opens with the queued song under _Next up_, and the button reports `aria-expanded="true"`. Click again and it closes.
8. **Create a playlist**: on **Playlists**, choose **New playlist**, type _Road Trip_ and click **Create**. You land on the empty playlist.
9. **Add songs**: click **Add songs**, tick all of them and click **Add**. The playlist lists them, with its total duration in the header.
10. **Reorder**: drag a song by its handle, or focus the handle and press `Space`, `↓`, `Space`. Reload the page; the new order is kept.
11. **Offline reload**: in DevTools, go to **Network → Offline** and reload. The playlist page loads; press **Play** and the audio plays; the top bar shows **Offline**. Opening `/now-playing` directly also works.

An automated run of these steps against the production build passed with Playwright in headless Edge (desktop 1360×860 and mobile 390×844), with no console errors.

## Known limitations

- **Storage quotas**: every browser caps how much a site can store, usually a share of free disk space; the exact limits vary by browser and version. The Import page shows your usage and quota, and has a **Make storage persistent** button. If storage fills up, the import stops with an explanation.
- **Safari and iOS**:
  - Safari may delete site data after 7 days without a visit, unless the app is installed to the Home Screen. Install it if you care about your library.
  - iOS ignores `audio.volume`; the hardware buttons control volume.
  - Background audio in an installed iOS PWA works, but it can stop if iOS suspends the app.
  - Media Session seek actions are only partly supported.
  - There's no install prompt event; use _Add to Home Screen_.
  - Safari can't encode WebP, so thumbnails fall back to PNG. That's handled automatically.
- **Formats**: MP3 works everywhere. M4A, OGG, FLAC and WAV import when the browser can decode them (for example, FLAC and OGG don't work in older Safari). Unplayable files are rejected with a message.
- **Plain HTTP on a LAN IP** (for example testing on a phone at `http://192.168.x.x`): there's no service worker and no WebCrypto there. The app still works, falling back to a non-cryptographic hash for dedupe, but offline mode and thumbnails need HTTPS or `localhost`.
- **Private browsing**: some browsers block or wipe IndexedDB in private windows. The app shows a clear error instead of failing silently.
- **Large full backups** are built in memory; see _Backup and restore_.
- **Tooling**: the spec asked for `.eslintrc.cjs`, but ESLint 10 only reads flat config, so the rules live in `eslint.config.js`. The React Compiler lint rules are off because this app doesn't use the compiler, and its player drives an imperative `<audio>` element.

## Troubleshooting

| Problem                                      | Fix                                                                                                                                                                   |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| No **Install** button                        | It appears only in production builds, over HTTPS or on `localhost`, in Chrome or Edge, after the service worker is active. In Safari, use Share → Add to Home Screen. |
| Offline reload shows the browser's dino page | The service worker wasn't active yet. Load once online and wait for the "ready to work offline" toast. It also doesn't run under `npm run dev`.                       |
| "Out of storage space" during import         | Delete songs you don't need, free disk space, or click _Make storage persistent_ on the Import page.                                                                  |
| A song shows ⚠ _audio not on this device_    | It came from a metadata-only backup. Import the original file; it relinks by content hash.                                                                            |
| "Couldn't play …, the file may be damaged"   | The browser couldn't decode it. Re-encode it as MP3, then delete and re-import it.                                                                                    |
| Stuck on an old version after a deploy       | Click **Reload** on the update toast, or close every Tunebox tab and open it again.                                                                                   |
| Deep links 404 on your own host              | Configure SPA fallback to `/index.html` (already done in `vercel.json` for Vercel).                                                                                   |
| Library won't open (error screen)            | Allow site data for the domain, leave private browsing, and reload.                                                                                                   |
