(() => {
  'use strict';

  /* ======================================================================
   * Dependencies (js/config.js, js/storage.js, js/achievements.js load first)
   * ==================================================================== */
  const missing = [
    ['ReflexLabConfig', 'js/config.js'],
    ['ReflexLabI18n', 'js/i18n.js'],
    ['ReflexLabStorage', 'js/storage.js'],
    ['ReflexLabAchievements', 'js/achievements.js'],
    ['ReflexLabAudio', 'js/audio.js'],
    ['ReflexLabLeaderboard', 'js/leaderboard.js'],
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
  const { CONFIG, COLORS, LEVELS, PRESETS, POWERUPS, PALETTES, TEXT_SCALES } = window.ReflexLabConfig;
  const POWERUP_BY_ID = Object.fromEntries(POWERUPS.map((p) => [p.id, p]));
  const Storage = window.ReflexLabStorage;
  const Achievements = window.ReflexLabAchievements;
  const Sound = window.ReflexLabAudio;
  const Board = window.ReflexLabLeaderboard;
  // Translation helpers. UI text comes from js/i18n.js; game data keeps its
  // English in its own file and gets French from i18n.js by id.
  const I18n = window.ReflexLabI18n;
  const T = I18n.t;
  const levelName = (n) => I18n.td(`level.${n}.name`, LEVELS[n - 1].name);
  const levelBrief = (n) => I18n.td(`level.${n}.brief`, LEVELS[n - 1].brief);
  const puName = (id) => I18n.td(`pu.${id}.name`, POWERUP_BY_ID[id].name);
  const puDesc = (id) => I18n.td(`pu.${id}.desc`, POWERUP_BY_ID[id].desc);
  const achTitle = (a) => I18n.td(`ach.${a.id}.title`, a.title);
  const achDesc = (a) => I18n.td(`ach.${a.id}.desc`, a.desc);
  const reasonText = (code) => I18n.td(`reason.${code}`, Board.REASONS[code] || code);
  const paletteName = (id) => I18n.td(`palette.${id}.name`, PALETTES[id].name);
  const paletteDesc = (id) => I18n.td(`palette.${id}.desc`, PALETTES[id].desc);
  Board.configure({
    minDelayMs: CONFIG.minDelayMs, maxDelayMs: CONFIG.maxDelayMs,
    anticipationMs: CONFIG.anticipationMs, timeoutMs: CONFIG.timeoutMs,
  });

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

  // Display settings (colour-vision palette, text size, motion); see applyDisplay().
  const display = { palette: 'standard', textScale: 1, reduceMotion: false, lang: 'en' };

  /**
   * Replace {go}, {wait} and {decoy} with the colour names of the active
   * palette ("green" by default, "blue" in the red–green safe palette…).
   * A capitalised placeholder ({Go}) gives a capitalised word.
   */
  function fillWords(text) {
    if (!text) return text;
    const words = (PALETTES[display.palette] || PALETTES.standard).words;
    return String(text).replace(/\{(go|wait|decoy)\}/gi, (m, key) => {
      const word = I18n.td(`word.${display.palette}.${key.toLowerCase()}`, words[key.toLowerCase()]);
      return key[0] === key[0].toUpperCase() ? word[0].toUpperCase() + word.slice(1) : word;
    });
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
    if (ms < 180) return T('rate.elite');
    if (ms < 220) return T('rate.excellent');
    if (ms < 270) return T('rate.sharp');
    if (ms < 330) return T('rate.typical');
    if (ms < 420) return T('rate.slow');
    return T('rate.verySlow');
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
      this.systemReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      this.reducedMotion = this.systemReducedMotion;
      this.colorMap = { ...COLORS };  // replaced by the colour-vision palette
      this.goRing = false;            // bright white ring on "go" (colour-safe palettes)

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

      // "Go" cue ring for colour-safe palettes (hidden otherwise). It faces the camera.
      const cueGeo = this._trackGeo(new THREE.TorusGeometry(1.55, 0.06, 12, 128));
      const cueMat = this._track(new THREE.MeshBasicMaterial({ color: 0xffffff }));
      this.cueRing = new THREE.Mesh(cueGeo, cueMat);
      this.cueRing.visible = false;
      scene.add(this.cueRing);

      // Shield power-up: a faint geodesic bubble. It stays constant through a
      // round (it never reacts to "go"), so it can't act as a cue.
      const bubbleGeo = this._trackGeo(new THREE.IcosahedronGeometry(1.8, 2));
      this.bubbleMat = this._track(new THREE.MeshBasicMaterial({
        color: 0xbfdbfe, wireframe: true, transparent: true, opacity: 0, depthWrite: false,
      }));
      this.bubble = new THREE.Mesh(bubbleGeo, this.bubbleMat);
      this.bubble.visible = false;
      scene.add(this.bubble);
      this.shieldOn = false;

      // Power-up pickup: one reusable gem that pops out of the core and flies off.
      const gemGeo = this._trackGeo(new THREE.OctahedronGeometry(0.3, 0));
      this.gemMat = this._track(new THREE.MeshStandardMaterial({
        color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.8, metalness: 0.2, roughness: 0.3, flatShading: true,
      }));
      this.gem = new THREE.Mesh(gemGeo, this.gemMat);
      this.gem.visible = false;
      this.gemT = 1;
      scene.add(this.gem);

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
      this.targetColor.setHex(this.colorMap[mode] !== undefined ? this.colorMap[mode] : preset.color);

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

    /** Apply a colour-vision palette (see PALETTES in config.js). */
    setPalette(palette) {
      if (!palette) return;
      this.colorMap = { ...palette.colors };
      this.goRing = !!palette.goRing;
      if (!this.ready) return;
      this.targetColor.setHex(this.colorMap[this.mode]);
      this.color.copy(this.targetColor); // a settings change, not gameplay: switch at once
    }

    setReducedMotion(on) {
      this.reducedMotion = !!on || this.systemReducedMotion;
    }

    setShield(on) {
      this.shieldOn = !!on;
      if (this.shieldOn && this.bubble) this.bubble.visible = true;
    }

    /** Animate a power-up gem of the given colour popping out of the core. */
    spawnPickup(hex) {
      if (!this.gem) return;
      this.gemMat.color.setHex(hex);
      this.gemMat.emissive.setHex(hex);
      this.gemT = 0;
      this.gem.visible = true;
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

      // Colour-safe palettes: a thick white ring appears on the "go" frame itself,
      // a brightness cue that works for every kind of colour vision.
      this.cueRing.visible = this.goRing && this.mode === 'go';
      if (this.cueRing.visible) this.cueRing.rotation.z += dt * 0.6 * motion;

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

      // Shield bubble fades in and out, then hides so it costs nothing.
      const bubbleTarget = this.shieldOn ? 0.22 : 0;
      this.bubbleMat.opacity += (bubbleTarget - this.bubbleMat.opacity) * (1 - Math.exp(-dt * 5));
      if (!this.shieldOn && this.bubbleMat.opacity < 0.01) this.bubble.visible = false;
      this.bubble.rotation.y -= dt * 0.25 * motion;
      this.bubble.rotation.z += dt * 0.1 * motion;

      // Pickup gem: grow out of the core, then arc up and away to the right.
      if (this.gem.visible) {
        this.gemT = Math.min(1, this.gemT + dt / 1.1);
        const t = this.gemT;
        const rise = easeInOut(Math.max(0, (t - 0.25) / 0.75));
        this.gem.position.set(rise * 2.6, 0.2 + rise * 2.1 + Math.sin(t * Math.PI) * 0.4, rise * 0.8);
        this.gem.scale.setScalar(t < 0.25 ? easeInOut(t / 0.25) * 1.3 : 1.3 - rise * 1.1);
        this.gem.rotation.set(time * 3, time * 4, 0);
        if (t >= 1) this.gem.visible = false;
      }

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
    sfxToggle: $('sfxToggle'), musicToggle: $('musicToggle'), volumeSlider: $('volumeSlider'),
    profileBtn: $('profileBtn'), profileAvatar: $('profileAvatar'), profileName: $('profileName'), profileSub: $('profileSub'),
    dialog: $('profileDialog'), dialogClose: $('dialogClose'), dlgAvatar: $('dlgAvatar'), dialogTitle: $('dialogTitle'), dlgSince: $('dlgSince'),
    tabs: Array.from(document.querySelectorAll('#profileDialog [role="tab"]')),
    achCount: $('achCount'),
    profileForm: $('profileForm'), nameInput: $('nameInput'), nameError: $('nameError'), colorOptions: $('colorOptions'),
    lifetimeGrid: $('lifetimeGrid'), profileSelect: $('profileSelect'),
    newProfileBtn: $('newProfileBtn'), deleteProfileBtn: $('deleteProfileBtn'), storageNote: $('storageNote'),
    recordsGrid: $('recordsGrid'), boardEmpty: $('boardEmpty'), boardWrap: $('boardWrap'), boardBody: $('boardBody'),
    sealNote: $('sealNote'), excludedBox: $('excludedBox'), excludedCount: $('excludedCount'), excludedList: $('excludedList'),
    leaderboardBtn: $('leaderboardBtn'),
    achList: $('achList'),
    tourneyBtn: $('tourneyBtn'), tourneyCard: $('tourneyCard'), tourneyMeta: $('tourneyMeta'), tourneyList: $('tourneyList'),
    tourneyFine: $('tourneyFine'),
    powerSlots: $('powerSlots'), powerActive: $('powerActive'), powerBadges: $('powerBadges'),
    a11yBtn: $('a11yBtn'), a11yDialog: $('a11yDialog'), a11yClose: $('a11yClose'), a11yDone: $('a11yDone'),
    paletteOptions: $('paletteOptions'), textScalePick: $('textScalePick'), reduceMotion: $('reduceMotion'),
    langPick: $('langPick'),
    tourneyDialog: $('tourneyDialog'), tourneyForm: $('tourneyForm'), tourneyClose: $('tourneyClose'), tourneyCancel: $('tourneyCancel'),
    playerPicks: $('playerPicks'), newPlayerName: $('newPlayerName'), addPlayerBtn: $('addPlayerBtn'),
    tourneyError: $('tourneyError'), roundsPick: $('roundsPick'), tourneyLevel: $('tourneyLevel'), tourneyRules: $('tourneyRules'),
    resultsDialog: $('resultsDialog'), winnerAvatar: $('winnerAvatar'), resultsTitle: $('resultsTitle'), resultsSub: $('resultsSub'),
    resultsBody: $('resultsBody'), resultsDone: $('resultsDone'), rematchBtn: $('rematchBtn'),
  };

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
    powerUps: freshPowerUps(),
    runWindow: [],   // evidence of the valid reactions in a row, for the leaderboard
  };

  function freshPowerUps() {
    return {
      inventory: [],                                            // power-up ids, oldest first
      active: { shield: false, double: false, leeway: 0, calm: 0 }, // flags, or rounds left
    };
  }
  // Messages from power-ups during a round, shown with that round's result.
  let powerNotes = [];

  // Saved profiles (see storage.js). `saved.state` is the document written to disk.
  const saved = { state: null, persistent: false, saveFailed: false };
  const activeProfile = () => saved.state.profiles[saved.state.activeId];

  // Hot-seat tournament. Phases: 'handoff' (waiting for the next player to
  // start), 'playing', 'turnDone' (last result of a turn on screen), 'finished'.
  const tournament = {
    active: false,
    players: [],     // profile ids, in turn order
    rounds: CONFIG.tournamentDefaultRounds,
    level: 1,
    turn: 0,
    roundInTurn: 0,
    phase: 'handoff',
    results: {},     // profile id → { times: [], fouls: 0 }
    returnTo: null,  // solo profile to restore afterwards
    lastSetup: null, // for rematches and to pre-fill the setup form
  };

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
    // Evidence for the leaderboard's anti-cheat checks.
    roundStartAt: 0,        // performance.now() when the wait began
    roundWallStart: 0,      // Date.now() at the same moment (clock-integrity check)
    scheduledDelay: 0,      // the random delay the game chose
    frameMsAtStimulus: 0,   // frame duration around the stimulus
  };

  let scene = null;
  let rafId = 0;
  let lastFrame = performance.now();
  let avgFrameMs = 1000 / 60; // smoothed frame duration
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
    const { active } = session.powerUps;
    dom.app.dataset.subtle = String(level.subtle);
    if (scene) {
      scene.setAgitation(active.calm > 0 ? 1 : level.agitation); // Calm quiets the waiting animation
      scene.setShield(active.shield);
    }
    Sound.setIntensity(session.level);
    renderLevel();
  }

  /** Target for the pass/fail check: the level's, loosened while Leeway is active. */
  function effectiveTarget() {
    const bonus = session.powerUps.active.leeway > 0 ? POWERUP_BY_ID.leeway.bonusMs : 0;
    return currentLevel().target + bonus;
  }

  /**
   * Update streaks after a round and move between levels.
   * Returns 'up', 'down' or null.
   */
  function registerOutcome(passed) {
    if (tournament.active) return null; // the level is fixed for everyone in a tournament
    let change = null;
    const { active } = session.powerUps;
    if (!passed && active.shield) {
      // Shield: the failure is still recorded in the stats, but the streak and
      // level are untouched.
      active.shield = false;
      activeProfile().stats.shieldSaves += 1;
      powerNotes.push(T('pu.note.shield'));
      Sound.play('shield', { delay: 0.3 });
      applyLevel();
      return null;
    }
    if (passed) {
      session.fails = 0;
      session.streak += active.double ? 2 : 1;
      if (active.double) {
        active.double = false;
        powerNotes.push(T('pu.note.double'));
      }
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
    if (change) Sound.play(change === 'up' ? 'levelUp' : 'levelDown', { delay: 0.35 }); // after the round's own sound
    if (change === 'up') {
      dom.levelCard.classList.remove('is-levelup');
      void dom.levelCard.offsetWidth; // restart the CSS animation
      dom.levelCard.classList.add('is-levelup');
    }
    return change;
  }

  function levelChangeCopy(change) {
    if (change === 'up') {
      return {
        eyebrow: T('level.upEyebrow', { n: session.level, name: levelName(session.level) }),
        note: levelBrief(session.level),
      };
    }
    if (change === 'down') {
      return {
        eyebrow: T('level.downEyebrow', { n: session.level, name: levelName(session.level) }),
        note: T('level.downNote', { n: CONFIG.levelDownStreak }),
      };
    }
    return null;
  }

  /* ---------- Decoys: a cube in the decoy colour that flashes during the wait ---------- */
  function scheduleDecoy(stimulusDelay) {
    const level = currentLevel();
    // Leave room for the decoy to finish at least 250 ms before the real signal.
    const earliest = 600;
    const latest = stimulusDelay - CONFIG.decoyDurationMs - 250;
    if (session.powerUps.active.calm > 0) return; // Calm: no decoys
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
  // Built on demand so it's always in the current language.
  function viewFor(state) {
    switch (state) {
      case 'idle': return { pill: T('state.idle.pill'), eyebrow: T('state.idle.eyebrow'), headline: T('state.idle.headline'), sub: T('state.idle.sub') };
      case 'waiting': return { pill: T('state.waiting.pill'), eyebrow: T('state.waiting.eyebrow'), headline: T('state.waiting.headline'), sub: T('state.waiting.sub'), hint: T('state.waiting.hint') };
      case 'go': return { pill: T('state.go.pill'), eyebrow: T('state.go.eyebrow'), headline: T('state.go.headline'), sub: '' };
      case 'result': return { pill: T('state.result.pill'), hint: T('hint.next') };
      case 'false': return { pill: T('state.false.pill'), eyebrow: T('state.false.eyebrow'), hint: T('hint.retry') };
      case 'missed': return { pill: T('state.missed.pill'), eyebrow: T('state.missed.eyebrow'), headline: T('state.missed.headline'), sub: T('state.missed.sub', { s: CONFIG.timeoutMs / 1000 }), hint: T('hint.retry') };
      default: return {};
    }
  }

  let lastView = null; // so a palette change can redraw the current message

  function setState(next, copy = {}) {
    game.state = next;
    // On subtle levels the text keeps saying "wait": only the shape signals go.
    const base = next === STATE.GO && currentLevel().subtle ? viewFor('waiting') : viewFor(next);
    const view = { ...base, ...copy };
    lastView = { state: next, copy };

    dom.app.dataset.state = next;
    delete dom.app.dataset.decoy;
    dom.stateLabel.textContent = view.pill;
    // Colour words ({go}, {wait}, {decoy}) follow the active palette.
    dom.eyebrow.textContent = fillWords(view.eyebrow) || '';
    dom.headline.textContent = fillWords(view.headline) || '';
    dom.headline.hidden = !view.headline;
    dom.subline.innerHTML = fillWords(view.sub) || '';
    dom.subline.hidden = !view.sub;
    dom.hint.innerHTML = fillWords(view.hint) || T('hint.default');

    const showReadout = typeof view.readout === 'number';
    dom.readout.hidden = !showReadout;
    if (showReadout) dom.readoutValue.textContent = fmt(view.readout);

    if (scene) scene.setMode(SCENE_MODE[next], { instant: next === STATE.GO });
    // Slots lock while a round is timed. Skipped on "go" to keep that frame lean.
    if (next !== STATE.GO) renderPowerUps();
    // Duck the music while waiting; restore it once the round is over. The music
    // is deliberately left alone on "go" so it can't act as an audio cue.
    if (next === STATE.WAITING) Sound.setFocus(true);
    else if (next !== STATE.GO) Sound.setFocus(false);
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
  }

  function stopSession(copy) {
    clearTimers();
    game.running = false;
    setState(STATE.IDLE, copy || {
      eyebrow: T('session.paused'),
      headline: session.times.length ? T('session.niceWork') : T('state.idle.headline'),
      sub: session.times.length ? T('session.pausedSub') : T('state.idle.sub'),
    });
  }

  function beginRound() {
    clearTimers();
    session.rounds += 1;
    game.lastDecoyAt = 0;
    game.roundStartAt = performance.now();
    game.roundWallStart = Date.now();
    setState(STATE.WAITING);
    const delay = randomDelay();
    game.scheduledDelay = delay;
    game.delayTimer = window.setTimeout(() => {
      game.delayTimer = null;
      // Don't touch the DOM or scene here: the render loop shows the stimulus on
      // its next frame so the canvas and the page change together.
      game.pendingStimulus = true;
    }, delay);
    scheduleDecoy(delay);
    Sound.play('arm'); // marks the start of the wait, never the signal itself
    // Screen readers hear when a round starts (never when the signal fires).
    announce(fillWords(T('announce.round', { n: session.rounds })));
  }

  /** Called from the render loop on the frame that shows the stimulus. */
  function commitStimulus() {
    game.pendingStimulus = false;
    if (game.lastDecoyAt > 0) activeProfile().stats.decoysDodged += 1; // held steady through it
    setState(STATE.GO);
  }

  function onStimulusDrawn() {
    game.frameMsAtStimulus = avgFrameMs;
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

  /** Append power-up messages from this round (texts are fixed strings, not user input). */
  function withPowerNotes(copy) {
    const notes = powerNotes;
    powerNotes = [];
    if (!notes.length) return copy;
    return { ...copy, sub: `${copy.sub || ''} ${notes.map((n) => `<span class="power-note">${n}</span>`).join(' ')}`.trim() };
  }

  /* ---------- Power-ups ---------- */

  /**
   * End-of-round bookkeeping: count down timed effects, then maybe drop a new
   * power-up. Solo only; tournaments stay luck-free.
   */
  function powerUpsAfterRound(last) {
    if (tournament.active) return;
    const pu = session.powerUps;
    // The round just played used these effects; count them down now.
    for (const id of ['leeway', 'calm']) {
      if (pu.active[id] > 0) {
        pu.active[id] -= 1;
        if (pu.active[id] === 0) powerNotes.push(T('pu.note.wornOff', { name: puName(id) }));
      }
    }

    const earned = last.type === 'result' && last.passed &&
      (last.isRecord || random01() < CONFIG.powerUpDropChance);
    if (earned) {
      if (pu.inventory.length >= CONFIG.powerUpSlots) {
        powerNotes.push(T('pu.note.full'));
      } else {
        const def = POWERUPS[Math.floor(random01() * POWERUPS.length)];
        pu.inventory.push(def.id);
        activeProfile().stats.powerUpsCollected += 1;
        powerNotes.push(T('pu.note.found', { name: puName(def.id), key: pu.inventory.length }));
        if (scene) scene.spawnPickup(def.hex3d);
        Sound.play('powerup', { delay: 0.25 });
        newSlotIndex = pu.inventory.length - 1;
        announce(T('pu.announce.found', { name: puName(def.id) }));
      }
    }
    applyLevel();
  }

  let newSlotIndex = -1; // slot to animate on the next render

  /** Use the power-up in a slot. Only between rounds, never while one is being timed. */
  function activatePowerUp(index) {
    if (tournament.active) return;
    if (game.state === STATE.WAITING || game.state === STATE.GO) return;
    const pu = session.powerUps;
    const id = pu.inventory[index];
    if (!id) return;
    const def = POWERUP_BY_ID[id];
    if (pu.active[id]) {
      announce(T('pu.alreadyActive', { name: puName(id) }));
      return;
    }
    pu.inventory.splice(index, 1);
    pu.active[id] = def.rounds || true;
    activeProfile().stats.powerUpsUsed += 1;
    Sound.play('powerOn');
    applyLevel();
    unlockAchievements(null);
    persist();
    renderProfileChip();
    announce(T('pu.activated', { name: puName(id), desc: puDesc(id) }));
  }

  function effectLabel(id, value) {
    const def = POWERUP_BY_ID[id];
    if (typeof value === 'number') return T('pu.effectRounds', { name: puName(id), n: value });
    return T('pu.effectReady', { name: puName(id) });
  }

  function renderPowerUps() {
    const pu = session.powerUps;
    const locked = tournament.active;
    const between = game.state !== STATE.WAITING && game.state !== STATE.GO;

    dom.powerSlots.replaceChildren(...Array.from({ length: CONFIG.powerUpSlots }, (_, i) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'slot';
      const id = pu.inventory[i];
      if (!id) {
        btn.classList.add('is-empty');
        btn.disabled = true;
        btn.textContent = T('pu.slotEmpty');
        btn.setAttribute('aria-label', T('pu.slotEmptyLabel', { n: i + 1 }));
        return btn;
      }
      const def = POWERUP_BY_ID[id];
      btn.style.setProperty('--pu', def.color);
      btn.innerHTML = `${iconSvg(`pu-${id}`, 20)}<span class="slot-name"></span><span class="slot-key">${T('pu.slotKey', { n: i + 1 })}</span>`;
      btn.querySelector('.slot-name').textContent = puName(id);
      btn.title = puDesc(id);
      btn.disabled = locked || !between || !!pu.active[id];
      btn.setAttribute('aria-label', T('pu.useLabel', { name: puName(id), n: i + 1, desc: puDesc(id) }) + (pu.active[id] ? T('pu.alreadyActiveSuffix') : ''));
      if (i === newSlotIndex) btn.classList.add('is-new');
      btn.addEventListener('click', () => activatePowerUp(i));
      return btn;
    }));
    newSlotIndex = -1;

    const effects = Object.entries(pu.active).filter(([, v]) => v);
    const chips = effects.map(([id, v]) => {
      const chip = document.createElement('span');
      chip.className = 'effect-chip';
      chip.style.setProperty('--pu', POWERUP_BY_ID[id].color);
      chip.innerHTML = iconSvg(`pu-${id}`, 14);
      chip.append(effectLabel(id, v));
      return chip;
    });
    if (chips.length) dom.powerActive.replaceChildren(...chips);
    else dom.powerActive.textContent = T('pu.hint');

    // Compact icons on the play area, so active effects are visible mid-round.
    dom.powerBadges.replaceChildren(...effects.map(([id]) => {
      const b = document.createElement('span');
      b.className = 'effect-chip';
      b.style.setProperty('--pu', POWERUP_BY_ID[id].color);
      b.innerHTML = iconSvg(`pu-${id}`, 14);
      return b;
    }));
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
        eyebrow: T('false.anticipated.eyebrow'),
        headline: T('false.anticipated.headline', { ms: fmt(Math.max(0, reactionMs)) }),
        sub: T('false.anticipated.sub', { min: CONFIG.anticipationMs }),
      };
    } else if (byDecoy) {
      copy = {
        eyebrow: T('false.decoy.eyebrow'),
        headline: T('false.decoy.headline'),
        sub: T('false.decoy.sub'),
      };
    } else {
      copy = {
        headline: T('false.early.headline'),
        sub: T('false.early.sub'),
      };
    }
    const roundLevel = session.level;
    const change = registerOutcome(false);
    powerUpsAfterRound({ type: 'false' });
    Sound.play('false');
    setState(STATE.FALSE_START, withPowerNotes(withLevelChange(copy, change)));
    renderStats();
    afterRound({ type: 'false', level: roundLevel });
    tournamentAfterRound({ type: 'false' });
    session.runWindow = []; // "in a row" is broken
    announce(T('announce.falseStart', { headline: copy.headline }) + (change === 'down' ? T('announce.levelBack', { n: session.level }) : ''));
  }

  function onMissed() {
    game.timeoutTimer = null;
    if (game.state !== STATE.GO) return;
    clearTimers();
    session.missed += 1;
    const roundLevel = session.level;
    const change = registerOutcome(false);
    powerUpsAfterRound({ type: 'missed' });
    Sound.play('missed');
    setState(STATE.MISSED, withPowerNotes(withLevelChange({ sub: viewFor('missed').sub }, change)));
    renderStats();
    afterRound({ type: 'missed', level: roundLevel });
    tournamentAfterRound({ type: 'missed' });
    session.runWindow = [];
    announce(T('announce.missed') + (change === 'down' ? T('announce.levelBack', { n: session.level }) : ''));
  }

  /**
   * Everything the leaderboard needs to re-check a round later. Collected after
   * the time is measured, so it costs nothing on the timed path.
   */
  function roundEvidence(timestamp, ms, meta) {
    const r3 = (v) => Math.round(v * 1000) / 1000;
    return {
      ms: r3(ms),
      delay: r3(game.scheduledDelay),
      actualDelay: r3(game.stimulusAt - game.roundStartAt),
      trusted: meta.trusted === true,
      input: meta.input,
      visible: !document.hidden,
      focused: document.hasFocus(),
      frameMs: r3(game.frameMsAtStimulus),
      perfSpan: r3(timestamp - game.roundStartAt),
      wallSpan: Date.now() - game.roundWallStart,
      nativeClock: Board.isNative(performance.now) && Board.isNative(Date.now),
      clockRes: clockResMs === null ? null : r3(clockResMs),
    };
  }

  function recordResult(ms, evidence) {
    clearTimers();
    const prev = summarize(session.times);
    session.times.push(ms);
    const now = summarize(session.times);

    const allTimeBest = activeProfile().stats.bestMs;
    let sub;
    if (allTimeBest !== null && ms < allTimeBest) {
      sub = T('result.newRecord', { ms: fmt(allTimeBest - ms) });
    } else if (allTimeBest === null) {
      sub = T('result.firstEver');
    } else if (prev.n === 0) {
      sub = T('result.firstSession');
    } else if (ms < prev.best) {
      sub = T('result.sessionBest', { ms: fmt(prev.best - ms) });
    } else {
      const delta = ms - prev.mean;
      sub = T(delta <= 0 ? 'result.faster' : 'result.slower', { ms: fmt(Math.abs(delta)), avg: fmt(prev.mean) });
    }

    // Every valid time goes into the stats; the level target only decides the streak.
    const target = effectiveTarget(); // Leeway loosens the pass/fail line, never the time
    const roundLevel = session.level;
    const passed = ms <= target;
    // The time is already measured, so feedback sound can't affect it.
    const isRecord = allTimeBest !== null && ms < allTimeBest;
    Sound.play(isRecord ? 'record' : 'hit', { quality: (450 - ms) / 250 });
    const change = registerOutcome(passed);
    let eyebrow = rate(ms);
    if (tournament.active) {
      // No level progression in tournaments: everyone plays the same level.
    } else if (passed && !change) {
      sub += session.level === LEVELS.length
        ? T('result.topLevel')
        : T('result.streak', { n: session.streak, of: CONFIG.levelUpStreak });
    } else if (!passed) {
      eyebrow = T('result.overTarget', { ms: target });
      sub += T('result.streakResets');
    }

    powerUpsAfterRound({ type: 'result', passed, isRecord: isRecord || allTimeBest === null });
    setState(STATE.RESULT, withPowerNotes(withLevelChange({ eyebrow, headline: '', readout: ms, sub }, change)));
    renderStats(now);
    afterRound({ type: 'result', ms, level: roundLevel, passed });
    tournamentAfterRound({ type: 'result', ms });
    if (evidence) {
      session.runWindow.push(evidence);
      if (session.runWindow.length > Board.RUN_LENGTH) session.runWindow.shift();
      maybeSubmitRun();
    }
    const levelNote = change === 'up' ? T('announce.levelUpNow', { n: session.level })
      : change === 'down' ? T('announce.levelBack', { n: session.level }) : '';
    announce(T('announce.result', { ms: fmt(ms), eyebrow }) + levelNote);
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
    session.powerUps = freshPowerUps();
    session.runWindow = [];
    powerNotes = [];
    applyLevel();
    setState(STATE.IDLE, copy || { eyebrow: T('session.cleared'), headline: T('state.idle.headline') });
    renderStats();
    if (!copy) announce(T('announce.cleared'));
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
      showBanner(T('banner.saveFailed'));
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

  /* ---------- Verified leaderboard ---------- */

  /**
   * After each valid reaction: if the last 5 in a row beat the player's
   * leaderboard entry, submit them for checking. Runs after the result is on
   * screen, never during a timed round.
   */
  function maybeSubmitRun() {
    if (session.runWindow.length < Board.RUN_LENGTH) return;
    const rounds = session.runWindow.slice(-Board.RUN_LENGTH);
    const profile = activeProfile();
    const avg = Math.round((rounds.reduce((a, r) => a + r.ms, 0) / rounds.length) * 10) / 10;
    const current = Board.currentBest(profile.id);
    if (current !== null && !(avg < current)) return;

    const roundNo = session.rounds;
    Board.submitRun({ profileId: profile.id, name: profile.name, level: session.level, rounds })
      .then((res) => {
        // Only annotate the result screen if it's still the same round.
        const stillShowing = game.state === STATE.RESULT && session.rounds === roundNo;
        let note = null;
        if (res.status === 'verified') {
          const p = saved.state.profiles[profile.id];
          if (p) p.stats.verifiedRuns += 1;
          note = T('board.newEntry', { avg: fmt(res.avg), rank: res.rank });
          if (p && saved.state.activeId === p.id) unlockAchievements(null);
          persist();
          renderProfileChip();
          Sound.play('record', { delay: 0.2 });
        } else if (res.status === 'rejected') {
          note = T('board.rejected', { reasons: res.reasons.map(reasonText).join(' ') });
        }
        if (!note) return;
        if (stillShowing) {
          const span = document.createElement('span');
          span.className = 'power-note';
          span.textContent = note;
          dom.subline.append(' ', span);
          dom.subline.hidden = false;
        }
        announce(note);
        if (dom.dialog.open) renderDialog();
      })
      .catch((err) => console.warn('[Reflex Lab] leaderboard submit failed', err));
  }

  let boardRenderToken = 0;

  async function renderLeaderboard() {
    const token = ++boardRenderToken;
    let result;
    try {
      result = await Board.list();
    } catch (err) {
      console.warn('[Reflex Lab] leaderboard unavailable', err);
      return;
    }
    if (token !== boardRenderToken) return; // a newer render has started
    const { verified, excluded, sealing } = result;
    const me = saved.state.activeId;
    // Show the player's current name and colour when the profile still exists.
    const who = (row) => {
      const p = saved.state.profiles[row.profileId];
      return p ? { name: p.name, color: p.color } : { name: String(row.name || T('board.deleted')), color: Storage.PROFILE_COLORS[4] };
    };

    const top = verified.slice(0, 10);
    dom.boardEmpty.hidden = top.length > 0;
    dom.boardWrap.hidden = top.length === 0;
    dom.boardBody.replaceChildren(...top.map((row, i) => {
      const tr = document.createElement('tr');
      if (row.profileId === me) tr.className = 'is-me';
      tr.innerHTML = `<td class="rank">${i + 1}</td><td><span class="who"><span class="avatar" aria-hidden="true"></span><span class="who-name"></span></span></td>` +
        `<td class="num time">${fmt(row.avg)} ms</td><td class="num">${fmt(row.best)} ms</td><td class="num">${Number(row.level) || 1}</td>` +
        `<td>${formatDate(row.at)}</td><td class="status"><span class="verified-badge" title="${escapeHtml(T('board.badgeTitle') + (row.sealed ? T('board.badgeSealed') : ''))}">✓<span class="sr-only">${escapeHtml(T('board.verifiedSr'))}</span></span></td>`;
      paintAvatar(tr.querySelector('.avatar'), who(row));
      tr.querySelector('.who-name').textContent = who(row).name;
      return tr;
    }));

    dom.sealNote.textContent = sealing
      ? T('board.sealOn')
      : T('board.sealOff');

    dom.excludedBox.hidden = excluded.length === 0;
    dom.excludedCount.textContent = String(excluded.length);
    dom.excludedList.replaceChildren(...excluded.slice(0, 10).map((row) => {
      const li = document.createElement('li');
      const head = document.createElement('p');
      head.className = 'excluded-head';
      const avg = Number.isFinite(row.avg) ? `${fmt(row.avg)} ms` : '—';
      head.textContent = `${who(row).name} · ${avg} · ${formatDate(row.at)}`;
      const reasons = document.createElement('ul');
      reasons.className = 'excluded-reasons';
      for (const code of row.reasons) {
        const r = document.createElement('li');
        r.textContent = reasonText(code);
        reasons.appendChild(r);
      }
      li.append(head, reasons);
      return li;
    }));
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
    const owner = tournament.active ? profile.name : null;
    unlocked.forEach((a, i) => {
      profile.achievements[a.id] = at;
      window.setTimeout(() => showToast(a, owner), i * 450); // stagger several unlocks
    });
    if (unlocked.length) {
      announce(T('announce.ach', { list: unlocked.map(achTitle).join(', ') }));
    }
  }

  /* ---------- Icons for achievements ---------- */
  const ICONS = {
    speed: '<path d="M13 2 4 14h7l-1 8 9-12h-7z" />',
    focus: '<circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1.2" />',
    decoy: '<path d="M12 3 20 6v6c0 5-3.4 8.2-8 9-4.6-.8-8-4-8-9V6z" /><path d="m8.5 12 2.5 2.5 4.5-5" />',
    level: '<path d="m6 15 6-6 6 6" /><path d="m6 20 6-6 6 6" /><path d="M6 4h12" />',
    'pu-shield': '<path d="M12 3 20 6v6c0 5-3.4 8.2-8 9-4.6-.8-8-4-8-9V6z" />',
    'pu-double': '<path d="m6 12 6-6 6 6" /><path d="m6 18 6-6 6 6" />',
    'pu-leeway': '<circle cx="12" cy="12" r="3.5" /><path d="M2.5 12h4M17.5 12h4M12 2.5v4M12 17.5v4" />',
    'pu-calm': '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" />',
    volume: '<path d="M5 20V11" /><path d="M12 20V5" /><path d="M19 20v-7" />',
    fun: '<path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1" />',
  };
  function iconSvg(kind, size = 20) {
    return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[kind] || ICONS.fun}</svg>`;
  }

  function showToast(achievement, owner) {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = `<span class="ach-icon">${iconSvg(achievement.kind)}</span>
      <div><p class="toast-kicker"></p><p class="toast-title"></p><p class="toast-desc"></p></div>`;
    toast.querySelector('.toast-kicker').textContent = T('toast.kicker');
    // In a tournament several people share the screen, so say whose it is.
    if (owner) toast.querySelector('.toast-kicker').textContent = T('toast.kickerOwner', { name: owner });
    toast.querySelector('.toast-title').textContent = achTitle(achievement);
    toast.querySelector('.toast-desc').textContent = achDesc(achievement);
    dom.toasts.appendChild(toast);
    Sound.play('achievement');
    // Keep at most three on screen.
    while (dom.toasts.children.length > 3) dom.toasts.firstElementChild.remove();
    window.setTimeout(() => {
      toast.classList.add('is-leaving');
      window.setTimeout(() => toast.remove(), 240);
    }, 4200);
  }

  /* ---------- Rendering ---------- */
  const formatDate = (iso) => (iso
    ? new Intl.DateTimeFormat(I18n.locale(), { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(iso))
    : '—');

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
    const record = p.stats.bestMs !== null ? T('profile.best', { ms: fmt(p.stats.bestMs) }) : T('profile.noRecord');
    dom.profileSub.textContent = `${record} · ${T('profile.achCount', { n: unlockedCount(p), of: Achievements.LIST.length })}`;
    dom.profileBtn.setAttribute('aria-label', T('profile.openLabel', { name: p.name, sub: dom.profileSub.textContent }));
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
    dom.dlgSince.textContent = T('profile.since', { date: formatDate(p.createdAt) }) +
      (p.lastPlayedAt ? T('profile.lastPlayed', { date: formatDate(p.lastPlayedAt) }) : '');
    if (document.activeElement !== dom.nameInput) dom.nameInput.value = p.name;

    // Colour choices
    if (!dom.colorOptions.children.length) {
      Storage.PROFILE_COLORS.forEach((color, i) => {
        const label = document.createElement('label');
        label.innerHTML = `<input type="radio" name="avatarColor" value="${color}" id="avatarColor${i}"><span class="dot" style="--swatch:${color}"></span><span class="sr-only">${escapeHtml(T('profile.colourN', { n: i + 1 }))}</span>`;
        dom.colorOptions.appendChild(label);
      });
    }
    dom.colorOptions.querySelectorAll('input').forEach((input) => { input.checked = input.value === p.color; });

    // Lifetime stats
    const avg = s.attempts ? s.totalMs / s.attempts : null;
    dom.lifetimeGrid.replaceChildren(
      statTile(T('stat.bestTime'), s.bestMs !== null ? msMarkup(s.bestMs) : null),
      statTile(T('stat.average'), avg !== null ? msMarkup(avg) : null, s.attempts ? T('stat.overN', { n: s.attempts }) : ''),
      statTile(T('stat.peakLevel'), `${s.peakLevel}<span class="u">/ ${LEVELS.length}</span>`, LEVELS[s.peakLevel - 1] ? levelName(s.peakLevel) : ''),
      statTile(T('stat.sessions'), String(s.sessions)),
      statTile(T('stat.falseStarts'), String(s.falseStarts), s.missed ? T('stat.nMissed', { n: s.missed }) : ''),
      statTile(T('stat.decoysDodged'), String(s.decoysDodged)),
      statTile(T('stat.tournaments'), String(s.tournamentsPlayed), s.tournamentsPlayed ? T('stat.nWon', { n: s.tournamentsWon }) : ''),
    );

    // Player switcher
    const profiles = Object.values(saved.state.profiles)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    dom.profileSelect.replaceChildren(...profiles.map((pr) => {
      const opt = document.createElement('option');
      opt.value = pr.id;
      opt.textContent = pr.stats.bestMs !== null ? T('profile.bestOption', { name: pr.name, ms: fmt(pr.stats.bestMs) }) : pr.name;
      opt.selected = pr.id === p.id;
      return opt;
    }));
    // Rounds are credited to the active player, so switching is locked mid-tournament.
    const locked = tournament.active;
    dom.profileSelect.disabled = locked;
    dom.newProfileBtn.disabled = locked || profiles.length >= Storage.MAX_PROFILES;
    dom.newProfileBtn.title = profiles.length >= Storage.MAX_PROFILES ? T('profile.maxPlayers', { n: Storage.MAX_PROFILES }) : '';
    dom.deleteProfileBtn.disabled = locked;
    resetDeleteButton();
    dom.storageNote.textContent = T(saved.persistent ? 'profile.storageOn' : 'profile.storageOff') +
      (locked ? T('profile.locked') : '');

    // Records
    dom.recordsGrid.replaceChildren(
      statTile(T('stat.personalBest'), s.bestMs !== null ? msMarkup(s.bestMs) : null, p.top[0] ? formatDate(p.top[0].at) : ''),
      statTile(T('stat.best5'), s.bestAvg5 !== null ? msMarkup(s.bestAvg5) : null, T('stat.avgNote')),
      statTile(T('stat.longestClean'), String(s.longestClean), T('stat.roundsNote')),
    );
    renderLeaderboard(); // async: re-checks every run before showing it

    // Achievements
    const ctx = achievementContext();
    const unlocked = unlockedCount(p);
    dom.achCount.textContent = `${unlocked}/${Achievements.LIST.length}`;
    dom.achList.replaceChildren(...Achievements.LIST.map((a) => {
      const at = p.achievements[a.id];
      const li = document.createElement('li');
      li.className = `ach${at ? ' is-unlocked' : ''}`;
      li.innerHTML = `<span class="ach-icon">${iconSvg(a.kind)}</span><div><p class="ach-title"></p><p class="ach-desc"></p><p class="ach-meta"></p></div>`;
      li.querySelector('.ach-title').textContent = achTitle(a);
      li.querySelector('.ach-desc').textContent = achDesc(a);
      const meta = li.querySelector('.ach-meta');
      const prog = Achievements.progressOf(a, ctx);
      if (at) {
        meta.textContent = T('ach.unlockedOn', { date: formatDate(at) });
      } else if (prog) {
        meta.textContent = `${prog.current} / ${prog.goal}`;
        const bar = document.createElement('div');
        bar.className = 'ach-bar';
        bar.innerHTML = `<span style="width:${Math.round((prog.current / prog.goal) * 100)}%"></span>`;
        li.lastElementChild.appendChild(bar);
      } else {
        meta.textContent = T('ach.locked');
      }
      li.setAttribute('aria-label', `${achTitle(a)}. ${achDesc(a)} ${at ? T('ach.aria.unlocked') : prog ? T('ach.aria.progress', { c: prog.current, g: prog.goal }) : T('ach.aria.locked')}`);
      return li;
    }));
  }

  /* ---------- Dialog behaviour ---------- */
  function openProfile(tabId = 'tab-profile') {
    if (game.running) {
      stopSession({
        eyebrow: T('common.paused'), headline: T('common.paused'),
        sub: T('session.profilePausedSub'),
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
    announce(T('announce.nameSaved', { name }));
  }

  function switchProfile(id) {
    if (!saved.state.profiles[id] || id === saved.state.activeId) return;
    saved.state.activeId = id;
    persist();
    // A new player starts a fresh session: stats on screen belong to one person.
    resetSession({ eyebrow: T('profile.switched'), headline: T('profile.hi', { name: activeProfile().name }) });
    renderProfileChip();
    renderDialog();
    announce(T('announce.switched', { name: activeProfile().name }));
  }

  function createPlayer() {
    const count = Object.keys(saved.state.profiles).length;
    if (count >= Storage.MAX_PROFILES) return;
    const used = new Set(Object.values(saved.state.profiles).map((p) => p.color));
    const color = Storage.PROFILE_COLORS.find((c) => !used.has(c)) || Storage.PROFILE_COLORS[count % Storage.PROFILE_COLORS.length];
    const profile = Storage.createProfile(T('profile.defaultNameN', { n: count + 1 }), color);
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
    dom.deleteProfileBtn.textContent = T('profile.delete');
  }

  /** Two-step delete: the first press arms the button for a few seconds. */
  function deletePlayer() {
    if (!dom.deleteProfileBtn.classList.contains('is-confirming')) {
      dom.deleteProfileBtn.classList.add('is-confirming');
      dom.deleteProfileBtn.textContent = T('profile.deleteConfirm', { name: activeProfile().name });
      deleteTimer = window.setTimeout(resetDeleteButton, 4000);
      return;
    }
    const gone = activeProfile().name;
    Board.removeProfile(saved.state.activeId);
    delete saved.state.profiles[saved.state.activeId];
    let next = Object.values(saved.state.profiles)[0];
    if (!next) {
      next = Storage.createProfile(T('profile.defaultName'));
      saved.state.profiles[next.id] = next;
    }
    saved.state.activeId = '';
    switchProfile(next.id);
    announce(T('announce.deleted', { gone, name: next.name }));
  }

  function reloadFromStorage() {
    const { state } = Storage.load({ defaultName: T('profile.defaultName') });
    saved.state = state;
    renderProfileChip();
    if (dom.dialog.open) renderDialog();
  }

  function bindProfileEvents() {
    dom.profileBtn.addEventListener('click', () => openProfile());
    dom.leaderboardBtn.addEventListener('click', () => openProfile('tab-records'));
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
      // Not mid-round, and not mid-tournament (players could disappear under us).
      if (game.state === STATE.WAITING || game.state === STATE.GO || tournament.active) return;
      reloadFromStorage();
    });
  }

  /* ======================================================================
   * Tournament (hot-seat: players take turns on this device)
   * ==================================================================== */
  const escapeHtml = (text) => String(text).replace(/[&<>"']/g, (ch) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

  /** Start button / first tap: begins a solo session or the current tournament turn. */
  function startPlay() {
    if (tournament.active) {
      if (tournament.phase === 'turnDone') { advanceTurn(); return; }
      if (tournament.phase === 'finished') return;
      tournament.phase = 'playing';
    }
    startSession();
  }

  /** Score: average of valid times plus a penalty per foul. Null without a valid time. */
  function tournamentScore(r) {
    if (!r.times.length) return null;
    const avg = r.times.reduce((a, b) => a + b, 0) / r.times.length;
    return avg + r.fouls * CONFIG.tournamentPenaltyMs;
  }

  function computeStandings() {
    return tournament.players.map((id) => {
      const r = tournament.results[id];
      const p = saved.state.profiles[id];
      const n = r.times.length;
      return {
        id,
        name: p ? p.name : T('board.deleted'),
        color: p ? p.color : Storage.PROFILE_COLORS[4],
        score: tournamentScore(r),
        avg: n ? r.times.reduce((a, b) => a + b, 0) / n : null,
        best: n ? Math.min(...r.times) : null,
        fouls: r.fouls,
        played: n + r.fouls,
      };
    }).sort((a, b) => {
      // No valid time ranks last; ties go to the best single time, then fewer fouls.
      if (a.score === null || b.score === null) return (a.score === null) - (b.score === null);
      return a.score - b.score || a.best - b.best || a.fouls - b.fouls;
    });
  }

  function startTournament(setup) {
    clearTimers();
    game.running = false;
    Object.assign(tournament, {
      active: true,
      players: setup.players.slice(),
      rounds: setup.rounds,
      level: setup.level,
      turn: 0,
      roundInTurn: 0,
      phase: 'handoff',
      results: Object.fromEntries(setup.players.map((id) => [id, { times: [], fouls: 0 }])),
      returnTo: tournament.active ? tournament.returnTo : saved.state.activeId,
      lastSetup: { ...setup, players: setup.players.slice() },
    });
    dom.tourneyCard.hidden = false;
    dom.levelCard.hidden = true;
    prepareTurn();
  }

  /** Hand-over screen for the player whose turn it is. */
  function prepareTurn() {
    tournament.phase = 'handoff';
    tournament.roundInTurn = 0;
    saved.state.activeId = tournament.players[tournament.turn];
    persist();

    // Each turn gets a clean slate, so the panel shows only this player's rounds.
    session.times.length = 0;
    Object.assign(session, {
      falseStarts: 0, missed: 0, rounds: 0, streak: 0, fails: 0, cleanRun: 0, falseStreak: 0,
      powerUps: freshPowerUps(), // power-ups are off in tournaments
      runWindow: [],
      level: tournament.level,
      peakLevel: 1, // levels are chosen, not reached, in a tournament
    });
    applyLevel();
    renderStats();
    renderProfileChip();
    renderTournament();

    const p = activeProfile();
    setState(STATE.IDLE, {
      eyebrow: T('t.handoff.eyebrow', { n: tournament.turn + 1, of: tournament.players.length }),
      headline: T('t.handoff.headline', { name: p.name }),
      sub: T('t.handoff.sub', { rounds: tournament.rounds, level: tournament.level, levelName: escapeHtml(levelName(tournament.level)) }),
      hint: T('t.handoff.hint'),
    });
    announce(T('announce.up', { name: p.name, rounds: tournament.rounds }));
  }

  /** Called after every round outcome; ends the turn once all rounds are played. */
  function tournamentAfterRound(last) {
    if (!tournament.active) return;
    const r = tournament.results[saved.state.activeId];
    if (!r) return;
    if (last.type === 'result') r.times.push(last.ms);
    else r.fouls += 1;
    tournament.roundInTurn += 1;

    if (tournament.roundInTurn >= tournament.rounds) {
      tournament.phase = 'turnDone';
      game.running = false;
      const next = tournament.players[tournament.turn + 1];
      const nextName = next && saved.state.profiles[next] ? saved.state.profiles[next].name : null;
      const note = nextName
        ? T('t.turnDone', { name: escapeHtml(nextName) })
        : T('t.lastTurn');
      dom.subline.innerHTML += note;
      dom.subline.hidden = false;
      dom.hint.innerHTML = T('hint.continue');
      announce(nextName ? T('announce.turnDone', { name: nextName }) : T('announce.lastTurn'));
    }
    renderControls();
    renderTournament();
  }

  function advanceTurn() {
    tournament.turn += 1;
    if (tournament.turn >= tournament.players.length) finishTournament();
    else prepareTurn();
  }

  function finishTournament() {
    tournament.phase = 'finished';
    const standings = computeStandings();
    const winner = standings[0] && standings[0].score !== null ? standings[0] : null;

    // Credit every player's profile, then check their achievements.
    const stamp = new Date().toISOString();
    let delay = 0;
    for (const row of standings) {
      const p = saved.state.profiles[row.id];
      if (!p) continue;
      p.stats.tournamentsPlayed += 1;
      if (winner && row.id === winner.id) p.stats.tournamentsWon += 1;
      const ctx = {
        stats: p.stats,
        session: { times: [], cleanRun: 0, falseStreak: 0 },
        last: { type: 'tournament', won: !!winner && row.id === winner.id, players: standings.length },
      };
      for (const a of Achievements.evaluate(p.achievements, ctx)) {
        p.achievements[a.id] = stamp;
        window.setTimeout(() => showToast(a, p.name), delay);
        delay += 450;
      }
    }
    persist();
    renderTournament();
    renderControls();
    openResults(standings, winner);
  }

  /** Leave tournament mode and go back to the solo player. */
  function endTournament(message) {
    clearTimers();
    game.running = false;
    const back = tournament.returnTo;
    tournament.active = false;
    tournament.phase = 'handoff';
    if (back && saved.state.profiles[back]) saved.state.activeId = back;
    persist();
    dom.tourneyCard.hidden = true;
    dom.levelCard.hidden = false;
    resetTourneyButton();
    resetSession({ eyebrow: message || T('t.ended'), headline: T('t.backToSolo') });
    renderProfileChip();
  }

  function renderTournament() {
    if (!tournament.active) return;
    dom.tourneyMeta.textContent = T('t.meta', { level: tournament.level, rounds: tournament.rounds });
    dom.tourneyFine.textContent = T('tcard.fine', { p: CONFIG.tournamentPenaltyMs });
    dom.tourneyList.replaceChildren(...tournament.players.map((id, i) => {
      const p = saved.state.profiles[id];
      const r = tournament.results[id];
      const played = r.times.length + r.fouls;
      const score = tournamentScore(r);
      const li = document.createElement('li');
      if (i === tournament.turn && tournament.phase !== 'finished') li.className = 'is-current';
      else if (i > tournament.turn) li.className = 'is-waiting';
      li.innerHTML = '<span class="avatar" aria-hidden="true"></span><span class="t-name"></span><span class="t-score"></span>';
      if (p) paintAvatar(li.querySelector('.avatar'), p);
      const nameEl = li.querySelector('.t-name');
      nameEl.textContent = p ? p.name : T('board.deleted');
      const progress = document.createElement('span');
      progress.className = 't-progress';
      progress.textContent = i < tournament.turn || (i === tournament.turn && tournament.phase !== 'handoff' && played >= tournament.rounds)
        ? T('t.done', { n: r.fouls })
        : i === tournament.turn ? T('t.playing', { p: played, of: tournament.rounds }) : T('t.waiting');
      nameEl.appendChild(progress);
      li.querySelector('.t-score').innerHTML = score === null
        ? '—'
        : `${fmt(score)}<small>${escapeHtml(T('t.scoreSmall'))}</small>`;
      return li;
    }));
  }

  /* ---------- Setup dialog ---------- */
  function openTourneySetup() {
    if (game.running) {
      stopSession({
        eyebrow: T('common.paused'), headline: T('common.paused'),
        sub: T('t.setupPausedSub'),
      });
    }
    const defaults = tournament.lastSetup || {
      players: [saved.state.activeId], rounds: CONFIG.tournamentDefaultRounds, level: 1,
    };
    renderSetup(new Set(defaults.players));

    dom.roundsPick.replaceChildren(...CONFIG.tournamentRoundOptions.map((n) => {
      const label = document.createElement('label');
      label.innerHTML = `<input type="radio" name="tourneyRounds" value="${n}" id="tourneyRounds${n}"><span>${n}</span>`;
      label.querySelector('input').checked = n === defaults.rounds;
      return label;
    }));
    dom.tourneyLevel.replaceChildren(...LEVELS.map((lvl, i) => {
      const opt = document.createElement('option');
      opt.value = String(i + 1);
      opt.textContent = T('t.levelOption', { n: i + 1, name: levelName(i + 1), target: lvl.target });
      opt.selected = i + 1 === defaults.level;
      return opt;
    }));
    dom.tourneyRules.textContent = T('t.rules', { p: CONFIG.tournamentPenaltyMs });
    dom.tourneyError.hidden = true;
    dom.newPlayerName.value = '';
    dom.tourneyDialog.showModal();
  }

  function renderSetup(checked) {
    const profiles = Object.values(saved.state.profiles)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    dom.playerPicks.replaceChildren(...profiles.map((p) => {
      const li = document.createElement('li');
      li.innerHTML = `<label><input type="checkbox" name="tourneyPlayer" id="pick-${p.id}"><span class="avatar" aria-hidden="true"></span><span class="p-name"></span><span class="p-best"></span></label>`;
      const input = li.querySelector('input');
      input.value = p.id;
      input.checked = checked.has(p.id);
      paintAvatar(li.querySelector('.avatar'), p);
      li.querySelector('.p-name').textContent = p.name;
      li.querySelector('.p-best').textContent = p.stats.bestMs !== null ? T('t.pickBest', { ms: fmt(p.stats.bestMs) }) : T('t.pickNew');
      return li;
    }));
    const full = profiles.length >= Storage.MAX_PROFILES;
    dom.addPlayerBtn.disabled = full;
    dom.newPlayerName.disabled = full;
    dom.newPlayerName.placeholder = full ? T('t.deviceFull', { n: Storage.MAX_PROFILES }) : T('t.addPlaceholder');
  }

  function checkedPlayers() {
    return Array.from(dom.playerPicks.querySelectorAll('input:checked')).map((i) => i.value)
      .filter((id) => saved.state.profiles[id]);
  }

  function setupError(message) {
    dom.tourneyError.textContent = message;
    dom.tourneyError.hidden = !message;
  }

  function addPlayerFromSetup() {
    const name = Storage.cleanName(dom.newPlayerName.value);
    if (!name) { setupError(T('t.err.name')); dom.newPlayerName.focus(); return; }
    const all = Object.values(saved.state.profiles);
    if (all.length >= Storage.MAX_PROFILES) { setupError(T('t.err.full', { n: Storage.MAX_PROFILES })); return; }
    if (all.some((p) => p.name.toLowerCase() === name.toLowerCase())) {
      setupError(T('t.err.exists', { name }));
      return;
    }
    const used = new Set(all.map((p) => p.color));
    const color = Storage.PROFILE_COLORS.find((c) => !used.has(c)) || Storage.PROFILE_COLORS[all.length % Storage.PROFILE_COLORS.length];
    const profile = Storage.createProfile(name, color);
    saved.state.profiles[profile.id] = profile;
    persist();
    renderSetup(new Set([...checkedPlayers(), profile.id]));
    setupError('');
    dom.newPlayerName.value = '';
    dom.newPlayerName.focus();
    announce(T('announce.added', { name }));
  }

  function submitSetup(event) {
    event.preventDefault();
    const players = checkedPlayers();
    if (players.length < CONFIG.tournamentMinPlayers) {
      setupError(T('t.err.min', { n: CONFIG.tournamentMinPlayers }));
      return;
    }
    const roundsInput = dom.roundsPick.querySelector('input:checked');
    const rounds = roundsInput ? Number(roundsInput.value) : CONFIG.tournamentDefaultRounds;
    const level = Math.min(LEVELS.length, Math.max(1, Number(dom.tourneyLevel.value) || 1));
    dom.tourneyDialog.close();
    Sound.play('levelUp');
    startTournament({ players, rounds, level });
  }

  /* ---------- Results dialog ---------- */
  let rematchRequested = false;

  function openResults(standings, winner) {
    if (winner) {
      paintAvatar(dom.winnerAvatar, winner);
      dom.winnerAvatar.hidden = false;
      dom.resultsTitle.textContent = T('t.wins', { name: winner.name });
    } else {
      dom.winnerAvatar.hidden = true;
      dom.resultsTitle.textContent = T('t.noWinner');
    }
    dom.resultsSub.textContent = T('t.resultsSub', { rounds: tournament.rounds, level: tournament.level, name: levelName(tournament.level), p: CONFIG.tournamentPenaltyMs });
    dom.resultsBody.replaceChildren(...standings.map((row, i) => {
      const tr = document.createElement('tr');
      if (winner && row.id === winner.id) tr.className = 'is-winner';
      const cell = (v) => (v === null ? '—' : `${fmt(v)} ms`);
      tr.innerHTML = `<td class="rank">${i + 1}</td><td><span class="who"><span class="avatar" aria-hidden="true"></span><span class="who-name"></span></span></td>` +
        `<td class="num time">${cell(row.score)}</td><td class="num">${cell(row.avg)}</td><td class="num">${cell(row.best)}</td><td class="num">${row.fouls}</td>`;
      paintAvatar(tr.querySelector('.avatar'), row);
      tr.querySelector('.who-name').textContent = row.name;
      return tr;
    }));
    Sound.play(winner ? 'record' : 'missed', { delay: 0.1 });
    announce(winner ? T('announce.wins', { name: winner.name }) : T('announce.noWinner'));
    rematchRequested = false;
    dom.resultsDialog.showModal();
    dom.rematchBtn.focus();
  }

  let tourneyConfirmTimer = null;
  function resetTourneyButton() {
    window.clearTimeout(tourneyConfirmTimer);
    dom.tourneyBtn.classList.remove('is-confirming');
    dom.tourneyBtn.textContent = tournament.active ? T('btn.endTournament') : T('btn.tournament');
  }

  function bindTournamentEvents() {
    dom.tourneyBtn.addEventListener('click', () => {
      if (!tournament.active) { openTourneySetup(); return; }
      // Ending early throws away the standings, so ask for a second press.
      if (!dom.tourneyBtn.classList.contains('is-confirming')) {
        if (game.running) stopSession({ eyebrow: T('common.paused'), headline: T('common.paused'), sub: T('t.endPausedSub') });
        dom.tourneyBtn.classList.add('is-confirming');
        dom.tourneyBtn.textContent = T('btn.endTournamentConfirm');
        tourneyConfirmTimer = window.setTimeout(resetTourneyButton, 4000);
        return;
      }
      endTournament(T('t.endedEarly'));
    });

    dom.tourneyForm.addEventListener('submit', submitSetup);
    dom.tourneyClose.addEventListener('click', () => dom.tourneyDialog.close());
    dom.tourneyCancel.addEventListener('click', () => dom.tourneyDialog.close());
    dom.tourneyDialog.addEventListener('click', (e) => { if (e.target === dom.tourneyDialog) dom.tourneyDialog.close(); });
    dom.addPlayerBtn.addEventListener('click', addPlayerFromSetup);
    dom.newPlayerName.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); addPlayerFromSetup(); } // add, don't submit
    });
    dom.playerPicks.addEventListener('change', () => setupError(''));

    dom.rematchBtn.addEventListener('click', () => {
      rematchRequested = true;
      dom.resultsDialog.close();
    });
    dom.resultsDone.addEventListener('click', () => dom.resultsDialog.close());
    dom.resultsDialog.addEventListener('close', () => {
      if (rematchRequested && tournament.lastSetup) {
        const setup = tournament.lastSetup;
        startTournament({ ...setup, players: setup.players.filter((id) => saved.state.profiles[id]) });
      } else {
        endTournament(T('t.finished'));
      }
    });
  }

  /** Single entry point for a reaction from mouse, touch, pen or keyboard. */
  function handleReaction(timestamp, meta = { trusted: false, input: 'unknown' }) {
    switch (game.state) {
      case STATE.IDLE:
        startPlay();
        break;
      case STATE.WAITING:
        falseStart();
        break;
      case STATE.GO: {
        const ms = timestamp - game.stimulusAt;
        if (ms < CONFIG.anticipationMs) falseStart(ms);
        else recordResult(ms, roundEvidence(timestamp, ms, meta));
        break;
      }
      case STATE.RESULT:
      case STATE.FALSE_START:
      case STATE.MISSED:
        if (game.running) beginRound();
        else startPlay();
        break;
      default:
        break;
    }
  }

  /* ======================================================================
   * Rendering: controls, stats, chart
   * ==================================================================== */
  function renderControls() {
    const t = tournament.active;
    let label;
    if (game.running) label = t ? T('btn.pauseTurn') : T('btn.stop');
    else if (!t) label = T('btn.start');
    else if (tournament.phase === 'turnDone' || tournament.phase === 'finished') {
      label = tournament.turn + 1 < tournament.players.length ? T('btn.nextPlayer') : T('btn.seeResults');
    } else label = tournament.phase === 'handoff' ? T('btn.startTurn') : T('btn.resumeTurn');
    dom.startBtn.textContent = label;
    dom.startBtn.classList.toggle('is-running', game.running);
    const hasData = session.rounds > 0 || session.times.length > 0;
    dom.resetBtn.disabled = t || !hasData;
    if (!dom.tourneyBtn.classList.contains('is-confirming')) {
      dom.tourneyBtn.textContent = t ? T('btn.endTournament') : T('btn.tournament');
    }
    if (t && saved.state) {
      const shown = Math.min(tournament.roundInTurn + 1, tournament.rounds);
      dom.roundCount.textContent = T('t.round', { name: activeProfile().name, r: shown, of: tournament.rounds });
    } else {
      dom.roundCount.textContent = T('level.round', { n: session.level }) + (session.rounds ? T('level.roundSuffix', { r: session.rounds }) : '');
    }
  }

  function renderLevel() {
    const level = currentLevel();
    dom.levelNum.textContent = String(session.level);
    dom.levelName.textContent = levelName(session.level);
    dom.levelOf.textContent = T('level.of', { n: session.level, of: LEVELS.length });
    dom.levelBrief.textContent = fillWords(levelBrief(session.level));
    const target = effectiveTarget();
    dom.levelTarget.textContent = target > level.target
      ? `≤ ${target} ms (+${target - level.target})`
      : `≤ ${level.target} ms`;
    renderPowerUps();

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
    dom.levelPips.setAttribute('aria-label', T('level.streakAria', { n: session.streak, of: CONFIG.levelUpStreak }));
    renderControls();
  }

  function msMarkup(ms) {
    // Screen readers say "milliseconds" rather than spelling out "m s".
    return `${fmt(ms)}<span class="u" aria-hidden="true">ms</span><span class="sr-only">${T('unit.msSr')}</span>`;
  }

  function renderStats(summary = summarize(session.times)) {
    if (summary.n === 0) {
      dom.statLast.textContent = '—';
      dom.statBest.textContent = '—';
      dom.statAvg.textContent = '—';
      dom.statSd.innerHTML = '&nbsp;';
      dom.statMedian.innerHTML = '&nbsp;';
      dom.statsScope.textContent = T('stats.noAttempts');
    } else {
      dom.statLast.innerHTML = msMarkup(summary.last);
      dom.statBest.innerHTML = msMarkup(summary.best);
      dom.statAvg.innerHTML = msMarkup(summary.mean);
      dom.statSd.textContent = summary.n > 1 ? T('stats.spread', { sd: fmt(summary.sd) }) : T('stats.needs2');
      dom.statMedian.textContent = T('stats.median', { ms: fmt(summary.median) });
      dom.statsScope.textContent = T('stats.thisView');
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
      // Colours come from CSS classes so they follow the colour-vision palette.
      const bar = svgEl('rect', {
        x, y: y(t), width: barW, height: Math.max(1, y(0) - y(t)), rx: 2,
        class: `bar${isBest ? ' is-best' : ''}${isLast ? ' is-last' : ''}`,
      });
      bar.appendChild(svgEl('title', {}, T('chart.attempt', { n: firstIndex + i + 1, ms: fmt(t) }) + (isBest ? T('chart.bestSuffix') : '')));
      svg.appendChild(bar);
      // The best bar is also marked with a star, not by colour alone.
      if (isBest) svg.appendChild(svgEl('text', { x: x + barW / 2, y: Math.max(top + 7, y(t) - 3), 'text-anchor': 'middle', class: 'avg-label', 'aria-hidden': 'true' }, '★'));
    });

    // Session average (all attempts, not only the visible ones).
    const avgY = y(Math.min(summary.mean, maxVal));
    svg.appendChild(svgEl('line', {
      x1: left, x2: W - right, y1: avgY, y2: avgY,
      class: 'avg-line', 'stroke-width': 1, 'stroke-dasharray': '4 3', opacity: 0.7,
    }));
    const labelY = avgY - 4 < top + 8 ? avgY + 11 : avgY - 4;
    svg.appendChild(svgEl('text', { x: W - right, y: labelY, 'text-anchor': 'end', class: 'avg-label' }, T('chart.avg', { ms: fmt(summary.mean) })));
    svg.appendChild(svgEl('text', { x: left, y: H - 4 }, `#${firstIndex + 1}`));
    svg.appendChild(svgEl('text', { x: W - right, y: H - 4, 'text-anchor': 'end' }, `#${session.times.length}`));

    // The chart's text alternative lists the values, not just a summary.
    svg.setAttribute('aria-label', T('chart.aria', {
      n: times.length, list: times.map((t) => fmt(t)).join(', '), avg: fmt(summary.mean), best: fmt(summary.best),
    }));
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
    setRenderStatus(T('render.fallback'), true);
    showBanner(T('banner.no3d', { reason }));
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

    if (now - lastFrame > 0 && now - lastFrame < 100) avgFrameMs = avgFrameMs * 0.9 + (now - lastFrame) * 0.1;
    const dt = clamp((now - lastFrame) / 1000, 0, 0.1);
    lastFrame = now;

    if (scene) {
      try {
        scene.update(dt, now / 1000);
        sceneErrors = 0;
      } catch (err) {
        console.error('[Reflex Lab] render error', err);
        if (++sceneErrors > 3) enterFlatMode(T('render.reasonErrors'));
      }
    }

    if (stimulusThisFrame) onStimulusDrawn();

    fpsFrames += 1;
    if (now - fpsSince >= 500) {
      const fps = Math.round((fpsFrames * 1000) / (now - fpsSince));
      fpsFrames = 0;
      fpsSince = now;
      if (scene && scene.ready) {
        if (scene.contextLost) setRenderStatus(T('render.lost'), true);
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
      handleReaction(inputTime(e), { trusted: e.isTrusted, input: 'pointer' });
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
      if (document.querySelector('dialog[open]')) return; // dialogs handle their own keys (Esc closes them)
      if (e.key === 'Escape' && game.running) {
        stopSession();
        return;
      }
      // Shortcuts: M toggles music, S toggles sound effects, 1–3 use a power-up.
      const key = e.key.length === 1 ? e.key.toLowerCase() : '';
      if (key >= '1' && key <= String(CONFIG.powerUpSlots) && !e.ctrlKey && !e.metaKey && !e.altKey) {
        if (e.target instanceof Element && e.target.closest('input, textarea, select')) return;
        if (!e.repeat) activatePowerUp(Number(key) - 1);
        return;
      }
      if ((key === 'm' || key === 's') && !e.ctrlKey && !e.metaKey && !e.altKey) {
        if (e.target instanceof Element && e.target.closest('input, textarea, select')) return;
        if (Sound.supported && !e.repeat) toggleAudio(key === 'm' ? 'music' : 'sfx');
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
      handleReaction(inputTime(e), { trusted: e.isTrusted, input: 'key' });
    });

    dom.startBtn.addEventListener('click', () => {
      if (game.running) stopSession();
      else startPlay();
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
        Sound.suspend(); // no music playing from a background tab
        if (game.running && (game.state === STATE.WAITING || game.state === STATE.GO)) {
          session.rounds = Math.max(0, session.rounds - 1);
          stopSession({
            eyebrow: T('session.roundCancelled'),
            headline: T('common.paused'),
            sub: T('session.hiddenSub'),
          });
        }
      } else {
        lastFrame = performance.now();
        Sound.resume();
      }
    });

    window.addEventListener('pagehide', teardown);
  }

  /* ======================================================================
   * Display & accessibility settings
   * ==================================================================== */
  const hexCss = (n) => `#${n.toString(16).padStart(6, '0')}`;

  /** Apply palette, text size and motion settings everywhere, then save them. */
  function applyDisplay(changes = {}, { save = true } = {}) {
    const langChanged = changes.lang !== undefined && changes.lang !== I18n.getLang();
    Object.assign(display, changes);
    if (langChanged || changes.lang !== undefined) {
      display.lang = I18n.setLang(display.lang);
      I18n.apply(document); // static text first; the colour words are filled in below
    }
    if (!PALETTES[display.palette]) display.palette = 'standard';
    if (!TEXT_SCALES.includes(display.textScale)) display.textScale = 1;

    const root = document.documentElement;
    // data-palette is only set for the colour-safe palettes (CSS keys off its presence).
    if (display.palette === 'standard') delete root.dataset.palette;
    else root.dataset.palette = display.palette;
    root.style.setProperty('--text-scale', String(display.textScale));
    if (display.reduceMotion) root.dataset.motion = 'reduced';
    else delete root.dataset.motion;

    if (scene) {
      scene.setPalette(PALETTES[display.palette]);
      scene.setReducedMotion(display.reduceMotion);
    }

    // Colour words in the static help text.
    document.querySelectorAll('[data-word]').forEach((el) => {
      el.textContent = fillWords(`{${el.dataset.word}}`);
    });
    // Redraw the current message with the new colour words (never mid-round).
    if (lastView && game.state !== STATE.WAITING && game.state !== STATE.GO) {
      setState(lastView.state, lastView.copy);
    }
    renderLevel();
    renderStats(); // chart colours come from CSS, but its labels are re-laid out
    if (langChanged) refreshLanguage();
    if (save) Storage.savePrefs({ ...display });
  }

  /** Redraw everything built in code after a language switch. */
  function refreshLanguage() {
    renderProfileChip();
    renderAudioControls();
    renderControls();
    renderClockText();
    if (!scene) setRenderStatus(T('render.fallback'), true);
    if (tournament.active) renderTournament();
    if (dom.dialog.open) renderDialog();
  }

  function renderDisplaySettings() {
    // Languages are named in their own language, so they're recognisable either way.
    dom.langPick.replaceChildren(...Object.entries(I18n.LANGS).map(([id, info]) => {
      const label = document.createElement('label');
      label.innerHTML = `<input type="radio" name="lang" value="${id}" id="lang-${id}" lang="${id}"><span lang="${id}"></span>`;
      label.querySelector('span').textContent = info.label;
      label.querySelector('input').checked = id === display.lang;
      return label;
    }));
    dom.paletteOptions.replaceChildren(...Object.entries(PALETTES).map(([id, p]) => {
      const label = document.createElement('label');
      label.className = 'palette-option';
      label.innerHTML = `<input type="radio" name="palette" id="palette-${id}" value="${id}">
        <span><span class="p-title"></span><span class="p-desc"></span></span>
        <span class="palette-swatches" aria-hidden="true"><i>W</i><i>G</i><i>D</i></span>`;
      label.querySelector('.p-title').textContent = paletteName(id);
      label.querySelector('.p-desc').textContent = paletteDesc(id);
      const [w, g, d] = label.querySelectorAll('.palette-swatches i');
      w.style.background = hexCss(p.colors.waiting);
      g.style.background = hexCss(p.colors.go);
      d.style.background = hexCss(p.colors.decoy);
      w.title = T('a11y.swatchWait'); g.title = T('a11y.swatchGo'); d.title = T('a11y.swatchDecoy');
      label.querySelector('input').checked = id === display.palette;
      return label;
    }));
    dom.textScalePick.replaceChildren(...TEXT_SCALES.map((scale) => {
      const label = document.createElement('label');
      const pct = Math.round(scale * 100);
      label.innerHTML = `<input type="radio" name="textScale" value="${scale}" id="textScale${pct}"><span>${pct}%</span>`;
      label.querySelector('input').checked = scale === display.textScale;
      label.querySelector('input').setAttribute('aria-label', T('a11y.textSizeAria', { n: pct }));
      return label;
    }));
    dom.reduceMotion.checked = display.reduceMotion;
  }

  function openDisplaySettings() {
    if (game.running && (game.state === STATE.WAITING || game.state === STATE.GO)) {
      stopSession({ eyebrow: T('common.paused'), headline: T('common.paused'), sub: T('session.settingsPausedSub') });
    }
    renderDisplaySettings();
    dom.a11yDialog.showModal();
  }

  function bindDisplayEvents() {
    dom.a11yBtn.addEventListener('click', openDisplaySettings);
    dom.a11yClose.addEventListener('click', () => dom.a11yDialog.close());
    dom.a11yDone.addEventListener('click', () => dom.a11yDialog.close());
    dom.a11yDialog.addEventListener('click', (e) => { if (e.target === dom.a11yDialog) dom.a11yDialog.close(); });
    dom.a11yDialog.addEventListener('close', () => dom.a11yBtn.focus());

    dom.paletteOptions.addEventListener('change', (e) => {
      if (!(e.target instanceof HTMLInputElement) || !PALETTES[e.target.value]) return;
      applyDisplay({ palette: e.target.value });
      announce(fillWords(T('announce.palette', { name: paletteName(display.palette) })));
    });
    dom.textScalePick.addEventListener('change', (e) => {
      if (!(e.target instanceof HTMLInputElement)) return;
      applyDisplay({ textScale: Number(e.target.value) });
      announce(T('announce.textSize', { n: Math.round(display.textScale * 100) }));
    });
    dom.langPick.addEventListener('change', (e) => {
      if (!(e.target instanceof HTMLInputElement) || !I18n.LANGS[e.target.value]) return;
      applyDisplay({ lang: e.target.value });
      renderDisplaySettings(); // relabel this dialog, then keep focus on the choice
      const chosen = document.getElementById(`lang-${display.lang}`);
      if (chosen) chosen.focus();
      announce(T('announce.language'));
    });
    dom.reduceMotion.addEventListener('change', () => {
      applyDisplay({ reduceMotion: dom.reduceMotion.checked });
    });
  }

  /* ======================================================================
   * Audio controls
   * ==================================================================== */
  function renderAudioControls() {
    if (!Sound.supported) {
      [dom.sfxToggle, dom.musicToggle, dom.volumeSlider].forEach((el) => {
        el.disabled = true;
        el.title = T('audio.unsupported');
      });
      dom.sfxToggle.setAttribute('aria-pressed', 'false');
      dom.musicToggle.setAttribute('aria-pressed', 'false');
      return;
    }
    const prefs = Sound.getPrefs();
    const paint = (btn, on, kind) => {
      btn.setAttribute('aria-pressed', String(on));
      btn.title = T(`audio.${kind}${on ? 'On' : 'Off'}`);
    };
    paint(dom.sfxToggle, prefs.sfx, 'sfx');
    paint(dom.musicToggle, prefs.music, 'music');
    dom.volumeSlider.value = String(Math.round(prefs.volume * 100));
    dom.volumeSlider.title = T('audio.volumeTitle', { n: dom.volumeSlider.value });
    dom.volumeSlider.setAttribute('aria-valuetext', `${dom.volumeSlider.value}%`);
  }

  function toggleAudio(kind) {
    Sound.unlock(); // the click or key press counts as the gesture browsers require
    const on = !Sound.getPrefs()[kind];
    Sound.setEnabled(kind, on);
    Storage.savePrefs(Sound.getPrefs());
    renderAudioControls();
    Sound.play('ui');
    announce(T(`announce.${kind}${on ? 'On' : 'Off'}`));
  }

  function bindAudioEvents() {
    if (!Sound.supported) return;
    dom.sfxToggle.addEventListener('click', () => toggleAudio('sfx'));
    dom.musicToggle.addEventListener('click', () => toggleAudio('music'));
    dom.volumeSlider.addEventListener('input', () => {
      Sound.unlock();
      Sound.setVolume(Number(dom.volumeSlider.value) / 100);
      dom.volumeSlider.title = T('audio.volumeTitle', { n: dom.volumeSlider.value });
      dom.volumeSlider.setAttribute('aria-valuetext', `${dom.volumeSlider.value}%`);
    });
    dom.volumeSlider.addEventListener('change', () => {
      Storage.savePrefs(Sound.getPrefs());
      Sound.play('ui'); // a sample at the new level
    });

    // Browsers only allow audio after a user gesture. Start it on the first
    // one; that is always before any timed round, because the first click or
    // key press can only start a session.
    const unlockOnGesture = () => { if (!Sound.isUnlocked()) Sound.unlock(); };
    document.addEventListener('pointerdown', unlockOnGesture, true);
    document.addEventListener('keydown', unlockOnGesture, true);
  }

  function teardown() {
    clearTimers();
    window.cancelAnimationFrame(rafId);
    if (scene) scene.dispose();
    scene = null;
    Sound.dispose();
  }

  /* ======================================================================
   * Boot
   * ==================================================================== */
  function boot() {
    const startPrefs = Storage.loadPrefs();
    display.lang = I18n.setLang(startPrefs.lang || I18n.detect());
    I18n.apply(document);

    const loaded = Storage.load({ defaultName: T('profile.defaultName') });
    saved.state = loaded.state;
    saved.persistent = loaded.persistent;
    if (loaded.notice === 'blocked') {
      showBanner(T('banner.blocked'));
    } else if (loaded.notice === 'corrupt') {
      showBanner(T('banner.corrupt', { key: `${Storage.KEY}.backup` }));
      persist();
    }

    Sound.setPrefs(Storage.loadPrefs());
    renderAudioControls();

    bindEvents();
    bindProfileEvents();
    bindAudioEvents();
    bindTournamentEvents();
    bindDisplayEvents();

    try {
      scene = new ReactionScene(dom.canvas, dom.stage, {
        onQualityChange: (pr) => setRenderStatus(`WebGL · ${pr}×`),
      });
      scene.init();
    } catch (err) {
      console.error('[Reflex Lab] 3D init failed', err);
      enterFlatMode(typeof THREE === 'undefined' ? T('render.reasonNoThree') : T('render.reasonNoWebgl'));
    }

    const prefs = Storage.loadPrefs();
    applyDisplay({ palette: prefs.palette, textScale: prefs.textScale, reduceMotion: prefs.reduceMotion }, { save: false });

    applyLevel();
    setState(STATE.IDLE);
    renderStats();
    renderProfileChip();
    renderClockResolution();
    rafId = window.requestAnimationFrame(tick);
  }

  let clockResMs = null; // measured timer precision, part of leaderboard evidence

  function renderClockResolution() {
    clockResMs = measureClockResolution();
    renderClockText();
  }

  function renderClockText() {
    const res = clockResMs;
    if (res === null) {
      dom.clockRes.textContent = T('clock.unavailable');
      dom.clockChip.title = T('clock.noHiRes');
      return;
    }
    dom.clockRes.textContent = `± ${formatResolution(res)}`;
    dom.clockChip.title = T('clock.title', { res: formatResolution(res) });
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
      text.textContent = window.ReflexLabI18n ? window.ReflexLabI18n.t('banner.fatal') : 'Reflex Lab couldn’t start. Reload the page.';
      banner.hidden = false;
    }
  }
})();
