# Compliment Generator

A small, warm web app that shows a random compliment, or a joke, with one click. It has 100 compliments and 100 jokes, each with its own emoji, all available in English and French.

Built with vanilla HTML, CSS and JavaScript: no framework, no library, no build step.

## Run

Open `index.html` in a browser. No server or installation is needed.

To try the offline mode and installing it as an app, serve the folder over http instead, since service workers don't run from a `file://` page. For example, from this folder:

```
npx serve .
# or
python -m http.server 8000
```

Then open the address it prints (`http://localhost:…`).

## Features

- **100 compliments:** each has its own emoji and exists in English and French.
- **100 jokes:** family-friendly, each with an emoji. The setup is shown first, then the punchline in bold on its own line.
  - Comedic timing: the punchline arrives 0.7 s after the setup with a small bounce, a Sunny Yellow highlighter sweeps under it, and the emoji gives a little laughing wiggle.
  - Only transforms, opacity and the highlight are animated, so the card never changes size. With reduced motion, the punchline appears straight away, already highlighted.
  - Puns rarely survive translation. When the English joke relies on one, the French side is a French joke on the same theme instead of a literal translation.
  - English knock-knock jokes, for example, are paired with French "M. et Mme…" jokes.
- **Two buttons below the card:** "Get a New Compliment" and "Tell Me a Joke". The same item is never shown twice in a row.
- **Tags:** every compliment and joke has one to three tags, shown as chips under the text. Clicking a chip opens the search filtered on that tag.

  | Tag | Used for |
  |-----|----------|
  | 💛 Wholesome / Tendre | warm compliments |
  | 💪 Encouraging / Encourageant | strength, growth, encouragement |
  | 🧠 Brainy / Futé | mind and creativity; school jokes |
  | 🤪 Silly / Loufoque | playful compliments; absurd jokes |
  | 🥁 Puns / Jeux de mots | wordplay jokes |
  | 🐾 Animals / Animaux · 🍕 Food / Miam · 👻 Spooky / Frissons | joke topics |
  | 🚪 Classics / Classiques | knock-knock and "M. et Mme…" jokes |

- **Browse & search:** opened with the button under the card, or with `Ctrl+K` (`⌘K` on a Mac) from anywhere.
  - **Search:** the search field looks in both languages and in the tag names, so "chien" finds the dog jokes even in English. It ignores case and accents ("ecole" finds "école"), every word you type must match, and matches are highlighted.
  - **Filters:** All / Compliments / Jokes, plus tag chips. Selected tags combine, so Animals + Puns shows only animal puns. The result count updates as you type.
  - **Results:** click a result to show it on the card, click ♥ to favorite it, or use "🎲 Random from these" to show a random item from the current results.
- **Copy and share:** two buttons next to the heart.
  - **Copy:** copies the emoji and the text, in the current language, with the Clipboard API. Older browsers fall back to `execCommand('copy')`. The icon turns into a ✓ for a moment, and "Copied!" is announced.
  - **Share:** uses the device's share sheet (Web Share API) when there is one, for example on phones, in Safari, and in Edge and Chrome on Windows. Otherwise, a small menu offers WhatsApp, X and Email, plus Facebook when the site is online.
  - **Page address:** it's added to shares only when the page is served online. A `file://` address means nothing to the person receiving it, so it's never shared.
  - **Facebook shares the page link, not the compliment.** Facebook doesn't accept pre-filled text: its share window only takes a link, and only a public one, because Facebook's servers fetch the page to build the preview.
    - Facebook appears in the menu only when the site is at a public address.
    - It's hidden on `localhost`, on a local network address and in a local file, where Facebook would only show an error.
    - To share the compliment itself on Facebook, use **Copy** and paste it into a post.
  - **Closing the menu:** it closes with `Esc`, with a click elsewhere, or when a new item appears. Web links open in a new tab with `rel="noopener noreferrer"`.
- **Favorites:**
  - **Heart:** the heart at the top left of the card adds or removes the compliment or joke on screen.
  - **List:** "My favorites (n)" opens the list, newest first. Click an item to show it on the card, or × to remove it. "Clear all" asks for a second press to confirm.
  - **Saved** in `localStorage` (key `compliment-generator.favorites`), so favorites persist across visits. Other open tabs stay in sync.
  - **How items are identified:** by type and English text, so favorites still point to the right item if the lists are reordered. If an item's text is later edited, or the saved data is invalid, that favorite is dropped instead of breaking the page.
  - **Blocked storage:** if the browser blocks storage, favorites still work for the visit, and the list says they won't be kept.
- **Language switch (EN / FR):**
  - it starts in the first of the browser's preferred languages that the app has, otherwise in English;
  - the choice is remembered for the next visit;
  - switching translates the compliment or joke on screen instead of picking a new one.
- **A card that never changes size:** the script measures every compliment and every joke, in every language, at the current width and locks the text area to the tallest. Nothing jumps when the text, the mode or the language changes, on desktop and on mobile.
- **Responsive:** the card and its buttons are centred with Flexbox, up to 720 px wide. On phones, the buttons stack and span the full width.
- **A lively background:**
  - a warm gradient with a fine dot texture;
  - four large soft glows (coral, yellow, peach, pink) that drift slowly;
  - small bubbles, rings and sparkles that float up like slow confetti.

  It's pure CSS, and only `transform` and `opacity` are animated, so the page stays smooth.
- **Gentle motion:** the text fades in and the emoji pops in.
- **Works offline, installable (Progressive Web App):**
  - **Install:** on a server (https, or `localhost`), browsers offer to install the app: "Install" in the address bar on desktop Chrome and Edge, "Add to Home Screen" on phones. It then opens in its own window, with its own icon.
  - **Offline:** after one visit, the app works with no connection. The service worker (`js/sw.js`) keeps a copy of the page, the styles, the scripts (which hold the compliments, the jokes and the interface text) and the icons. It also keeps the Nunito and Lato fonts, so the app looks the same offline. Favorites and the language choice are in `localStorage`, which works offline anyway.
  - **Updates:** files are served from the copy straight away, and a fresh copy is fetched in the background. A change you publish shows on the visit after next.
  - **Share links** (WhatsApp, X…) still need a connection, since they open other sites.
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
  - the page has a main heading (`<h1>`, visually hidden) and the card is labelled by its small heading;
  - the compliment or joke is in an `aria-live` region, so each new one is read aloud;
  - the emoji (on the card, in tags, on the 🎲 button) and the background decoration are hidden from screen readers, which read the words instead;
  - the page's `lang` attribute follows the chosen language, so the right voice is used;
  - the language switch is a radio group (`role="radiogroup"`, `aria-checked`), and each option is labelled in its own language ("English", "Français").
- **Announcements:** short messages ("Added to favorites.", "Copied!") go to a live region. A modal dialog hides the rest of the page from screen readers, so each dialog has its own live region and messages go there while it's open.
- **Favorites:**
  - the heart is a toggle button: its name stays "Favorite", `aria-pressed` says whether the item is one, and the tooltip says what a click will do (a toggle whose name also changed would be read as the opposite of its state);
  - adding or removing a favorite is announced, and so is the "Clear all? Tap again" confirmation;
  - the list is a native `<dialog>`, which keeps focus inside and closes with `Esc`;
  - after an item is removed, focus moves to the next one.
- **Copy and share:**
  - both icon buttons are labelled in the current language;
  - the share menu is a disclosure: the button reports whether it's open (`aria-expanded`), focus moves into it when it opens, and `Esc` returns focus to the button.
- **Browse & search:**
  - the search field is labelled; the type filter is a radio group and the tag filters a toolbar of toggle buttons (`aria-pressed`);
  - the result count is announced once typing pauses, not after every key;
  - the results list is labelled by that count, and the favorites list by its title.
- **Keyboard:**

  | Where | Keys |
  |-------|------|
  | Anywhere | `Ctrl+K` / `⌘K` opens the search (`aria-keyshortcuts`) |
  | Language switch, type filter | one Tab stop; `←` `→` (or `↑` `↓`), `Home`, `End` choose |
  | Tag filters | one Tab stop; the arrows move, `Space` / `Enter` turn a tag on or off |
  | Search field | `↓` goes to the first result |
  | Results and favorites | `↑` `↓` move between rows in the same column, `Home` / `End` jump to the first / last; `↑` on the first result goes back to the search field |
  | Share menu | `↑` `↓` `Home` `End` move between the links; `Tab` out or `Esc` closes it |
  | Dialogs | `Esc` closes; focus returns to the control that opened the dialog (or to its button, if that control is gone) |

  The search shortcut uses a modifier on purpose: a single-key shortcut like `/` can fire by accident with speech input or screen-reader keys (WCAG 2.1.4).
- **Focus ring:** every control shows a 3 px charcoal ring when reached with the keyboard (`:focus-visible`). Charcoal rather than coral, because coral on white is only 2.8:1, below the 3:1 WCAG asks of focus indicators. In Windows High Contrast (forced colours), selected options and pressed filters use the system highlight colour.
- **Without JavaScript:** a first compliment is written in the HTML, so the page isn't empty if the script doesn't run.

## Project structure

```
compliment-generator/
├── index.html     page structure, background decoration, language switch, buttons, dialogs
├── manifest.webmanifest  app name, icons and colours for installing (PWA)
├── sw.js          one line that loads js/sw.js (must stay at the root, see below)
├── favicon.png    tab icon
├── images/
│   ├── og-image.png  1200×630 link-preview image (Facebook, WhatsApp, X…)
│   └── icons/        app icons: icon.svg (the source), 192 and 512 px PNGs,
│                     "maskable" versions for Android, apple-touch-icon.png (180 px)
├── css/
│   └── style.css  palette, background, layout, animations, responsive rules
└── js/
    ├── i18n.js    interface text: one dictionary per language
    ├── sw.js      service worker: keeps a copy of the app for offline use
    └── script.js  the 100 compliments, the 100 jokes, tags, logic
```

## Customise

**Compliments.** They're in the `compliments` array at the top of `js/script.js`. Each entry has an emoji and the text in both languages:

```js
{ emoji: '🌟', tags: ['wholesome'],
  en: 'You make the world a little brighter just by being in it.',
  fr: 'Tu rends le monde un peu plus lumineux, simplement en étant là.' },
```

**Jokes.** They're in the `jokes` array, just below. `\n` separates the setup from the punchline:

```js
{ emoji: '🐧', tags: ['animals', 'puns'],
  en: 'Why don’t penguins like parties?\nThey find it hard to break the ice.',
  fr: 'Pourquoi les pingouins n’aiment-ils pas les fêtes ?\nIls ont du mal à briser la glace.' },
```

Add, remove or edit entries freely. The random draw, the search and the card's height adapt automatically.

**Tags.** Each entry lists its tags in `tags` (one to three). The tags and their emoji are in the `tagInfo` object just after the jokes, and their names are in `js/i18n.js` (`'tag.wholesome'`…). Add a line in both to create a new tag, and it appears in the search filters automatically.

**Interface text.** Every word of the interface is in `js/i18n.js`, one dictionary per language, with keys such as `'action.joke'` or `'browse.results'`:

```js
en: {
  meta: { name: 'English', short: 'EN', locale: 'en-GB', dir: 'ltr' },
  strings: {
    'action.joke': 'Tell Me a Joke',
    'browse.tagOnCard': 'Browse everything tagged {tag}',            // {tag} is filled in
    'browse.results': { one: '{count} result', other: '{count} results' },  // plural forms
    …
  },
},
```

- **In the HTML,** `data-i18n="key"` fills an element's text and `data-i18n-attr="aria-label:key; title:key"` fills attributes. The English written in `index.html` only shows before the script runs.
- **In the script,** `t('key', { name: value })` returns the string in the current language. Plurals are chosen with the language's own rules (`Intl.PluralRules`), and numbers are formatted for its locale.
- **Missing strings** fall back to English, so a new language can be added bit by bit.

**Adding a language.** Copy the `en` block in `js/i18n.js`, rename it (for example `es`), and translate it. It appears in the language switch by itself. Compliments and jokes can get an `es` field in `js/script.js`; any item without one shows its English text. For a right-to-left language, set `dir: 'rtl'`: the page direction follows, and the arrow keys in the switches are mirrored.

**Background.** In `css/style.css`:

- to change how strong each glow is, edit the opacity in its `radial-gradient` (`.glow-coral`, `.glow-yellow`, `.glow-peach`, `.glow-pink`);
- to change the floating shapes (position, size, speed, colour), edit the `.float:nth-of-type(…)` lines.

**Offline copy (`js/sw.js`).** The service worker code is in `js/sw.js`, but the one-line `sw.js` that loads it has to stay at the root: a service worker only looks after pages in its own folder and below, so one registered from `js/` would never handle `index.html`. Paths in `js/sw.js` are therefore relative to the root. When you add a file the app needs, add it to `APP_FILES`. When you change which files exist, or want returning visitors to download everything again at once, change `VERSION` (`'v1'` → `'v2'`): the old copy is deleted when the new version takes over. If you change the Google Fonts link in `index.html`, copy it into `FONT_CSS` too.

**App icons.** Edit `images/icons/icon.svg`, then export it again as PNG at 192 and 512 px. For the "maskable" versions, use a full square with no rounded corners, and keep the drawing inside the central 80%: Android crops these icons into circles or rounded squares.

## Publishing online

The site must be served over **https** for the offline mode and installing to work (`localhost` is the only exception). GitHub Pages and Netlify both use https.

When the site goes online (GitHub Pages, Netlify…), finish the link previews. In `index.html`, uncomment the `og:url` and `og:image` lines and replace `https://YOUR-SITE/…` with the site's real address. Facebook only accepts full addresses for these two tags.

You can then check the preview with Facebook's [Sharing Debugger](https://developers.facebook.com/tools/debug/). It also refreshes Facebook's cached copy of the page after a change.

## Browser support

The app works in current versions of Chrome, Edge, Firefox and Safari. The offline mode works in all of them. Installing as an app works in Chrome and Edge (desktop and Android) and in Safari (iOS "Add to Home Screen", macOS "Add to Dock"); Firefox on desktop doesn't install web apps, but still works offline. The language choice and the favorites are saved with `localStorage`. If storage is blocked (private browsing, for example), the app still works but doesn't remember them after the page is closed.
