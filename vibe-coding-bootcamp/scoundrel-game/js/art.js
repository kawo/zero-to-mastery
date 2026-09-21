/*
 * Scoundrel: card artwork.
 *
 * Card faces and the card back are illustrations from assets/cards/, chosen per
 * card by ScoundrelConfig.artFor(). Eleven files cover all forty-four cards.
 *
 * What stays inline here are the SUIT OUTLINES, drawn from primitives (triangle,
 * circles, trapezoid) rather than one smooth glyph. They are stroked with
 * currentColor, so the small suit marks in the pips, the weapon panel and the
 * chronicle take their colour from CSS and stay sharp at any size.
 *
 * Exposed as window.ScoundrelArt.
 */
(() => {
  'use strict';

  const C = window.ScoundrelConfig;

  /* ------------------------------------------------------------------ *
   * Suit outlines — built from primitives (triangle, circles, trapezoid)
   * rather than one smooth glyph, which is what gives them the engraved,
   * drafted look of an old deck back.
   * ------------------------------------------------------------------ */

  const SUIT_SHAPE = {
    '♦': '<path d="M50 3 97 50 50 97 3 50Z"/>',
    '♥': '<path d="M50 95S5 65 5 38A22.5 22.5 0 0 1 50 28 22.5 22.5 0 0 1 95 38c0 27-45 57-45 57Z"/>',
    '♣': '<circle cx="50" cy="29" r="23"/><circle cx="26" cy="57" r="23"/><circle cx="74" cy="57" r="23"/>'
       + '<path d="M41 69h18l6 27H35Z"/>',
    '♠': '<path d="M50 3 89 57H11Z"/><circle cx="29" cy="62" r="22"/><circle cx="71" cy="62" r="22"/>'
       + '<path d="M42 74h16l5 22H37Z"/>',
  };

  /* ------------------------------------------------------------------ *
   * Public builders
   * ------------------------------------------------------------------ */

  /**
   * The front artwork: the illustration for this card's suit and rank tier.
   *
   * The illustrations are full card faces — they carry their own suit outline,
   * starfield and framing — so the card chrome on top is only the rank pips and
   * the name plate, both of which sit in the empty space the art leaves at the
   * top and bottom.
   *
   * `alt=""` is deliberate: the art is decorative here, and the button around
   * it already carries a label naming the card, what it is and what it costs.
   * A second description would just be read twice.
   *
   * @param {object} card a card from ScoundrelConfig.makeCard
   */
  function face(card) {
    return `<img class="art" src="${card.art}" alt="" draggable="false" decoding="async">`;
  }

  /** The card back: the ornamented deck illustration. */
  function back() {
    return `<img class="art art--back" src="${C.ART_BACK}" alt="" draggable="false" decoding="async">`;
  }

  /**
   * Warm the image cache before the first deal.
   *
   * Eleven files cover all forty-four cards, so one pass here means no card
   * ever flips over to an empty rectangle. Failures are ignored on purpose:
   * a missing file should cost you the picture, not the game.
   */
  function preload() {
    const seen = new Set([C.ART_BACK]);
    for (const tiers of Object.values(C.ART)) {
      for (const [, , file] of tiers) seen.add(C.ART_DIR + file);
    }
    for (const src of seen) {
      const img = new Image();
      img.decoding = 'async';
      img.src = src;
    }
    return seen.size;
  }

  /** An inline suit glyph for the HUD / log, same drafted outlines. */
  function glyph(suit, size = 14) {
    return `<svg class="glyph" width="${size}" height="${size}" viewBox="0 0 100 100" aria-hidden="true" focusable="false"><g>${SUIT_SHAPE[suit]}</g></svg>`;
  }

  window.ScoundrelArt = Object.freeze({ face, back, glyph, preload });
})();
