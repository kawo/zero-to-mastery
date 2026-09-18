# Reflex Lab

A reaction-time game with a Three.js 3D scene. Plain HTML/CSS/JS, no build step. Three.js r128 is loaded from cdnjs.

## Run

Open `index.html` in a browser, or serve the folder:

```bash
npx serve .
```

## How to play

1. Press **Start session**, or tap the pad.
2. The shape turns amber. A random delay of 1 to 5 s starts.
3. When the shape turns green, click, tap or press `Space`.
4. If you react before green, or in under 100 ms, it counts as a false start. False starts aren't included in the average.

`Esc` stops the session. **Reset** clears the stats.

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

## Data

Stats live in JavaScript memory only. There's no `localStorage` or cookies. Reloading the page clears them.

## Structure

```
index.html      markup: stage, controls, stats and chart
favicon.png     32×32 tab icon
css/style.css   colour tokens, per-state styles, responsive layout
js/app.js       config, stats, 3D scene (ReactionScene), game state machine, render loop
```
