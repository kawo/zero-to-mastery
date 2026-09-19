#!/usr/bin/env node
/* ==========================================================================
   Compliment Generator: sync server
   --------------------------------------------------------------------------
   A small API that stores each person's favorites so they can be shared
   between devices. No dependencies: only Node.js (version 18 or later).

     node server/server.js            → http://localhost:8787

   It also serves the app itself, so one address gives the page and its API.
   Accounts are a username and a password, nothing else: no email, no name.
   See server/README.md for the API, the settings and deployment.
   ========================================================================== */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { promisify } = require('util');
const { mergeEntries } = require('../js/sync.js');

const scrypt = promisify(crypto.scrypt);

/* ---------- Settings (environment variables) ---------- */
const config = {
  port: Number(process.env.PORT) || 8787,
  host: process.env.HOST || '127.0.0.1',            // use 0.0.0.0 on a hosting platform
  dataDir: process.env.DATA_DIR || path.join(__dirname, 'data'),
  serveApp: process.env.SERVE_APP !== 'false',       // also serve index.html, css/, js/…
  // Other sites allowed to call the API (when the page is hosted elsewhere),
  // comma-separated, e.g. "https://me.github.io". Same-origin always works.
  allowedOrigins: (process.env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim().replace(/\/$/, '')).filter(Boolean),
  trustProxy: process.env.TRUST_PROXY === 'true',    // read the client IP from X-Forwarded-For
  sessionDays: Number(process.env.SESSION_DAYS) || 90,
};

const APP_DIR = path.resolve(__dirname, '..');
const MAX_BODY = 256 * 1024;         // bytes: room for the 2,000-entry maximum (200 items take ~40 KB)
const USERNAME = /^[A-Za-z0-9_.-]{3,32}$/;
const PASSWORD_MIN = 8;
const PASSWORD_MAX = 200;

/* ==========================================================================
   Storage: one JSON file, rewritten atomically after each change
   ========================================================================== */
// {
//   users:     { "<username in lower case>": { id, username, password, createdAt } },
//   favorites: { "<user id>": { entries: [...], updatedAt } },
//   sessions:  { "<sha-256 of the token>": { userId, createdAt, expiresAt } }
// }
// Only a hash of each session token is stored, so a copy of this file can't
// be used to sign in as anyone.
class Store {
  constructor(dir) {
    this.file = path.join(dir, 'db.json');
    this.data = { users: {}, favorites: {}, sessions: {} };
    this.queue = Promise.resolve();
    fs.mkdirSync(dir, { recursive: true });
    try {
      this.data = { ...this.data, ...JSON.parse(fs.readFileSync(this.file, 'utf8')) };
    } catch (error) {
      if (error.code !== 'ENOENT') throw error; // a corrupt file must not be silently replaced
    }
  }

  /** Writes the current data. Writes happen one at a time, in order. */
  save() {
    const snapshot = JSON.stringify(this.data);
    this.queue = this.queue.then(() => writeAtomically(this.file, snapshot));
    return this.queue;
  }
}

/** Writes to a temporary file, then renames it over the real one: never a half-written file. */
async function writeAtomically(file, content) {
  const temp = `${file}.${process.pid}.tmp`;
  await fs.promises.writeFile(temp, content, { mode: 0o600 });
  for (let attempt = 0; ; attempt++) {
    try {
      await fs.promises.rename(temp, file);
      return;
    } catch (error) {
      // Windows: the file can be briefly locked (antivirus, indexer). Try again.
      if (attempt >= 5 || (error.code !== 'EPERM' && error.code !== 'EBUSY')) throw error;
      await new Promise((r) => setTimeout(r, 50 * (attempt + 1)));
    }
  }
}

/* ==========================================================================
   Passwords and sessions
   ========================================================================== */
const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };

/** "scrypt$N$r$p$salt$hash": the parameters are stored so they can be raised later. */
async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = await scrypt(password.normalize('NFC'), salt, SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p });
  return ['scrypt', SCRYPT.N, SCRYPT.r, SCRYPT.p, salt.toString('base64'), hash.toString('base64')].join('$');
}

async function verifyPassword(password, stored) {
  const [scheme, N, r, p, salt, hash] = String(stored).split('$');
  if (scheme !== 'scrypt') return false;
  const expected = Buffer.from(hash, 'base64');
  const actual = await scrypt(password.normalize('NFC'), Buffer.from(salt, 'base64'), expected.length, { N: +N, r: +r, p: +p });
  return crypto.timingSafeEqual(actual, expected);
}

// Checked when the username doesn't exist, so a wrong username takes as long
// as a wrong password and response times don't reveal which accounts exist.
const dummyHash = (() => {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(crypto.randomBytes(16), salt, SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p });
  return ['scrypt', SCRYPT.N, SCRYPT.r, SCRYPT.p, salt.toString('base64'), hash.toString('base64')].join('$');
})();

const tokenHash = (token) => crypto.createHash('sha256').update(token).digest('base64url');

/* ==========================================================================
   Rate limiting (in memory only: nothing about visitors is written to disk)
   ========================================================================== */
class RateLimiter {
  constructor(limit, windowMs) {
    this.limit = limit;
    this.windowMs = windowMs;
    this.hits = new Map();
  }

  /** Counts one attempt for `key`. Returns 0 if allowed, else the seconds to wait. */
  hit(key) {
    const now = Date.now();
    let record = this.hits.get(key);
    if (!record || record.resetAt <= now) {
      record = { count: 0, resetAt: now + this.windowMs };
      this.hits.set(key, record);
    }
    record.count += 1;
    return record.count > this.limit ? Math.ceil((record.resetAt - now) / 1000) : 0;
  }

  reset(key) {
    this.hits.delete(key);
  }

  sweep() {
    const now = Date.now();
    for (const [key, record] of this.hits) if (record.resetAt <= now) this.hits.delete(key);
  }
}

/* ==========================================================================
   HTTP helpers
   ========================================================================== */
class HttpError extends Error {
  constructor(status, code, headers = {}) {
    super(code);
    this.status = status;
    this.code = code;
    this.headers = headers;
  }
}

function send(res, status, body, headers = {}) {
  const payload = body === undefined ? '' : JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',              // personal data: never cached
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    ...headers,
  });
  res.end(payload);
}

/** Reads a JSON body (at most MAX_BODY bytes). */
function readJson(req) {
  return new Promise((resolve, reject) => {
    const type = String(req.headers['content-type'] || '');
    if (!type.startsWith('application/json')) {
      reject(new HttpError(415, 'bad_request'));
      return;
    }
    let size = 0;
    let tooLarge = false;
    const chunks = [];
    req.on('data', (chunk) => {
      if (tooLarge) return; // ignore the rest; the connection is closed after the reply
      size += chunk.length;
      if (size > MAX_BODY) {
        tooLarge = true;
        chunks.length = 0;
        reject(new HttpError(413, 'too_large', { Connection: 'close' }));
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (tooLarge) return;
      try {
        const value = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
        if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('not an object');
        resolve(value);
      } catch (error) {
        reject(new HttpError(400, 'bad_request'));
      }
    });
    req.on('error', reject);
  });
}

function clientIp(req) {
  if (config.trustProxy && req.headers['x-forwarded-for']) {
    return String(req.headers['x-forwarded-for']).split(',')[0].trim();
  }
  return req.socket.remoteAddress || 'unknown';
}

/**
 * CORS: the page may be hosted on another site (e.g. GitHub Pages) than the
 * API. Only the origins listed in ALLOWED_ORIGINS may then call it.
 */
function corsHeaders(req) {
  const origin = req.headers.origin;
  if (!origin || !config.allowedOrigins.includes(origin)) return {};
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Max-Age': '600',
    Vary: 'Origin',
  };
}

/* ==========================================================================
   The API
   ========================================================================== */
function createApi(store) {
  const authLimiter = new RateLimiter(20, 15 * 60 * 1000);    // sign-up/sign-in attempts per IP
  const accountLimiter = new RateLimiter(10, 15 * 60 * 1000); // failed sign-ins per username
  const syncLimiter = new RateLimiter(120, 60 * 1000);        // syncs per account per minute
  const sweeper = setInterval(() => {
    authLimiter.sweep();
    accountLimiter.sweep();
    syncLimiter.sweep();
    removeExpiredSessions();
  }, 10 * 60 * 1000);
  sweeper.unref();

  function removeExpiredSessions() {
    const now = Date.now();
    let changed = false;
    for (const [hash, session] of Object.entries(store.data.sessions)) {
      if (Date.parse(session.expiresAt) <= now) {
        delete store.data.sessions[hash];
        changed = true;
      }
    }
    if (changed) store.save();
  }
  removeExpiredSessions();

  function limit(limiter, key) {
    const wait = limiter.hit(key);
    if (wait) throw new HttpError(429, 'rate_limited', { 'Retry-After': String(wait) });
  }

  async function createSession(user) {
    const token = crypto.randomBytes(32).toString('base64url');
    const now = new Date();
    store.data.sessions[tokenHash(token)] = {
      userId: user.id,
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + config.sessionDays * 86400000).toISOString(),
    };
    await store.save();
    return token;
  }

  /** The signed-in user, from the "Authorization: Bearer <token>" header. */
  function authenticate(req) {
    const match = /^Bearer ([A-Za-z0-9_-]{20,200})$/.exec(String(req.headers.authorization || ''));
    if (!match) throw new HttpError(401, 'unauthorized');
    const hash = tokenHash(match[1]);
    const session = store.data.sessions[hash];
    if (!session || Date.parse(session.expiresAt) <= Date.now()) throw new HttpError(401, 'unauthorized');
    const user = Object.values(store.data.users).find((u) => u.id === session.userId);
    if (!user) throw new HttpError(401, 'unauthorized');
    return { user, sessionHash: hash };
  }

  function checkCredentials(body) {
    const username = typeof body.username === 'string' ? body.username.trim() : '';
    const password = typeof body.password === 'string' ? body.password : '';
    if (!USERNAME.test(username)) throw new HttpError(400, 'invalid_username');
    if (password.length < PASSWORD_MIN || password.length > PASSWORD_MAX) throw new HttpError(400, 'invalid_password');
    return { username, password, key: username.toLowerCase() };
  }

  const publicUser = (user) => ({ username: user.username, createdAt: user.createdAt });

  const routes = {
    'GET /api/health': async () => ({ status: 200, body: { ok: true, service: 'compliment-generator-sync', version: 1 } }),

    'POST /api/register': async (req) => {
      limit(authLimiter, clientIp(req));
      const { username, password, key } = checkCredentials(await readJson(req));
      if (password.toLowerCase() === key) throw new HttpError(400, 'invalid_password');
      if (store.data.users[key]) throw new HttpError(409, 'username_taken');
      const passwordHash = await hashPassword(password);
      if (store.data.users[key]) throw new HttpError(409, 'username_taken'); // taken while hashing
      const user = { id: crypto.randomUUID(), username, password: passwordHash, createdAt: new Date().toISOString() };
      store.data.users[key] = user;
      store.data.favorites[user.id] = { entries: [], updatedAt: user.createdAt };
      const token = await createSession(user);
      return { status: 201, body: { token, user: publicUser(user) } };
    },

    'POST /api/login': async (req) => {
      limit(authLimiter, clientIp(req));
      const body = await readJson(req);
      const username = typeof body.username === 'string' ? body.username.trim() : '';
      const password = typeof body.password === 'string' ? body.password : '';
      const key = username.toLowerCase();
      if (!username || !password || password.length > PASSWORD_MAX) throw new HttpError(401, 'wrong_credentials');
      limit(accountLimiter, key);
      const user = store.data.users[key];
      const ok = await verifyPassword(password, user ? user.password : dummyHash);
      if (!user || !ok) throw new HttpError(401, 'wrong_credentials'); // same answer either way
      accountLimiter.reset(key);
      const token = await createSession(user);
      return { status: 200, body: { token, user: publicUser(user) } };
    },

    'POST /api/logout': async (req) => {
      const { sessionHash } = authenticate(req);
      delete store.data.sessions[sessionHash];
      await store.save();
      return { status: 204 };
    },

    'GET /api/account': async (req) => {
      const { user } = authenticate(req);
      const favorites = store.data.favorites[user.id] || { entries: [] };
      return { status: 200, body: { user: publicUser(user), favorites: favorites.entries.filter((e) => !e.removed).length } };
    },

    'DELETE /api/account': async (req) => {
      const { user } = authenticate(req);
      const body = await readJson(req);
      limit(accountLimiter, user.username.toLowerCase());
      if (typeof body.password !== 'string' || !(await verifyPassword(body.password, user.password))) {
        throw new HttpError(403, 'wrong_password');
      }
      // Everything about this person goes: the account, the favorites, every session.
      delete store.data.users[user.username.toLowerCase()];
      delete store.data.favorites[user.id];
      for (const [hash, session] of Object.entries(store.data.sessions)) {
        if (session.userId === user.id) delete store.data.sessions[hash];
      }
      await store.save();
      return { status: 204 };
    },

    'GET /api/favorites': async (req) => {
      const { user } = authenticate(req);
      const favorites = store.data.favorites[user.id] || { entries: [], updatedAt: null };
      return { status: 200, body: favorites };
    },

    // The one sync call: the device sends everything it has (favorites and
    // removals), the server merges it with what it has, keeps the result and
    // sends it back. Safe to repeat, and works in any order.
    'POST /api/favorites/sync': async (req) => {
      const { user } = authenticate(req);
      limit(syncLimiter, user.id);
      const body = await readJson(req);
      const current = store.data.favorites[user.id] || { entries: [] };
      const merged = mergeEntries(current.entries, body.entries);
      if (!merged) throw new HttpError(400, 'bad_request');
      const changed = JSON.stringify(merged) !== JSON.stringify(current.entries);
      const result = { entries: merged, updatedAt: changed ? new Date().toISOString() : current.updatedAt || new Date().toISOString() };
      store.data.favorites[user.id] = result;
      if (changed) await store.save();
      return { status: 200, body: result };
    },
  };

  async function handle(req, res, pathname) {
    const cors = corsHeaders(req);
    if (req.method === 'OPTIONS') {
      res.writeHead(204, cors);
      res.end();
      return;
    }
    const route = routes[`${req.method} ${pathname}`];
    try {
      if (!route) {
        const known = Object.keys(routes).some((r) => r.endsWith(` ${pathname}`));
        throw new HttpError(known ? 405 : 404, known ? 'method_not_allowed' : 'not_found');
      }
      const { status, body } = await route(req);
      send(res, status, body, cors);
    } catch (error) {
      if (error instanceof HttpError) {
        send(res, error.status, { error: error.code }, { ...cors, ...error.headers });
      } else {
        console.error(error);
        send(res, 500, { error: 'server_error' }, cors);
      }
    }
  }

  return { handle, close: () => clearInterval(sweeper) };
}

/* ==========================================================================
   The app's own files (so one server gives the page and its API)
   ========================================================================== */
// Only these are served: never server/ (the data lives there) or anything else.
const PUBLIC_FILES = new Set(['index.html', 'favicon.png', 'manifest.webmanifest', 'sw.js']);
const PUBLIC_DIRS = ['css/', 'js/', 'images/'];
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json', '.json': 'application/json',
};

function serveFile(req, res, pathname) {
  let relative;
  try {
    relative = decodeURIComponent(pathname).replace(/^\/+/, '') || 'index.html';
  } catch (error) {
    relative = '';
  }
  const allowed = PUBLIC_FILES.has(relative) || PUBLIC_DIRS.some((dir) => relative.startsWith(dir));
  const file = path.resolve(APP_DIR, relative);
  if (!allowed || relative.includes('..') || !file.startsWith(APP_DIR + path.sep) || (req.method !== 'GET' && req.method !== 'HEAD')) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
    return;
  }
  fs.stat(file, (error, stat) => {
    if (error || !stat.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found');
      return;
    }
    res.writeHead(200, {
      'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream',
      'Content-Length': stat.size,
      'Cache-Control': 'no-cache', // the service worker handles offline copies
      'X-Content-Type-Options': 'nosniff',
    });
    if (req.method === 'HEAD') res.end();
    else fs.createReadStream(file).pipe(res);
  });
}

/* ==========================================================================
   Start
   ========================================================================== */
function createServer(options = {}) {
  Object.assign(config, options);
  const store = new Store(config.dataDir);
  const api = createApi(store);
  const server = http.createServer((req, res) => {
    const { pathname } = new URL(req.url, 'http://localhost');
    if (pathname === '/api' || pathname.startsWith('/api/')) api.handle(req, res, pathname);
    else if (config.serveApp) serveFile(req, res, pathname);
    else send(res, 404, { error: 'not_found' });
  });
  server.on('close', () => api.close());
  server.store = store;
  return server;
}

if (require.main === module) {
  const server = createServer();
  server.listen(config.port, config.host, () => {
    const shown = config.host === '0.0.0.0' ? 'localhost' : config.host;
    console.log(`Compliment Generator sync server: http://${shown}:${config.port}/`);
    console.log(`Data: ${path.join(config.dataDir, 'db.json')}`);
  });
  // Finish writing before stopping (Ctrl+C, or the host restarting the app).
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => {
      server.close();
      server.store.queue.finally(() => process.exit(0));
    });
  }
}

module.exports = { createServer };
