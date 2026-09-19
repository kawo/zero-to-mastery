/*
 * Starts Electron reliably:
 * - removes ELECTRON_RUN_AS_NODE, which terminals opened from VS Code set
 *   (with it, Electron starts as plain Node and the app can't open a window);
 * - downloads the Electron binary if npm skipped it (npm 12 blocks packages'
 *   install scripts by default).
 *
 *   node scripts/run-electron.js <args for electron>
 */
const { spawn, execFileSync } = require('child_process');
const path = require('path');

function electronPath() {
  try {
    return require('electron');
  } catch (err) {
    console.log('run-electron: Electron binary missing, downloading it once…');
    execFileSync(process.execPath, [path.join(__dirname, '..', 'node_modules', 'electron', 'install.js')], { stdio: 'inherit' });
    delete require.cache[require.resolve('electron')];
    return require('electron');
  }
}

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const child = spawn(electronPath(), process.argv.slice(2), { stdio: 'inherit', env });
child.on('exit', (code) => process.exit(code === null ? 1 : code));
