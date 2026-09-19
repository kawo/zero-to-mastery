/*
 * Reflex Lab: verified leaderboard with client-side anti-cheat.
 *
 * An entry is a player's best average over 5 valid reactions in a row. Every
 * run keeps its evidence (the 5 rounds: scheduled delay, actual delay, input
 * type, clocks…). That evidence is checked when the run is submitted AND
 * replayed every time the leaderboard is displayed, so editing saved data
 * after the fact doesn't help.
 *
 * Runs are also sealed with an HMAC whose key is a non-extractable Web Crypto
 * key kept in IndexedDB: the page can sign with it but can't read it, so
 * editing localStorage breaks the seal.
 *
 * Honest limit: all of this runs in the player's browser. It stops casual
 * cheating (editing saved data, scripted clicks, simple bots, clock hacks);
 * a determined expert with devtools can still get around it. A trusted,
 * global leaderboard needs a server.
 *
 * Exposed as window.ReflexLabLeaderboard.
 */
(() => {
  'use strict';

  const KEY = 'reflexlab.board.v1';
  const VERSION = 1;
  const RUN_LENGTH = 5;
  const MAX_REJECTED = 10;

  // Human limits and tolerances. Deliberately conservative: a real person
  // should never be flagged; only machine-like runs are.
  const LIMITS = Object.freeze({
    minSpreadMs: 5,       // standard deviation over 5 reactions; people vary by 20–40 ms
    minAverageMs: 140,    // a 5-round average this low is beyond human visual reaction
    frameLockTolMs: 0.6,  // "on a screen refresh" means within this of a frame boundary
    clockDriftMs: 60,     // performance.now() vs Date.now() over one round
    delaySlackMs: 350,    // timer + next-frame wait can make the stimulus land this late
    maxClockResMs: 2,     // coarser timers (anti-fingerprinting modes) can't rank fairly
  });

  // Reason codes → text shown to players.
  const REASONS = Object.freeze({
    synthetic: 'Scripted input: not a real click, tap or key press.',
    hidden: 'The page wasn’t visible and focused during the round.',
    impossible: 'A reaction time the game can’t have measured.',
    timing: 'The round timing doesn’t match the game’s own schedule.',
    clock: 'The timing functions were tampered with (clock drift).',
    regular: 'Too regular to be human: under 5 ms of spread over 5 reactions.',
    fast: 'Implausibly fast: a 5-round average under 140 ms.',
    frameLocked: 'Every reaction lands exactly on a screen refresh, like a bot watching the pixels.',
    mismatch: 'The stored scores don’t match the recorded reactions.',
    seal: 'The saved data was edited after the run was recorded.',
    unsigned: 'The signing key is gone (site data was partly cleared), so this run can’t be checked.',
    coarseClock: 'This browser rounds its timer too coarsely (over 2 ms) to rank times fairly. Privacy modes such as “resist fingerprinting” do this.',
  });

  let cfg = { minDelayMs: 1000, maxDelayMs: 5000, anticipationMs: 100, timeoutMs: 3000 };
  function configure(config) {
    cfg = { ...cfg, ...config };
  }

  /* ---------- Checks (pure functions) ---------- */
  const round1 = (v) => Math.round(v * 10) / 10;

  function runStats(rounds) {
    const times = rounds.map((r) => r.ms);
    const n = times.length;
    const mean = times.reduce((a, b) => a + b, 0) / n;
    const sd = Math.sqrt(times.reduce((a, t) => a + (t - mean) ** 2, 0) / Math.max(1, n - 1));
    return { mean, sd, best: Math.min(...times) };
  }

  /** Problems with a single round's evidence (reason codes). */
  function checkRound(r) {
    const codes = [];
    const num = (v) => typeof v === 'number' && Number.isFinite(v);
    if (!r || !num(r.ms) || !num(r.delay) || !num(r.actualDelay) || !num(r.perfSpan) || !num(r.wallSpan)) {
      return ['mismatch'];
    }
    // Checked first: with a coarse timer, the statistical checks below would
    // wrongly look like a bot, so this gives the honest reason instead.
    if (!(typeof r.clockRes === 'number' && r.clockRes <= LIMITS.maxClockResMs)) return ['coarseClock'];
    if (r.trusted !== true) codes.push('synthetic');
    if (r.visible !== true || r.focused !== true) codes.push('hidden');
    if (r.ms < cfg.anticipationMs || r.ms > cfg.timeoutMs) codes.push('impossible');
    const delayInRange = r.delay >= cfg.minDelayMs - 1 && r.delay <= cfg.maxDelayMs + 1;
    const landedOnTime = r.actualDelay >= r.delay - 2 && r.actualDelay <= r.delay + LIMITS.delaySlackMs;
    if (!delayInRange || !landedOnTime) codes.push('timing');
    if (r.nativeClock !== true || Math.abs(r.perfSpan - r.wallSpan) > LIMITS.clockDriftMs) codes.push('clock');
    // By construction: round start → stimulus → input. The parts must add up.
    if (Math.abs(r.perfSpan - (r.actualDelay + r.ms)) > 1) codes.push('mismatch');
    return codes;
  }

  /** Check a whole run: every round, then human-plausibility statistics. */
  function checkRun(rounds) {
    if (!Array.isArray(rounds) || rounds.length !== RUN_LENGTH) {
      return { codes: ['mismatch'], mean: NaN, sd: NaN, best: NaN };
    }
    const codes = new Set();
    rounds.forEach((r) => checkRound(r).forEach((c) => codes.add(c)));
    if (codes.has('mismatch')) return { codes: [...codes], mean: NaN, sd: NaN, best: NaN };
    if (codes.has('coarseClock')) return { codes: ['coarseClock'], ...runStats(rounds) };

    const stats = runStats(rounds);
    if (stats.sd < LIMITS.minSpreadMs) codes.add('regular');
    if (stats.mean < LIMITS.minAverageMs) codes.add('fast');
    // A bot reacting to pixels answers on frame boundaries. For a person, all
    // five landing within 0.6 ms of one is roughly a one-in-a-million chance.
    const locked = rounds.every((r) => {
      if (!(r.frameMs > 4)) return false;
      const rem = r.ms % r.frameMs;
      return Math.min(rem, r.frameMs - rem) <= LIMITS.frameLockTolMs;
    });
    if (locked) codes.add('frameLocked');
    return { codes: [...codes], ...stats };
  }

  /* ---------- Sealing: HMAC with a non-extractable key in IndexedDB ---------- */
  let keyPromise = null;

  function idbRequest(req) {
    return new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function loadOrCreateKey() {
    const subtle = window.crypto && window.crypto.subtle;
    if (!subtle || !window.indexedDB) return null;
    const open = window.indexedDB.open('reflexlab', 1);
    open.onupgradeneeded = () => open.result.createObjectStore('keys');
    const db = await idbRequest(open);
    try {
      const read = db.transaction('keys', 'readonly').objectStore('keys');
      let record = await idbRequest(read.get('board-hmac'));
      if (!record || !record.key) {
        const key = await subtle.generateKey({ name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
        record = { key, id: `k${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}` };
        const write = db.transaction('keys', 'readwrite').objectStore('keys');
        await idbRequest(write.put(record, 'board-hmac'));
      }
      return record;
    } finally {
      db.close();
    }
  }

  /** { key, id } or null when this browser can't sign (no Web Crypto / IndexedDB). */
  function getKey() {
    if (!keyPromise) {
      keyPromise = loadOrCreateKey().catch((err) => {
        console.warn('[Reflex Lab] leaderboard signing unavailable', err);
        return null;
      });
    }
    return keyPromise;
  }

  // Everything that matters for the score, in a fixed order.
  function canonical(e) {
    return JSON.stringify([
      e.id, e.profileId, e.name, e.avg, e.best, e.level, e.at, e.keyId,
      e.rounds.map((r) => [r.ms, r.delay, r.actualDelay, r.trusted, r.input, r.visible,
        r.focused, r.frameMs, r.perfSpan, r.wallSpan, r.nativeClock, r.clockRes]),
    ]);
  }

  const toB64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
  const fromB64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

  async function sign(record, entry) {
    const data = new TextEncoder().encode(canonical(entry));
    return toB64(await window.crypto.subtle.sign('HMAC', record.key, data));
  }

  async function verifySeal(record, entry) {
    try {
      const data = new TextEncoder().encode(canonical(entry));
      return await window.crypto.subtle.verify('HMAC', record.key, fromB64(entry.seal), data);
    } catch (err) {
      return false;
    }
  }

  /* ---------- Storage ---------- */
  function emptyBoard() {
    return { version: VERSION, best: {}, rejected: [] };
  }

  // Only the shape is repaired here (so bad data can't crash the page). Values
  // are left untouched on purpose: the replay check has to see any tampering.
  function loadBoard() {
    try {
      const raw = JSON.parse(window.localStorage.getItem(KEY) || 'null');
      if (!raw || raw.version !== VERSION) return emptyBoard();
      const isEntry = (e) => e && typeof e === 'object' && typeof e.profileId === 'string' && Array.isArray(e.rounds);
      const best = {};
      if (raw.best && typeof raw.best === 'object') {
        for (const [id, e] of Object.entries(raw.best)) if (isEntry(e)) best[id] = e;
      }
      const rejected = Array.isArray(raw.rejected) ? raw.rejected.filter(isEntry).slice(0, MAX_REJECTED) : [];
      return { version: VERSION, best, rejected };
    } catch (err) {
      return emptyBoard();
    }
  }

  function saveBoard(board) {
    try {
      window.localStorage.setItem(KEY, JSON.stringify(board));
      return true;
    } catch (err) {
      return false;
    }
  }

  /* ---------- Public API ---------- */

  /** The player's current best average (unverified quick look), or null. */
  function currentBest(profileId) {
    const e = loadBoard().best[profileId];
    return e && typeof e.avg === 'number' ? e.avg : null;
  }

  /**
   * Submit a run of 5 rounds. Only runs that would beat the player's current
   * entry are considered. Returns { status: 'verified' | 'rejected' | 'not-better',
   * reasons, avg, rank, sealed }.
   */
  async function submitRun({ profileId, name, level, rounds }) {
    const check = checkRun(rounds);
    const avg = round1(check.mean);
    const current = currentBest(profileId);
    if (current !== null && !(avg < current)) return { status: 'not-better', avg };

    const entry = {
      id: `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
      profileId,
      name,
      avg,
      best: round1(check.best),
      level,
      at: new Date().toISOString(),
      rounds: rounds.map((r) => ({ ...r })),
    };

    if (check.codes.length) {
      const board = loadBoard();
      board.rejected.unshift({ ...entry, reasons: check.codes });
      board.rejected.length = Math.min(board.rejected.length, MAX_REJECTED);
      saveBoard(board);
      return { status: 'rejected', reasons: check.codes, avg };
    }

    const record = await getKey();
    entry.keyId = record ? record.id : null;
    entry.seal = record ? await sign(record, entry) : null;

    const board = loadBoard(); // re-read: another tab may have written meanwhile
    board.best[profileId] = entry;
    saveBoard(board);
    const rank = Object.values(board.best).filter((e) => typeof e.avg === 'number' && e.avg < avg).length + 1;
    return { status: 'verified', reasons: [], avg, rank, sealed: !!record };
  }

  /**
   * Re-check every entry (replay + seal) and split them into verified rows,
   * sorted by average, and excluded rows with their reasons.
   */
  async function list() {
    const board = loadBoard();
    const record = await getKey();
    const rows = await Promise.all(Object.values(board.best).map(async (e) => {
      const check = checkRun(e.rounds);
      const codes = new Set(check.codes);
      // Replay: the stored score must be exactly what the rounds add up to.
      if (!codes.has('mismatch') && (e.avg !== round1(check.mean) || e.best !== round1(check.best))) codes.add('mismatch');
      if (record) {
        if (!e.seal || !e.keyId) codes.add('seal');
        else if (e.keyId !== record.id) codes.add('unsigned');
        else if (!(await verifySeal(record, e))) codes.add('seal');
      }
      return { ...e, reasons: [...codes], sealed: !!record && !!e.seal };
    }));
    const verified = rows.filter((r) => r.reasons.length === 0).sort((a, b) => a.avg - b.avg || a.at.localeCompare(b.at));
    const excluded = [
      ...rows.filter((r) => r.reasons.length > 0),
      ...board.rejected.map((r) => ({ ...r, reasons: Array.isArray(r.reasons) ? r.reasons : ['mismatch'] })),
    ].sort((a, b) => String(b.at).localeCompare(String(a.at)));
    return { verified, excluded, sealing: !!record };
  }

  /** Forget a player's runs (when their profile is deleted). */
  function removeProfile(profileId) {
    const board = loadBoard();
    delete board.best[profileId];
    board.rejected = board.rejected.filter((e) => e.profileId !== profileId);
    saveBoard(board);
  }

  /** True if a function is the browser's own (not replaced from devtools). */
  function isNative(fn) {
    try {
      return typeof fn === 'function' && /\{\s*\[native code\]\s*\}\s*$/.test(Function.prototype.toString.call(fn));
    } catch (err) {
      return false;
    }
  }

  window.ReflexLabLeaderboard = Object.freeze({
    KEY, RUN_LENGTH, LIMITS, REASONS,
    configure, checkRound, checkRun, submitRun, list, removeProfile, currentBest, isNative, getKey,
  });
})();
