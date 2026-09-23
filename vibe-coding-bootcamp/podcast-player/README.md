# Podcast Player

A podcast player that runs in the browser. It uses the [Podcast Index API](https://podcastindex.org/) for search and a small Node.js/Express server. You can search for podcasts, subscribe to their RSS feeds, stream or download episodes for offline listening, and control playback from your lock screen. It can be installed as a Progressive Web App.

## Features

- **Search:** find podcasts by title, author or keyword through Podcast Index. Your past searches are kept in a dropdown.
- **Library:** your subscriptions, shown when the app opens. There are three ways to subscribe:
  - click the ★ on a search result
  - paste an RSS or Atom feed URL (`feed://` links and URLs without a scheme also work)
  - import an OPML file from another podcast app

  Click a podcast to see its episodes, 50 at a time. Feeds not checked in the last hour refresh when you open the Library. **Refresh all** re-checks every feed, and **Export OPML** saves your subscriptions to move them elsewhere.
- **Offline downloads:** download any episode from its card and follow its progress. You can pause, resume and delete downloads, and the **Downloads** view lists them all. An interrupted download picks up from the last saved byte instead of starting over. Downloaded episodes play without a connection.
- **Playback:** play and pause, skip 15 seconds, and click the progress bar to seek.
- **Queue:** add episodes to the end, or use **Play next** (double arrow) to put one at the top. Reorder by dragging the handle (mouse or touch) or with the ↑/↓ keys. When an episode ends, the next one in the queue starts, and playing an episode from the queue takes it off the list. The queue stays in step across open tabs.
- **Lock-screen and media-key controls:** the episode title, podcast and artwork appear on the lock screen and in the system media controls. Play, pause, seek and headset or keyboard media keys all work. Starting an episode in one tab pauses any other tab.
- **Picks up where you left off:** the current episode, your position and your queue are restored when you come back.
- **Installable (PWA):** the app files are cached, so the app opens offline, and so do your Library and Downloads.

Private feeds (Patreon, Supercast and similar) work when the feed URL contains an access token, which is how those services usually provide them. Feeds that ask for a username and password aren't supported. The app shows an error saying the feed needs a login.

## Getting started

Requires **Node.js 18 or later**.

1. Clone the repository and go to the project folder:
   ```bash
   git clone https://github.com/kawo/zero-to-mastery.git
   cd zero-to-mastery/vibe-coding-bootcamp/podcast-player
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Get a free API key and secret from [Podcast Index](https://api.podcastindex.org/), then create a `.env` file from the example and fill it in:
   ```bash
   cp .env.example .env
   ```
   ```bash
   AUTH_KEY='your_api_key'
   SECRET_KEY='your_api_secret'
   USER_AGENT='Your_app_name'
   API_ENDPOINT='https://api.podcastindex.org/api/1.0'
   ```

4. Start the server:
   ```bash
   npm start
   ```

The app runs at http://localhost:3000. Set `PORT` to use a different port.

The service worker checks the network first, so a normal reload picks up code changes. If you ran an older copy of the app on the same address, reload once so the new service worker takes over.

## Project structure

```
server.js                 Express server: serves public/ and the API routes below
public/
  index.html              Page layout
  style.css               Styles, including the phone/tablet layout (under 1025px)
  script.js               Main UI: search, cards, Library views, player, queue, Media Session
  subscriptions.js        Library: feed fetching and RSS/Atom parsing, OPML, IndexedDB storage
  downloads.js            Offline downloads: chunked, resumable storage in IndexedDB
  queue.js                Playback queue: ordered list in IndexedDB, synced across tabs
  service-worker.js       Caches the app files so it opens offline
  manifest.json           PWA manifest
```

## Server routes

| Route | Purpose |
|---|---|
| `GET /api/search?q=` | Search Podcast Index |
| `GET /api/episodes?feedId=&max=` | Episodes for a podcast, by iTunes ID |
| `GET /api/podcast?itunesId=` | Podcast details (including its feed URL), by iTunes ID |
| `GET /api/feed?url=` | Fetches an RSS/Atom feed and returns it as text for the browser to parse |
| `GET /api/audio?url=` | Streams episode audio for downloads and passes `Range` headers through for resuming |

The browser can't fetch feeds and audio directly, because most podcast hosts don't allow cross-origin requests. So `/api/feed` and `/api/audio` fetch them on its behalf. Because these routes fetch any URL they're given, they:
- only connect to public addresses, checked when the connection is made and again after every redirect
- only pass audio through (`/api/audio`)
- limit feeds to 50 MB and 20 seconds (`/api/feed`)
- never log feed URLs, since private ones contain access tokens

## Where data is stored

Everything is stored in the browser. There are no user accounts and no server-side database.

| What | Where |
|---|---|
| Library (subscriptions and their episodes) | IndexedDB `podcast-library` |
| Downloaded audio | IndexedDB `podcast-downloads`, in 1 MB chunks |
| Playback queue | IndexedDB `podcast-queue` |
| Current episode and position, search history | localStorage |

Favorites from older versions of the app are moved into the Library automatically.

## Deployment

The project can be deployed on [Render](https://render.com/) or any host that runs Node.js:

1. Connect the repository to your Render account. Set the root directory to `vibe-coding-bootcamp/podcast-player`.
2. Add the environment variables from `.env` in Render's dashboard.
3. Use `npm install` as the build command and `npm start` as the start command.

Downloads and feed refreshes pass through your server. A 50 MB episode means 50 MB in and 50 MB out, so check your host's bandwidth limits.

## Technologies used

- **Node.js and Express:** server and API routes
- **Podcast Index API:** podcast search and episode lookup
- **Vanilla JavaScript, HTML and CSS:** the interface, with no framework and no build step
- **IndexedDB and localStorage:** the Library, downloads and playback state
- **Service Worker and Web App Manifest:** installable app that opens offline
- **Media Session API:** lock-screen and media-key controls
- **Font Awesome:** icons

## Acknowledgements

- Forked from [JacintoDesign/podcast-player](https://github.com/JacintoDesign/podcast-player).
- [Podcast Index](https://podcastindex.org/) for providing the podcast data.
- [Render](https://render.com/) for hosting and deployment.
- [Podcast Icon](https://www.flaticon.com/free-icons/podcast): podcast icons created by Flat Icons - Flaticon.
