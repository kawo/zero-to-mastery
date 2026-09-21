/*
 * Scoundrel: player preferences.
 *
 * Kept in its own LocalStorage key, separate from the save. Settings outlive
 * any individual run — clearing a game, or a save written by an older build
 * being discarded, must not cost you your preferences.
 *
 * Every read is defensive: unknown keys are dropped and bad values fall back to
 * the default, so a hand-edited or half-written entry degrades to sane settings
 * rather than breaking startup.
 *
 * Exposed as window.ScoundrelPrefs.
 */
(() => {
  'use strict';

  const C = window.ScoundrelConfig;
  const KEY = 'scoundrel:prefs:v1';

  /**
   * Defaults, and the allowed values for each. `one-of` fields validate against
   * their list; booleans just have to be booleans.
   */
  const SCHEMA = {
    /** Which ruleset new games are dealt with. */
    preset: { value: C.DEFAULT_PRESET, options: Object.keys(C.PRESETS) },
    /**
     * 'system' follows prefers-reduced-motion. The other two override it —
     * the OS setting is not always reachable, and some players want the flip
     * animation off (or on) just here.
     */
    motion: { value: 'system', options: ['system', 'reduced', 'full'] },
    /** The −N damage badges on monsters. Off makes for a harder read. */
    showThreat: { value: true },
    /** One-off teaching notes in the chronicle. */
    coach: { value: true },
    /** Has the welcome been shown. */
    seenWelcome: { value: false },
  };

  const DEFAULTS = Object.fromEntries(
    Object.entries(SCHEMA).map(([k, spec]) => [k, spec.value]),
  );

  let cache = null;
  const listeners = new Set();
  let warned = false;

  function warn(err) {
    if (warned) return;
    warned = true;
    console.warn('[Scoundrel] preferences are not persisting:', err);
  }

  function valid(key, value) {
    const spec = SCHEMA[key];
    if (!spec) return false;
    if (spec.options) return spec.options.includes(value);
    return typeof value === typeof spec.value;
  }

  function load() {
    if (cache) return cache;
    cache = { ...DEFAULTS };
    try {
      const raw = window.localStorage.getItem(KEY);
      if (raw) {
        const saved = JSON.parse(raw);
        for (const [key, value] of Object.entries(saved || {})) {
          if (valid(key, value)) cache[key] = value;
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

  const get = (key) => load()[key];
  const all = () => ({ ...load() });

  function set(key, value) {
    if (!valid(key, value)) return false;
    load();
    if (cache[key] === value) return true;
    cache[key] = value;
    persist();
    for (const fn of listeners) fn(key, value);
    return true;
  }

  function reset() {
    cache = { ...DEFAULTS };
    persist();
    for (const fn of listeners) fn(null, null);
  }

  /** @param {(key: string|null, value: *) => void} fn */
  function onChange(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }

  /**
   * Should motion be suppressed right now?
   * 'system' defers to the OS; the other two are explicit overrides.
   */
  function reduceMotion() {
    const mode = get('motion');
    if (mode === 'reduced') return true;
    if (mode === 'full') return false;
    try {
      return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch {
      return false;
    }
  }

  window.ScoundrelPrefs = Object.freeze({
    DEFAULTS, SCHEMA, get, set, all, reset, onChange, reduceMotion,
  });
})();
