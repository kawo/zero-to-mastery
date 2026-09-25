/**
 * Tunebox desktop (Electron main process).
 *
 * The web build in dist/ is served from a private `app://tunebox` origin rather
 * than file://: the app uses absolute paths (/assets, /icons) and client-side
 * routes (/songs, /playlists/…), and a standard, secure origin gets the same
 * storage (IndexedDB) and APIs as the website. Its data is separate from the
 * website's; use Backup & restore to move a library between them.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  app,
  BrowserWindow,
  ipcMain,
  nativeTheme,
  net,
  protocol,
  screen,
  session,
  shell,
} from 'electron';
import { autoInstall, setupUpdates } from './updates';

const SCHEME = 'app';
const ORIGIN = `${SCHEME}://tunebox`;
const DIST = path.join(app.getAppPath(), 'dist');
/** `electron . --dev-url=http://localhost:5173` loads the Vite dev server instead. */
const DEV_URL = process.argv.find((a) => a.startsWith('--dev-url='))?.slice('--dev-url='.length);

protocol.registerSchemesAsPrivileged([
  {
    scheme: SCHEME,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
      codeCache: true,
    },
  },
]);

// One window, one library: a second launch focuses the running app.
if (!app.requestSingleInstanceLock()) app.quit();

/* ------------------------------ content policy ------------------------------ */

/**
 * The page may only run its own scripts (plus the inline pre-paint theme script,
 * allowed by hash) and only talk to lrclib.net for lyrics.
 */
function contentSecurityPolicy(): string {
  const html = readFileSync(path.join(DIST, 'index.html'), 'utf8');
  const hashes = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(
    (m) => `'sha256-${createHash('sha256').update(m[1]!).digest('base64')}'`,
  );
  return [
    "default-src 'self'",
    `script-src 'self' ${hashes.join(' ')}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "media-src 'self' blob:",
    "connect-src 'self' blob: https://lrclib.net",
    "font-src 'self' data:",
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'none'",
    "frame-ancestors 'none'",
  ].join('; ');
}

/** Serves dist/, falling back to index.html for app routes (like the Vercel rewrite). */
function serveApp() {
  const csp = contentSecurityPolicy();
  protocol.handle(SCHEME, async (request) => {
    const { pathname } = new URL(request.url);
    const file = path.normalize(path.join(DIST, decodeURIComponent(pathname)));
    if (!file.startsWith(DIST)) return new Response('Forbidden', { status: 403 });
    const isFile = existsSync(file) && statSync(file).isFile();
    // A missing file with an extension is a real 404; anything else is an app route.
    if (!isFile && path.extname(file)) return new Response('Not found', { status: 404 });
    const target = isFile ? file : path.join(DIST, 'index.html');
    const res = await net.fetch(pathToFileURL(target).toString());
    if (!target.endsWith('.html')) return res;
    const headers = new Headers(res.headers);
    headers.set('Content-Security-Policy', csp);
    headers.set('Content-Type', 'text/html; charset=utf-8');
    return new Response(res.body, { status: 200, headers });
  });
}

/* ------------------------------ window state ------------------------------ */

interface Bounds {
  x?: number;
  y?: number;
  width: number;
  height: number;
  maximized?: boolean;
}
const STATE_FILE = () => path.join(app.getPath('userData'), 'window-state.json');

function loadBounds(): Bounds {
  const fallback = { width: 1280, height: 820 };
  try {
    const b = JSON.parse(readFileSync(STATE_FILE(), 'utf8')) as Bounds;
    // Ignore a saved position that's no longer on any screen (monitor unplugged).
    const visible =
      b.x === undefined ||
      screen
        .getAllDisplays()
        .some(
          ({ workArea: w }) =>
            b.x! >= w.x - 50 &&
            b.y! >= w.y - 50 &&
            b.x! < w.x + w.width - 100 &&
            b.y! < w.y + w.height - 100,
        );
    return visible ? b : { ...fallback, maximized: b.maximized };
  } catch {
    return fallback;
  }
}

function saveBounds(win: BrowserWindow) {
  try {
    writeFileSync(
      STATE_FILE(),
      JSON.stringify({ ...win.getNormalBounds(), maximized: win.isMaximized() }),
    );
  } catch {
    /* not worth failing over */
  }
}

/* --------------------------------- window --------------------------------- */

let mainWindow: BrowserWindow | null = null;

function isAppUrl(url: string) {
  return url.startsWith(`${ORIGIN}/`) || (!!DEV_URL && url.startsWith(DEV_URL));
}

function createWindow() {
  const bounds = loadBounds();
  const win = new BrowserWindow({
    ...bounds,
    minWidth: 380,
    minHeight: 560,
    title: 'Tunebox',
    show: false,
    autoHideMenuBar: true,
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#121212' : '#f7f7f5',
    icon: process.platform === 'linux' ? path.join(DIST, 'icons', 'icon-512.png') : undefined,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      spellcheck: false,
      // Keep timers precise while minimised (crossfades, gapless handover).
      backgroundThrottling: false,
      // Restored sessions and media keys can start playback without a click.
      autoplayPolicy: 'no-user-gesture-required',
    },
  });
  mainWindow = win;
  if (bounds.maximized) win.maximize();
  win.once('ready-to-show', () => win.show());
  // Save on close, and shortly after resizing or moving (in case the app is killed).
  let saveTimer: ReturnType<typeof setTimeout> | undefined;
  const saveSoon = () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => !win.isDestroyed() && saveBounds(win), 500);
  };
  win.on('resize', saveSoon);
  win.on('move', saveSoon);
  win.on('close', () => saveBounds(win));
  win.on('closed', () => (mainWindow = null));

  // Links to the web (lyrics credit, release page) open in the browser, never in the app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (isAppUrl(url)) return;
    e.preventDefault();
    if (/^https:\/\//.test(url)) void shell.openExternal(url);
  });

  void win.loadURL(DEV_URL ?? `${ORIGIN}/`);
}

/* ------------------------------- lifecycle ------------------------------- */

app.on('second-instance', () => {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.focus();
});

void app.whenReady().then(() => {
  // No camera, microphone, location…: only what the app uses.
  const allowed = new Set(['fullscreen', 'clipboard-sanitized-write', 'persistent-storage']);
  session.defaultSession.setPermissionRequestHandler((_wc, permission, done) =>
    done(allowed.has(permission)),
  );

  ipcMain.handle('app:info', () => ({ version: app.getVersion(), autoInstall }));
  serveApp();
  setupUpdates();
  createWindow();

  // macOS: clicking the dock icon with no window open reopens it.
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
