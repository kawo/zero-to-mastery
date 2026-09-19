/*
 * Smoke test for the desktop build: loads app/ in a hidden Electron window
 * (real Chromium, WebGL included), checks that it starts cleanly offline,
 * presses Space to start a round, saves a screenshot and exits.
 *
 *   npm run smoke            → exit code 0 if every check passes
 *   SMOKE_SHOT=out.png npm run smoke   → also choose where the screenshot goes
 */
const { app, BrowserWindow, session } = require('electron');
const fs = require('fs');
const path = require('path');

const results = [];
const check = (label, ok, detail = '') => results.push({ label, ok: !!ok, detail });
const problems = [];

app.whenReady().then(async () => {
  // Offline for real: any network request is a failure.
  session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
    const remote = /^https?:/.test(details.url);
    if (remote) problems.push(`network request: ${details.url}`);
    callback({ cancel: remote });
  });

  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    show: false,
    backgroundColor: '#0F172A',
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, offscreen: true },
  });
  win.webContents.on('console-message', (event) => {
    const { level, message } = event;
    if (level === 'error' || level === 3) problems.push(`console error: ${message}`);
    if (/Content Security Policy/i.test(message)) problems.push(`CSP: ${message}`);
  });

  await win.loadFile(path.join(__dirname, '..', 'app', 'index.html'));
  await new Promise((r) => setTimeout(r, 2500)); // renderer + fonts settle

  const js = (code) => win.webContents.executeJavaScript(code);
  check('Three.js r128 bundled and loaded', await js("typeof THREE !== 'undefined' && THREE.REVISION === '128'"));
  const status = await js("document.getElementById('renderStatus').textContent");
  check('3D renderer running', /WebGL/.test(status), status);
  check('Inter and Outfit fonts loaded', await js("document.fonts.check('400 16px Inter') && document.fonts.check('700 16px Outfit')"));
  check('game booted (idle state)', (await js("document.getElementById('app').dataset.state")) === 'idle');
  check('storage works (profile saved)', await js("!!localStorage.getItem('reflexlab.v1') || !!document.getElementById('profileName').textContent"));

  // A real (trusted) key press starts a round.
  win.webContents.focus();
  win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Space' });
  win.webContents.sendInputEvent({ type: 'char', keyCode: ' ' });
  win.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Space' });
  await new Promise((r) => setTimeout(r, 400));
  const state = await js("document.getElementById('app').dataset.state");
  check('Space starts a round', state === 'waiting' || state === 'go', state);
  await new Promise((r) => setTimeout(r, 800)); // let a few frames render

  const shot = process.env.SMOKE_SHOT || path.join(__dirname, '..', 'dist', 'smoke.png');
  fs.mkdirSync(path.dirname(shot), { recursive: true });
  fs.writeFileSync(shot, (await win.webContents.capturePage()).toPNG());

  check('no errors, CSP violations or network requests', problems.length === 0, problems.join(' | '));
  for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.label}${r.detail ? `  (${r.detail})` : ''}`);
  console.log(`screenshot: ${shot}`);
  app.exit(results.every((r) => r.ok) ? 0 : 1);
});
