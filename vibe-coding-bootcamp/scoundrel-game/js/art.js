/*
 * Scoundrel: card artwork, drawn as inline SVG.
 *
 * Every face is built the same way: a large open suit outline, and an emblem
 * sitting inside it. Both live in the same 100x100 box so they always register,
 * and both are stroked with currentColor so CSS owns the palette (including
 * the per-type tints and the focus/disabled states).
 *
 * No <img>, no sprite sheet: the deck has to work from file:// with nothing
 * fetched, and inline paths scale to any card size without blurring.
 *
 * Exposed as window.ScoundrelArt.
 */
(() => {
  'use strict';

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
   * Emblems
   *
   * Each is a fragment drawn in the same 100x100 box. Strokes are round-joined
   * so they read as ink rather than geometry. Filled shapes use `class="ink"`
   * (solid) or `class="ink-soft"` (a wash) so themes stay in one place.
   * ------------------------------------------------------------------ */

  const EMBLEM = {
    /* --- monsters, in ascending order of "oh no" --- */

    vermin:
      '<path d="M30 52c0-9 9-16 20-16s20 7 20 16c0 12-9 20-20 24-11-4-20-12-20-24Z"/>'
      + '<circle cx="31" cy="38" r="8"/><circle cx="69" cy="38" r="8"/>'
      + '<circle class="ink" cx="42" cy="52" r="2.6" stroke="none"/>'
      + '<circle class="ink" cx="58" cy="52" r="2.6" stroke="none"/>'
      + '<path d="M50 62v5M44 70h12"/>'
      + '<path d="M22 64 8 70M22 70l-13 3M78 64l14 6M78 70l13 3"/>',

    wolf:
      '<path d="M27 40 31 14l16 14M73 40 69 14 53 28"/>'
      + '<path d="M27 38c0 26 10 43 23 50 13-7 23-24 23-50"/>'
      + '<path class="ink" d="M36 45l11 5-11 3Z" stroke="none"/>'
      + '<path class="ink" d="M64 45l-11 5 11 3Z" stroke="none"/>'
      + '<path class="ink" d="M50 60l-6 6h12Z" stroke="none"/>'
      + '<path d="M40 74c4 4 16 4 20 0"/>'
      + '<path d="M43 72l2 5M50 73v5M57 72l-2 5"/>',

    goblin:
      '<path d="M34 44c0-13 7-22 16-22s16 9 16 22c0 15-7 26-16 31-9-5-16-16-16-31Z"/>'
      + '<path d="M34 42 14 32l20 6M66 42l20-10-20 6"/>'
      + '<path class="ink" d="M39 46h8l-8 4Z" stroke="none"/>'
      + '<path class="ink" d="M61 46h-8l8 4Z" stroke="none"/>'
      + '<path d="M50 54v6"/><path d="M42 68c5 3 11 3 16 0"/>'
      + '<path d="M28 78c-4 6-6 12-6 18M72 78c4 6 6 12 6 18"/>',

    wraith:
      '<path d="M31 96c-5-34 1-64 19-64s24 30 19 64Z"/>'
      + '<path class="ink-soft" d="M31 96c-5-34 1-64 19-64s24 30 19 64Z" stroke="none"/>'
      + '<path class="ink" d="M40 47h7v4h-7ZM53 47h7v4h-7Z" stroke="none"/>'
      + '<path d="M44 34v58M50 32v64M56 34v58" stroke-opacity=".45"/>'
      + '<path d="M28 66c-6 2-9 8-7 14M72 66c6 2 9 8 7 14"/>',

    knight:
      '<path d="M34 44c0-13 7-22 16-22s16 9 16 22v20c0 9-7 16-16 16s-16-7-16-16Z"/>'
      + '<path d="M50 14v10M34 48h32"/>'
      + '<path class="ink" d="M39 42h9v5h-9ZM52 42h9v5h-9Z" stroke="none"/>'
      + '<path d="M44 56h12M42 64h16M46 72h8"/>'
      + '<path d="M24 60l-8-10 4 16-6 4M76 60l8-10-4 16 6 4"/>',

    skull:
      '<path d="M30 48c0-14 9-24 20-24s20 10 20 24c0 8-3 12-3 17 0 4-4 6-8 6H41c-4 0-8-2-8-6 0-5-3-9-3-17Z"/>'
      + '<circle class="ink" cx="40" cy="47" r="7" stroke="none"/>'
      + '<circle class="ink" cx="60" cy="47" r="7" stroke="none"/>'
      + '<path class="ink" d="M50 55l-4 8h8Z" stroke="none"/>'
      + '<path d="M40 68h20M45 68v7M50 68v7M55 68v7"/>'
      + '<path d="M38 30c4-4 8-6 12-6" stroke-opacity=".5"/>'
      + '<path d="M22 84c-4 0-8-3-8-7M78 84c4 0 8-3 8-7"/>',

    dragon:
      '<path d="M33 36c0-10 7-18 17-18s17 8 17 18c0 14-7 24-17 36-10-12-17-22-17-36Z"/>'
      + '<path d="M33 32 22 8l6 22M67 32 78 8l-6 22"/>'
      + '<path class="ink" d="M40 40l9 4-9 4Z" stroke="none"/>'
      + '<path class="ink" d="M60 40l-9 4 9 4Z" stroke="none"/>'
      + '<path d="M46 56h8M44 62h12"/>'
      + '<path d="M45 66l2 6 3-5 3 5 2-6"/>'
      + '<path d="M21 56l8-4-6 12 8-2M79 56l-8-4 6 12-8-2"/>',

    /* --- weapons, hung point-down like a trophy --- */

    dagger:
      '<path d="M50 92 43 52h14Z"/>'
      + '<path d="M32 50h36"/>'
      + '<path d="M46 50V26h8v24"/>'
      + '<circle cx="50" cy="20" r="6"/>'
      + '<path d="M50 60v22" stroke-opacity=".4"/>',

    axe:
      '<path d="M47 24h6v66h-6Z"/>'
      + '<path d="M47 32C31 32 22 41 20 54c9 7 18 7 27 2Z"/>'
      + '<path d="M53 32c16 0 25 9 27 22-9 7-18 7-27 2Z"/>'
      + '<path d="M50 10v14"/>'
      + '<path d="M44 90h12l-6 8Z"/>'
      + '<path d="M30 44c5-2 9-2 13 0M70 44c-5-2-9-2-13 0" stroke-opacity=".45"/>',

    crossbow:
      '<path d="M12 44C28 30 72 30 88 44"/>'
      + '<path d="M12 44h76"/>'
      + '<path d="M46 30h8v62h-8Z"/>'
      + '<path d="M50 12v18M50 12l-5 8h10Z"/>'
      + '<path d="M38 56h24"/>'
      + '<path d="M46 70h8M46 78h8" stroke-opacity=".45"/>',

    sword:
      '<path d="M50 96 42 44h16Z"/>'
      + '<path d="M28 42h44"/>'
      + '<path d="M30 34c8 0 14 3 20 8 6-5 12-8 20-8"/>'
      + '<path d="M46 42V22h8v20"/>'
      + '<path d="M44 20c0-5 3-8 6-8s6 3 6 8Z"/>'
      + '<path d="M50 52v38" stroke-opacity=".35"/>',

    /* --- potion --- */

    flask:
      '<path d="M43 30h14v12l13 22c5 9-2 19-11 19H41c-9 0-16-10-11-19l13-22Z"/>'
      + '<path class="ink-soft" d="M34 62h32c2 7-3 13-9 13H43c-6 0-11-6-9-13Z" stroke="none"/>'
      + '<path d="M40 24h20v7H40Z"/>'
      + '<path d="M34 62h32" stroke-opacity=".5"/>'
      + '<path d="M66 28c7-3 3-10 8-14M72 34c6-2 3-8 7-11" stroke-opacity=".6"/>'
      + '<circle cx="46" cy="70" r="2.5" stroke-opacity=".5"/>'
      + '<circle cx="56" cy="67" r="1.8" stroke-opacity=".5"/>',
  };

  /* ------------------------------------------------------------------ *
   * Public builders
   * ------------------------------------------------------------------ */

  /**
   * The front artwork: suit outline + emblem, sized to the card.
   * @param {object} card a card from ScoundrelConfig.makeCard
   */
  function face(card) {
    return `<svg class="art" viewBox="0 0 100 100" aria-hidden="true" focusable="false">
      <g class="art__suit">${SUIT_SHAPE[card.suit]}</g>
      <g class="art__emblem">${EMBLEM[card.emblem] || ''}</g>
    </svg>`;
  }

  /**
   * The card back: a drafted ornament. Deliberately symmetric so a face-down
   * card reads as "nothing known yet" at any size.
   */
  function back() {
    return `<svg class="art art--back" viewBox="0 0 100 140" aria-hidden="true" focusable="false">
      <g class="back__frame">
        <rect x="5" y="5" width="90" height="130" rx="3"/>
        <rect x="9.5" y="9.5" width="81" height="121" rx="2"/>
        <path d="M50 14 86 70 50 126 14 70Z"/>
        <path d="M50 24 78 70 50 116 22 70Z"/>
      </g>
      <g class="back__motif">
        <path d="M50 44c-9 6-14 14-14 22s6 14 14 18c8-4 14-10 14-18s-5-16-14-22Z"/>
        <path d="M50 52v36M36 70h28"/>
        <circle cx="50" cy="70" r="6"/>
        <path d="M14 70 5 70M86 70h9M50 14V5M50 126v9"/>
        <path d="M20 20h10M20 20v10M80 20H70M80 20v10M20 120h10M20 120v-10M80 120H70M80 120v-10"/>
      </g>
      <g class="back__stars">
        <circle cx="26" cy="38" r="1"/><circle cx="74" cy="34" r=".8"/>
        <circle cx="30" cy="104" r=".8"/><circle cx="70" cy="110" r="1"/>
        <circle cx="50" cy="32" r=".7"/><circle cx="50" cy="112" r=".7"/>
      </g>
    </svg>`;
  }

  /** An inline suit glyph for the HUD / log, same drafted outlines. */
  function glyph(suit, size = 14) {
    return `<svg class="glyph" width="${size}" height="${size}" viewBox="0 0 100 100" aria-hidden="true" focusable="false"><g>${SUIT_SHAPE[suit]}</g></svg>`;
  }

  window.ScoundrelArt = Object.freeze({ face, back, glyph });
})();
