# Palette &amp; Font Kit

A random aesthetic generator: it produces cohesive color palettes and Google Font pairings, checks every color against WCAG AA, and exports the result as CSS variables or JSON.

Built with vanilla HTML, CSS and JavaScript: no framework, no library, no build step.

## Run

Open `index.html` in a browser. Nothing to install, and it works straight from the file system.

To serve it instead (any static server will do):

```
npx serve .
# or
python -m http.server 8000
```

## Features

- **Palettes of 4 to 6 colors.** Generated from a hue scheme — analogous, complementary, triadic, split complementary or monochrome — rather than random RGB, which is what keeps them cohesive. Every palette runs from a dark anchor to a light one, so it works as a real UI scale, and saturation eases off at both ends so the darks don't go muddy and the lights don't go neon.
- **Steer it, or leave it to chance.** A base color picker and a saturation slider sit above the swatches.
  - **Base color:** the color you pick lands in the palette itself, in the slot closest to its own lightness, and the rest of the palette is built around its hue. The saturation slider follows the color you picked.
  - **Saturation:** drag it and the whole palette, base color included, moves with it. The scheme, the number of colors and the lightness ramp stay put, so the palette morphs rather than re-rolling.
  - **Keep on shuffle:** off by default — shuffle picks a fresh base each time and the controls show what came out. Tick it and shuffle keeps your color and saturation while changing everything else.
- **Contrast built in.** Each swatch shows its contrast ratio *used as text* on white and on black, with a pass/fail badge for WCAG 2.1 AA at normal text size (4.5:1). Ratios are floored rather than rounded, so "4.50:1" never appears next to a FAIL badge.
- **Font pairings from a curated list.** 20 Google Fonts families in 14 hand-checked pairings. Only the two families in play are downloaded, and only in the weights actually used, so the whole set is never loaded upfront.
- **Live preview.** The pairing applied to a headline, a subhead, a paragraph at a readable measure, a link, two buttons, a tinted panel and a row of chips — so most of the palette is on screen doing a job, not just sitting in swatches.

  Every one of those colors is picked with a contrast check first:

  | Element | Color it takes |
  |---------|----------------|
  | Headline | the color with the most contrast against the preview's background |
  | Eyebrow, link, outline button | other colors that pass AA on that background, kept distinct where the palette allows |
  | Filled button | the most saturated color that clears 3:1 against the background (WCAG's bar for UI components), with black or white text by ratio |
  | Panel | the color closest in tone to the background, with the most readable color on top |
  | Chips | every color, each carrying the text color that reads best on it |

  **The preview follows the UI theme,** and the whole table is recomputed when it does: on white the headline takes the darkest color and the panel the lightest, and on the dark ground both flip. A palette therefore shows you how it behaves in both modes, rather than only on paper.

  The caption under the preview states the ratios it used, so the sample is never an unreadable mush.

- **Bring your own type.** An *Add a font* panel under the pairing, closed until you want it, with three ways in. Whatever you add behaves like a built-in family: it can be set as the heading or the body, tuned with the controls below, and saved to favorites.
  - **Search Google Fonts.** The whole catalogue (1,900-odd families) is fetched straight from the browser on first open — no API key and no server — and suggestions narrow as you type. If the catalogue can't be reached (offline, or a `file://` page the endpoint won't share with), the built-in families are listed instead and any family name can still be typed and tried.
  - **Paste a URL:** a `.woff2`, `.woff`, `.ttf` or `.otf` file, or a Google Fonts stylesheet link.
  - **Load a file** from your computer. It's read with `FileReader` and handed to the browser as a `FontFace`, so the bytes never leave the page — nothing is uploaded anywhere.
  - **Added fonts last for the visit.** They aren't saved: a favorite that uses one will fall back (and say so) on a later visit.

  **Checks before anything is used:** the extension must be one of the four; the type the browser reports must be a font type; the file must be under 5 MB; and then the browser itself has to parse the bytes, which is the real test — a text file renamed `.woff2` is refused. Links must be `https` (or `http` on localhost), and anything that could break out of a CSS `url("…")` is rejected. Family names are reduced to letters, digits and spaces before they reach the stylesheet.

- **Type your own words.** Above the preview: a text box, an *Apply to* switch (Heading or Body), and size, weight and line-height controls. Everything updates as you type or drag — one style write per change, measured at well under a millisecond.
  - **Each role keeps its own settings,** so a 96px headline and a 17px paragraph can be tuned separately without fighting each other.
  - **The weight list is the family's own weights.** Asking for a weight a font doesn't publish makes the browser synthesise one, so only the real ones are offered; switching to a family with fewer weights snaps to the nearest published one.
  - **Empty text brings the sample copy back,** link and all.
  - **Untouched controls leave the stylesheet alone.** Inline sizes are only written once you actually change something, so a size picked on a desktop doesn't wreck the phone layout. **Reset** puts a role back to the sample copy and the responsive sizes.
  - **Edge cases:** the text box is capped at 300 characters and long strings wrap rather than stretching the page; out-of-range or non-numeric values are clamped to the control's range; and if a family can't be fetched (offline, or Google Fonts blocked) the preview falls back to the stack declared with it and says which family is missing.

  **The sample controls are real controls.** The two buttons and the link are `<button>` and `<a>` elements, not dressed-up spans: they take keyboard focus, show hover, press and focus states in the palette's own colors, and do something rather than nothing — each button copies the color it is wearing (as the swatches do), and the link opens the body face's specimen on Google Fonts. That way the states you are judging are the states a browser really renders.
- **Shuffle All** changes palette and pairing together, from the button or the keyboard. **Shuffle Fonts Only**, next to it, changes the pairing and leaves the colors exactly as they are — useful once a palette is right and the type isn't. The swatches don't replay their entrance animation when only the fonts move.
- **Three curated starting points** — Minimal, Playful and Bold — so the page is never empty. It opens on Minimal.
- **Favorites.** Save a combination, re-apply it, or delete it. Stored in `localStorage`, so they survive a reload.
- **Export** the current combination as CSS custom properties (with the matching Google Fonts `<link>` as a comment) or as JSON, copied to the clipboard or downloaded:

  ```json
  { "palette": ["#0F172A", "…"], "fonts": { "heading": "Space Grotesk", "body": "IBM Plex Sans" } }
  ```

- **Light and dark UI,** remembered across visits. It follows the system setting until you choose.
- **Keyboard shortcuts:** `Space` shuffle, `F` fonts only, `S` save, `C` copy CSS. They're listed in a bar at the top of the page, which is hidden below 640 px along with the hints inside the buttons, since a phone has no keyboard to press.

## Design

The interface is deliberately quiet, so the generated colors and type are the only things with personality.

| Role | Light | Dark |
|------|-------|------|
| Background | `#f9fafb` | `#1e1e1e` |
| Card surface | `#ffffff` | `#262626` |
| Accent | `#4f46e5` | `#818cf8` |

- **Interface fonts:** Inter for headings, Source Sans 3 for body text. They're used for the app shell only, never for the generated preview.
- **The accent is indigo 600 (`#4f46e5`), not the lighter `#6366f1`.** White text on `#6366f1` reaches only 3.6:1, below the AA minimum of 4.5:1 for normal text. The lighter indigo is still there as the soft tint and the dark-mode focus ring.
- **The preview follows the theme** — white in light mode, `#171717` in dark — but its own neutrals stay plain grey. Every other color in it comes from the generated palette, re-picked against whichever background it sits on.
- **Motion** is 150–250 ms throughout: swatches rise in with a small stagger, the preview fades up. All of it is switched off under `prefers-reduced-motion`.

## Accessibility

- **Semantic structure:** landmarks, one `h1`, labelled sections, and a skip link.
- **Contrast badges are screen-reader friendly.** The tick or cross is hidden from assistive technology and the meaning is spelled out instead ("passes WCAG AA for normal text"). A color that fails for normal text but passes for large text says so.
- **Swatches are buttons:** keyboard reachable, with a 3 px focus ring. Copying shows a "Copied" mark without ever renaming the button under a screen reader.
- **Status messages** (copied, saved, applied) go to a `role="status"` region, so they're announced as well as shown.
- **Deleting a favorite** moves focus to the next entry rather than dropping it to the top of the page.
- **Single-key shortcuts follow WCAG 2.1.4.** They're ignored while typing in a field, `Space` is ignored when a button already has focus (otherwise one press would both activate the button and shuffle), and they can be switched off in the bar at the top of the page.
- **Responsive down to 320 px,** with no horizontal scrolling.

## Project structure

```
palette-font-kit/
├── index.html     markup, plus a six-line inline script (see below)
├── css/
│   └── style.css  tokens, both themes, layout, focus states, transitions
├── js/
│   └── script.js  everything the app does
├── favicon.png    tab icon
└── README.md
```

`js/script.js` is loaded with `defer`, so it never blocks parsing and runs with the DOM ready. It's split into commented sections: curated data, helpers, color maths and the contrast check, generators, rendering, storage, exports and clipboard, then events and init. The main functions are `getRandomPalette`, `pickFontPair`, `applyFonts`, `renderPalette`, `renderPreview`, `saveFavorite`, `loadFavorites`, `exportCSSVars`, `exportJSON` and `checkContrast`.

**The one inline script**, in `<head>`, reads the saved theme and sets a class on `<html>`. It stays inline on purpose: it has to run before the first paint, or a saved dark preference would flash light first.

## Customize

**Fonts.** The `FONTS` object lists each family with the weights to load and a real fallback stack. Fonts added through the panel are registered in the same object at runtime, which is why everything else — the weight list, the exports, favorites — treats them identically. Only the listed weights are requested: asking for a weight a family doesn't publish makes the whole request fail, which is why they're written out.

```js
'Space Grotesk': { weights: [400, 700], stack: 'system-ui, sans-serif' },
```

**Pairings.** `PAIRS` holds the heading/body combinations the shuffle draws from. Add a pair and it's in the rotation; both families must exist in `FONTS`.

**Curated presets.** `PRESETS` holds Minimal, Playful and Bold — a label, a palette and a pairing each. Editing one changes the chips under the controls; `Minimal` is what the page opens with.

**Palette feel.** A palette is built from a *recipe*: scheme, hue, saturation, how many colors, the lightness anchors and a small per-color jitter. `randomRecipe` rolls one, `buildPalette` turns it into colors, and `getRandomPalette` does both. Keeping the recipe is what lets the controls change the hue or the saturation while everything else holds still. `SCHEMES` defines the hue relationships, and the lightness anchors (`randInt(8, 18)` for the darkest, `randInt(88, 96)` for the lightest) decide how much range a palette covers.

**Interface colors.** The tokens at the top of the `<style>` block: `:root` for light, `.theme-dark` for dark. Nothing else hard-codes a color.

**Favorites cap.** `MAX_FAVORITES` (60) keeps `localStorage` small.

## Storage

| Key | Contents |
|-----|----------|
| `aesthetic.favorites` | saved combinations: palette, fonts, date |
| `aesthetic.settings` | theme choice and whether shortcuts are on |

Everything stays in the browser; nothing is sent anywhere. Saved data is validated on load, so hand-edited or outdated entries are dropped instead of trusted. If storage is blocked, as in private browsing, the app still works and the favorites panel says they won't be kept.

## Browser support

Current versions of Chrome, Edge, Firefox and Safari. Copying uses the Clipboard API with a `document.execCommand` fallback, so it also works on pages opened as files. If Google Fonts can't be reached, the preview falls back to the stacks declared with each family instead of waiting.

## License

MIT. Fonts are served by Google Fonts under the SIL Open Font License.
