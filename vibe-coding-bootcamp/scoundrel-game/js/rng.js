/*
 * Scoundrel: seedable randomness.
 *
 * The dungeon order is decided once, at deal time, from a seed string. Keeping
 * the seed in the save is what makes "Restart dungeon" replay the exact same
 * 44 cards — useful for practising a run you narrowly lost, and for bug reports.
 *
 * Exposed as window.ScoundrelRng.
 */
(() => {
  'use strict';

  /**
   * xmur3: string -> 32-bit seed. Lets players type "goblin" as a seed.
   */
  function hashSeed(str) {
    let h = 1779033703 ^ str.length;
    for (let i = 0; i < str.length; i += 1) {
      h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
      h = (h << 13) | (h >>> 19);
    }
    return () => {
      h = Math.imul(h ^ (h >>> 16), 2246822507);
      h = Math.imul(h ^ (h >>> 13), 3266489909);
      h ^= h >>> 16;
      return h >>> 0;
    };
  }

  /**
   * mulberry32: small, fast, good enough for a card game.
   * @param {string|number} seed
   * @returns {() => number} float in [0, 1)
   */
  function make(seed) {
    let a = hashSeed(String(seed))();
    return function next() {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /**
   * Fisher–Yates, walking from the end and swapping with a random earlier slot.
   * Returns a new array; the input is left alone.
   */
  function shuffle(list, rand) {
    const out = list.slice();
    for (let i = out.length - 1; i > 0; i -= 1) {
      const j = Math.floor(rand() * (i + 1));
      const tmp = out[i];
      out[i] = out[j];
      out[j] = tmp;
    }
    return out;
  }

  /** A short, pronounceable-ish seed for a fresh run. */
  function randomSeed() {
    const n = (typeof crypto !== 'undefined' && crypto.getRandomValues)
      ? crypto.getRandomValues(new Uint32Array(1))[0]
      : Math.floor(Math.random() * 0xffffffff);
    return n.toString(36).toUpperCase().padStart(7, '0');
  }

  window.ScoundrelRng = Object.freeze({ make, shuffle, randomSeed });
})();
