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

## Rulesets

The written rules for Scoundrel are ambiguous in two places, so both readings
ship as selectable rulesets in **Settings**:

| Ruleset | The blade may fight… | A bloody win… |
| --- | --- | --- |
| **Standard** (default) | its last kill's value **or lower** | stacks and lowers the cap |
| **Classic** | something **strictly smaller** | stacks and lowers the cap |
| **Relaxed** | its last kill's value or lower | leaves the cap alone |

Classic is the printed rule and the hardest. Relaxed is the literal reading of
the original brief — taken at face value, one good weapon clears the dungeon and
the weapon rule never really bites, which is why it is not the default.

A ruleset is **copied into the run when the dungeon is dealt**, so changing the
setting never alters a game in progress, and a saved game always replays by the
rules it was dealt with. The history list records which ruleset each run used.

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
node tests/engine.test.js          # 124 assertions, ~3s
node tests/engine.test.js --full   # adds the beam-search winnability check, ~1 min
```

Covered: deck composition, shuffle bias, the worked weapon example above,
equipping, potion capping and the one-per-room rule, carry-forward, both avoid
restrictions, short final rooms, both scoring paths, all three rulesets (including
that a run keeps its own rules when the setting changes under it), preference
validation, and the record — streaks, best score, history cap, and that a finished
run counts exactly once.

Also every achievement condition — including the ones that must *not* fire, like
Bare Knuckle when the face card kills you — and the outcome object that sound and
particles are driven from.

Plus a 4000-game fuzz run, cycling all three rulesets, checking that health stays
in range, no card is ever lost or duplicated, and no position can get stuck. The
harness stubs LocalStorage in memory so prefs, stats and trophies are exercised
for real.

Translations are covered structurally rather than by eye: every English key has
a French one and vice versa, the `{placeholders}` match in every pair, all 44
cards and 15 trophies have French, plural selection is asserted in both
languages, and the engine is checked to emit only keys — never rendered text.

Audio and particles are not covered: they are WebAudio and canvas, and testing
them headlessly would test the mock rather than the sound.

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
js/config.js            rules constants, rulesets, card tables, art mapping, deck
js/i18n.js              English and French, plus the data-i18n machinery
js/prefs.js             player settings (own storage key)
js/stats.js             lifetime record and run history (own storage key)
js/achievements.js      trophy definitions and unlock checks
js/audio.js             synthesised sound — oscillators, no audio files
js/particles.js         canvas overlay for sparks, motes and the win shower
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

### Onboarding

A first visit opens a three-point primer — pick three of four, what the suits do,
and that the blade dulls — with a link to the full rules. It is shown once.

After that, teaching happens where a rule actually bites: the first time you
fight bare-handed, equip a blade, cap one, waste a potion or could avoid a room,
a one-off note appears in the chronicle explaining that rule. Each fires once per
browser, and the whole thing is switchable in Settings. Teaching a rule at the
moment it costs you something beats front-loading it into a modal nobody reads
twice.

### Your record

Every finished run is folded into a lifetime record: runs, wins, win rate, best
score, current and longest streak, plus the last 25 runs. Each history row keeps
its seed and ruleset, so any past run can be dealt again from the list — losing a
good dungeon by one card and immediately replaying it is the loop this is here
to serve.

A run is recorded exactly once. The guard lives on the game state rather than in
the stats module, because the state is what gets saved: finish a run, close the
tab, come back, and the end screen shows again — but the run must not count
twice.

### Languages

English and French, switchable in Settings and applied without a reload.

The page detects the browser's language on a first visit and remembers your
choice after that. Static markup is translated through `data-i18n` attributes;
everything built in JavaScript goes through `t(key, params)`.

**The chronicle stores keys, not sentences.** Engine log entries are
`{ key, params }`, rendered at display time — so switching language re-translates
the history you have already written instead of leaving a wall of the old one
above the new. That also keeps the engine free of any notion of language, which
is why it can still be tested in Node with no DOM.

Game data — 44 card names, 15 trophies, 3 rulesets — keeps its English next to
the thing it describes and only the French lives in `i18n.js`, keyed by id. Adding
a card means adding one name in `config.js`, not editing two files in lockstep;
a missing translation falls back to English rather than showing a raw key.

Plurals are handled per language: English pluralises at 1, **French treats 0 as
singular too**. The tests caught a real bug here — the French singular hard-coded
"1 carte", so zero cards read as one.

### Polish

**Sound** is synthesised from oscillators and a noise buffer — there are no
audio files, so the game stays a handful of text files that run from `file://`
with nothing fetched. The palette is dry and low: short percussive hits, minor
intervals, no reverb. Damage is pitched by how hard you were hit; a clean kill
and a costly one deliberately do not sound alike.

It is **off by default**. A game that makes noise uninvited on first load is a
game people mute at the tab level. Browsers also refuse to start an
`AudioContext` before a gesture, so the context is created on first interaction
and every call before that is a silent no-op.

**Particles** are one canvas overlay. Bursts are fired at an element, so callers
pass a card and never think about coordinates, and the animation loop stops
dead when the last particle dies — an idle table costs nothing. Suppressed
entirely under reduced motion, which is exactly what that setting is for.

**Trophies** are fifteen achievements, weighted towards *how* you won rather
than how often: clearing the dungeon without ever avoiding, winning without
drinking, killing an ace with a blade, taking a face card bare-handed and
living. Each is either a one-off condition or a counter with a progress bar.
Unlocks arrive as a toast in a polite live region, so they queue behind whatever
the chronicle just announced rather than talking over it.

Sound, particles and achievements are all driven off the **outcome object** the
engine returns from `resolve()`. The presentation layer is told what happened
rather than re-deriving it from the state — which is the only way to know that a
kill was clean, since the final state cannot show it.

### Leaderboard

The board is **your own top ten, kept in this browser**. There is no global one,
and that is a deliberate limit rather than an omission: a shared board that could
be trusted needs a server to verify runs, and this project has no backend by
design. A client-side board that anyone can edit with devtools is not a
leaderboard, it is decoration.

Every row keeps its seed and ruleset, so a good dungeon can be handed to someone
else — `?seed=…` deals exactly the same 44 cards — which is the closest thing to
competition a static page can honestly offer.

### Storage

Three independent LocalStorage keys, so one being lost or outdated never takes
the others with it:

| Key | Holds |
| --- | --- |
| `scoundrel:save:v1` | the run in progress (or the finished one you last saw) |
| `scoundrel:prefs:v1` | settings |
| `scoundrel:stats:v1` | lifetime record and history |
| `scoundrel:achievements:v1` | unlocked trophies |
| `scoundrel:coached:v1` | which one-off tips have been shown |
| `scoundrel:lang:v1` | the chosen language |

A save from an older build is discarded rather than migrated — but your settings
and your record survive it. Every read is wrapped: private windows, blocked site
data and full quotas all throw, and none of them should cost you the game.
Preferences validate on read, so a hand-edited or half-written value falls back
to its default instead of breaking startup.

### Accessibility

- Fully keyboard operable: <kbd>1</kbd>–<kbd>4</kbd> cards, <kbd>←</kbd>/<kbd>→</kbd>
  (and <kbd>Home</kbd>/<kbd>End</kbd>) to move between playable cards,
  <kbd>A</kbd> avoid, <kbd>N</kbd> new game, <kbd>R</kbd> restart, <kbd>S</kbd>
  settings, <kbd>T</kbd> record, <kbd>?</kbd> rules, <kbd>Esc</kbd> cancel. A skip
  link jumps to the room.
- The room's own label carries progress — "Room 3. 4 cards face up, 1 of 3
  resolved" — so landing on the group tells you where you are without counting.
- Motion is a **setting**, not just an OS query: System, Reduced or Full. The OS
  control is not always reachable, and some people want the flip off only here.
- Settings use real radios and checkboxes, so arrow-key behaviour and the
  accessibility tree come from the browser rather than being re-implemented.
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
