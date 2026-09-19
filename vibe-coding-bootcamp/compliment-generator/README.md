# Compliment Generator

A small, warm web app that shows a random compliment, or a joke, with one click. It has 100 compliments and 100 jokes, each with its own emoji, all available in English and French.

Built with vanilla HTML, CSS and JavaScript: no framework, no library, no build step.

## Run

Open `index.html` in a browser. No server or installation is needed.

## Features

- **100 compliments:** each has its own emoji and exists in English and French.
- **100 jokes:** family-friendly, each with an emoji. The setup is shown first, then the punchline in bold on its own line.
  - Comedic timing: the punchline arrives 0.7 s after the setup with a small bounce, a Sunny Yellow highlighter sweeps under it, and the emoji gives a little laughing wiggle.
  - Only transforms, opacity and the highlight are animated, so the card never changes size. With reduced motion, the punchline appears straight away, already highlighted.
  - Puns rarely survive translation. When the English joke relies on one, the French side is a French joke on the same theme instead of a literal translation.
  - English knock-knock jokes, for example, are paired with French "M. et Mme…" jokes.
- **Two buttons below the card:** "Get a New Compliment" and "Tell Me a Joke". The same item is never shown twice in a row.
- **Favorites:**
  - **Heart:** the heart at the top left of the card adds or removes the compliment or joke on screen.
  - **List:** "My favorites (n)" opens the list, newest first. Click an item to show it on the card, or × to remove it. "Clear all" asks for a second press to confirm.
  - **Saved** in `localStorage` (key `compliment-generator.favorites`), so favorites persist across visits. Other open tabs stay in sync.
  - **How items are identified:** by type and English text, so favorites still point to the right item if the lists are reordered. If an item's text is later edited, or the saved data is invalid, that favorite is dropped instead of breaking the page.
  - **Blocked storage:** if the browser blocks storage, favorites still work for the visit, and the list says they won't be kept.
- **Language switch (EN / FR):**
  - it starts in French if the browser's language is French, otherwise in English;
  - the choice is remembered for the next visit;
  - switching translates the compliment or joke on screen instead of picking a new one.
- **A card that never changes size:** the script measures every compliment and every joke, in both languages, at the current width and locks the text area to the tallest. Nothing jumps when the text, the mode or the language changes, on desktop and on mobile.
- **Responsive:** the card and its buttons are centred with Flexbox, up to 720 px wide. On phones, the buttons stack and span the full width.
- **A lively background:**
  - a warm gradient with a fine dot texture;
  - four large soft glows (coral, yellow, peach, pink) that drift slowly;
  - small bubbles, rings and sparkles that float up like slow confetti.

  It's pure CSS, and only `transform` and `opacity` are animated, so the page stays smooth.
- **Gentle motion:** the text fades in and the emoji pops in.
- **Reduced motion:** when the system asks for it, the glows stop moving, the floating shapes are hidden, and the text and emoji appear without animation.

## Design

| Role | Colour |
|------|--------|
| Background | `#F8F9FA`, light grey |
| Text | `#212529`, charcoal |
| Button | `#FF6B6B`, Living Coral |
| Button on hover | `#FFD166`, Sunny Yellow |

- **Fonts** (Google Fonts): Nunito for the compliments and jokes, Lato for the buttons and the rest of the interface.
- **The joke button** uses the same two colours the other way round: yellow, turning coral on hover.
- **Button text is charcoal, not white.** White on Living Coral has a contrast of only 2.8:1. Charcoal reaches 5.6:1 on coral and 10.7:1 on the yellow hover, above the WCAG AA minimum of 4.5:1.

## Accessibility

- **Screen readers:**
  - the compliment or joke is in an `aria-live` region, so each new one is read aloud;
  - the emoji and the background decoration are hidden from screen readers;
  - the page's `lang` attribute follows the chosen language, so the right voice is used;
  - each language button is labelled in its own language ("English", "Français") and shows its state with `aria-pressed`.
- **Favorites:**
  - the heart is a toggle button (`aria-pressed`) whose label says what it will do ("Add to favorites" or "Remove from favorites");
  - adding or removing a favorite is announced;
  - the list is a native `<dialog>`, which keeps focus inside and closes with `Esc`;
  - after an item is removed, focus moves to the next one.
- **Keyboard:** everything works with the keyboard, with a visible focus ring.
- **Without JavaScript:** a first compliment is written in the HTML, so the page isn't empty if the script doesn't run.

## Project structure

```
compliment-generator/
├── index.html     page structure, background decoration, language switch, buttons
├── favicon.png    tab icon
├── css/
│   └── style.css  palette, background, layout, animations, responsive rules
└── js/
    └── script.js  the 100 compliments, the 100 jokes, interface text, logic
```

## Customise

**Compliments.** They're in the `compliments` array at the top of `js/script.js`. Each entry has an emoji and the text in both languages:

```js
{ emoji: '🌟',
  en: 'You make the world a little brighter just by being in it.',
  fr: 'Tu rends le monde un peu plus lumineux, simplement en étant là.' },
```

**Jokes.** They're in the `jokes` array, just below. `\n` separates the setup from the punchline:

```js
{ emoji: '🐧',
  en: 'Why don’t penguins like parties?\nThey find it hard to break the ice.',
  fr: 'Pourquoi les pingouins n’aiment-ils pas les fêtes ?\nIls ont du mal à briser la glace.' },
```

Add, remove or edit entries freely. The random draw and the card's height adapt automatically.

**Interface text.** The buttons, the heading and the page title are in the `uiText` object, just below the jokes.

**Background.** In `css/style.css`:

- to change how strong each glow is, edit the opacity in its `radial-gradient` (`.glow-coral`, `.glow-yellow`, `.glow-peach`, `.glow-pink`);
- to change the floating shapes (position, size, speed, colour), edit the `.float:nth-of-type(…)` lines.

## Browser support

The app works in current versions of Chrome, Edge, Firefox and Safari. The language choice and the favorites are saved with `localStorage`. If storage is blocked (private browsing, for example), the app still works but doesn't remember them after the page is closed.
