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
 *   preset      string    which ruleset this run was dealt with
 *   rules       object    the ruleset itself, frozen into the run at deal time
 *   recorded    boolean   set by app.js once the run is folded into the record
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
 *   avoidsUsed  number    rooms fled; potionsDrunk/potionsWasted/monstersSlain likewise
 *   log         Entry[]   { id, key, params, kind, turn } — keys, not sentences
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
   * The ruleset this run was dealt with.
   *
   * Stored on the state so changing the Settings preset never alters a game in
   * progress, and a save always replays by its own rules. Saves written before
   * rulesets existed fall back to the module defaults.
   */
  const rulesOf = (state) => state.rules || {
    weaponStrictlyDecreasing: C.WEAPON_STRICTLY_DECREASING,
    stackOnlyOnCleanKill: C.STACK_ONLY_ON_CLEAN_KILL,
  };

  /**
   * Append to the chronicle.
   *
   * Entries store a translation KEY and its parameters, never rendered text.
   * The engine has no business knowing what language the page is in, and it
   * means switching language re-translates the history you have already
   * written rather than leaving a wall of the old one.
   *
   * Entries also carry a monotonic id so the renderer can append only what is
   * new — which keeps the aria-live region from re-announcing everything each
   * time you play a card.
   */
  function log(state, key, params, kind = 'info') {
    state.logSeq = (state.logSeq || 0) + 1;
    state.log.push({ id: state.logSeq, key, params: params || null, kind, turn: state.turn });
    if (state.log.length > C.LOG_LIMIT) state.log.splice(0, state.log.length - C.LOG_LIMIT);
  }

  /* ------------------------------------------------------------------ *
   * Setting up
   * ------------------------------------------------------------------ */

  /**
   * Deal a fresh dungeon.
   * @param {string} [seed] omit for a random one; pass one to replay a dungeon
   */
  function create(seed, preset) {
    const usedSeed = String(seed == null || seed === '' ? RNG.randomSeed() : seed);
    const presetId = C.PRESETS[preset] ? preset : C.DEFAULT_PRESET;
    const state = {
      version: C.SAVE_VERSION,
      seed: usedSeed,
      preset: presetId,
      rules: C.rulesFor(presetId),
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
      // Tallies for achievements and the end screen. Cheap to keep, and they
      // cannot be reconstructed from the final state.
      avoidsUsed: 0,
      potionsDrunk: 0,
      potionsWasted: 0,
      monstersSlain: 0,
      log: [],
      logSeq: 0,
      startedAt: Date.now(),
    };
    log(state, 'log.start', { seed: usedSeed }, 'start');
    if (presetId !== C.DEFAULT_PRESET) {
      log(state, 'log.ruleset', { preset: presetId }, 'muted');
    }
    beginRoom(state);
    return state;
  }

  /** Deal the same dungeon again from the top, under the same ruleset. */
  function replay(state) {
    return create(state.seed, state.preset);
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
    if (carried > 0) {
      log(state, 'log.roomCarried', { turn: state.turn, card: cardText(state.room[0].card) }, 'room');
    } else {
      log(state, 'log.roomFresh', { turn: state.turn }, 'room');
    }
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
    state.avoidsUsed = (state.avoidsUsed || 0) + 1;

    log(state, 'log.avoided', { cards: cards.map(cardText).join(' ') }, 'avoid');
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
    return rulesOf(state).weaponStrictlyDecreasing ? card.rank < cap : card.rank <= cap;
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
      log(state, 'log.dropped', {
        card: cardText(state.weapon.card), n: state.weapon.stack.length,
      }, 'muted');
    }
    // A new weapon always starts with no history, so its cap is open again.
    state.weapon = { card, lastSlain: null, stack: [] };
    log(state, 'log.equipped', { card: cardText(card), id: card.id, name: card.name }, 'weapon');
  }

  function drink(state, card, outcome) {
    if (state.potionUsed) {
      state.potionsWasted = (state.potionsWasted || 0) + 1;
      // Rule: one potion per room. The rest are resolved, but wasted — which
      // makes "which three do I play" a real decision when two hearts show up.
      state.discard.push(card);
      outcome.wasted = true;
      log(state, 'log.poured', { card: cardText(card) }, 'muted');
      return;
    }
    const before = state.health;
    state.health = Math.min(C.MAX_HEALTH, state.health + card.rank);
    state.potionUsed = true;
    state.potionsDrunk = (state.potionsDrunk || 0) + 1;
    state.discard.push(card);

    const healed = state.health - before;
    outcome.healed = healed;
    if (healed === card.rank) {
      log(state, 'log.drank', { card: cardText(card), n: healed }, 'potion');
    } else {
      log(state, 'log.drankSpill', {
        card: cardText(card), n: healed, max: C.MAX_HEALTH,
      }, 'potion');
    }
  }

  function fight(state, card, mode, outcome) {
    const withWeapon = mode === 'weapon' && canUseWeapon(state, card);

    if (!withWeapon) {
      state.discard.push(card);
      hurt(state, card.rank, card);
      outcome.bareHanded = true;
      outcome.damage = card.rank;
      log(state, 'log.bare', { card: cardText(card), n: card.rank }, 'damage');
      return;
    }

    const weapon = state.weapon;
    const damage = Math.max(0, card.rank - weapon.card.rank);
    const slain = rulesOf(state).stackOnlyOnCleanKill ? damage === 0 : true;

    if (slain) {
      weapon.stack.push(card);
      weapon.lastSlain = card.rank; // the cap only ever falls from here
      state.monstersSlain = (state.monstersSlain || 0) + 1;
    } else {
      state.discard.push(card);
    }
    if (damage > 0) hurt(state, damage, card);

    outcome.withWeapon = true;
    outcome.damage = damage;
    outcome.clean = damage === 0;
    outcome.slain = slain;

    const shared = {
      weapon: cardText(weapon.card), card: cardText(card), cap: weapon.lastSlain,
    };
    if (damage === 0) log(state, 'log.killClean', shared, 'kill');
    else log(state, 'log.killBloody', { ...shared, n: damage }, 'damage');
  }

  /**
   * Play the card in room slot `index`.
   *
   * Returns an outcome describing HOW it resolved — the presentation layer
   * needs that to pick a sound and a particle burst, and achievements need it
   * to spot things like a clean kill that the final state cannot show.
   *
   * @param {number} index
   * @param {'weapon'|'bare'} [mode] only meaningful for monsters
   * @returns {object|null} the outcome, or null if the card could not be played
   */
  function resolve(state, index, mode) {
    if (state.status !== 'playing') return null;
    const slot = state.room[index];
    if (!slot || slot.done) return null;

    const card = slot.card;
    const outcome = {
      card,
      kind: card.kind,
      damage: 0,
      healed: 0,
      withWeapon: false,
      bareHanded: false,
      clean: false,
      slain: false,
      wasted: false,
      equipped: false,
      roomEnded: false,
      turn: state.turn,
    };

    if (card.kind === 'weapon') { equip(state, card); outcome.equipped = true; }
    else if (card.kind === 'potion') drink(state, card, outcome);
    else fight(state, card, mode, outcome);

    slot.done = true;
    state.resolved += 1;
    // Touching a card means this room was faced, not fled — the next room is
    // avoidable again.
    state.avoidedLast = false;

    afterResolve(state);
    outcome.roomEnded = state.turn !== outcome.turn;
    return outcome;
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
    log(state, 'log.win', { n: state.health, score: state.score }, 'win');
  }

  function lose(state) {
    state.status = 'lost';
    state.health = 0;
    state.score = -remainingMonsterValue(state);
    if (state.killer) {
      log(state, 'log.lose', { card: cardText(state.killer), score: state.score }, 'lose');
    } else {
      log(state, 'log.loseDark', { score: state.score }, 'lose');
    }
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
    rulesOf,
    remainingMonsterValue,
    view,
  });
})();
