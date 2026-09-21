/*
 * Scoundrel: tunable rules, card tables and flavour.
 *
 * Everything here is data. The engine reads it and never writes to it, so this
 * file doubles as the place to house-rule the game: change a constant, reload.
 *
 * Exposed as window.ScoundrelConfig.
 */
(() => {
  'use strict';

  /* ------------------------------------------------------------------ *
   * Rules you can turn
   * ------------------------------------------------------------------ */

  const RULES = {
    MAX_HEALTH: 20,
    ROOM_SIZE: 4,
    /** How many of the four room cards you must resolve before moving on. */
    CARDS_TO_RESOLVE: 3,

    /**
     * The weapon rule.
     *
     *   false — non-increasing: a blade capped at 10 may still fight a 10.
     *   true  — strictly decreasing: capped at 10, it may only fight a 9 or less.
     *
     * Non-increasing is the default here. Printed editions of Scoundrel use the
     * strict version, so flip this if you want the harsher dungeon.
     */
    WEAPON_STRICTLY_DECREASING: false,

    /**
     * What happens when you swing at a monster too big for the blade.
     *
     *   false — the monster always dies; you soak the overflow as damage and the
     *           monster is stacked, lowering the cap. (Default, and the printed rule.)
     *   true  — only a clean kill (0 damage) stacks; a bloody win leaves the cap
     *           untouched, which makes one good weapon last the whole dungeon.
     */
    STACK_ONLY_ON_CLEAN_KILL: false,

    /** Potions after the first in a room are poured out. */
    POTIONS_PER_ROOM: 1,

    STORAGE_KEY: 'scoundrel:save:v1',
    SAVE_VERSION: 1,
    /** Chronicle entries kept in memory / in the save. */
    LOG_LIMIT: 120,
  };

  /* ------------------------------------------------------------------ *
   * Cards
   * ------------------------------------------------------------------ */

  const SUITS = {
    '♣': { key: 'clubs', name: 'Clubs', kind: 'monster' },
    '♠': { key: 'spades', name: 'Spades', kind: 'monster' },
    '♦': { key: 'diamonds', name: 'Diamonds', kind: 'weapon' },
    '♥': { key: 'hearts', name: 'Hearts', kind: 'potion' },
  };

  /** Rank 14 is the ace: high, and the nastiest thing in the deck. */
  const RANK_LABEL = { 11: 'J', 12: 'Q', 13: 'K', 14: 'A' };

  const label = (rank) => RANK_LABEL[rank] || String(rank);

  /* Emblem picked by rank so the art escalates as the numbers do. */
  const MONSTER_EMBLEM = (rank) =>
    rank <= 4 ? 'vermin' : rank <= 7 ? 'wolf' : rank <= 10 ? 'goblin'
      : rank === 11 ? 'wraith' : rank === 12 ? 'knight' : rank === 13 ? 'skull' : 'dragon';

  const WEAPON_EMBLEM = (rank) =>
    rank <= 3 ? 'dagger' : rank <= 6 ? 'axe' : rank <= 8 ? 'crossbow' : 'sword';

  /* Two bestiaries so ♣7 and ♠7 do not read as the same creature twice. */
  const LORE = {
    clubs: {
      2: 'Sewer Rat', 3: 'Cave Bat', 4: 'Rot Grub', 5: 'Dire Wolf', 6: 'Moor Hound',
      7: 'Black Lurcher', 8: 'Goblin Cutter', 9: 'Hobgoblin', 10: 'Ogre',
      11: 'The Shrouded', 12: 'Grave Knight', 13: 'Bone Lord', 14: 'Elder Wyrm',
    },
    spades: {
      2: 'Crypt Spider', 3: 'Carrion Crow', 4: 'Grave Worm', 5: 'Winter Wolf', 6: 'Barrow Beast',
      7: 'Ash Stalker', 8: 'Gutter Goblin', 9: 'Fen Troll', 10: 'Cave Giant',
      11: 'The Silent Veil', 12: 'Iron Revenant', 13: 'Pale King', 14: 'Wyrm of Cinders',
    },
    diamonds: {
      2: 'Chipped Knife', 3: 'Rusted Dagger', 4: 'Hand Axe', 5: 'Bearded Axe', 6: 'War Axe',
      7: 'Hunting Crossbow', 8: 'Siege Crossbow', 9: 'Knight’s Sword', 10: 'Falcon Blade',
    },
    hearts: {
      2: 'Sip of Rain', 3: 'Bitter Tonic', 4: 'Field Salve', 5: 'Vial of Mending',
      6: 'Red Draught', 7: 'Cleric’s Flask', 8: 'Elixir of Bone', 9: 'Amber Philtre',
      10: 'Draught of Dawn',
    },
  };

  /* ------------------------------------------------------------------ *
   * Card factory
   * ------------------------------------------------------------------ */

  /**
   * Build one card.
   * @param {'♣'|'♠'|'♦'|'♥'} suit
   * @param {number} rank 2–14
   */
  function makeCard(suit, rank) {
    const meta = SUITS[suit];
    const kind = meta.kind;
    return {
      id: meta.key[0].toUpperCase() + rank, // "S14", "D7", "H3"
      suit,
      suitKey: meta.key,
      suitName: meta.name,
      rank,
      label: label(rank),
      kind,
      name: LORE[meta.key][rank],
      emblem: kind === 'monster' ? MONSTER_EMBLEM(rank)
        : kind === 'weapon' ? WEAPON_EMBLEM(rank) : 'flask',
    };
  }

  /** The 44-card dungeon, unshuffled: 26 monsters, 9 weapons, 9 potions. */
  function buildDeck() {
    const cards = [];
    for (const suit of ['♣', '♠']) {
      for (let rank = 2; rank <= 14; rank += 1) cards.push(makeCard(suit, rank));
    }
    for (let rank = 2; rank <= 10; rank += 1) cards.push(makeCard('♦', rank));
    for (let rank = 2; rank <= 10; rank += 1) cards.push(makeCard('♥', rank));
    return cards;
  }

  window.ScoundrelConfig = Object.freeze({
    ...RULES,
    SUITS,
    RANK_LABEL,
    label,
    makeCard,
    buildDeck,
  });
})();
