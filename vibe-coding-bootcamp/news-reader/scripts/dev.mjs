// scripts/dev.mjs
/*
 * Runs the proxy and the web dev server together.
 *
 * Deliberately dependency-free rather than reaching for `concurrently`: the
 * documented way in is `npm run server:install && npm run dev`, which never
 * installs anything at the root, so the root must have nothing to install.
 *
 * It also installs any missing workspace dependencies first. Without that,
 * `npm run dev` fails on a fresh clone with an error about vite, which tells
 * you nothing useful.
 */

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const isWindows = process.platform === 'win32';
const npm = isWindows ? 'npm.cmd' : 'npm';

/*
 * Node 18.20 / 20.12 stopped spawning .cmd and .bat files without a shell
 * (CVE-2024-27980), so on Windows `npm.cmd` throws EINVAL unless shell:true.
 * Every argument below is a hard-coded constant, never user input, so the
 * usual objection to shell:true does not apply here.
 */
const SPAWN_SHELL = isWindows;

const TARGETS = [
  { name: 'proxy', dir: join(root, 'server'), args: ['run', 'dev'], color: '[36m' },
  { name: 'web  ', dir: join(root, 'web'), args: ['run', 'dev'], color: '[35m' },
];

const RESET = '[0m';
const DIM = '[2m';

function note(message) {
  console.log(`${DIM}[dev]${RESET} ${message}`);
}

/** Install one workspace, inheriting stdio so npm's own output is visible. */
function install(dir, name) {
  return new Promise((resolve, reject) => {
    note(`installing ${name} dependencies (first run only)…`);
    const child = spawn(npm, ['install'], { cwd: dir, stdio: 'inherit', shell: SPAWN_SHELL });
    child.on('error', reject);
    child.on('exit', (code) =>
      code === 0 ? resolve() : reject(new Error(`npm install failed in ${dir}`)),
    );
  });
}

/** Prefix every line so two servers in one terminal stay readable. */
function pipe(stream, prefix, toStderr = false) {
  let buffer = '';
  stream.setEncoding('utf8');
  stream.on('data', (chunk) => {
    buffer += chunk;
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      const out = `${prefix} ${line}`;
      if (toStderr) console.error(out);
      else console.log(out);
    }
  });
}

const children = [];
let shuttingDown = false;

/**
 * Stop one child and everything it started.
 *
 * On Windows each child is `npm.cmd` running under a shell (see SPAWN_SHELL),
 * and the node/vite process doing the actual work is its grandchild. Signalling
 * the child kills the shell and orphans the grandchild, which keeps holding
 * 5176/5177 — so the next `npm run dev` fails with EADDRINUSE. `taskkill /T`
 * takes the whole tree. Elsewhere a signal already reaches the process group.
 */
function stop(child) {
  if (child.killed || child.exitCode !== null) return;
  if (!isWindows) {
    child.kill('SIGTERM');
    return;
  }
  try {
    // Detached and stdio-ignored so this cannot keep our own event loop alive.
    spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], {
      stdio: 'ignore',
      detached: true,
    }).unref();
  } catch {
    child.kill('SIGTERM'); // better than leaving it running
  }
}

function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) stop(child);
  // Give them a beat to exit cleanly, then leave regardless.
  setTimeout(() => process.exit(code), 400).unref();
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

for (const target of TARGETS) {
  if (!existsSync(join(target.dir, 'node_modules'))) {
    await install(target.dir, target.name.trim());
  }
}

if (!existsSync(join(root, 'server', '.env'))) {
  note('server/.env not found — copy server/.env.example and add THENEWSAPI_TOKEN.');
  note('The app will start, but every request will return "missing_token".');
}

for (const target of TARGETS) {
  const prefix = `${target.color}${target.name}${RESET}${DIM}│${RESET}`;
  const child = spawn(npm, target.args, {
    cwd: target.dir,
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: SPAWN_SHELL,
    env: { ...process.env, FORCE_COLOR: '1' },
  });

  pipe(child.stdout, prefix);
  pipe(child.stderr, prefix, true);

  child.on('exit', (code) => {
    // If either half dies the pair is useless, so take the other down with it
    // rather than leaving a half-working app behind.
    note(`${target.name.trim()} exited (${code ?? 'signal'})`);
    shutdown(code ?? 1);
  });

  children.push(child);
}

note('proxy → http://localhost:5177   web → http://localhost:5176');
