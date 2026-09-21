# Scoundrel

A solo dungeon-crawl card game, played with 44 cards and no luck you can blame.
Vanilla HTML, CSS and JavaScript — no framework, no dependencies, no build step.

Open `index.html` and play.

---

## The game

You are alone in a dungeon made of a stripped-down deck of cards. Clear all 44
and you walk out; reach 0 health and you don't.

Every room deals four cards face up. You may **avoid** it — the whole room slides
under the deck and a new one comes up — or **face it**, resolving three of the
four cards in any order. The card you leave behind follows you into the next room.

The game is hard. A beam search solves about **72%** of deals; playing at random
wins essentially never. The tension is that avoiding never removes a card, it only
delays it, and your weapon gets worse every time you use it.

### The dungeon

44 cards — the jokers, the red face cards and the red aces are removed.

| Cards | Meaning | Values |
| --- | --- | --- |
| ♣ and ♠ | 26 monsters | 2–10, J = 11, Q = 12, K = 13, A = 14 |
| ♦2–♦10 | 9 weapons | 2–10 |
| ♥2–♥10 | 9 potions | 2–10 |

### Resolving a card

**Weapon (♦)** — equipped immediately. Your old weapon and every monster stacked
on it are discarded, and the new blade starts with a clean history.

**Potion (♥)** — heals its value, capped at 20. **Only the first potion in a room
has any effect**; a second one resolved in the same room is poured out. Leaving it
as your carry-over card, so you can drink it next room, is often the right play.

**Monster (♣ ♠)** — fight it bare-handed for its full value in damage, or use your
weapon for `monster − weapon` damage (never below zero). Fighting with the weapon
always slays the monster, which is then stacked on the blade.

### The weapon rule

A blade dulls. Once it has slain something it may only be used on monsters **of
that value or lower** — a non-increasing sequence.

> Equip ♦7.
> 1. Fight ♠10 → take `10 − 7 = 3`. The 10 is stacked; the blade is capped at **10**.
> 2. Fight ♣10 → allowed (10 ≤ 10). Take 3 more. Still capped at 10.
> 3. Fight ♣4 → `4 − 7 = −3`, so **0 damage**. The cap drops to **4**.
> 4. A ♠9 appears → the blade refuses it (9 > 4). Take all 9 bare-handed, or leave
>    the 9 as your carry-over card.

Because the cap only ever falls, spending a sharp blade on a small monster is
usually a mistake.

### Scoring

- **Survived** — your score is the health you walked out with (1 to 20).
- **Died** — your score is negative: the total value of every monster still in the
  dungeon, *including the one that killed you*.

---

## Rules this build had to decide

The written rules for Scoundrel are ambiguous in two places. Both are single
constants in [`js/config.js`](js/config.js), so you can flip either and reload.

**`WEAPON_STRICTLY_DECREASING: false`** — the brief specified a *non-increasing*
sequence (a blade capped at 10 may still fight another 10), and that is what
ships. Printed editions of Scoundrel use the stricter *strictly decreasing* rule.
Set it to `true` for the harsher dungeon.

**`STACK_ONLY_ON_CLEAN_KILL: false`** — the brief said a monster is stacked on the
weapon only "if defeated (damage ≤ 0)". Taken literally, a bloody win would leave
the cap untouched, so one good weapon would clear the whole dungeon and the
weapon rule would never bite. This build uses the printed rule instead: swinging
the weapon always slays the monster and always lowers the cap, and you soak the
overflow as damage. Set it to `true` for the literal reading.

---

## Running it

```
open index.html
```

That is the whole install. Everything is relative paths and classic
`<script>` tags, so it runs straight off the filesystem — no server, no bundler.
The only network request is the Google Fonts stylesheet, and the page falls back
to Georgia and system serifs when it is offline.

### Tests

The engine is pure JavaScript with no DOM, so it can be tested in Node with no
test framework — the harness builds a fake `window`, evaluates the browser
modules into it, and exercises the real code.

```
node tests/engine.test.js          # 37 assertions, ~2s
node tests/engine.test.js --full   # adds the beam-search winnability check, ~1 min
```

Covered: deck composition, shuffle bias, the worked weapon example above,
equipping, potion capping and the one-per-room rule, carry-forward, both avoid
restrictions, short final rooms, both scoring paths, and a 4000-game fuzz run
checking that health stays in range, no card is ever lost or duplicated, and no
position can get stuck.

### URL parameters

| Parameter | Effect |
| --- | --- |
| `?seed=goblin` | Deal a specific dungeon (seeds are strings) |
| `?debug=1` | Open the debug panel |

The debug panel (also <kbd>`</kbd>) shows the seed, lets you deal a chosen one,
and can reveal the deck order.

---

## Files

```
index.html              structure: HUD, room, chronicle, controls, modals
css/style.css           the whole theme — tokens, layout, cards, animation, a11y
favicon.svg .png        the spade mark, filled solid so it survives 16px
apple-touch-icon.png    180x180 for iOS home screens
assets/cards/           the eleven card illustrations (2.5 MB total)
js/config.js            rules constants, card tables, art mapping, deck builder
js/rng.js               seeded mulberry32 + Fisher–Yates
js/art.js               card face/back markup + the inline suit outlines
js/storage.js           LocalStorage save/load, wrapped against private mode
js/engine.js            the rules: state, rooms, resolution, scoring (no DOM)
js/ui.js                state → DOM (no rules)
js/app.js               wiring: input, keyboard, persistence
tests/engine.test.js    Node harness for the engine
```

The split that matters is **`engine.js` knows no DOM and `ui.js` knows no rules**.
The engine is a plain function over a JSON-safe state object, which is what makes
it both testable in Node and saveable to LocalStorage without any serialisation
layer.

### State

One object, all JSON-safe:

```js
{
  seed,                    // replaying it deals the same 44 cards
  deck: [Card],            // index 0 is the top; push() puts a card underneath
  room: [{card, done, dealtOn}],
  discard: [Card],
  health, weapon: {card, lastSlain, stack},
  turn, resolved, potionUsed, avoidedLast,
  status: 'playing'|'won'|'lost', score, killer,
  log: [{id, text, kind, turn}]
}
```

Resolved cards stay in `room` with `done: true` until the room ends. That keeps
the four slots visually stable while you work through them, and makes
carry-forward a filter rather than bookkeeping.

---

## Interface

**HUD** — health meter that flashes and shakes on damage, the equipped weapon with
its current cap and slain stack, room/deck/discard counters, and the Avoid button,
which explains *why* it is disabled when it is.

**Room** — four cards that flip in on a stagger. Each monster carries a live damage
badge showing what it would cost you right now, green when the blade kills it for
free. Pressing a monster your weapon can legally take opens an inline
weapon-or-fists prompt with both numbers on it; anything else resolves on press.
A potion that would be wasted is labelled as such before you spend a card on it.

**Chronicle** — a scrollable `role="log"` with `aria-live="polite"`, appending only
new entries so a screen reader announces the thing that just happened rather than
the whole history.

### Accessibility

- Fully keyboard operable: <kbd>1</kbd>–<kbd>4</kbd> cards, <kbd>A</kbd> avoid,
  <kbd>N</kbd> new game, <kbd>R</kbd> restart, <kbd>?</kbd> rules,
  <kbd>Esc</kbd> cancel. A skip link jumps to the room.
- Focus is managed, not dropped: playing a card or avoiding a room moves focus to
  the next playable card, but only when you were already working the keyboard.
  The page never steals focus on load.
- Cards are real buttons with labels that state the card, what it is and what it
  will cost — `"Ace of Spades, Wyrm of Cinders. Monster, strength 14. Press to
  choose: weapon for 4 damage, or bare hands for 14."`
- Native `<dialog>` for modals, so the focus trap and <kbd>Esc</kbd> are the
  browser's rather than a reimplementation.
- `prefers-reduced-motion` turns the flip into an instant state change and stops
  the deal stagger.
- Colour is never the only signal: type is carried by suit, name and label too.

### Visual design

Engraved silver illustrations on near-black. The art files are full card faces —
each carries its own suit outline, starfield and framing — so the only chrome
drawn over them is the rank pips and the name plate, both sitting in the dark
margins the illustrations leave at top and bottom. A two-stop gradient keeps that
text legible without covering any of the drawing.

The illustrations are greyscale, so card type is carried by the frame colour and
the pips rather than by tinting the art. The small suit marks in the HUD, the
pips and the chronicle stay inline SVG, stroked with `currentColor`, so they take
their colour from CSS and stay sharp at any size.

Everything is CSS custom properties on `:root`; the layout is mobile-first, 2×2
room on phones, 4-across from 48rem, and a two-column table from 60rem.

### The artwork

Eleven illustrations cover forty-four cards, so each suit is cut into tiers by
rank and the art escalates with the number:

| Suit | 2–6 | 7–10 | J Q K A |
| --- | --- | --- | --- |
| ♣ Clubs | wolf | hooded wraith | skeleton |
| ♠ Spades | goblin | armoured knight | dragon |

| Suit | 2–4 | 5–7 | 8–10 |
| --- | --- | --- | --- |
| ♦ Diamonds | crossbow | war axe | winged sword |

Hearts use the potion flask throughout, and `deck.png` is the card back. Card
names follow the pictures — a card showing a dragon is not called a spider. The
whole mapping is the `ART` table in [`js/config.js`](js/config.js); re-cutting the
deck means editing that table and nothing else.

**One caveat:** `club-3` is drawn inside a *spade* outline, not a club — the only
file whose frame disagrees with its name. It is used as a club anyway, following
the naming, so low clubs show a spade-shaped frame. Moving it to the spade list
(leaving clubs with two tiers) is a two-line change in that same table.

#### Optimisation

The masters are 864×1184 and total **18.2 MB**, which is far too much to ship for
cards that render a couple of hundred pixels wide. `assets/cards/` holds derived
copies at 432×592, converted to 8-bit greyscale — which the art already was, so
nothing is lost — for **2.45 MB** total. All eleven are preloaded on startup, so
no card ever flips over to an empty rectangle.

The masters are not in the repo. Keep them somewhere outside it; the two files
that were already small enough (`club-3.jpg`, `diamond-2.jpg`) are byte-identical
copies in `assets/cards/`.

---

## Credits

Scoundrel was designed by **Zach Gage** and **Kurt Bieg**. This is an unofficial
implementation, built as a portfolio project.
