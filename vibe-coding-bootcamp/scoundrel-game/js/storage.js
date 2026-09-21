/*
 * Scoundrel: LocalStorage persistence.
 *
 * The whole game state is a plain JSON tree (cards are data, not class
 * instances), so saving is a stringify and loading is a parse plus a version
 * check. Every access is wrapped: private windows, blocked site data and full
 * quotas all throw, and none of them should cost you the game.
 *
 * Exposed as window.ScoundrelStorage.
 */
(() => {
  'use strict';

  const C = window.ScoundrelConfig;
  const KEY = C.STORAGE_KEY;

  let warned = false;

  function warn(err) {
    if (warned) return;
    warned = true;
    console.warn('[Scoundrel] storage unavailable, the run will not survive a reload:', err);
  }

  /** @returns {boolean} whether the write went through */
  function save(state) {
    try {
      window.localStorage.setItem(KEY, JSON.stringify(state));
      return true;
    } catch (err) {
      warn(err);
      return false;
    }
  }

  /**
   * Read the saved run back.
   * @returns {object|null} null when there is nothing usable
   */
  function load() {
    let raw;
    try {
      raw = window.localStorage.getItem(KEY);
    } catch (err) {
      warn(err);
      return null;
    }
    if (!raw) return null;

    try {
      const state = JSON.parse(raw);
      // A save from an older build is not worth migrating for a card game;
      // drop it rather than crash halfway through a render.
      if (!state || state.version !== C.SAVE_VERSION) return null;
      if (!Array.isArray(state.deck) || !Array.isArray(state.room)) return null;
      return state;
    } catch (err) {
      warn(err);
      return null;
    }
  }

  function clear() {
    try {
      window.localStorage.removeItem(KEY);
    } catch (err) {
      warn(err);
    }
  }

  window.ScoundrelStorage = Object.freeze({ save, load, clear });
})();
