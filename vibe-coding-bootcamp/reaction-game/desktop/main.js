/*
 * Reflex Lab desktop: Electron main process.
 *
 * Loads the game from app/ (a copy of the web version prepared by
 * scripts/prepare-app.js, with Three.js and the fonts bundled so it works
 * offline). The renderer is locked down: no Node.js, sandboxed, no navigation,
 * no pop-ups, no permissions, and no DevTools in the packaged build (they would
 * make cheating on the verified leaderboard trivial).
 */
const { app, BrowserWindow, Menu, session } = require('electron');
const path = require('path');

// One window only: a second launch focuses the running game.
if (!app.requestSingleInstanceLock()) {
  app.quit();
}

let win = null;

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 640,
    title: 'Reflex Lab',
    backgroundColor: '#0F172A', // the game's background: no white flash on start
    show: false,
    autoHideMenuBar: true,
    icon: path.join(__dirname, 'build', 'icon.png'),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
      devTools: !app.isPackaged,
    },
  });

  win.once('ready-to-show', () => win.show());
  win.loadFile(path.join(__dirname, 'app', 'index.html'));

  // Keep the game in its window.
  win.webContents.on('will-navigate', (event) => event.preventDefault());
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

  // F11 toggles full screen (there is no menu to provide the shortcut).
  win.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown' && input.key === 'F11') {
      win.setFullScreen(!win.isFullScreen());
      event.preventDefault();
    }
  });

  win.on('closed', () => { win = null; });
}

Menu.setApplicationMenu(null);

app.on('second-instance', () => {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.focus();
});

app.whenReady().then(() => {
  // The game needs no camera, microphone, notifications… refuse everything.
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => callback(false));
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
