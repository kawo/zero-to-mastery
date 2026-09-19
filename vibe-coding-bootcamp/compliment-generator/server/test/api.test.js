// Tests for the sync server. Run from the compliment-generator folder:
//   node --test "server/test/*.test.js"
// Each test file gets its own server on a free port and a temporary data folder.
'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createServer } = require('../server.js');
const { mergeEntries } = require('../../js/sync.js');

let server;
let base;
let dataDir;

async function start() {
  server = createServer({ dataDir, serveApp: true, allowedOrigins: ['https://allowed.example'] });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
}

async function stop() {
  await new Promise((resolve) => server.close(resolve));
  await server.store.queue;
}

before(async () => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cg-sync-'));
  await start();
});

after(async () => {
  await stop();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

/** Calls the API; returns { status, body, headers }. */
async function call(method, route, { body, token, headers = {} } = {}) {
  const res = await fetch(base + route, {
    method,
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null, headers: res.headers };
}

const entry = (en, minutesAgo = 0, extra = {}) => ({
  type: 'joke', en, updated: new Date(Date.now() - minutesAgo * 60000).toISOString(), ...extra,
});

/* ---------- Shared merge rules ---------- */
test('merge: the latest change wins, removals included', () => {
  const merged = mergeEntries(
    [entry('A', 10), entry('B', 5)],
    [entry('A', 2, { removed: true }), entry('B', 8, { removed: true }), entry('C', 1)],
  );
  const byText = Object.fromEntries(merged.map((e) => [e.en, e]));
  assert.equal(byText.A.removed, true, 'A removed after it was added');
  assert.equal(byText.B.removed, undefined, 'B re-added after the old removal');
  assert.equal(merged[0].en, 'C', 'newest first');
});

test('merge: invalid entries dropped, future dates pulled back, oversized lists refused', () => {
  const future = new Date(Date.now() + 365 * 86400000).toISOString();
  const merged = mergeEntries([
    { type: 'poem', en: 'x', updated: new Date().toISOString() },
    { type: 'joke', en: '', updated: new Date().toISOString() },
    { type: 'joke', en: 'ok', updated: 'not a date' },
    { type: 'joke', en: 'future', updated: future },
  ]);
  assert.equal(merged.length, 1);
  assert.ok(Date.parse(merged[0].updated) <= Date.now() + 5 * 60000 + 1000);
  assert.equal(mergeEntries(new Array(2001).fill(entry('x'))), null);
  assert.equal(mergeEntries('nope'), null);
});

/* ---------- Health and static files ---------- */
test('health check identifies the service', async () => {
  const { status, body, headers } = await call('GET', '/api/health');
  assert.equal(status, 200);
  assert.equal(body.service, 'compliment-generator-sync');
  assert.equal(headers.get('cache-control'), 'no-store');
});

test('serves the app, but never the server folder or its data', async () => {
  for (const [route, expected] of [['/', 200], ['/js/sync.js', 200], ['/manifest.webmanifest', 200],
    ['/server/server.js', 404], ['/server/data/db.json', 404], ['/README.md', 404], ['/js/../server/server.js', 404],
    ['/%2e%2e/%2e%2e/etc/passwd', 404], ['/js/%2e%2e/server/data/db.json', 404]]) {
    const res = await fetch(base + route);
    assert.equal(res.status, expected, route);
  }
  assert.match((await fetch(`${base}/`)).headers.get('content-type'), /text\/html/);
});

/* ---------- Accounts ---------- */
let token;

test('register: validates the username and the password', async () => {
  for (const [username, password, code] of [
    ['ab', 'long enough', 'invalid_username'],
    ['has space', 'long enough', 'invalid_username'],
    ['sunny-otter', 'short', 'invalid_password'],
    ['sunny-otter', 'Sunny-Otter', 'invalid_password'], // password = username
  ]) {
    const { status, body } = await call('POST', '/api/register', { body: { username, password } });
    assert.equal(status, 400, `${username}/${password}`);
    assert.equal(body.error, code);
  }
});

test('register: creates the account and a session; no personal data asked or returned', async () => {
  const { status, body } = await call('POST', '/api/register', { body: { username: 'Sunny-Otter', password: 'correct horse battery' } });
  assert.equal(status, 201);
  assert.equal(typeof body.token, 'string');
  assert.deepEqual(Object.keys(body.user).sort(), ['createdAt', 'username']);
  token = body.token;
});

test('register: usernames are unique, whatever the case', async () => {
  const { status, body } = await call('POST', '/api/register', { body: { username: 'sunny-OTTER', password: 'another password' } });
  assert.equal(status, 409);
  assert.equal(body.error, 'username_taken');
});

test('stored data: password hashed with scrypt, session token only as a hash', async () => {
  await server.store.queue;
  const raw = fs.readFileSync(path.join(dataDir, 'db.json'), 'utf8');
  assert.ok(!raw.includes('correct horse battery'), 'no plain password');
  assert.ok(!raw.includes(token), 'no plain session token');
  assert.match(JSON.parse(raw).users['sunny-otter'].password, /^scrypt\$16384\$8\$1\$/);
});

test('login: right password works (any username case), wrong one gets the same answer as an unknown user', async () => {
  const good = await call('POST', '/api/login', { body: { username: 'SUNNY-otter', password: 'correct horse battery' } });
  assert.equal(good.status, 200);
  assert.notEqual(good.body.token, token, 'a new session per sign-in');
  const wrong = await call('POST', '/api/login', { body: { username: 'sunny-otter', password: 'wrong password' } });
  const unknown = await call('POST', '/api/login', { body: { username: 'nobody-here', password: 'wrong password' } });
  assert.equal(wrong.status, 401);
  assert.deepEqual(wrong.body, unknown.body);
});

test('protected routes need a valid token', async () => {
  for (const t of [undefined, 'not-a-real-token-0123456789', `${token}x`]) {
    const { status, body } = await call('GET', '/api/favorites', { token: t });
    assert.equal(status, 401);
    assert.equal(body.error, 'unauthorized');
  }
  assert.equal((await call('GET', '/api/account', { token })).body.user.username, 'Sunny-Otter');
});

/* ---------- Sync ---------- */
test('sync: two devices, offline changes, everyone converges', async () => {
  const second = (await call('POST', '/api/login', { body: { username: 'sunny-otter', password: 'correct horse battery' } })).body.token;

  // Device 1 adds A and B
  let res = await call('POST', '/api/favorites/sync', { token, body: { entries: [entry('A', 30), entry('B', 20)] } });
  assert.deepEqual(res.body.entries.map((e) => e.en), ['B', 'A']);

  // Device 2 (had nothing) receives them, then removes A and adds C
  res = await call('POST', '/api/favorites/sync', { token: second, body: { entries: [] } });
  assert.deepEqual(res.body.entries.map((e) => e.en), ['B', 'A']);
  res = await call('POST', '/api/favorites/sync', { token: second, body: { entries: [...res.body.entries.filter((e) => e.en !== 'A'), entry('A', 5, { removed: true }), entry('C', 4)] } });

  // Device 1, which still has its old copy (A active, added 30 min ago), syncs: A stays removed
  res = await call('POST', '/api/favorites/sync', { token, body: { entries: [entry('A', 30), entry('B', 20)] } });
  const active = res.body.entries.filter((e) => !e.removed).map((e) => e.en);
  assert.deepEqual(active, ['C', 'B']);
  assert.ok(res.body.entries.find((e) => e.en === 'A').removed);
});

test('sync: rejects bad input without changing anything', async () => {
  const before = (await call('GET', '/api/favorites', { token })).body;
  assert.equal((await call('POST', '/api/favorites/sync', { token, body: { entries: 'nope' } })).status, 400);
  // Just under the body size limit, but more entries than allowed
  assert.equal((await call('POST', '/api/favorites/sync', { token, body: { entries: new Array(2001).fill({ type: 'joke', en: 'x', updated: '2026-01-01T00:00:00.000Z' }) } })).status, 400);
  // Over the body size limit (256 KB)
  const huge = await call('POST', '/api/favorites/sync', { token, body: { entries: new Array(2001).fill(entry("x".repeat(200))) } });
  assert.equal(huge.status, 413);
  assert.equal(huge.body.error, 'too_large');
  assert.equal((await call('POST', '/api/favorites/sync', { token, body: '{broken' })).status, 400);
  assert.equal((await call('POST', '/api/favorites/sync', { token, body: 'x', headers: { 'Content-Type': 'text/plain' } })).status, 415);
  assert.deepEqual((await call('GET', '/api/favorites', { token })).body, before);
});

test('data survives a restart', async () => {
  await stop();
  await start();
  const { status, body } = await call('GET', '/api/favorites', { token });
  assert.equal(status, 200);
  assert.deepEqual(body.entries.filter((e) => !e.removed).map((e) => e.en), ['C', 'B']);
});

/* ---------- CORS ---------- */
test('CORS: only listed origins get access headers', async () => {
  const allowed = await fetch(`${base}/api/health`, { headers: { Origin: 'https://allowed.example' } });
  assert.equal(allowed.headers.get('access-control-allow-origin'), 'https://allowed.example');
  const other = await fetch(`${base}/api/health`, { headers: { Origin: 'https://evil.example' } });
  assert.equal(other.headers.get('access-control-allow-origin'), null);
  const preflight = await fetch(`${base}/api/favorites/sync`, { method: 'OPTIONS', headers: { Origin: 'https://allowed.example', 'Access-Control-Request-Method': 'POST' } });
  assert.equal(preflight.status, 204);
  assert.match(preflight.headers.get('access-control-allow-headers'), /Authorization/);
});

/* ---------- Sign out, delete ---------- */
test('logout ends only that session', async () => {
  const other = (await call('POST', '/api/login', { body: { username: 'sunny-otter', password: 'correct horse battery' } })).body.token;
  assert.equal((await call('POST', '/api/logout', { token: other })).status, 204);
  assert.equal((await call('GET', '/api/account', { token: other })).status, 401);
  assert.equal((await call('GET', '/api/account', { token })).status, 200);
});

test('delete account: needs the password, then removes everything', async () => {
  const wrong = await call('DELETE', '/api/account', { token, body: { password: 'nope nope nope' } });
  assert.equal(wrong.status, 403);
  const ok = await call('DELETE', '/api/account', { token, body: { password: 'correct horse battery' } });
  assert.equal(ok.status, 204);
  assert.equal((await call('GET', '/api/account', { token })).status, 401);
  await server.store.queue;
  const data = JSON.parse(fs.readFileSync(path.join(dataDir, 'db.json'), 'utf8'));
  assert.deepEqual(data.users, {});
  assert.deepEqual(data.favorites, {});
  assert.deepEqual(data.sessions, {});
  // The name can be used again
  assert.equal((await call('POST', '/api/register', { body: { username: 'sunny-otter', password: 'a brand new one' } })).status, 201);
});

/* ---------- Rate limiting ---------- */
test('rate limiting: repeated failed sign-ins for one username are slowed down', async () => {
  let last;
  for (let i = 0; i < 11; i++) {
    last = await call('POST', '/api/login', { body: { username: 'target-user', password: `guess number ${i}` } });
  }
  assert.equal(last.status, 429);
  assert.equal(last.body.error, 'rate_limited');
  assert.ok(Number(last.headers.get('retry-after')) > 0);
});

test('unknown routes and methods', async () => {
  assert.equal((await call('GET', '/api/nothing')).status, 404);
  assert.equal((await call('GET', '/api/login')).status, 405);
});
