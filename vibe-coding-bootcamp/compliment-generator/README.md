# Compliment Generator

A small, warm web app that shows a random compliment with one click. It has 100 compliments, each with its own emoji, available in English and French.

Built with vanilla HTML, CSS and JavaScript: no framework, no library, no build step.

## Run

Open `index.html` in a browser. No server or installation is needed.

## Features

- **100 compliments:** each has its own emoji and exists in English and French. The same compliment is never shown twice in a row.
- **Language switch (EN / FR):**
  - it starts in French if the browser's language is French, otherwise in English;
  - the choice is remembered for the next visit;
  - switching translates the compliment on screen instead of picking a new one.
- **A card that never changes size:** the script measures every compliment in both languages at the current width and locks the text area to the tallest. Nothing jumps when the compliment or the language changes, on desktop and on mobile.
- **Responsive:** the card is centred with Flexbox, up to 720 px wide. On phones, the button spans the full width.
- **Gentle motion:**
  - the text fades in and the emoji pops in;
  - the background has two soft coral and yellow glows that drift slowly over a fine dot texture;
  - all of it stops when the system asks for reduced motion.

## Design

| Role | Colour |
|------|--------|
| Background | `#F8F9FA`, light grey |
| Text | `#212529`, charcoal |
| Button | `#FF6B6B`, Living Coral |
| Button on hover | `#FFD166`, Sunny Yellow |

- **Fonts** (Google Fonts): Nunito for the compliment, Lato for the button and the rest of the interface.
- **Button text is charcoal, not white.** White on Living Coral has a contrast of only 2.8:1. Charcoal reaches 5.6:1 on coral and 10.7:1 on the yellow hover, above the WCAG AA minimum of 4.5:1.

## Accessibility

- **Screen readers:**
  - the compliment is in an `aria-live` region, so each new one is read aloud;
  - the emoji is decorative and hidden from screen readers;
  - the page's `lang` attribute follows the chosen language, so the right voice is used;
  - each language button is labelled in its own language ("English", "Français") and shows its state with `aria-pressed`.
- **Keyboard:** everything works with the keyboard, with a visible focus ring.
- **Without JavaScript:** a first compliment is written in the HTML, so the page isn't empty if the script doesn't run.

## Project structure

```
compliment-generator/
├── index.html     page structure, language switch, first compliment
├── favicon.png    tab icon
├── css/
│   └── style.css  palette, layout, animations, responsive rules
└── js/
    └── script.js  the 100 compliments, interface text, logic
```

## Customise

**Compliments.** They're in the `compliments` array at the top of `js/script.js`. Each entry has an emoji and the text in both languages:

```js
{ emoji: '🌟',
  en: 'You make the world a little brighter just by being in it.',
  fr: 'Tu rends le monde un peu plus lumineux, simplement en étant là.' },
```

Add, remove or edit entries freely. The random draw and the card's height adapt automatically.

**Interface text.** The button, the heading and the page title are in the `uiText` object, just below the compliments.

**Background.** To change how strong the glows are, edit the two opacity values in `body::before` (coral) and `body::after` (yellow) in `css/style.css`.

## Browser support

The app works in current versions of Chrome, Edge, Firefox and Safari. The language choice is saved with `localStorage`. If storage is blocked (private browsing, for example), the app still works but doesn't remember the language.
