/*
 * Reflex Lab: persistence for player profiles, records and achievements.
 *
 * Everything is stored as one versioned JSON document in localStorage. All
 * reads are validated, because stored data can be edited by hand, truncated,
 * or written by an older version of the game. When storage is blocked
 * (private browsing, strict settings) the game keeps working in memory.
 *
 * Exposed as window.ReflexLabStorage.
 */
(() => {
  'use strict';

  const KEY = 'reflexlab.v1';
  const VERSION = 1;
  const MAX_PROFILES = 8;
  const MAX_NAME = 20;
  const TOP_N = 10;
  const PROFILE_COLORS = Object.freeze(['#10B981', '#3B82F6', '#F59E0B', '#EF4444', '#94A3B8']);

  /** Returns localStorage if it can actually be written to, otherwise null. */
  function detectStorage() {
    try {
      const probe = '__reflexlab_probe__';
      window.localStorage.setItem(probe, '1');
      window.localStorage.removeItem(probe);
      return window.localStorage;
    } catch (err) {
      return null;
    }
  }

  const store = detectStorage();

  /* ---------- Validation helpers ---------- */
  const count = (v) => (Number.isFinite(v) && v > 0 ? Math.floor(v) : 0);
  const positiveOrNull = (v) => (Number.isFinite(v) && v > 0 ? v : null);
  const isoOr = (v, fallback) => (typeof v === 'string' && !Number.isNaN(Date.parse(v)) ? v : fallback);

  function cleanName(name) {
    return String(name == null ? '' : name).replace(/\s+/g, ' ').trim().slice(0, MAX_NAME);
  }

  function newId() {
    return `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  }

  function emptyStats() {
    return {
      attempts: 0,        // valid reactions, all time
      totalMs: 0,         // sum of those reactions, for the lifetime average
      falseStarts: 0,
      missed: 0,
      sessions: 0,
      bestMs: null,       // the high score: fastest single reaction
      bestAvg5: null,     // fastest average over 5 reactions in a row
      peakLevel: 1,
      decoysDodged: 0,
      longestClean: 0,    // most rounds in a row without a false start or miss
    };
  }

  function createProfile(name, color) {
    return {
      id: newId(),
      name: cleanName(name) || 'Player',
      color: PROFILE_COLORS.includes(color) ? color : PROFILE_COLORS[0],
      createdAt: new Date().toISOString(),
      lastPlayedAt: null,
      stats: emptyStats(),
      achievements: {},   // id → ISO date unlocked
      top: [],            // this player's 10 fastest reactions: { ms, level, at }
    };
  }

  function sanitizeProfile(p) {
    if (!p || typeof p !== 'object' || typeof p.id !== 'string' || !p.id) return null;
    const s = p.stats && typeof p.stats === 'object' ? p.stats : {};
    const now = new Date().toISOString();

    const achievements = {};
    if (p.achievements && typeof p.achievements === 'object') {
      for (const [id, at] of Object.entries(p.achievements)) {
        if (typeof at === 'string') achievements[id] = isoOr(at, now);
      }
    }

    const top = Array.isArray(p.top)
      ? p.top
        .filter((e) => e && positiveOrNull(e.ms) !== null)
        .map((e) => ({ ms: e.ms, level: Math.max(1, count(e.level)), at: isoOr(e.at, now) }))
        .sort((a, b) => a.ms - b.ms)
        .slice(0, TOP_N)
      : [];

    return {
      id: p.id,
      name: cleanName(p.name) || 'Player',
      color: PROFILE_COLORS.includes(p.color) ? p.color : PROFILE_COLORS[0],
      createdAt: isoOr(p.createdAt, now),
      lastPlayedAt: p.lastPlayedAt ? isoOr(p.lastPlayedAt, null) : null,
      stats: {
        attempts: count(s.attempts),
        totalMs: Number.isFinite(s.totalMs) && s.totalMs > 0 ? s.totalMs : 0,
        falseStarts: count(s.falseStarts),
        missed: count(s.missed),
        sessions: count(s.sessions),
        bestMs: positiveOrNull(s.bestMs),
        bestAvg5: positiveOrNull(s.bestAvg5),
        peakLevel: Math.max(1, count(s.peakLevel)),
        decoysDodged: count(s.decoysDodged),
        longestClean: count(s.longestClean),
      },
      achievements,
      top,
    };
  }

  function sanitizeState(raw) {
    if (!raw || typeof raw !== 'object' || raw.version !== VERSION) return null;
    const profiles = {};
    const list = raw.profiles && typeof raw.profiles === 'object' ? Object.values(raw.profiles) : [];
    for (const candidate of list) {
      const p = sanitizeProfile(candidate);
      if (p && !profiles[p.id] && Object.keys(profiles).length < MAX_PROFILES) profiles[p.id] = p;
    }
    const ids = Object.keys(profiles);
    if (ids.length === 0) return null;
    return { version: VERSION, activeId: profiles[raw.activeId] ? raw.activeId : ids[0], profiles };
  }

  function freshState() {
    const p = createProfile('Player');
    return { version: VERSION, activeId: p.id, profiles: { [p.id]: p } };
  }

  /* ---------- Public API ---------- */

  /**
   * Load saved data.
   * Returns { state, persistent, notice } where notice is null, 'blocked'
   * (storage unavailable) or 'corrupt' (unreadable data was backed up and replaced).
   */
  function load() {
    if (!store) return { state: freshState(), persistent: false, notice: 'blocked' };
    let raw;
    try {
      raw = store.getItem(KEY);
    } catch (err) {
      return { state: freshState(), persistent: false, notice: 'blocked' };
    }
    if (raw === null) return { state: freshState(), persistent: true, notice: null };

    try {
      const state = sanitizeState(JSON.parse(raw));
      if (state) return { state, persistent: true, notice: null };
    } catch (err) { /* fall through to recovery */ }

    // Unreadable: keep a copy so nothing is lost silently, then start fresh.
    try { store.setItem(`${KEY}.backup`, raw); } catch (err) { /* best effort */ }
    return { state: freshState(), persistent: true, notice: 'corrupt' };
  }

  /** Save the whole state. Returns false if the browser refused (quota, blocked). */
  function save(state) {
    if (!store) return false;
    try {
      store.setItem(KEY, JSON.stringify(state));
      return true;
    } catch (err) {
      console.warn('[Reflex Lab] could not save progress', err);
      return false;
    }
  }

  /** Insert a reaction into a profile's personal top 10. */
  function recordTop(profile, entry) {
    profile.top.push(entry);
    profile.top.sort((a, b) => a.ms - b.ms);
    if (profile.top.length > TOP_N) profile.top.length = TOP_N;
  }

  /** Fastest reactions across every profile on this device. */
  function leaderboard(state, limit = TOP_N) {
    const rows = [];
    for (const p of Object.values(state.profiles)) {
      for (const e of p.top) rows.push({ ...e, profileId: p.id, name: p.name, color: p.color });
    }
    return rows.sort((a, b) => a.ms - b.ms || a.at.localeCompare(b.at)).slice(0, limit);
  }

  /* ---------- Device preferences (audio), kept apart from player data ---------- */
  const PREFS_KEY = 'reflexlab.prefs.v1';
  const DEFAULT_PREFS = Object.freeze({ sfx: true, music: true, volume: 0.7 });

  function loadPrefs() {
    if (!store) return { ...DEFAULT_PREFS };
    try {
      const raw = JSON.parse(store.getItem(PREFS_KEY) || 'null');
      if (!raw || typeof raw !== 'object') return { ...DEFAULT_PREFS };
      return {
        sfx: typeof raw.sfx === 'boolean' ? raw.sfx : DEFAULT_PREFS.sfx,
        music: typeof raw.music === 'boolean' ? raw.music : DEFAULT_PREFS.music,
        volume: Number.isFinite(raw.volume) ? Math.min(1, Math.max(0, raw.volume)) : DEFAULT_PREFS.volume,
      };
    } catch (err) {
      return { ...DEFAULT_PREFS };
    }
  }

  function savePrefs(prefs) {
    if (!store) return false;
    try {
      store.setItem(PREFS_KEY, JSON.stringify(prefs));
      return true;
    } catch (err) {
      return false;
    }
  }

  /** Call `callback` when another tab changes the saved data. */
  function onExternalChange(callback) {
    window.addEventListener('storage', (e) => {
      if (e.key === KEY || e.key === null) callback();
    });
  }

  window.ReflexLabStorage = Object.freeze({
    KEY, MAX_PROFILES, MAX_NAME, PROFILE_COLORS,
    load, save, createProfile, cleanName, recordTop, leaderboard, onExternalChange,
    loadPrefs, savePrefs,
  });
})();
