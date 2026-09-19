# Reflex Lab

A reaction-time game with a Three.js 3D scene. Plain HTML/CSS/JS, no build step. Three.js r128 is loaded from cdnjs.

## Run

Open `index.html` in a browser.

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

## Profiles, high scores and achievements

To open your profile, click your name in the top bar. Opening it pauses the current session.

- **Profile:** your display name, avatar colour and lifetime stats: best time, average, peak level, sessions, false starts and decoys dodged. The profile also lists everyone who has played on this device. You can switch player, add a player (up to 8) or delete one (you press the button twice to confirm).
- **High scores:** your personal best, your best average over 5 reactions in a row and your longest run without a false start or miss. There's also a top-10 leaderboard of every player on this device. A result screen tells you when you set a new personal record.
- **Achievements:** there are 16 achievements, covering speed, consistency, dodging decoys, levels and volume. Some of them count toward a goal, and those show a progress bar. When you unlock one, a notification pops up.

**Reset** clears only the current session's stats. It never touches your profile.

## Data

Profiles are saved in `localStorage` under the key `reflexlab.v1`. Audio settings are saved separately, under `reflexlab.prefs.v1`. That means they're saved in this browser only. Clearing site data removes them.

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
js/config.js        settings: timings, difficulty levels (LEVELS), colours, 3D presets
js/storage.js       saving and loading, data checks, leaderboard
js/achievements.js  achievement definitions and their rules
js/audio.js         synthesised sound effects and music (Web Audio API)
js/app.js           stats, 3D scene (ReactionScene), game state machine, profile window, render loop
```
