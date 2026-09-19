# Reflex Lab

A reaction-time game with a Three.js 3D scene. Plain HTML/CSS/JS, no build step. Three.js r128 is loaded from cdnjs.

## Run

Open `index.html` in a browser.

## Desktop app (Windows `.exe`)

The `desktop/` folder packages the game with [Electron](https://www.electronjs.org/) into a **portable executable**. It's a single `.exe`, with no installation, and it works **offline**.

```bash
cd desktop
npm install
npm run build:win     # → desktop/dist/ReflexLab-1.0.0-portable.exe
npm start             # run the app without packaging it
npm run smoke         # automatic check in real Chromium (see below)
```

- **The web version isn't modified.** `scripts/prepare-app.js` copies it into `desktop/app/`, then:
  - bundles Three.js r128 (npm package `three@0.128.0`) instead of the CDN;
  - bundles the Inter and Outfit fonts (`@fontsource`, Latin and Latin Extended only) instead of Google Fonts;
  - adds a strict Content-Security-Policy: only the app's own files, no remote scripts, no network.
- **Icon:** `scripts/make-icon.js` draws a 512×512 icon from the header logo (the hexagon and lightning bolt), in pure Node.
- **Security:**
  - Node.js is disabled in the page (`contextIsolation`, `sandbox`);
  - navigation and pop-ups are blocked, and all permissions are refused;
  - there are no DevTools in the packaged build, which would make cheating on the leaderboard too easy.
- **Window:** the app runs as a single instance, and `F11` switches to full screen.
- **Smoke test:** `npm run smoke` loads the app in a hidden Electron window. It checks:
  - Three.js and the fonts loaded;
  - WebGL is running;
  - no errors, CSP violations or network requests;
  - a real `Space` press starts a round.
  It also saves a screenshot to `dist/smoke.png`.
- **Data:** profiles, settings and the leaderboard are stored in `%APPDATA%\Reflex Lab`, separately from the browser version.
- **Other platforms:** `npm run build:mac` and `npm run build:linux` produce a `.dmg` and an AppImage. Each must be built on its own system.

Good to know:

- **SmartScreen:** the executable isn't signed, so Windows SmartScreen shows a warning the first time you launch it ("More info" → "Run anyway"). A code-signing certificate would remove it.
- **Size:** the file is about 96 MB, which is normal for Electron since it embeds Chromium. The portable version unpacks itself each time it starts, so it takes a few seconds to launch.
- **Launcher:** `npm start` and `npm run smoke` go through `scripts/run-electron.js`. It removes `ELECTRON_RUN_AS_NODE` (set by terminals opened from VS Code, which prevents the window from opening), and it downloads the Electron binary if npm skipped it (npm 12 blocks install scripts).

## How to play

1. Press **Start session**, or tap the pad.
2. The shape turns amber. A random delay of 1 to 5 s starts.
3. When the shape turns green, click, tap or press `Space`.
4. If you react before green, or in under 100 ms, it counts as a false start. False starts aren't included in the average.

`Esc` stops the session. **Reset** clears the stats and goes back to level 1.

## Difficulty

Each level has a target time. Beat it **3 rounds in a row** to level up. **2 failed rounds in a row** drop you one level. A failed round is one that's too slow for the target, a false start, or a miss. All valid times go into the stats, even the ones over the target.

| Level | Name    | Target   | Decoy chance | Text cue on "go" |
|-------|---------|----------|--------------|------------------|
| 1     | Warm-up | ≤ 500 ms | —            | yes              |
| 2     | Steady  | ≤ 400 ms | —            | yes              |
| 3     | Decoys  | ≤ 380 ms | 35 %         | yes              |
| 4     | Sharp   | ≤ 340 ms | 45 %         | yes              |
| 5     | Subtle  | ≤ 320 ms | 50 %         | no               |
| 6     | Elite   | ≤ 290 ms | 60 %         | no               |

- **Decoys:** a blue cube flashes for 450 ms during the wait. Reacting to it counts as a false start. A decoy always ends at least 250 ms before the real signal.
- **Subtle levels:** the "React!" text and the green border flash are gone. Only the shape and the glow turn green.
- **Visual noise:** the waiting animation spins faster at each level. The speed stays constant within a round, so it can't hint at when "go" will fire.

The levels are defined in the `LEVELS` table in `js/config.js`.

## Power-ups

In solo play, a round that beats the target has a 25 % chance to drop a power-up, and a new personal record always drops one. You can hold up to **3**. Use one between rounds by clicking its slot in the level card or pressing `1`, `2` or `3`. You can't use a power-up while a round is being timed.

| Power-up | Effect |
|----------|--------|
| Shield   | Your next failed round (false start, miss or over the target) doesn't break your streak or count toward a level drop. |
| Double   | Your next round under the target counts twice toward levelling up. |
| Leeway   | For 3 rounds, the level target is 50 ms more generous. |
| Calm     | For 3 rounds, there are no decoys and the waiting animation is calmer. |

**Power-ups never change a measured time.** The false start is still counted, the times are the real ones, and so are the records and averages. Power-ups only act on the game layer: streak, levels, the pass/fail target and decoys.

- **3D:** an active shield shows as a faint bubble around the shape, and a gem pops out of the shape when a power-up drops. Neither changes at the moment of "go", so they can't act as a signal.
- **Tournaments:** power-ups are off, so the result can't depend on a random drop.
- **Achievements:** "Saved by the Shield" and "Power Player" (use 10 power-ups).

## Tournament (local multiplayer)

With **Tournament**, 2 to 8 players take turns on the same device ("hot-seat").

1. **Setup:** tick the players in turn order. You can pick existing profiles or add new ones right in the window. Then choose the number of rounds each (3, 5 or 10) and the level (1–6). Everyone plays the same level, with no level-ups during the tournament.
2. **Turns:** before each turn, a hand-over screen shows who's up ("Alex, you're up"). The device switches to that player's profile. The session stats start fresh for each turn, so they only show that player's rounds. A standings card in the side panel shows everyone's progress and live score.
3. **Score:** the average of your valid times, plus **100 ms for each false start or miss**. The lowest score wins. A tie goes to the best single time, then to fewer fouls. A player with no valid time ranks last.
4. **Results:** a ranking with score, average, best time and fouls, plus **Rematch** (same players and settings) or **Back to solo**.

Every round also counts toward the player's own profile: records, leaderboard and achievements. There are two tournament achievements: "Champion" (win a tournament) and "Party Host" (finish a tournament with 4 or more players). Switching players is locked during a tournament. **End tournament** needs a second press to confirm, and it throws away the standings.

## Sound and music

All the audio is generated with the Web Audio API, so there are no sound files. The controls are in the top bar: sound effects on/off (`S`), music on/off (`M`) and volume. These settings are saved in this browser.

- **Sound effects:** a sound when a round starts, when a reaction registers (the pitch goes up the faster you are), for a new record, a false start, a miss, going up or down a level, and an unlocked achievement.
- **Music:** an ambient loop (Am–F–C–G, 84 BPM). It gets denser as the level goes up. The music gets quieter while you wait and comes back up after the round.
- **Fair timing:** the green signal and the decoys are **silent**, and the music doesn't change at that moment. People react to sound about 40 ms faster than to sight, so an audio cue would make this an auditory test. Every feedback sound plays after the time has been measured.
- Browsers only allow sound after a user action, so audio starts on your first click or key press. When the tab is hidden, the audio pauses. Every note frees its audio resources when it ends.

## How timing works

- **Random delay:** `crypto.getRandomValues`, uniform over 1000–5000 ms.
- **Stimulus:** when the timer fires, the game only sets a flag. The next `requestAnimationFrame` changes the canvas and the DOM together, so both appear on the same frame. The game records the time that frame is drawn. On the following frame, it moves that time forward to when the frame should reach the screen, by at most one refresh at 60 Hz.
- **Input:** it uses `pointerdown`, which fires before `click`, and `keydown`. It reads `event.timeStamp` (when the input happened), not `performance.now()` inside the handler. That keeps rendering work from adding time to the result.
- **Guards:** anything under 100 ms counts as an anticipation (a guess). After 3 s with no reaction, the round is void. If the tab is hidden mid-round, the round is discarded, because timers and frames are throttled in background tabs.

## 3D and performance

- Each state has its own polyhedron and colour: idle is slate, waiting amber, go green, result blue and error red. The shape changes with a shrink-and-grow morph. The go state skips the morph and switches instantly.
- The waiting "breath" animation runs at a fixed rate, so it can't hint at when the signal will fire.
- The 42 orbiting cubes are one `InstancedMesh` (one draw call). All edge geometries are built once at startup.
- Adaptive quality: when the average frame time goes over 25 ms, the pixel ratio drops in 0.25 steps.
- The game handles WebGL context loss and restore. On `pagehide`, it disposes every geometry, material and the renderer.
- If WebGL or the CDN isn't available, a 2D fallback runs and the game still works.
- The game supports `prefers-reduced-motion`.

## Language

The game is available in **English** and **French**. You choose the language at the top of the **Display & accessibility** window. By default, the game follows the browser's first preferred language (French if it starts with `fr`, English otherwise). Your choice is saved in this browser.

- **Everything is translated:**
  - the interface and screen-reader announcements;
  - level names, power-ups, achievements and anti-cheat reasons;
  - the default name of new profiles ("Player" / "Joueur");
  - dates (`Intl.DateTimeFormat`);
  - the page's `lang` attribute, so screen readers use the right voice.
- **When you switch:** the change applies straight away. The text you can see is redrawn, including the current message and any open window.
- **How it works (`js/i18n.js`):**
  - `t(key, params)` handles parameters (`{name}`) and French/English plurals.
  - The static HTML is translated with `data-i18n`, `data-i18n-html` and `data-i18n-attr` attributes.
  - The game data keeps its English in its own files. Only the French lives in `i18n.js`, keyed by id, so there's no duplication.
- **Colour words:** the colour words (`{go}`, `{wait}`, `{decoy}`) follow the colour-vision palette in both languages. The French sentences are written so the word never needs to agree in gender or number ("passe au {go}", "le cube {decoy}", "se colore en {wait}"), so they read correctly with vert, bleu, blanc…

## Accessibility

To open **Display & accessibility**, use the ♿ button in the top bar. Your settings are saved in this browser.

- **Colour vision:**
  - The game has four palettes, based on the Okabe–Ito colours:
    - **Standard;**
    - **Red–green safe** (protanopia and deuteranopia): orange wait, blue go, pink decoys;
    - **Blue–yellow safe** (tritanopia): red wait, green go, white decoys;
    - **Monochrome** (for players who see no colour): grey wait, white go, dark decoys.
  - Each palette applies to the page and to the 3D scene.
  - The text names the colours of the active palette ("Wait for blue…"), using `{go}`, `{wait}` and `{decoy}` placeholders.
  - Colour is never the only cue. Each state has its own 3D shape and its own text. The colour-safe palettes also add a **bright white ring** on "go", because a change in brightness is visible whatever your colour vision. The best bar in the chart also has a ★.
- **Contrast:** every palette meets WCAG AA. Small text is 4.5:1 or better, and large text and the decoy shape are 3:1 or better. The "go" colour's brightness is close to the "wait" colour's (ratio about 1.0–1.2), except in Monochrome. That's why the white ring matters.
- **Text size:** 100 %, 115 %, 130 % or 150 %. All font sizes are in `rem`, so they also follow the browser's font-size setting.
- **Motion:** a "Reduce motion" setting, on top of the system `prefers-reduced-motion` preference. It slows the 3D animation and turns off the camera shake and pop-in effects.
- **Screen readers:**
  - The reaction pad is a labelled `region`. Its messages are readable, and a skip link leads to it.
  - A live region announces the start of each round, the results, level changes, power-ups and achievements.
  - Units are read as "milliseconds", and the chart's text description lists the times.
  - Buttons and toggles have labels, and the windows are `<dialog>` elements with keyboard-navigable tabs.
  - **The "go" signal itself is not announced.** This is a visual reaction test, and an audio cue would measure something else.

## Profiles, high scores and achievements

To open your profile, click your name in the top bar. Opening it pauses the current session.

- **Profile:** your display name, avatar colour and lifetime stats: best time, average, peak level, sessions, false starts and decoys dodged. The profile also lists everyone who has played on this device. You can switch player, add a player (up to 8) or delete one (you press the button twice to confirm).
- **Leaderboard:** your personal best, your best average over 5 reactions in a row and your longest run without a false start or miss, plus the **verified leaderboard** described below. A result screen tells you when you set a new personal record.
- **Achievements:** there are 21 achievements, covering speed, consistency, dodging decoys, levels, volume, tournaments, power-ups and the leaderboard. Some of them count toward a goal, and those show a progress bar. When you unlock one, a notification pops up.

**Reset** clears only the current session's stats. It never touches your profile.

## Verified leaderboard (anti-cheat)

To open it, use **Leaderboard** in the side panel (or the Leaderboard tab of the profile window).

- **What counts:** each player's **best average over 5 valid reactions in a row**. A single lucky reaction isn't enough. The leaderboard shows the top 10, one entry per player, from this device.
- **Evidence:** every run keeps its 5 rounds. That's the delay the game chose, when the signal appeared, when you reacted, the input type, the page state, the frame duration and both clocks.
- **Submission:** runs are submitted automatically after a result, when they beat your current entry. The result screen then says whether the run was accepted, with your rank, or why it was refused.

Each run is checked when it's submitted, **and again every time the leaderboard is shown**:

| Check | Catches |
|-------|---------|
| Timer precision (≤ 2 ms) | Browsers that round their timer (anti-fingerprinting modes): the run is refused with that reason, rather than being wrongly flagged as a bot |
| Real input (`event.isTrusted`) | Clicks and key presses generated by a script |
| Visible and focused page | Playing in the background, automation |
| Game's own schedule | Delays the game couldn't have chosen; round parts that don't add up |
| Clock integrity (`performance.now()` vs `Date.now()`, native functions) | Slowed down or patched timers |
| Human limits | Average under 140 ms, spread under 5 ms, reactions all on a screen refresh (bots watching pixels) |
| Replay | A stored score that doesn't match the recorded rounds |
| HMAC seal | Any edit to the saved data, even one that's consistent |

- **Seal:** runs are signed with an HMAC-SHA-256 key generated by Web Crypto as **non-extractable**. It's kept in IndexedDB, so the page can sign with it but can't read it. Editing `localStorage` therefore breaks the seal, even when the numbers are rewritten consistently. If a browser can't sign (no Web Crypto or IndexedDB), only the replay checks apply, and the leaderboard says so.
- **Excluded runs:** refused or tampered runs appear in an "Excluded runs" list, with the reason for each. Deleting a player deletes their runs.
- **Thresholds:** they're deliberately conservative, so that a real person is never flagged. People vary by 20 to 40 ms between reactions.
- **Honest limit:** all of this runs in the browser. It stops casual cheating: editing saved data, scripts, simple bots and clock tricks. It doesn't stop a determined expert, for example someone who signs with the key from devtools or uses a physical auto-clicker that imitates human variability. A trustworthy **global** leaderboard needs a server that fixes the delays itself and validates the runs.

Achievement: "On the Board" (get a verified run on the leaderboard).

## Data

Profiles are saved in `localStorage` under the key `reflexlab.v1`. Audio, display and language settings are saved separately, under `reflexlab.prefs.v1`. The leaderboard is saved under `reflexlab.board.v1`, and its signing key is in IndexedDB (in the `reflexlab` database). That means they're saved in this browser only. Clearing site data removes them.

- Every value is checked when it's loaded. A missing or wrong value is replaced with a safe default.
- If the saved data can't be read, the game copies it to `reflexlab.v1.backup` and starts a fresh profile.
- If the browser blocks storage (private browsing, for example), the game still works. Your progress lasts until you close the page, and a message tells you that.
- If saving fails (for example when storage is full), a message appears once. The game keeps running.
- Progress saved in another tab of this browser is picked up automatically, unless a round is being timed.

The current session's stats (average, chart, level) stay in memory only.

## Structure

```
index.html          markup: stage, controls, stats, chart, profile window
favicon.png         32×32 tab icon
css/style.css       colour tokens, per-state styles, profile window, responsive layout
js/config.js        settings: timings, difficulty levels (LEVELS), power-ups (POWERUPS), colours, 3D presets
js/i18n.js          translations (English, French): t(), plurals, data-i18n attributes
js/storage.js       saving and loading, data checks, preferences
js/achievements.js  achievement definitions and their rules
js/audio.js         synthesised sound effects and music (Web Audio API)
js/leaderboard.js   verified leaderboard: anti-cheat checks, replay, HMAC seal
js/app.js           stats, 3D scene (ReactionScene), game state machine, profile window, render loop
desktop/            Electron app: main.js, scripts (prepare-app, make-icon, smoke-test, run-electron)
```
