/**
 * Auto-update from GitHub Releases (electron-updater).
 *
 * The repository hosts other projects' releases too, so instead of electron-updater's
 * "latest release of the repo", each check asks the GitHub API for the newest published
 * `tunebox-vX.Y.Z` release and points the updater at that release's files.
 *
 * Windows: downloads in the background, then offers "Restart" (or installs on quit).
 * macOS: installing an update requires a signed app. Until signing is set up
 * (MAC_AUTO_INSTALL), the app only checks and links to the release to download.
 *
 * TUNEBOX_UPDATE_URL=<folder URL with latest.yml> overrides the feed, to test the
 * update flow against a local build without publishing a release.
 */
import { app, BrowserWindow, ipcMain, net } from 'electron';
import electronUpdater from 'electron-updater';
import type { UpdateStatus } from '../src/lib/desktop';

const { autoUpdater } = electronUpdater;

/** Flip once the macOS build is signed with a Developer ID and notarized. */
const MAC_AUTO_INSTALL = false;
const REPO = 'kawo/zero-to-mastery';
const TAG_PREFIX = 'tunebox-v';
const CHECK_EVERY_MS = 4 * 3600 * 1000;

export const autoInstall = process.platform !== 'darwin' || MAC_AUTO_INSTALL;

let last: UpdateStatus = { state: 'none' };

function send(status: UpdateStatus) {
  last = status;
  for (const win of BrowserWindow.getAllWindows()) win.webContents.send('update:status', status);
}

const releaseUrl = (version: string) =>
  `https://github.com/${REPO}/releases/tag/${TAG_PREFIX}${version}`;

function newer(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return (pa[i] ?? 0) - (pb[i] ?? 0);
  return 0;
}

/** The newest published Tunebox release's version, or null if there is none yet. */
async function latestTuneboxVersion(): Promise<string | null> {
  const res = await net.fetch(`https://api.github.com/repos/${REPO}/releases?per_page=50`, {
    headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'Tunebox-updater' },
  });
  if (!res.ok) throw new Error(`GitHub API ${res.status}`);
  const releases = (await res.json()) as {
    tag_name: string;
    draft: boolean;
    prerelease: boolean;
  }[];
  const versions = releases
    .filter((r) => !r.draft && !r.prerelease && r.tag_name.startsWith(TAG_PREFIX))
    .map((r) => r.tag_name.slice(TAG_PREFIX.length))
    .filter((v) => /^\d+\.\d+\.\d+$/.test(v))
    .sort(newer);
  return versions.at(-1) ?? null;
}

async function check() {
  if (last.state === 'downloading' || last.state === 'ready') return;
  try {
    let feed = process.env.TUNEBOX_UPDATE_URL;
    if (!feed) {
      const version = await latestTuneboxVersion();
      if (!version) return send({ state: 'none' }); // nothing published yet
      feed = `https://github.com/${REPO}/releases/download/${TAG_PREFIX}${version}`;
    }
    autoUpdater.setFeedURL({ provider: 'generic', url: feed });
    await autoUpdater.checkForUpdates();
  } catch (err) {
    // Offline, rate-limited, or a release still uploading: try again at the next interval.
    send({ state: 'error', message: err instanceof Error ? err.message : String(err) });
  }
}

export function setupUpdates(): void {
  ipcMain.handle('update:check', () => (app.isPackaged ? check() : undefined));
  // The page asks once on load, so it doesn't miss a status sent before it subscribed.
  ipcMain.handle('update:current', () => last);
  ipcMain.handle('update:install', () => {
    if (last.state === 'ready') autoUpdater.quitAndInstall();
  });
  // Development runs (`electron .`) have no update feed.
  if (!app.isPackaged) return;

  autoUpdater.autoDownload = autoInstall;
  autoUpdater.autoInstallOnAppQuit = autoInstall;
  autoUpdater.logger = console;

  autoUpdater.on('checking-for-update', () => send({ state: 'checking' }));
  autoUpdater.on('update-not-available', () => send({ state: 'none' }));
  autoUpdater.on('update-available', (info) =>
    send(
      autoInstall
        ? { state: 'downloading', version: info.version }
        : { state: 'manual', version: info.version, url: releaseUrl(info.version) },
    ),
  );
  autoUpdater.on('download-progress', (p) => {
    if (last.state === 'downloading') send({ ...last, percent: Math.round(p.percent) });
  });
  autoUpdater.on('update-downloaded', (info) => send({ state: 'ready', version: info.version }));
  autoUpdater.on('error', (err) => send({ state: 'error', message: err.message }));

  setTimeout(check, 10_000);
  setInterval(check, CHECK_EVERY_MS);
}
