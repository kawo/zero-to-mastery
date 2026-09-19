(() => {
  'use strict';

  /* ======================================================================
   * Dependencies (js/config.js, js/storage.js, js/achievements.js load first)
   * ==================================================================== */
  const missing = [
    ['ReflexLabConfig', 'js/config.js'],
    ['ReflexLabStorage', 'js/storage.js'],
    ['ReflexLabAchievements', 'js/achievements.js'],
  ].filter(([globalName]) => !window[globalName]).map(([, file]) => file);
  if (missing.length) {
    console.error('[Reflex Lab] missing scripts:', missing.join(', '));
    const banner = document.getElementById('banner');
    const text = document.getElementById('bannerText');
    if (banner && text) {
      text.textContent = `Reflex Lab couldn’t load ${missing.join(', ')}. Check the file exists next to app.js, then reload.`;
      banner.hidden = false;
    }
    return;
  }
  const { CONFIG, COLORS, LEVELS, PRESETS } = window.ReflexLabConfig;
  const Storage = window.ReflexLabStorage;
  const Achievements = window.ReflexLabAchievements;

  /* ======================================================================
   * Utilities
   * ==================================================================== */

  /** Uniform random delay in [min, max). Uses the CSPRNG where available. */
  function randomDelay() {
    return CONFIG.minDelayMs + random01() * (CONFIG.maxDelayMs - CONFIG.minDelayMs);
  }

  /** Uniform random number in [0, 1). */
  function random01() {
    if (window.crypto && typeof window.crypto.getRandomValues === 'function') {
      const buf = new Uint32Array(1);
      window.crypto.getRandomValues(buf);
      return buf[0] / 4294967296;
    }
    return Math.random();
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

  /**
   * Measure the effective resolution of performance.now(). Browsers coarsen it
   * (and may add jitter) as a Spectre mitigation: typically 5 µs–0.1 ms in
   * Chromium, 1 ms in Safari and Firefox without cross-origin isolation.
   * Returns the smallest non-zero step seen, in ms, or null if unavailable.
   */
  function measureClockResolution() {
    if (!window.performance || typeof performance.now !== 'function') return null;
    const deadline = performance.now() + 30; // never block the page for long
    let smallest = Infinity;
    let steps = 0;
    let prev = performance.now();
    while (steps < 40) {
      const t = performance.now();
      if (t !== prev) {
        const delta = t - prev;
        if (delta > 0 && delta < smallest) smallest = delta;
        prev = t;
        steps += 1;
      }
      if (t > deadline) break;
    }
    return Number.isFinite(smallest) ? smallest : null;
  }

  function formatResolution(ms) {
    if (ms < 0.01) return `${Math.max(1, Math.round(ms * 1000))} µs`;
    if (ms < 1) return `${parseFloat(ms.toFixed(ms < 0.1 ? 3 : 2))} ms`;
    return `${Math.round(ms)} ms`;
  }

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
      this.agitation = 1;       // level-driven speed-up of the waiting animation

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
        decoy: new THREE.BoxGeometry(1.35, 1.35, 1.35),
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

    setAgitation(value) {
      this.agitation = clamp(Number(value) || 1, 0.5, 3);
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

      // Higher levels spin and orbit faster while waiting, adding visual noise.
      const busy = this.mode === 'waiting' || this.mode === 'decoy' ? this.agitation : 1;
      const spin = this.params.spin * dt * motion * busy;
      this.group.rotation.y += spin;
      this.group.rotation.x += spin * 0.45;
      this.wire.rotation.y -= spin * 0.3;

      this.halo.rotation.z += dt * 0.2 * motion;
      this.halo.scale.setScalar(this.params.radius / 2.5);

      // Orbiting cubes.
      this.orbitAngle += this.params.orbit * dt * motion * busy;
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
    statFalse: $('statFalse'), statMissed: $('statMissed'), statPeak: $('statPeak'),
    chart: $('chart'), chartEmpty: $('chartEmpty'),
    levelCard: $('levelCard'), levelNum: $('levelNum'), levelName: $('levelName'), levelOf: $('levelOf'),
    levelTrack: $('levelTrack'), levelBrief: $('levelBrief'), levelTarget: $('levelTarget'), levelPips: $('levelPips'),
    renderChip: $('renderChip'), renderStatus: $('renderStatus'),
    clockChip: $('clockChip'), clockRes: $('clockRes'),
    banner: $('banner'), bannerText: $('bannerText'), bannerClose: $('bannerClose'),
    live: $('live'), toasts: $('toasts'),
    profileBtn: $('profileBtn'), profileAvatar: $('profileAvatar'), profileName: $('profileName'), profileSub: $('profileSub'),
    dialog: $('profileDialog'), dialogClose: $('dialogClose'), dlgAvatar: $('dlgAvatar'), dialogTitle: $('dialogTitle'), dlgSince: $('dlgSince'),
    tabs: Array.from(document.querySelectorAll('#profileDialog [role="tab"]')),
    achCount: $('achCount'),
    profileForm: $('profileForm'), nameInput: $('nameInput'), nameError: $('nameError'), colorOptions: $('colorOptions'),
    lifetimeGrid: $('lifetimeGrid'), profileSelect: $('profileSelect'),
    newProfileBtn: $('newProfileBtn'), deleteProfileBtn: $('deleteProfileBtn'), storageNote: $('storageNote'),
    recordsGrid: $('recordsGrid'), boardEmpty: $('boardEmpty'), boardWrap: $('boardWrap'), boardBody: $('boardBody'),
    achList: $('achList'),
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
  const session = {
    times: [], falseStarts: 0, missed: 0, rounds: 0,
    level: 1, peakLevel: 1,
    streak: 0,   // rounds in a row under the level's target
    fails: 0,    // failed rounds in a row (too slow, false start, missed)
    cleanRun: 0,     // rounds in a row without a false start or miss
    falseStreak: 0,  // false starts in a row
  };

  // Saved profiles (see storage.js). `saved.state` is the document written to disk.
  const saved = { state: null, persistent: false, saveFailed: false };
  const activeProfile = () => saved.state.profiles[saved.state.activeId];

  const game = {
    state: STATE.IDLE,
    running: false,
    delayTimer: null,
    timeoutTimer: null,
    decoyTimer: null,
    decoyEndTimer: null,
    decoyActive: false,
    lastDecoyAt: 0,
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
    clearTimeout(game.decoyTimer);
    clearTimeout(game.decoyEndTimer);
    game.delayTimer = null;
    game.timeoutTimer = null;
    game.decoyTimer = null;
    game.decoyEndTimer = null;
    game.decoyActive = false;
    game.pendingStimulus = false;
    game.awaitingPresent = false;
  }

  const currentLevel = () => LEVELS[session.level - 1];

  /* ---------- Difficulty ---------- */

  /** Push the current level's settings to the page and the scene. */
  function applyLevel() {
    const level = currentLevel();
    dom.app.dataset.subtle = String(level.subtle);
    if (scene) scene.setAgitation(level.agitation);
    renderLevel();
  }

  /**
   * Update streaks after a round and move between levels.
   * Returns 'up', 'down' or null.
   */
  function registerOutcome(passed) {
    let change = null;
    if (passed) {
      session.fails = 0;
      session.streak += 1;
      if (session.streak >= CONFIG.levelUpStreak && session.level < LEVELS.length) {
        session.level += 1;
        session.streak = 0;
        session.peakLevel = Math.max(session.peakLevel, session.level);
        change = 'up';
      }
      session.streak = Math.min(session.streak, CONFIG.levelUpStreak); // at max level the pips stay full
    } else {
      session.streak = 0;
      session.fails += 1;
      if (session.fails >= CONFIG.levelDownStreak && session.level > 1) {
        session.level -= 1;
        session.fails = 0;
        change = 'down';
      }
    }
    applyLevel();
    if (change === 'up') {
      dom.levelCard.classList.remove('is-levelup');
      void dom.levelCard.offsetWidth; // restart the CSS animation
      dom.levelCard.classList.add('is-levelup');
    }
    return change;
  }

  function levelChangeCopy(change) {
    const level = currentLevel();
    if (change === 'up') {
      return {
        eyebrow: `Level up · ${session.level}: ${level.name}`,
        note: level.brief,
      };
    }
    if (change === 'down') {
      return {
        eyebrow: `Back to level ${session.level}: ${level.name}`,
        note: `${CONFIG.levelDownStreak} misses in a row. Settle in and build a new streak.`,
      };
    }
    return null;
  }

  /* ---------- Decoys: a blue cube that flashes during the wait ---------- */
  function scheduleDecoy(stimulusDelay) {
    const level = currentLevel();
    // Leave room for the decoy to finish at least 250 ms before the real signal.
    const earliest = 600;
    const latest = stimulusDelay - CONFIG.decoyDurationMs - 250;
    if (level.decoy <= 0 || latest <= earliest || random01() >= level.decoy) return;
    game.decoyTimer = window.setTimeout(showDecoy, earliest + random01() * (latest - earliest));
  }

  function showDecoy() {
    game.decoyTimer = null;
    if (game.state !== STATE.WAITING) return;
    game.decoyActive = true;
    game.lastDecoyAt = performance.now();
    dom.app.dataset.decoy = 'true';
    if (scene) scene.setMode('decoy', { instant: true });
    game.decoyEndTimer = window.setTimeout(hideDecoy, CONFIG.decoyDurationMs);
  }

  function hideDecoy() {
    game.decoyEndTimer = null;
    game.decoyActive = false;
    delete dom.app.dataset.decoy;
    if (game.state === STATE.WAITING && scene) scene.setMode('waiting');
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
    // On subtle levels the text keeps saying "wait": only the shape signals go.
    const base = next === STATE.GO && currentLevel().subtle ? VIEW.waiting : VIEW[next];
    const view = { ...base, ...copy };

    dom.app.dataset.state = next;
    delete dom.app.dataset.decoy;
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
    activeProfile().stats.sessions += 1;
    persist();
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
    game.lastDecoyAt = 0;
    setState(STATE.WAITING);
    const delay = randomDelay();
    game.delayTimer = window.setTimeout(() => {
      game.delayTimer = null;
      // Don't touch the DOM or scene here: the render loop shows the stimulus on
      // its next frame so the canvas and the page change together.
      game.pendingStimulus = true;
    }, delay);
    scheduleDecoy(delay);
  }

  /** Called from the render loop on the frame that shows the stimulus. */
  function commitStimulus() {
    game.pendingStimulus = false;
    if (game.lastDecoyAt > 0) activeProfile().stats.decoysDodged += 1; // held steady through it
    setState(STATE.GO);
  }

  function onStimulusDrawn() {
    game.commitAt = performance.now();
    game.stimulusAt = game.commitAt;
    game.awaitingPresent = true;
    game.timeoutTimer = window.setTimeout(onMissed, CONFIG.timeoutMs);
  }

  /** Append a level-change message to a state's copy, if the level moved. */
  function withLevelChange(copy, change) {
    const lc = levelChangeCopy(change);
    if (!lc) return copy;
    return { ...copy, eyebrow: lc.eyebrow, sub: `${copy.sub || ''} <strong>${lc.note}</strong>`.trim() };
  }

  function falseStart(reactionMs) {
    const byDecoy = game.decoyActive ||
      (game.lastDecoyAt > 0 && performance.now() - game.lastDecoyAt < CONFIG.decoyBlameMs);
    clearTimers();
    session.falseStarts += 1;
    const anticipated = typeof reactionMs === 'number';
    let copy;
    if (anticipated) {
      copy = {
        eyebrow: 'Anticipated',
        headline: `${fmt(Math.max(0, reactionMs))} ms is a guess`,
        sub: `Visual reactions under ${CONFIG.anticipationMs} ms aren’t physiologically possible, so this one counts as a false start.`,
      };
    } else if (byDecoy) {
      copy = {
        eyebrow: 'Decoy',
        headline: 'That was a decoy',
        sub: 'The blue cube is a fake-out. Only react when the shape turns green.',
      };
    } else {
      copy = {
        headline: 'Too soon!',
        sub: 'You reacted before the shape turned green. False starts aren’t averaged, but they are counted.',
      };
    }
    const roundLevel = session.level;
    const change = registerOutcome(false);
    setState(STATE.FALSE_START, withLevelChange(copy, change));
    renderStats();
    afterRound({ type: 'false', level: roundLevel });
    announce(`${copy.headline}. False start.${change === 'down' ? ` Back to level ${session.level}.` : ''}`);
  }

  function onMissed() {
    game.timeoutTimer = null;
    if (game.state !== STATE.GO) return;
    clearTimers();
    session.missed += 1;
    const roundLevel = session.level;
    const change = registerOutcome(false);
    setState(STATE.MISSED, withLevelChange({ sub: VIEW.missed.sub }, change));
    renderStats();
    afterRound({ type: 'missed', level: roundLevel });
    announce(`Too slow. Round not counted.${change === 'down' ? ` Back to level ${session.level}.` : ''}`);
  }

  function recordResult(ms) {
    clearTimers();
    const prev = summarize(session.times);
    session.times.push(ms);
    const now = summarize(session.times);

    const allTimeBest = activeProfile().stats.bestMs;
    let sub;
    if (allTimeBest !== null && ms < allTimeBest) {
      sub = `<strong>New personal record</strong>, ${fmt(allTimeBest - ms)} ms faster than your all-time best.`;
    } else if (allTimeBest === null) {
      sub = 'Your first recorded time. It’s your personal record for now.';
    } else if (prev.n === 0) {
      sub = 'First valid attempt of the session.';
    } else if (ms < prev.best) {
      sub = `<strong>New session best</strong>, ${fmt(prev.best - ms)} ms faster than your previous record.`;
    } else {
      const delta = ms - prev.mean;
      sub = `<strong>${fmt(Math.abs(delta))} ms ${delta <= 0 ? 'faster' : 'slower'}</strong> than your average of ${fmt(prev.mean)} ms.`;
    }

    // Every valid time goes into the stats; the level target only decides the streak.
    const target = currentLevel().target;
    const roundLevel = session.level;
    const passed = ms <= target;
    const change = registerOutcome(passed);
    let eyebrow = rate(ms);
    if (passed && !change) {
      sub += session.level === LEVELS.length
        ? ' Top level, holding strong.'
        : ` Streak ${session.streak}/${CONFIG.levelUpStreak}.`;
    } else if (!passed) {
      eyebrow = `Over the ${target} ms target`;
      sub += ' The streak resets.';
    }

    setState(STATE.RESULT, withLevelChange({ eyebrow, headline: '', readout: ms, sub }, change));
    renderStats(now);
    afterRound({ type: 'result', ms, level: roundLevel, passed });
    const levelNote = change === 'up' ? ` Level up, now level ${session.level}.`
      : change === 'down' ? ` Back to level ${session.level}.` : '';
    announce(`${fmt(ms)} milliseconds. ${eyebrow}.${levelNote}`);
  }

  /** Clear this page view's stats. Saved profile data is never touched here. */
  function resetSession(copy) {
    clearTimers();
    game.running = false;
    session.times.length = 0;
    session.falseStarts = 0;
    session.missed = 0;
    session.rounds = 0;
    session.level = 1;
    session.peakLevel = 1;
    session.streak = 0;
    session.fails = 0;
    session.cleanRun = 0;
    session.falseStreak = 0;
    applyLevel();
    setState(STATE.IDLE, copy || { eyebrow: 'Session cleared', headline: 'Test your reflexes' });
    renderStats();
    if (!copy) announce('Session cleared. Your profile and records are kept.');
  }

  /* ======================================================================
   * Profile: lifetime stats, records, achievements
   * ==================================================================== */
  function persist() {
    if (!saved.persistent) return;
    if (Storage.save(saved.state)) {
      saved.saveFailed = false;
    } else if (!saved.saveFailed) {
      saved.saveFailed = true; // warn once, not after every round
      showBanner('Progress couldn’t be saved: browser storage is full or blocked. Your records will last until you close this page.');
    }
  }

  /** Fold the round that just ended into the saved profile. */
  function afterRound(last) {
    const profile = activeProfile();
    const s = profile.stats;
    profile.lastPlayedAt = new Date().toISOString();

    if (last.type === 'result') {
      s.attempts += 1;
      s.totalMs += last.ms;
      if (s.bestMs === null || last.ms < s.bestMs) s.bestMs = last.ms;
      Storage.recordTop(profile, {
        ms: Math.round(last.ms * 10) / 10, level: last.level, at: profile.lastPlayedAt,
      });
      const five = session.times.slice(-5);
      if (five.length === 5) {
        const avg = five.reduce((a, b) => a + b, 0) / 5;
        if (s.bestAvg5 === null || avg < s.bestAvg5) s.bestAvg5 = avg;
      }
      session.cleanRun += 1;
      session.falseStreak = 0;
    } else if (last.type === 'false') {
      s.falseStarts += 1;
      session.cleanRun = 0;
      session.falseStreak += 1;
    } else {
      s.missed += 1;
      session.cleanRun = 0;
      session.falseStreak = 0;
    }
    s.longestClean = Math.max(s.longestClean, session.cleanRun);
    s.peakLevel = Math.max(s.peakLevel, session.peakLevel);

    unlockAchievements(last);
    persist();
    renderProfileChip();
    if (dom.dialog.open) renderDialog();
  }

  function achievementContext(last = null) {
    return {
      stats: activeProfile().stats,
      session: { times: session.times, cleanRun: session.cleanRun, falseStreak: session.falseStreak },
      last,
    };
  }

  function unlockAchievements(last) {
    const profile = activeProfile();
    const unlocked = Achievements.evaluate(profile.achievements, achievementContext(last));
    const at = new Date().toISOString();
    unlocked.forEach((a, i) => {
      profile.achievements[a.id] = at;
      window.setTimeout(() => showToast(a), i * 450); // stagger several unlocks
    });
    if (unlocked.length) {
      announce(`Achievement unlocked: ${unlocked.map((a) => a.title).join(', ')}.`);
    }
  }

  /* ---------- Icons for achievements ---------- */
  const ICONS = {
    speed: '<path d="M13 2 4 14h7l-1 8 9-12h-7z" />',
    focus: '<circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1.2" />',
    decoy: '<path d="M12 3 20 6v6c0 5-3.4 8.2-8 9-4.6-.8-8-4-8-9V6z" /><path d="m8.5 12 2.5 2.5 4.5-5" />',
    level: '<path d="m6 15 6-6 6 6" /><path d="m6 20 6-6 6 6" /><path d="M6 4h12" />',
    volume: '<path d="M5 20V11" /><path d="M12 20V5" /><path d="M19 20v-7" />',
    fun: '<path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1" />',
  };
  function iconSvg(kind, size = 20) {
    return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[kind] || ICONS.fun}</svg>`;
  }

  function showToast(achievement) {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = `<span class="ach-icon">${iconSvg(achievement.kind)}</span>
      <div><p class="toast-kicker">Achievement unlocked</p><p class="toast-title"></p><p class="toast-desc"></p></div>`;
    toast.querySelector('.toast-title').textContent = achievement.title;
    toast.querySelector('.toast-desc').textContent = achievement.desc;
    dom.toasts.appendChild(toast);
    // Keep at most three on screen.
    while (dom.toasts.children.length > 3) dom.toasts.firstElementChild.remove();
    window.setTimeout(() => {
      toast.classList.add('is-leaving');
      window.setTimeout(() => toast.remove(), 240);
    }, 4200);
  }

  /* ---------- Rendering ---------- */
  const dateFmt = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  const formatDate = (iso) => (iso ? dateFmt.format(new Date(iso)) : '—');

  function initials(name) {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    const letters = parts.length > 1 ? parts[0][0] + parts[1][0] : (parts[0] || 'P').slice(0, 2);
    return letters.toUpperCase();
  }

  function paintAvatar(el, profile) {
    el.textContent = initials(profile.name);
    el.style.setProperty('--avatar', profile.color);
  }

  function unlockedCount(profile) {
    return Achievements.LIST.filter((a) => profile.achievements[a.id]).length;
  }

  function renderProfileChip() {
    const p = activeProfile();
    paintAvatar(dom.profileAvatar, p);
    dom.profileName.textContent = p.name;
    const record = p.stats.bestMs !== null ? `Best ${fmt(p.stats.bestMs)} ms` : 'No record yet';
    dom.profileSub.textContent = `${record} · ${unlockedCount(p)}/${Achievements.LIST.length} achievements`;
    dom.profileBtn.setAttribute('aria-label', `Open profile for ${p.name}. ${dom.profileSub.textContent}.`);
  }

  function statTile(label, value, note) {
    const wrap = document.createElement('div');
    wrap.className = 'stat';
    const dt = document.createElement('dt');
    dt.textContent = label;
    const dd = document.createElement('dd');
    if (value === null) {
      dd.textContent = '—';
      dd.classList.add('is-empty');
    } else {
      dd.innerHTML = value; // only ever built from numbers below
    }
    wrap.append(dt, dd);
    if (note) {
      const n = document.createElement('span');
      n.className = 'note';
      n.textContent = note;
      wrap.appendChild(n);
    }
    return wrap;
  }

  function renderDialog() {
    const p = activeProfile();
    const s = p.stats;
    paintAvatar(dom.dlgAvatar, p);
    dom.dialogTitle.textContent = p.name;
    dom.dlgSince.textContent = `Playing since ${formatDate(p.createdAt)}` +
      (p.lastPlayedAt ? ` · last played ${formatDate(p.lastPlayedAt)}` : '');
    if (document.activeElement !== dom.nameInput) dom.nameInput.value = p.name;

    // Colour choices
    if (!dom.colorOptions.children.length) {
      Storage.PROFILE_COLORS.forEach((color, i) => {
        const label = document.createElement('label');
        label.innerHTML = `<input type="radio" name="avatarColor" value="${color}" id="avatarColor${i}"><span class="dot" style="--swatch:${color}"></span><span class="sr-only">Colour ${i + 1}</span>`;
        dom.colorOptions.appendChild(label);
      });
    }
    dom.colorOptions.querySelectorAll('input').forEach((input) => { input.checked = input.value === p.color; });

    // Lifetime stats
    const avg = s.attempts ? s.totalMs / s.attempts : null;
    dom.lifetimeGrid.replaceChildren(
      statTile('Best time', s.bestMs !== null ? msMarkup(s.bestMs) : null),
      statTile('Average', avg !== null ? msMarkup(avg) : null, s.attempts ? `over ${s.attempts} reactions` : ''),
      statTile('Peak level', `${s.peakLevel}<span class="u">/ ${LEVELS.length}</span>`, LEVELS[s.peakLevel - 1] ? LEVELS[s.peakLevel - 1].name : ''),
      statTile('Sessions', String(s.sessions)),
      statTile('False starts', String(s.falseStarts), s.missed ? `${s.missed} missed` : ''),
      statTile('Decoys dodged', String(s.decoysDodged)),
    );

    // Player switcher
    const profiles = Object.values(saved.state.profiles)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    dom.profileSelect.replaceChildren(...profiles.map((pr) => {
      const opt = document.createElement('option');
      opt.value = pr.id;
      opt.textContent = pr.name + (pr.stats.bestMs !== null ? ` (best ${fmt(pr.stats.bestMs)} ms)` : '');
      opt.selected = pr.id === p.id;
      return opt;
    }));
    dom.newProfileBtn.disabled = profiles.length >= Storage.MAX_PROFILES;
    dom.newProfileBtn.title = dom.newProfileBtn.disabled ? `Up to ${Storage.MAX_PROFILES} players per device` : '';
    resetDeleteButton();
    dom.storageNote.textContent = saved.persistent
      ? 'Profiles, records and achievements are saved in this browser only. Clearing site data removes them.'
      : 'This browser is blocking storage, so nothing will be kept after you close the page.';

    // Records
    dom.recordsGrid.replaceChildren(
      statTile('Personal best', s.bestMs !== null ? msMarkup(s.bestMs) : null, p.top[0] ? formatDate(p.top[0].at) : ''),
      statTile('Best 5 in a row', s.bestAvg5 !== null ? msMarkup(s.bestAvg5) : null, 'average'),
      statTile('Longest clean run', String(s.longestClean), 'rounds'),
    );
    const rows = Storage.leaderboard(saved.state);
    dom.boardEmpty.hidden = rows.length > 0;
    dom.boardWrap.hidden = rows.length === 0;
    dom.boardBody.replaceChildren(...rows.map((row, i) => {
      const tr = document.createElement('tr');
      if (row.profileId === p.id) tr.className = 'is-me';
      tr.innerHTML = `<td class="rank">${i + 1}</td><td><span class="who"><span class="avatar" aria-hidden="true"></span><span class="who-name"></span></span></td>` +
        `<td class="num time">${fmt(row.ms)} ms</td><td class="num">${row.level}</td><td>${formatDate(row.at)}</td>`;
      paintAvatar(tr.querySelector('.avatar'), row);
      tr.querySelector('.who-name').textContent = row.name;
      return tr;
    }));

    // Achievements
    const ctx = achievementContext();
    const unlocked = unlockedCount(p);
    dom.achCount.textContent = `${unlocked}/${Achievements.LIST.length}`;
    dom.achList.replaceChildren(...Achievements.LIST.map((a) => {
      const at = p.achievements[a.id];
      const li = document.createElement('li');
      li.className = `ach${at ? ' is-unlocked' : ''}`;
      li.innerHTML = `<span class="ach-icon">${iconSvg(a.kind)}</span><div><p class="ach-title"></p><p class="ach-desc"></p><p class="ach-meta"></p></div>`;
      li.querySelector('.ach-title').textContent = a.title;
      li.querySelector('.ach-desc').textContent = a.desc;
      const meta = li.querySelector('.ach-meta');
      const prog = Achievements.progressOf(a, ctx);
      if (at) {
        meta.textContent = `Unlocked ${formatDate(at)}`;
      } else if (prog) {
        meta.textContent = `${prog.current} / ${prog.goal}`;
        const bar = document.createElement('div');
        bar.className = 'ach-bar';
        bar.innerHTML = `<span style="width:${Math.round((prog.current / prog.goal) * 100)}%"></span>`;
        li.lastElementChild.appendChild(bar);
      } else {
        meta.textContent = 'Locked';
      }
      li.setAttribute('aria-label', `${a.title}. ${a.desc} ${at ? 'Unlocked.' : prog ? `Progress ${prog.current} of ${prog.goal}.` : 'Locked.'}`);
      return li;
    }));
  }

  /* ---------- Dialog behaviour ---------- */
  function openProfile(tabId = 'tab-profile') {
    if (game.running) {
      stopSession({
        eyebrow: 'Paused', headline: 'Paused',
        sub: 'The session is paused while your profile is open. Press Start to continue.',
      });
    }
    renderDialog();
    selectTab(tabId, false);
    if (typeof dom.dialog.showModal === 'function') dom.dialog.showModal();
    else dom.dialog.setAttribute('open', '');
  }

  function closeProfile() {
    if (typeof dom.dialog.close === 'function') dom.dialog.close();
    else dom.dialog.removeAttribute('open');
  }

  function selectTab(tabId, focus = true) {
    dom.tabs.forEach((tab) => {
      const selected = tab.id === tabId;
      tab.setAttribute('aria-selected', String(selected));
      tab.tabIndex = selected ? 0 : -1;
      document.getElementById(tab.getAttribute('aria-controls')).hidden = !selected;
      if (selected && focus) tab.focus();
    });
  }

  function saveName(event) {
    event.preventDefault();
    const name = Storage.cleanName(dom.nameInput.value);
    const valid = name.length > 0;
    dom.nameError.hidden = valid;
    dom.nameInput.setAttribute('aria-invalid', String(!valid));
    if (!valid) { dom.nameInput.focus(); return; }
    activeProfile().name = name;
    persist();
    renderProfileChip();
    renderDialog();
    announce(`Name saved: ${name}.`);
  }

  function switchProfile(id) {
    if (!saved.state.profiles[id] || id === saved.state.activeId) return;
    saved.state.activeId = id;
    persist();
    // A new player starts a fresh session: stats on screen belong to one person.
    resetSession({ eyebrow: 'Player switched', headline: `Hi, ${activeProfile().name}` });
    renderProfileChip();
    renderDialog();
    announce(`Switched to ${activeProfile().name}.`);
  }

  function createPlayer() {
    const count = Object.keys(saved.state.profiles).length;
    if (count >= Storage.MAX_PROFILES) return;
    const used = new Set(Object.values(saved.state.profiles).map((p) => p.color));
    const color = Storage.PROFILE_COLORS.find((c) => !used.has(c)) || Storage.PROFILE_COLORS[count % Storage.PROFILE_COLORS.length];
    const profile = Storage.createProfile(`Player ${count + 1}`, color);
    saved.state.profiles[profile.id] = profile;
    saved.state.activeId = ''; // force switchProfile to run
    switchProfile(profile.id);
    selectTab('tab-profile', false);
    dom.nameInput.focus();
    dom.nameInput.select();
  }

  let deleteTimer = null;
  function resetDeleteButton() {
    window.clearTimeout(deleteTimer);
    dom.deleteProfileBtn.classList.remove('is-confirming');
    dom.deleteProfileBtn.textContent = 'Delete player';
  }

  /** Two-step delete: the first press arms the button for a few seconds. */
  function deletePlayer() {
    if (!dom.deleteProfileBtn.classList.contains('is-confirming')) {
      dom.deleteProfileBtn.classList.add('is-confirming');
      dom.deleteProfileBtn.textContent = `Delete ${activeProfile().name}? Press again`;
      deleteTimer = window.setTimeout(resetDeleteButton, 4000);
      return;
    }
    const gone = activeProfile().name;
    delete saved.state.profiles[saved.state.activeId];
    let next = Object.values(saved.state.profiles)[0];
    if (!next) {
      next = Storage.createProfile('Player');
      saved.state.profiles[next.id] = next;
    }
    saved.state.activeId = '';
    switchProfile(next.id);
    announce(`${gone} deleted. Now playing as ${next.name}.`);
  }

  function reloadFromStorage() {
    const { state } = Storage.load();
    saved.state = state;
    renderProfileChip();
    if (dom.dialog.open) renderDialog();
  }

  function bindProfileEvents() {
    dom.profileBtn.addEventListener('click', () => openProfile());
    dom.dialogClose.addEventListener('click', closeProfile);
    dom.dialog.addEventListener('click', (e) => { if (e.target === dom.dialog) closeProfile(); }); // backdrop
    dom.dialog.addEventListener('close', () => { resetDeleteButton(); dom.profileBtn.focus(); });

    dom.tabs.forEach((tab, i) => {
      tab.addEventListener('click', () => selectTab(tab.id));
      tab.addEventListener('keydown', (e) => {
        const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
        if (e.key === 'Home' || e.key === 'End') {
          e.preventDefault();
          selectTab(dom.tabs[e.key === 'Home' ? 0 : dom.tabs.length - 1].id);
        } else if (step) {
          e.preventDefault();
          selectTab(dom.tabs[(i + step + dom.tabs.length) % dom.tabs.length].id);
        }
      });
    });

    dom.profileForm.addEventListener('submit', saveName);
    dom.nameInput.addEventListener('input', () => {
      if (!dom.nameError.hidden && Storage.cleanName(dom.nameInput.value)) {
        dom.nameError.hidden = true;
        dom.nameInput.removeAttribute('aria-invalid');
      }
    });
    dom.colorOptions.addEventListener('change', (e) => {
      if (!(e.target instanceof HTMLInputElement) || !Storage.PROFILE_COLORS.includes(e.target.value)) return;
      activeProfile().color = e.target.value;
      persist();
      renderProfileChip();
      paintAvatar(dom.dlgAvatar, activeProfile());
    });
    dom.profileSelect.addEventListener('change', () => switchProfile(dom.profileSelect.value));
    dom.newProfileBtn.addEventListener('click', createPlayer);
    dom.deleteProfileBtn.addEventListener('click', deletePlayer);

    // Another tab saved progress: pick it up, unless a round is being timed here.
    Storage.onExternalChange(() => {
      if (game.state === STATE.WAITING || game.state === STATE.GO) return;
      reloadFromStorage();
    });
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
    dom.roundCount.textContent = `Level ${session.level}${session.rounds ? ` · Round ${session.rounds}` : ''}`;
  }

  function renderLevel() {
    const level = currentLevel();
    dom.levelNum.textContent = String(session.level);
    dom.levelName.textContent = level.name;
    dom.levelOf.textContent = `${session.level} of ${LEVELS.length}`;
    dom.levelBrief.textContent = level.brief;
    dom.levelTarget.textContent = `≤ ${level.target} ms`;

    if (dom.levelTrack.children.length !== LEVELS.length) {
      dom.levelTrack.replaceChildren(...LEVELS.map(() => document.createElement('span')));
    }
    Array.from(dom.levelTrack.children).forEach((seg, i) => {
      seg.classList.toggle('is-done', i + 1 < session.level);
      seg.classList.toggle('is-current', i + 1 === session.level);
    });

    if (dom.levelPips.children.length !== CONFIG.levelUpStreak) {
      dom.levelPips.replaceChildren(
        ...Array.from({ length: CONFIG.levelUpStreak }, () => document.createElement('i')));
    }
    Array.from(dom.levelPips.children).forEach((pip, i) => {
      pip.classList.toggle('is-on', i < session.streak);
    });
    dom.levelPips.setAttribute('aria-label', `Streak ${session.streak} of ${CONFIG.levelUpStreak}`);
    renderControls();
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
    dom.statPeak.textContent = String(session.peakLevel);
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
    svg.toggleAttribute('hidden', empty); // SVG elements have no .hidden property
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
      if (dom.dialog.open) return; // the dialog handles its own keys (Esc closes it)
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
    const loaded = Storage.load();
    saved.state = loaded.state;
    saved.persistent = loaded.persistent;
    if (loaded.notice === 'blocked') {
      showBanner('This browser is blocking storage, so your profile and records will only last until you close the page.');
    } else if (loaded.notice === 'corrupt') {
      showBanner(`Saved progress couldn’t be read, so a fresh profile was started. The old data was kept under “${Storage.KEY}.backup” in this browser’s storage.`);
      persist();
    }

    bindEvents();
    bindProfileEvents();

    try {
      scene = new ReactionScene(dom.canvas, dom.stage, {
        onQualityChange: (pr) => setRenderStatus(`WebGL · ${pr}×`),
      });
      scene.init();
    } catch (err) {
      console.error('[Reflex Lab] 3D init failed', err);
      enterFlatMode(err && err.message ? err.message : 'WebGL could not start');
    }

    applyLevel();
    setState(STATE.IDLE);
    renderStats();
    renderProfileChip();
    renderClockResolution();
    rafId = window.requestAnimationFrame(tick);
  }

  function renderClockResolution() {
    const res = measureClockResolution();
    if (res === null) {
      dom.clockRes.textContent = 'unavailable';
      dom.clockChip.title = 'This browser has no high-resolution clock; timings may be off by several ms.';
      return;
    }
    dom.clockRes.textContent = `± ${formatResolution(res)}`;
    dom.clockChip.title =
      `performance.now() ticks every ${formatResolution(res)} in this browser, ` +
      'so each reaction time is accurate to about that much (plus one screen refresh).';
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
