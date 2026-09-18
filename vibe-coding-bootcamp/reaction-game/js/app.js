(() => {
  'use strict';

  /* ======================================================================
   * Configuration
   * ==================================================================== */
  const CONFIG = Object.freeze({
    minDelayMs: 1000,        // earliest the stimulus can fire after a round starts
    maxDelayMs: 5000,        // latest
    anticipationMs: 100,     // faster than visual processing allows → counted as a guess
    timeoutMs: 3000,         // no reaction within this window → round voided
    historySize: 15,         // bars shown in the chart
    maxPixelRatio: 2,
    slowFrameMs: 25,         // average frame time that triggers a resolution drop
  });

  const COLORS = Object.freeze({
    idle: 0x94a3b8,
    waiting: 0xf59e0b,
    go: 0x10b981,
    result: 0x3b82f6,
    error: 0xef4444,
  });

  // Visual preset for each scene mode. The game maps its states onto these.
  const PRESETS = Object.freeze({
    idle:    { shape: 'idle',    color: COLORS.idle,    spin: 0.25, radius: 2.5, orbit: 0.12, glow: 0.12, light: 0.6 },
    waiting: { shape: 'waiting', color: COLORS.waiting, spin: 0.7,  radius: 2.1, orbit: 0.45, glow: 0.3,  light: 1.3 },
    go:      { shape: 'go',      color: COLORS.go,      spin: 1.6,  radius: 3.0, orbit: 1.1,  glow: 0.75, light: 2.8 },
    result:  { shape: 'result',  color: COLORS.result,  spin: 0.35, radius: 2.6, orbit: 0.2,  glow: 0.25, light: 1.1 },
    error:   { shape: 'error',   color: COLORS.error,   spin: 0.9,  radius: 3.2, orbit: -0.6, glow: 0.4,  light: 1.7 },
  });

  /* ======================================================================
   * Utilities
   * ==================================================================== */

  /** Uniform random delay in [min, max). Uses the CSPRNG where available. */
  function randomDelay() {
    let r;
    if (window.crypto && typeof window.crypto.getRandomValues === 'function') {
      const buf = new Uint32Array(1);
      window.crypto.getRandomValues(buf);
      r = buf[0] / 4294967296;
    } else {
      r = Math.random();
    }
    return CONFIG.minDelayMs + r * (CONFIG.maxDelayMs - CONFIG.minDelayMs);
  }

  /**
   * Best available timestamp for an input event. `event.timeStamp` records when
   * the OS delivered the input, so it isn't inflated if the main thread was busy
   * rendering. Legacy engines used epoch-based values; those fail the range check.
   */
  function inputTime(event) {
    const now = performance.now();
    const ts = event && event.timeStamp;
    if (typeof ts === 'number' && ts > 0 && ts <= now + 1 && now - ts < 1000) return ts;
    return now;
  }

  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
  const fmt = (ms) => Math.round(ms).toString();

  /* ======================================================================
   * Statistics (pure functions over the session's valid times)
   * ==================================================================== */
  function summarize(times) {
    const n = times.length;
    if (n === 0) return { n: 0 };
    let sum = 0;
    let best = Infinity;
    for (const t of times) { sum += t; if (t < best) best = t; }
    const mean = sum / n;
    let variance = 0;
    for (const t of times) variance += (t - mean) * (t - mean);
    const sd = n > 1 ? Math.sqrt(variance / (n - 1)) : 0;
    const sorted = times.slice().sort((a, b) => a - b);
    const mid = n >> 1;
    const median = n % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
    return { n, best, mean, sd, median, last: times[n - 1] };
  }

  function rate(ms) {
    if (ms < 180) return 'Elite reflexes';
    if (ms < 220) return 'Excellent';
    if (ms < 270) return 'Sharp, above typical';
    if (ms < 330) return 'Typical human range';
    if (ms < 420) return 'A little slow, stay focused';
    return 'Slow. Shake it off and go again';
  }

  /* ======================================================================
   * 3D scene
   * ==================================================================== */
  class ReactionScene {
    constructor(canvas, container, { onQualityChange } = {}) {
      this.canvas = canvas;
      this.container = container;
      this.onQualityChange = onQualityChange || (() => {});
      this.ready = false;
      this.contextLost = false;
      this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

      this.mode = 'idle';
      this.params = { ...PRESETS.idle };
      this.target = { ...PRESETS.idle };
      this.morph = null;        // { t, next } while swapping shapes
      this.pop = 0;             // scale impulse for the stimulus
      this.shake = 0;           // camera shake for errors
      this.orbitAngle = 0;
      this.pointer = { x: 0, y: 0 };
      this.cameraBaseZ = 7;

      this.pixelRatio = Math.min(window.devicePixelRatio || 1, CONFIG.maxPixelRatio);
      this.frameSamples = 0;
      this.frameTotal = 0;

      this._geometries = [];
      this._materials = [];
      this._onLost = this._onLost.bind(this);
      this._onRestored = this._onRestored.bind(this);
    }

    init() {
      if (typeof THREE === 'undefined') throw new Error('the Three.js library did not load');

      const renderer = new THREE.WebGLRenderer({
        canvas: this.canvas,
        antialias: true,
        alpha: true,
        powerPreference: 'high-performance',
      });
      renderer.setPixelRatio(this.pixelRatio);
      renderer.setClearColor(0x000000, 0);
      renderer.outputEncoding = THREE.sRGBEncoding;
      this.renderer = renderer;

      const scene = new THREE.Scene();
      scene.fog = new THREE.Fog(0x0f172a, 9, 20);
      this.scene = scene;

      this.camera = new THREE.PerspectiveCamera(40, 1, 0.1, 60);
      this.camera.position.set(0, 0.5, this.cameraBaseZ);
      this.lookTarget = new THREE.Vector3(0, -0.85, 0); // lifts the object above the overlay text

      // Lighting: soft sky fill, a white key, a cool rim and a state-coloured point light.
      scene.add(new THREE.HemisphereLight(0xdbeafe, 0x0f172a, 0.55));
      const key = new THREE.DirectionalLight(0xffffff, 0.9);
      key.position.set(4, 6, 5);
      scene.add(key);
      const rim = new THREE.DirectionalLight(0x3b82f6, 0.45);
      rim.position.set(-5, -2, -4);
      scene.add(rim);
      this.stateLight = new THREE.PointLight(COLORS.idle, 0.6, 12);
      this.stateLight.position.set(0, 0.2, 2.6);
      scene.add(this.stateLight);

      // A distinct polyhedron per state; edges are precomputed so swaps are free.
      const shapes = {
        idle: new THREE.IcosahedronGeometry(1, 0),
        waiting: new THREE.OctahedronGeometry(1.15, 0),
        go: new THREE.IcosahedronGeometry(1.05, 1),
        result: new THREE.DodecahedronGeometry(1, 0),
        error: new THREE.TetrahedronGeometry(1.3, 0),
      };
      this.shapes = {};
      for (const [name, geo] of Object.entries(shapes)) {
        const edges = new THREE.EdgesGeometry(geo);
        this.shapes[name] = { geo, edges };
        this._geometries.push(geo, edges);
      }

      this.color = new THREE.Color(COLORS.idle);
      this.targetColor = new THREE.Color(COLORS.idle);

      this.coreMat = this._track(new THREE.MeshStandardMaterial({
        color: COLORS.idle, emissive: COLORS.idle, emissiveIntensity: 0.12,
        metalness: 0.35, roughness: 0.38, flatShading: true,
      }));
      this.wireMat = this._track(new THREE.LineBasicMaterial({ color: COLORS.idle, transparent: true, opacity: 0.55 }));

      this.core = new THREE.Mesh(this.shapes.idle.geo, this.coreMat);
      this.wire = new THREE.LineSegments(this.shapes.idle.edges, this.wireMat);
      this.wire.scale.setScalar(1.22);
      this.group = new THREE.Group();
      this.group.add(this.core, this.wire);
      scene.add(this.group);

      // Thin halo ring around the core.
      const haloGeo = this._trackGeo(new THREE.TorusGeometry(1.95, 0.012, 8, 160));
      this.haloMat = this._track(new THREE.MeshBasicMaterial({ color: COLORS.idle, transparent: true, opacity: 0.5 }));
      this.halo = new THREE.Mesh(haloGeo, this.haloMat);
      this.halo.rotation.x = Math.PI * 0.42;
      scene.add(this.halo);

      // Orbiting cubes: one InstancedMesh = one draw call.
      this.orbitCount = 42;
      const cubeGeo = this._trackGeo(new THREE.BoxGeometry(0.09, 0.09, 0.09));
      this.orbitMat = this._track(new THREE.MeshStandardMaterial({
        color: COLORS.idle, emissive: COLORS.idle, emissiveIntensity: 0.35, metalness: 0.2, roughness: 0.5,
      }));
      this.orbit = new THREE.InstancedMesh(cubeGeo, this.orbitMat, this.orbitCount);
      this.orbit.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.orbitSeeds = Array.from({ length: this.orbitCount }, () => Math.random());
      this.dummy = new THREE.Object3D();
      scene.add(this.orbit);

      // Distant star field for depth.
      const starCount = 520;
      const positions = new Float32Array(starCount * 3);
      for (let i = 0; i < starCount; i++) {
        const r = 7 + Math.random() * 8;
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1);
        positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
        positions[i * 3 + 1] = r * Math.cos(phi) * 0.6;
        positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta) - 4;
      }
      const starGeo = this._trackGeo(new THREE.BufferGeometry());
      starGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      const starMat = this._track(new THREE.PointsMaterial({
        color: 0x94a3b8, size: 0.035, transparent: true, opacity: 0.55, depthWrite: false,
      }));
      this.stars = new THREE.Points(starGeo, starMat);
      scene.add(this.stars);

      this.canvas.addEventListener('webglcontextlost', this._onLost, false);
      this.canvas.addEventListener('webglcontextrestored', this._onRestored, false);

      this.resizeObserver = new ResizeObserver(() => this.resize());
      this.resizeObserver.observe(this.container);
      this.resize();

      this.ready = true;
      this.onQualityChange(this.pixelRatio);
    }

    _track(material) { this._materials.push(material); return material; }
    _trackGeo(geometry) { this._geometries.push(geometry); return geometry; }

    _onLost(event) {
      event.preventDefault(); // allows the browser to restore the context
      this.contextLost = true;
    }
    _onRestored() {
      this.contextLost = false;
      this.resize();
    }

    resize() {
      if (!this.renderer) return;
      const w = Math.max(1, this.container.clientWidth);
      const h = Math.max(1, this.container.clientHeight);
      this.renderer.setSize(w, h, false);
      const aspect = w / h;
      this.camera.aspect = aspect;
      // Pull back on portrait screens so the orbit ring stays in frame.
      this.cameraBaseZ = aspect >= 1 ? 7 : 7 + (1 - aspect) * 7.5;
      this.camera.updateProjectionMatrix();
    }

    /**
     * Switch visual mode. `instant` snaps colour, shape and motion on this very
     * frame; it's used for the stimulus so the eye gets one unambiguous change.
     */
    setMode(mode, { instant = false } = {}) {
      const preset = PRESETS[mode];
      if (!preset || !this.ready) return;
      const shapeChanged = preset.shape !== this.target.shape;
      this.mode = mode;
      this.target = { ...preset };
      this.targetColor.setHex(preset.color);

      if (instant) {
        this.color.copy(this.targetColor);
        Object.assign(this.params, preset);
        this.morph = null;
        this._setShape(preset.shape);
        this.pop = 1;
      } else if (shapeChanged) {
        // If a morph is mid-flight, continue from the same scale instead of jumping.
        let t = 0;
        if (this.morph) t = this.morph.swapped ? 1 - this.morph.t : this.morph.t;
        this.morph = { t, next: preset.shape, swapped: false };
      }
      if (mode === 'error' && !this.reducedMotion) this.shake = 1;
    }

    _setShape(name) {
      const s = this.shapes[name];
      this.core.geometry = s.geo;
      this.wire.geometry = s.edges;
    }

    /** Record frame cost and lower resolution if the GPU can't keep up. */
    _adaptQuality(dt) {
      if (dt > 0.25) return; // ignore stalls from tab switches
      this.frameTotal += dt;
      this.frameSamples += 1;
      if (this.frameSamples < 90) return;
      const avgMs = (this.frameTotal / this.frameSamples) * 1000;
      this.frameTotal = 0;
      this.frameSamples = 0;
      if (avgMs > CONFIG.slowFrameMs && this.pixelRatio > 1) {
        this.pixelRatio = Math.max(1, this.pixelRatio - 0.25);
        this.renderer.setPixelRatio(this.pixelRatio);
        this.resize();
        this.onQualityChange(this.pixelRatio);
      }
    }

    update(dt, time) {
      if (!this.ready || this.contextLost) return;
      this._adaptQuality(dt);

      const motion = this.reducedMotion ? 0.3 : 1;
      const k = 1 - Math.exp(-dt * 6);

      // Ease colour and motion parameters towards the current preset.
      this.color.lerp(this.targetColor, k);
      for (const key of ['spin', 'radius', 'orbit', 'glow', 'light']) {
        this.params[key] += (this.target[key] - this.params[key]) * k;
      }
      const c = this.color;
      this.coreMat.color.copy(c);
      this.coreMat.emissive.copy(c);
      this.wireMat.color.copy(c);
      this.haloMat.color.copy(c);
      this.orbitMat.color.copy(c);
      this.orbitMat.emissive.copy(c);
      this.stateLight.color.copy(c);

      // Shape morph: shrink out, swap geometry, grow back in.
      let scale = 1;
      if (this.morph) {
        this.morph.t = Math.min(1, this.morph.t + dt / 0.36);
        const t = this.morph.t;
        if (t >= 0.5 && !this.morph.swapped) { this._setShape(this.morph.next); this.morph.swapped = true; }
        scale = t < 0.5 ? 1 - easeInOut(t * 2) * 0.85 : 0.15 + easeInOut((t - 0.5) * 2) * 0.85;
        if (t >= 1) this.morph = null;
      }

      // Stimulus pop and the waiting "breath". The breath runs at a fixed rate
      // so it can never hint at when the stimulus will fire.
      scale *= 1 + 0.22 * this.pop;
      this.pop *= Math.exp(-dt * 7);
      let pulse = 0;
      if (this.mode === 'waiting' && !this.reducedMotion) pulse = Math.sin(time * 4.2);
      scale *= 1 + 0.045 * pulse;
      this.group.scale.setScalar(scale);

      this.coreMat.emissiveIntensity = this.params.glow + 0.12 * Math.max(0, pulse);
      this.stateLight.intensity = this.params.light;

      this.group.rotation.y += this.params.spin * dt * motion;
      this.group.rotation.x += this.params.spin * 0.45 * dt * motion;
      this.wire.rotation.y -= this.params.spin * 0.3 * dt * motion;

      this.halo.rotation.z += dt * 0.2 * motion;
      this.halo.scale.setScalar(this.params.radius / 2.5);

      // Orbiting cubes.
      this.orbitAngle += this.params.orbit * dt * motion;
      const n = this.orbitCount;
      const jitter = this.mode === 'error' ? 0.35 : 0;
      for (let i = 0; i < n; i++) {
        const seed = this.orbitSeeds[i];
        const a = (i / n) * Math.PI * 2 + this.orbitAngle;
        const r = this.params.radius + Math.sin(time * 2 + seed * 20) * (0.06 + jitter * seed);
        this.dummy.position.set(Math.cos(a) * r, Math.sin(a * 3 + time * 0.8) * 0.22, Math.sin(a) * r);
        this.dummy.rotation.set(time * (0.5 + seed), time * 0.7 + seed * 6, 0);
        this.dummy.scale.setScalar(0.7 + seed * 0.8);
        this.dummy.updateMatrix();
        this.orbit.setMatrixAt(i, this.dummy.matrix);
      }
      this.orbit.instanceMatrix.needsUpdate = true;

      this.stars.rotation.y += dt * 0.012 * motion;

      // Camera: gentle pointer parallax plus a decaying shake on errors.
      const cam = this.camera;
      const shakeAmt = this.shake * 0.18;
      this.shake = Math.max(0, this.shake - dt * 2.6);
      const tx = this.pointer.x * 0.45 + (Math.random() - 0.5) * shakeAmt;
      const ty = 0.5 + this.pointer.y * 0.25 + (Math.random() - 0.5) * shakeAmt;
      cam.position.x += (tx - cam.position.x) * (shakeAmt ? 1 : k);
      cam.position.y += (ty - cam.position.y) * (shakeAmt ? 1 : k);
      cam.position.z += (this.cameraBaseZ - cam.position.z) * k;
      cam.lookAt(this.lookTarget);

      this.renderer.render(this.scene, cam);
    }

    /** Release every GPU resource this scene created. */
    dispose() {
      this.ready = false;
      if (this.resizeObserver) this.resizeObserver.disconnect();
      this.canvas.removeEventListener('webglcontextlost', this._onLost);
      this.canvas.removeEventListener('webglcontextrestored', this._onRestored);
      for (const g of this._geometries) g.dispose();
      for (const m of this._materials) m.dispose();
      if (this.orbit && typeof this.orbit.dispose === 'function') this.orbit.dispose();
      if (this.scene) this.scene.clear();
      if (this.renderer) {
        this.renderer.dispose();
        this.renderer.forceContextLoss();
      }
      this._geometries.length = 0;
      this._materials.length = 0;
    }
  }

  /* ======================================================================
   * DOM references
   * ==================================================================== */
  const $ = (id) => {
    const el = document.getElementById(id);
    if (!el) throw new Error(`Missing element #${id}`);
    return el;
  };
  const dom = {
    app: $('app'), stage: $('stage'), canvas: $('scene'), flatOrb: $('flatOrb'),
    stateLabel: $('stateLabel'), roundCount: $('roundCount'),
    eyebrow: $('eyebrow'), headline: $('headline'), readout: $('readout'), readoutValue: $('readoutValue'),
    subline: $('subline'), hint: $('stageHint'),
    startBtn: $('startBtn'), resetBtn: $('resetBtn'),
    statsScope: $('statsScope'), statLast: $('statLast'), statBest: $('statBest'), statAvg: $('statAvg'),
    statSd: $('statSd'), statCount: $('statCount'), statMedian: $('statMedian'),
    statFalse: $('statFalse'), statMissed: $('statMissed'),
    chart: $('chart'), chartEmpty: $('chartEmpty'),
    renderChip: $('renderChip'), renderStatus: $('renderStatus'),
    banner: $('banner'), bannerText: $('bannerText'), bannerClose: $('bannerClose'),
    live: $('live'),
  };
  const HINT_DEFAULT = dom.hint.innerHTML;

  /* ======================================================================
   * Game state
   * ==================================================================== */
  const STATE = Object.freeze({
    IDLE: 'idle', WAITING: 'waiting', GO: 'go', RESULT: 'result', FALSE_START: 'false', MISSED: 'missed',
  });
  const SCENE_MODE = {
    idle: 'idle', waiting: 'waiting', go: 'go', result: 'result', false: 'error', missed: 'error',
  };

  // Everything lives in memory for this page view only.
  const session = { times: [], falseStarts: 0, missed: 0, rounds: 0 };

  const game = {
    state: STATE.IDLE,
    running: false,
    delayTimer: null,
    timeoutTimer: null,
    pendingStimulus: false, // delay elapsed; show stimulus on the next frame
    commitAt: 0,            // when the stimulus frame was drawn
    stimulusAt: 0,          // best estimate of when it reached the screen
    awaitingPresent: false,
  };

  let scene = null;
  let rafId = 0;
  let lastFrame = performance.now();
  let fpsFrames = 0;
  let fpsSince = performance.now();
  let sceneErrors = 0;

  function clearTimers() {
    clearTimeout(game.delayTimer);
    clearTimeout(game.timeoutTimer);
    game.delayTimer = null;
    game.timeoutTimer = null;
    game.pendingStimulus = false;
    game.awaitingPresent = false;
  }

  function announce(text) {
    // Re-set so identical consecutive messages are still announced.
    dom.live.textContent = '';
    window.setTimeout(() => { dom.live.textContent = text; }, 30);
  }

  /* ---------- View: one place that maps a state to on-screen copy ---------- */
  const VIEW = {
    idle:    { pill: 'Idle',        eyebrow: 'Ready when you are', headline: 'Test your reflexes',
               sub: 'Press Start, wait for the shape to turn green, then react as fast as you can.' },
    waiting: { pill: 'Wait',        eyebrow: 'Hold steady',        headline: 'Wait for green…',
               sub: 'The signal fires after a random 1–5 second delay. Don’t guess.',
               hint: 'React only when the shape turns green' },
    go:      { pill: 'Go',          eyebrow: 'Now',                headline: 'React!', sub: '' },
    result:  { pill: 'Result',      hint: '<kbd>Space</kbd>, click or tap for the next round' },
    false:   { pill: 'False start', eyebrow: 'Too soon',          hint: '<kbd>Space</kbd>, click or tap to try again' },
    missed:  { pill: 'Missed',      eyebrow: 'No reaction',        headline: 'Too slow',
               sub: `Nothing registered within ${CONFIG.timeoutMs / 1000} seconds, so this round doesn’t count.`,
               hint: '<kbd>Space</kbd>, click or tap to try again' },
  };

  function setState(next, copy = {}) {
    game.state = next;
    const view = { ...VIEW[next], ...copy };

    dom.app.dataset.state = next;
    dom.stateLabel.textContent = view.pill;
    dom.eyebrow.textContent = view.eyebrow || '';
    dom.headline.textContent = view.headline || '';
    dom.headline.hidden = !view.headline;
    dom.subline.innerHTML = view.sub || '';
    dom.subline.hidden = !view.sub;
    dom.hint.innerHTML = view.hint || HINT_DEFAULT;

    const showReadout = typeof view.readout === 'number';
    dom.readout.hidden = !showReadout;
    if (showReadout) dom.readoutValue.textContent = fmt(view.readout);

    if (scene) scene.setMode(SCENE_MODE[next], { instant: next === STATE.GO });
    renderControls();
  }

  /* ---------- Session flow ---------- */
  function startSession() {
    if (game.running) return;
    game.running = true;
    beginRound();
    dom.stage.focus({ preventScroll: true }); // so Space reacts instead of re-pressing the button
    announce('Session started. Wait for green.');
  }

  function stopSession(copy) {
    clearTimers();
    game.running = false;
    setState(STATE.IDLE, copy || {
      eyebrow: 'Session paused',
      headline: session.times.length ? 'Nice work' : 'Test your reflexes',
      sub: session.times.length
        ? 'Your stats are kept until you reset or leave the page. Press Start to continue.'
        : VIEW.idle.sub,
    });
  }

  function beginRound() {
    clearTimers();
    session.rounds += 1;
    setState(STATE.WAITING);
    game.delayTimer = window.setTimeout(() => {
      game.delayTimer = null;
      // Don't touch the DOM or scene here: the render loop shows the stimulus on
      // its next frame so the canvas and the page change together.
      game.pendingStimulus = true;
    }, randomDelay());
  }

  /** Called from the render loop on the frame that shows the stimulus. */
  function commitStimulus() {
    game.pendingStimulus = false;
    setState(STATE.GO);
  }

  function onStimulusDrawn() {
    game.commitAt = performance.now();
    game.stimulusAt = game.commitAt;
    game.awaitingPresent = true;
    game.timeoutTimer = window.setTimeout(onMissed, CONFIG.timeoutMs);
  }

  function falseStart(reactionMs) {
    clearTimers();
    session.falseStarts += 1;
    const anticipated = typeof reactionMs === 'number';
    setState(STATE.FALSE_START, anticipated ? {
      eyebrow: 'Anticipated',
      headline: `${fmt(Math.max(0, reactionMs))} ms is a guess`,
      sub: `Visual reactions under ${CONFIG.anticipationMs} ms aren’t physiologically possible, so this one counts as a false start.`,
    } : {
      headline: 'Too soon!',
      sub: 'You reacted before the shape turned green. False starts aren’t averaged, but they are counted.',
    });
    renderStats();
    announce(anticipated ? 'Anticipated. Counted as a false start.' : 'Too soon. False start.');
  }

  function onMissed() {
    game.timeoutTimer = null;
    if (game.state !== STATE.GO) return;
    clearTimers();
    session.missed += 1;
    setState(STATE.MISSED);
    renderStats();
    announce('Too slow. Round not counted.');
  }

  function recordResult(ms) {
    clearTimers();
    const prev = summarize(session.times);
    session.times.push(ms);
    const now = summarize(session.times);

    let sub;
    if (prev.n === 0) {
      sub = 'First valid attempt of the session. Keep going to build an average.';
    } else if (ms < prev.best) {
      sub = `<strong>New session best</strong>, ${fmt(prev.best - ms)} ms faster than your previous record.`;
    } else {
      const delta = ms - prev.mean;
      sub = `<strong>${fmt(Math.abs(delta))} ms ${delta <= 0 ? 'faster' : 'slower'}</strong> than your average of ${fmt(prev.mean)} ms.`;
    }

    setState(STATE.RESULT, { eyebrow: rate(ms), headline: '', readout: ms, sub });
    renderStats(now);
    announce(`${fmt(ms)} milliseconds. ${rate(ms)}.`);
  }

  function resetSession() {
    clearTimers();
    game.running = false;
    session.times.length = 0;
    session.falseStarts = 0;
    session.missed = 0;
    session.rounds = 0;
    setState(STATE.IDLE, { eyebrow: 'Session cleared', headline: 'Test your reflexes' });
    renderStats();
    announce('Session cleared.');
  }

  /** Single entry point for a reaction from mouse, touch, pen or keyboard. */
  function handleReaction(timestamp) {
    switch (game.state) {
      case STATE.IDLE:
        startSession();
        break;
      case STATE.WAITING:
        falseStart();
        break;
      case STATE.GO: {
        const ms = timestamp - game.stimulusAt;
        if (ms < CONFIG.anticipationMs) falseStart(ms);
        else recordResult(ms);
        break;
      }
      case STATE.RESULT:
      case STATE.FALSE_START:
      case STATE.MISSED:
        if (game.running) beginRound();
        else startSession();
        break;
      default:
        break;
    }
  }

  /* ======================================================================
   * Rendering: controls, stats, chart
   * ==================================================================== */
  function renderControls() {
    dom.startBtn.textContent = game.running ? 'Stop session' : 'Start session';
    dom.startBtn.classList.toggle('is-running', game.running);
    const hasData = session.rounds > 0 || session.times.length > 0;
    dom.resetBtn.disabled = !hasData;
    dom.roundCount.textContent = session.rounds ? `Round ${session.rounds}` : '';
  }

  function msMarkup(ms) {
    return `${fmt(ms)}<span class="u">ms</span>`;
  }

  function renderStats(summary = summarize(session.times)) {
    if (summary.n === 0) {
      dom.statLast.textContent = '—';
      dom.statBest.textContent = '—';
      dom.statAvg.textContent = '—';
      dom.statSd.innerHTML = '&nbsp;';
      dom.statMedian.innerHTML = '&nbsp;';
      dom.statsScope.textContent = 'No attempts yet';
    } else {
      dom.statLast.innerHTML = msMarkup(summary.last);
      dom.statBest.innerHTML = msMarkup(summary.best);
      dom.statAvg.innerHTML = msMarkup(summary.mean);
      dom.statSd.textContent = summary.n > 1 ? `± ${fmt(summary.sd)} ms spread` : 'needs 2+ attempts';
      dom.statMedian.textContent = `median ${fmt(summary.median)} ms`;
      dom.statsScope.textContent = 'This page view';
    }
    dom.statCount.textContent = String(summary.n || 0);
    dom.statFalse.textContent = String(session.falseStarts);
    dom.statFalse.classList.toggle('has-errors', session.falseStarts > 0);
    dom.statMissed.textContent = String(session.missed);
    renderChart(summary);
    renderControls();
  }

  const SVG_NS = 'http://www.w3.org/2000/svg';
  function svgEl(tag, attrs, text) {
    const el = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
    if (text != null) el.textContent = text;
    return el;
  }

  function renderChart(summary) {
    const svg = dom.chart;
    const times = session.times.slice(-CONFIG.historySize);
    const empty = times.length === 0;
    dom.chartEmpty.hidden = !empty;
    svg.hidden = empty;
    svg.replaceChildren();
    if (empty) return;

    const W = 300, H = 130, left = 30, right = 4, top = 8, bottom = 18;
    const plotW = W - left - right;
    const plotH = H - top - bottom;
    const maxVal = Math.max(400, Math.ceil(Math.max(...times) / 100) * 100);
    const y = (v) => top + plotH - (v / maxVal) * plotH;
    const slot = plotW / CONFIG.historySize;
    const barW = Math.max(4, slot - 5);
    const firstIndex = session.times.length - times.length;

    // Gridlines every 100 ms (every 200 ms when the scale gets tall).
    const step = maxVal > 600 ? 200 : 100;
    for (let v = 0; v <= maxVal; v += step) {
      svg.appendChild(svgEl('line', {
        x1: left, x2: W - right, y1: y(v), y2: y(v),
        stroke: v === 0 ? 'rgba(148,163,184,0.35)' : 'rgba(148,163,184,0.12)', 'stroke-width': 1,
      }));
      svg.appendChild(svgEl('text', { x: left - 5, y: y(v) + 3, 'text-anchor': 'end' }, v));
    }

    times.forEach((t, i) => {
      const x = left + i * slot + (slot - barW) / 2;
      const isBest = t === summary.best;
      const isLast = i === times.length - 1;
      const bar = svgEl('rect', {
        x, y: y(t), width: barW, height: Math.max(1, y(0) - y(t)), rx: 2,
        fill: isBest ? '#10B981' : '#3B82F6',
        'fill-opacity': isLast || isBest ? 1 : 0.6,
      });
      bar.appendChild(svgEl('title', {}, `Attempt ${firstIndex + i + 1}: ${fmt(t)} ms${isBest ? ' (best)' : ''}`));
      svg.appendChild(bar);
    });

    // Session average (all attempts, not only the visible ones).
    const avgY = y(Math.min(summary.mean, maxVal));
    svg.appendChild(svgEl('line', {
      x1: left, x2: W - right, y1: avgY, y2: avgY,
      stroke: '#F1F5F9', 'stroke-width': 1, 'stroke-dasharray': '4 3', opacity: 0.7,
    }));
    const labelY = avgY - 4 < top + 8 ? avgY + 11 : avgY - 4;
    svg.appendChild(svgEl('text', { x: W - right, y: labelY, 'text-anchor': 'end', style: 'fill:#F1F5F9' }, `avg ${fmt(summary.mean)}`));
    svg.appendChild(svgEl('text', { x: left, y: H - 4 }, `#${firstIndex + 1}`));
    svg.appendChild(svgEl('text', { x: W - right, y: H - 4, 'text-anchor': 'end' }, `#${session.times.length}`));

    svg.setAttribute('aria-label',
      `Bar chart of the last ${times.length} reaction times. Average ${fmt(summary.mean)} ms, best ${fmt(summary.best)} ms.`);
  }

  function showBanner(message) {
    dom.bannerText.textContent = message;
    dom.banner.hidden = false;
  }

  function setRenderStatus(text, degraded = false) {
    dom.renderStatus.textContent = text;
    dom.renderChip.classList.toggle('is-degraded', degraded);
  }

  /* ======================================================================
   * Render loop
   * ==================================================================== */
  function enterFlatMode(reason) {
    if (scene) {
      try { scene.dispose(); } catch (e) { /* already torn down */ }
    }
    scene = null;
    dom.canvas.hidden = true;
    dom.flatOrb.hidden = false;
    setRenderStatus('2D fallback', true);
    showBanner(`3D graphics are unavailable (${reason}). The game still works, with a simplified display.`);
  }

  function tick(now) {
    rafId = window.requestAnimationFrame(tick);

    // The frame after the stimulus was drawn is when it actually reached the
    // screen (± one refresh). Bounded so a janky frame can't flatter the result.
    if (game.awaitingPresent) {
      game.stimulusAt = Math.min(performance.now(), game.commitAt + 1000 / 60);
      game.awaitingPresent = false;
    }

    const stimulusThisFrame = game.pendingStimulus && game.state === STATE.WAITING;
    if (stimulusThisFrame) commitStimulus();

    const dt = clamp((now - lastFrame) / 1000, 0, 0.1);
    lastFrame = now;

    if (scene) {
      try {
        scene.update(dt, now / 1000);
        sceneErrors = 0;
      } catch (err) {
        console.error('[Reflex Lab] render error', err);
        if (++sceneErrors > 3) enterFlatMode('repeated rendering errors');
      }
    }

    if (stimulusThisFrame) onStimulusDrawn();

    fpsFrames += 1;
    if (now - fpsSince >= 500) {
      const fps = Math.round((fpsFrames * 1000) / (now - fpsSince));
      fpsFrames = 0;
      fpsSince = now;
      if (scene && scene.ready) {
        if (scene.contextLost) setRenderStatus('WebGL context lost, recovering…', true);
        else setRenderStatus(`WebGL · ${fps} fps · ${scene.pixelRatio.toFixed(2).replace(/\.?0+$/, '')}×`, fps < 40);
      }
    }
  }

  /* ======================================================================
   * Events
   * ==================================================================== */
  function bindEvents() {
    dom.stage.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      e.preventDefault();
      dom.stage.focus({ preventScroll: true });
      handleReaction(inputTime(e));
    });

    dom.stage.addEventListener('pointermove', (e) => {
      if (!scene || e.pointerType !== 'mouse') return;
      const r = dom.stage.getBoundingClientRect();
      scene.pointer.x = ((e.clientX - r.left) / r.width) * 2 - 1;
      scene.pointer.y = -(((e.clientY - r.top) / r.height) * 2 - 1);
    });
    dom.stage.addEventListener('pointerleave', () => {
      if (scene) { scene.pointer.x = 0; scene.pointer.y = 0; }
    });
    dom.stage.addEventListener('contextmenu', (e) => e.preventDefault());

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && game.running) {
        stopSession();
        return;
      }
      const isSpace = e.code === 'Space' || e.key === ' ';
      const isEnter = e.key === 'Enter' && e.target === dom.stage;
      if (!isSpace && !isEnter) return;
      // Let buttons and other controls keep their native keyboard behaviour.
      const t = e.target;
      if (t !== dom.stage && t instanceof Element && t.closest('button, a, input, select, textarea')) return;
      e.preventDefault();
      if (e.repeat) return; // holding the key must not fire repeated reactions
      handleReaction(inputTime(e));
    });

    dom.startBtn.addEventListener('click', () => {
      if (game.running) stopSession();
      else startSession();
    });
    dom.resetBtn.addEventListener('click', () => {
      resetSession();
      dom.startBtn.focus();
    });
    dom.bannerClose.addEventListener('click', () => { dom.banner.hidden = true; });

    // Timers are throttled and frames stop in background tabs, so a live round
    // can't be measured fairly. Cancel it instead of recording a bad number.
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        if (game.running && (game.state === STATE.WAITING || game.state === STATE.GO)) {
          session.rounds = Math.max(0, session.rounds - 1);
          stopSession({
            eyebrow: 'Round cancelled',
            headline: 'Paused',
            sub: 'The page was hidden mid-round, so that round was discarded. Press Start to continue.',
          });
        }
      } else {
        lastFrame = performance.now();
      }
    });

    window.addEventListener('pagehide', teardown);
  }

  function teardown() {
    clearTimers();
    window.cancelAnimationFrame(rafId);
    if (scene) scene.dispose();
    scene = null;
  }

  /* ======================================================================
   * Boot
   * ==================================================================== */
  function boot() {
    bindEvents();

    try {
      scene = new ReactionScene(dom.canvas, dom.stage, {
        onQualityChange: (pr) => setRenderStatus(`WebGL · ${pr}×`),
      });
      scene.init();
    } catch (err) {
      console.error('[Reflex Lab] 3D init failed', err);
      enterFlatMode(err && err.message ? err.message : 'WebGL could not start');
    }

    setState(STATE.IDLE);
    renderStats();
    rafId = window.requestAnimationFrame(tick);
  }

  window.addEventListener('error', (e) => {
    console.error('[Reflex Lab] unexpected error', e.error || e.message);
  });

  try {
    boot();
  } catch (err) {
    console.error(err);
    const banner = document.getElementById('banner');
    const text = document.getElementById('bannerText');
    if (banner && text) {
      text.textContent = 'Reflex Lab couldn’t start. Reload the page, or try a current version of Chrome, Firefox, Safari or Edge.';
      banner.hidden = false;
    }
  }
})();
