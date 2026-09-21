/*
 * Scoundrel: the rules engine.
 *
 * Pure game logic — this file never touches the DOM and never reads the clock
 * except to stamp log entries. The UI calls an action, the engine mutates the
 * state object and appends to the chronicle, the UI re-renders from scratch.
 *
 * STATE SHAPE (all JSON-safe, so it round-trips through LocalStorage as is)
 *
 *   seed        string    the dungeon's identity; replaying it deals the same 44 cards
 *   deck        Card[]    index 0 is the top of the deck, push() puts a card underneath
 *   room        Slot[]    up to 4 slots, kept in dealt order; { card, done, dealtOn }
 *   discard     Card[]    spent potions, monsters killed bare-handed, retired weapons
 *   health      number    0–20
 *   weapon      null | { card, lastSlain: number|null, stack: Card[] }
 *   turn        number    rooms entered, counting avoided ones
 *   resolved    number    cards resolved in the CURRENT room (0–3)
 *   potionUsed  boolean   has a potion already worked this room
 *   avoidedLast boolean   was the previous room avoided (blocks a second avoid)
 *   status      'playing' | 'won' | 'lost'
 *   score       null | number
 *   killer      null | Card    the monster that finished you, kept for scoring
 *   log         Entry[]   { text, kind, turn }
 *
 * A note on `room`: resolved cards stay in the array with done = true until the
 * room ends. That keeps the four slots visually stable while you work through
 * them, and makes "the card you didn't play carries forward" a filter rather
 * than bookkeeping.
 *
 * Exposed as window.ScoundrelEngine.
 */
(() => {
  'use strict';

  const C = window.ScoundrelConfig;
  const RNG = window.ScoundrelRng;

  /* ------------------------------------------------------------------ *
   * Small helpers
   * ------------------------------------------------------------------ */

  const pending = (state) => state.room.filter((slot) => !slot.done);
  const cardText = (card) => `${card.suit}${card.label}`;

  /**
   * Append to the chronicle. Entries carry a monotonic id so the renderer can
   * append only what is new — which is what keeps the aria-live region from
   * re-announcing the whole history every time you play a card.
   */
  function log(state, text, kind = 'info') {
    state.logSeq = (state.logSeq || 0) + 1;
    state.log.push({ id: state.logSeq, text, kind, turn: state.turn });
    if (state.log.length > C.LOG_LIMIT) state.log.splice(0, state.log.length - C.LOG_LIMIT);
  }

  /* ------------------------------------------------------------------ *
   * Setting up
   * ------------------------------------------------------------------ */

  /**
   * Deal a fresh dungeon.
   * @param {string} [seed] omit for a random one; pass one to replay a dungeon
   */
  function create(seed) {
    const usedSeed = String(seed == null || seed === '' ? RNG.randomSeed() : seed);
    const state = {
      version: C.SAVE_VERSION,
      seed: usedSeed,
      deck: RNG.shuffle(C.buildDeck(), RNG.make(usedSeed)),
      room: [],
      discard: [],
      health: C.MAX_HEALTH,
      weapon: null,
      turn: 0,
      resolved: 0,
      potionUsed: false,
      avoidedLast: false,
      status: 'playing',
      score: null,
      killer: null,
      log: [],
      logSeq: 0,
      startedAt: Date.now(),
    };
    log(state, `You step into the dungeon. 44 cards, seed ${usedSeed}.`, 'start');
    beginRoom(state);
    return state;
  }

  /** Deal the same dungeon again from the top. */
  function replay(state) {
    return create(state.seed);
  }

  /* ------------------------------------------------------------------ *
   * Rooms
   * ------------------------------------------------------------------ */

  /** Top up the room to four cards, or to whatever the deck has left. */
  function fill(state) {
    while (pending(state).length < C.ROOM_SIZE && state.deck.length > 0) {
      state.room.push({ card: state.deck.shift(), done: false, dealtOn: state.turn });
    }
  }

  /**
   * Close the current room and open the next one. The card left unresolved (if
   * any) stays in place and becomes the first card of the new room.
   */
  function beginRoom(state) {
    state.turn += 1;
    state.resolved = 0;
    state.potionUsed = false;
    state.room = pending(state); // drop the spent slots, keep the carry-over
    fill(state);

    if (state.room.length === 0) {
      // Nothing carried, nothing left to deal: the dungeon is empty.
      win(state);
      return;
    }

    const carried = state.room.filter((slot) => slot.dealtOn < state.turn).length;
    log(
      state,
      carried > 0
        ? `Room ${state.turn}. ${cardText(state.room[0].card)} followed you in.`
        : `Room ${state.turn}. Four cards face up.`,
      'room',
    );
  }

  /**
   * May the room be avoided right now?
   *
   * Three gates: you cannot avoid twice running, you cannot avoid once you have
   * touched a card, and you cannot avoid a short room at the end of the deck —
   * there is nowhere left to push the cards to.
   */
  function canAvoid(state) {
    return state.status === 'playing'
      && !state.avoidedLast
      && state.resolved === 0
      && pending(state).length === C.ROOM_SIZE;
  }

  /** Slide the whole room under the deck, in order, and deal a new one. */
  function avoid(state) {
    if (!canAvoid(state)) return false;

    const cards = pending(state).map((slot) => slot.card);
    state.deck.push(...cards); // in order: the room reappears intact, much later
    state.room = [];
    state.avoidedLast = true;

    log(state, `Avoided the room — ${cards.map(cardText).join(' ')} slid under the deck.`, 'avoid');
    beginRoom(state);
    return true;
  }

  /* ------------------------------------------------------------------ *
   * The weapon rule
   * ------------------------------------------------------------------ */

  /**
   * Can the equipped weapon legally be swung at this monster?
   *
   * A fresh weapon fights anything. After that it is capped by the last monster
   * it slew and the cap only ever falls.
   *
   *   Equip ♦7 (cap: none)
   *     → ♠10 allowed, take 3, cap becomes 10
   *     → ♣10 allowed (10 <= 10, non-increasing), take 3, cap stays 10
   *     → ♣4  allowed, take 0, cap drops to 4
   *     → ♠9  REFUSED (9 > 4) — fight it bare-handed or leave it for next room
   *
   * With WEAPON_STRICTLY_DECREASING the second step above would be refused too.
   */
  function canUseWeapon(state, card) {
    if (!state.weapon || card.kind !== 'monster') return false;
    const cap = state.weapon.lastSlain;
    if (cap === null) return true;
    return C.WEAPON_STRICTLY_DECREASING ? card.rank < cap : card.rank <= cap;
  }

  /** Damage you would take from this monster, for the given plan. */
  function previewDamage(state, card, mode) {
    if (card.kind !== 'monster') return 0;
    if (mode === 'weapon' && canUseWeapon(state, card)) {
      return Math.max(0, card.rank - state.weapon.card.rank);
    }
    return card.rank;
  }

  /* ------------------------------------------------------------------ *
   * Resolving one card
   * ------------------------------------------------------------------ */

  function hurt(state, amount, source) {
    state.health -= amount;
    if (state.health <= 0) {
      state.health = 0;
      state.killer = source || null;
    }
  }

  function equip(state, card) {
    if (state.weapon) {
      // The old blade and every monster stacked on it leave the table together.
      state.discard.push(state.weapon.card, ...state.weapon.stack);
      log(state, `Dropped ${cardText(state.weapon.card)} and its ${state.weapon.stack.length} trophies.`, 'muted');
    }
    // A new weapon always starts with no history, so its cap is open again.
    state.weapon = { card, lastSlain: null, stack: [] };
    log(state, `Equipped ${cardText(card)} — ${card.name}.`, 'weapon');
  }

  function drink(state, card) {
    if (state.potionUsed) {
      // Rule: one potion per room. The rest are resolved, but wasted — which
      // makes "which three do I play" a real decision when two hearts show up.
      state.discard.push(card);
      log(state, `Poured out ${cardText(card)} — you can only stomach one potion a room.`, 'muted');
      return;
    }
    const before = state.health;
    state.health = Math.min(C.MAX_HEALTH, state.health + card.rank);
    state.potionUsed = true;
    state.discard.push(card);

    const healed = state.health - before;
    log(
      state,
      healed === card.rank
        ? `Drank ${cardText(card)} — healed ${healed}.`
        : `Drank ${cardText(card)} — healed ${healed}, the rest spilled (capped at ${C.MAX_HEALTH}).`,
      'potion',
    );
  }

  function fight(state, card, mode) {
    const withWeapon = mode === 'weapon' && canUseWeapon(state, card);

    if (!withWeapon) {
      state.discard.push(card);
      hurt(state, card.rank, card);
      log(state, `Fought ${cardText(card)} bare-handed — took ${card.rank} damage.`, 'damage');
      return;
    }

    const weapon = state.weapon;
    const damage = Math.max(0, card.rank - weapon.card.rank);
    const slain = C.STACK_ONLY_ON_CLEAN_KILL ? damage === 0 : true;

    if (slain) {
      weapon.stack.push(card);
      weapon.lastSlain = card.rank; // the cap only ever falls from here
    } else {
      state.discard.push(card);
    }
    if (damage > 0) hurt(state, damage, card);

    log(
      state,
      damage === 0
        ? `${cardText(weapon.card)} cut down ${cardText(card)} clean. Blade now capped at ${weapon.lastSlain}.`
        : `${cardText(weapon.card)} killed ${cardText(card)} — took ${damage} damage. Blade now capped at ${weapon.lastSlain}.`,
      damage === 0 ? 'kill' : 'damage',
    );
  }

  /**
   * Play the card in room slot `index`.
   * @param {number} index
   * @param {'weapon'|'bare'} [mode] only meaningful for monsters
   * @returns {boolean} whether anything happened
   */
  function resolve(state, index, mode) {
    if (state.status !== 'playing') return false;
    const slot = state.room[index];
    if (!slot || slot.done) return false;

    const card = slot.card;
    if (card.kind === 'weapon') equip(state, card);
    else if (card.kind === 'potion') drink(state, card);
    else fight(state, card, mode);

    slot.done = true;
    state.resolved += 1;
    // Touching a card means this room was faced, not fled — the next room is
    // avoidable again.
    state.avoidedLast = false;

    afterResolve(state);
    return true;
  }

  /** Death, victory or the next room — in that order of precedence. */
  function afterResolve(state) {
    if (state.health <= 0) {
      lose(state);
      return;
    }
    const left = pending(state).length;

    // The dungeon is only clear when there is nothing face up AND nothing left
    // to deal. This is how the short final room ends the game.
    if (left === 0 && state.deck.length === 0) {
      win(state);
      return;
    }
    if (state.resolved >= C.CARDS_TO_RESOLVE || left === 0) {
      beginRoom(state);
    }
  }

  /* ------------------------------------------------------------------ *
   * Endings
   * ------------------------------------------------------------------ */

  /**
   * Everything still able to hurt you: the undealt deck, the cards you left
   * face up, and the monster that landed the killing blow.
   */
  function remainingMonsterValue(state) {
    const pool = state.deck.concat(pending(state).map((slot) => slot.card));
    if (state.killer) pool.push(state.killer);
    return pool.reduce((sum, card) => (card.kind === 'monster' ? sum + card.rank : sum), 0);
  }

  function win(state) {
    state.status = 'won';
    state.score = state.health; // survived: your score is what you walked out with
    log(state, `The dungeon is empty. You walk out with ${state.health} health. Score ${state.score}.`, 'win');
  }

  function lose(state) {
    state.status = 'lost';
    state.health = 0;
    state.score = -remainingMonsterValue(state);
    log(
      state,
      `${state.killer ? cardText(state.killer) : 'The dungeon'} finishes you. Score ${state.score}.`,
      'lose',
    );
  }

  /* ------------------------------------------------------------------ *
   * Read-only views for the UI
   * ------------------------------------------------------------------ */

  const view = {
    pending,
    cardText,
    /** Cards still face up, with their slot index, for rendering. */
    slots: (state) => state.room,
    monstersLeft: (state) =>
      state.deck.reduce((n, c) => (c.kind === 'monster' ? n + 1 : n), 0),
  };

  window.ScoundrelEngine = Object.freeze({
    create,
    replay,
    avoid,
    canAvoid,
    resolve,
    canUseWeapon,
    previewDamage,
    remainingMonsterValue,
    view,
  });
})();
