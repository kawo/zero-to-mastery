/*
 * Scoundrel: lifetime record and run history.
 *
 * Its own LocalStorage key again — your record should survive a corrupt save,
 * a version bump, or starting a fresh run.
 *
 * A finished run is recorded exactly once. The guard lives on the game state
 * (`state.recorded`), not in here, because the state is what gets saved: if you
 * finish a run, close the tab and come back, the end screen shows again but the
 * run must not be counted twice.
 *
 * Streaks count wins in a row and reset on a loss. Rows keep the seed, so any
 * past run can be dealt again from the history list.
 *
 * Exposed as window.ScoundrelStats.
 */
(() => {
  'use strict';

  const C = window.ScoundrelConfig;
  const KEY = 'scoundrel:stats:v1';

  const EMPTY = {
    version: 1,
    games: 0,
    wins: 0,
    losses: 0,
    bestScore: null,
    bestSeed: null,
    currentStreak: 0,
    longestStreak: 0,
    totalTurns: 0,
    history: [],
  };

  let cache = null;
  let warned = false;

  function warn(err) {
    if (warned) return;
    warned = true;
    console.warn('[Scoundrel] stats are not persisting:', err);
  }

  function load() {
    if (cache) return cache;
    cache = { ...EMPTY, history: [] };
    try {
      const raw = window.localStorage.getItem(KEY);
      if (raw) {
        const saved = JSON.parse(raw);
        if (saved && saved.version === EMPTY.version) {
          cache = { ...EMPTY, ...saved };
          if (!Array.isArray(cache.history)) cache.history = [];
        }
      }
    } catch (err) {
      warn(err);
    }
    return cache;
  }

  function persist() {
    try {
      window.localStorage.setItem(KEY, JSON.stringify(cache));
    } catch (err) {
      warn(err);
    }
  }

  /**
   * Fold a finished run into the record.
   * @param {object} state a state with status 'won' or 'lost'
   * @returns {object|null} the updated stats, or null if the run did not count
   */
  function record(state) {
    if (!state || (state.status !== 'won' && state.status !== 'lost')) return null;
    const s = load();
    const won = state.status === 'won';

    s.games += 1;
    s.totalTurns += state.turn || 0;
    if (won) {
      s.wins += 1;
      s.currentStreak += 1;
      if (s.currentStreak > s.longestStreak) s.longestStreak = s.currentStreak;
    } else {
      s.losses += 1;
      s.currentStreak = 0;
    }

    // Best score is across every run: a win is always positive and a loss
    // always negative, so the comparison works without special-casing.
    if (s.bestScore === null || state.score > s.bestScore) {
      s.bestScore = state.score;
      s.bestSeed = state.seed;
    }

    s.history.unshift({
      seed: state.seed,
      preset: state.preset || C.DEFAULT_PRESET,
      status: state.status,
      score: state.score,
      health: state.health,
      turns: state.turn,
      killer: state.killer ? `${state.killer.suit}${state.killer.label}` : null,
      at: Date.now(),
    });
    if (s.history.length > C.HISTORY_LIMIT) s.history.length = C.HISTORY_LIMIT;

    persist();
    return all();
  }

  const all = () => {
    const s = load();
    return { ...s, history: s.history.slice() };
  };

  /** Wins as a percentage, or null before the first finished run. */
  const winRate = () => {
    const s = load();
    return s.games ? (s.wins / s.games) * 100 : null;
  };

  function reset() {
    cache = { ...EMPTY, history: [] };
    persist();
  }

  window.ScoundrelStats = Object.freeze({ record, all, winRate, reset });
})();
