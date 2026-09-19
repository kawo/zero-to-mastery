/* ==========================================================================
   Compliment Generator: favorites sync rules (shared)
   --------------------------------------------------------------------------
   Used by the page (js/script.js) and by the sync server (server/server.js),
   so both sides merge favorites the same way.

   A favorite is sent as an "entry":
     { type: 'compliment' | 'joke', en: '<English text>', updated: '<ISO date>' }
   and a removed favorite as the same thing with `removed: true` (a
   "tombstone"). Keeping removals is what lets a favorite deleted on one
   device disappear from the others, instead of coming back at the next sync.

   Merging keeps, for each item, the most recent change: added or removed,
   whichever happened last wins. So devices can change favorites offline and
   sync later, in any order, and all end up with the same list.
   ========================================================================== */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(); // Node (the server)
  else root.FavoritesSync = factory();                                          // browser
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const TYPES = ['compliment', 'joke'];
  const MAX_ENTRIES = 2000;       // far more than the 200 items there are, with room for edits
  const MAX_TEXT = 1000;          // longest allowed text, in characters
  const MAX_CLOCK_AHEAD = 5 * 60 * 1000; // a date in the future is pulled back to "now + 5 min"

  /** The identity of an item, as in the page: its type and its English text. */
  const keyOf = (entry) => `${entry.type}:${entry.en}`;

  /**
   * Checks one entry and returns a clean copy, or null if it isn't valid.
   * Dates too far in the future (a device with a wrong clock) are pulled back,
   * so they can't win every merge from then on.
   */
  function cleanEntry(raw, now = Date.now()) {
    if (!raw || typeof raw !== 'object') return null;
    if (!TYPES.includes(raw.type)) return null;
    if (typeof raw.en !== 'string' || !raw.en || raw.en.length > MAX_TEXT) return null;
    const time = Date.parse(raw.updated);
    if (!Number.isFinite(time)) return null;
    const entry = {
      type: raw.type,
      en: raw.en,
      updated: new Date(Math.min(time, now + MAX_CLOCK_AHEAD)).toISOString(),
    };
    if (raw.removed === true) entry.removed = true;
    return entry;
  }

  /** The more recent of two versions of the same item (a removal wins a tie). */
  function newer(a, b) {
    const ta = Date.parse(a.updated);
    const tb = Date.parse(b.updated);
    if (ta !== tb) return ta > tb ? a : b;
    return a.removed ? a : b;
  }

  /**
   * Merges any number of entry lists into one: one entry per item, the most
   * recent change of each. Invalid entries are dropped. The result is sorted
   * newest first. Returns null if a list isn't a list or is too long.
   */
  function mergeEntries(...lists) {
    const now = Date.now();
    const byKey = new Map();
    for (const list of lists) {
      if (!Array.isArray(list) || list.length > MAX_ENTRIES) return null;
      for (const raw of list) {
        const entry = cleanEntry(raw, now);
        if (!entry) continue;
        const key = keyOf(entry);
        const existing = byKey.get(key);
        byKey.set(key, existing ? newer(existing, entry) : entry);
      }
    }
    if (byKey.size > MAX_ENTRIES) return null;
    return [...byKey.values()].sort((a, b) => Date.parse(b.updated) - Date.parse(a.updated));
  }

  return { keyOf, cleanEntry, mergeEntries, MAX_ENTRIES, MAX_TEXT };
}));
