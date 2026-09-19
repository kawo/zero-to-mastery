/*
 * Reflex Lab: sound effects and music, synthesised with the Web Audio API.
 * No audio files: everything is built from oscillators and a noise buffer.
 *
 * Fair-timing rule: nothing here ever sounds at the moment of the "go" signal
 * (or a decoy). Sound reaches the brain faster than sight, so an audio cue
 * would turn this visual-reaction test into an auditory one. Effects play on
 * the player's actions and on results; the music is independent of the round
 * timer and is only ducked when a round starts and restored after it ends.
 *
 * Browsers only allow audio after a user gesture, so call unlock() from a
 * click or key handler. Exposed as window.ReflexLabAudio.
 */
(() => {
  'use strict';

  const AudioCtor = window.AudioContext || window.webkitAudioContext;

  const TEMPO = 84;
  const STEP = 60 / TEMPO / 4;   // one 16th note, in seconds
  const LOOKAHEAD = 0.12;        // how far ahead notes are scheduled (s)
  const TICK_MS = 25;            // how often the scheduler wakes up
  const MUSIC_LEVEL = 0.5;
  const DUCKED = 0.4;            // music level while a round is running

  const midi = (note) => 440 * Math.pow(2, (note - 69) / 12);
  const clamp01 = (v) => Math.min(1, Math.max(0, v));

  // Am – F – C – G, one bar each. Notes are MIDI numbers.
  const PROGRESSION = [
    { bass: 45, pad: [57, 60, 64], arp: [69, 72, 76, 72] },
    { bass: 41, pad: [53, 57, 60], arp: [65, 69, 72, 69] },
    { bass: 48, pad: [55, 60, 64], arp: [67, 72, 76, 72] },
    { bass: 43, pad: [55, 59, 62], arp: [67, 71, 74, 71] },
  ];

  const state = {
    ctx: null,
    nodes: null,
    prefs: { sfx: true, music: true, volume: 0.7 },
    intensity: 1,
    timer: null,
    step: 0,
    nextTime: 0,
    failed: false,
  };

  /* ---------- Graph ---------- */
  function build() {
    const ctx = new AudioCtor({ latencyHint: 'interactive' });

    const master = ctx.createGain();
    master.gain.value = state.prefs.volume;
    const limiter = ctx.createDynamicsCompressor(); // glues the mix and protects ears
    limiter.threshold.value = -10;
    limiter.knee.value = 6;
    limiter.ratio.value = 8;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.2;
    master.connect(limiter).connect(ctx.destination);

    const sfx = ctx.createGain();
    sfx.gain.value = state.prefs.sfx ? 1 : 0;
    sfx.connect(master);

    const music = ctx.createGain();
    music.gain.value = state.prefs.music ? MUSIC_LEVEL : 0;
    music.connect(master);
    const duck = ctx.createGain();
    duck.connect(music);
    const musicIn = ctx.createGain();
    musicIn.connect(duck);

    // A dotted-eighth echo gives the music some space.
    const echo = ctx.createDelay(1.5);
    echo.delayTime.value = STEP * 3;
    const feedback = ctx.createGain();
    feedback.gain.value = 0.32;
    const wet = ctx.createGain();
    wet.gain.value = 0.28;
    musicIn.connect(echo);
    echo.connect(feedback).connect(echo);
    echo.connect(wet).connect(duck);

    const noise = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.5), ctx.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

    state.ctx = ctx;
    state.nodes = { master, sfx, music, duck, musicIn, echo, feedback, wet, noise };
  }

  /**
   * One enveloped oscillator. Nodes disconnect themselves when the note ends,
   * so nothing accumulates however long the page runs.
   */
  function voice({ type = 'sine', freq, to, at, dur, gain = 0.2, attack = 0.005, release, detune = 0, filter, dest }) {
    const { ctx } = state;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, at);
    if (to) osc.frequency.exponentialRampToValueAtTime(to, at + dur);
    if (detune) osc.detune.value = detune;

    const env = ctx.createGain();
    const rel = release === undefined ? dur - attack : Math.min(release, dur - attack);
    env.gain.setValueAtTime(0.0001, at);
    env.gain.exponentialRampToValueAtTime(gain, at + attack);
    if (dur - rel > attack) env.gain.setValueAtTime(gain, at + dur - rel);
    env.gain.exponentialRampToValueAtTime(0.0001, at + dur);

    let head = osc;
    let filterNode = null;
    if (filter) {
      filterNode = ctx.createBiquadFilter();
      filterNode.type = filter.type || 'lowpass';
      filterNode.frequency.value = filter.freq;
      filterNode.Q.value = filter.q || 0.7;
      osc.connect(filterNode);
      head = filterNode;
    }
    head.connect(env).connect(dest);
    osc.start(at);
    osc.stop(at + dur + 0.05);
    osc.onended = () => {
      osc.disconnect();
      env.disconnect();
      if (filterNode) filterNode.disconnect();
    };
  }

  function noiseBurst({ at, dur, gain = 0.1, freq = 2000, type = 'highpass', dest }) {
    const { ctx, nodes } = state;
    const src = ctx.createBufferSource();
    src.buffer = nodes.noise;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = freq;
    const env = ctx.createGain();
    env.gain.setValueAtTime(gain, at);
    env.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    src.connect(filter).connect(env).connect(dest);
    src.start(at);
    src.stop(at + dur + 0.02);
    src.onended = () => { src.disconnect(); filter.disconnect(); env.disconnect(); };
  }

  const arpeggio = (notes, at, gap, opts) =>
    notes.forEach((n, i) => voice({ freq: midi(n), at: at + i * gap, ...opts }));

  /* ---------- Sound effects ---------- */
  const SFX = {
    // Buttons and toggles
    ui: (t, d) => voice({ type: 'sine', freq: 880, to: 1175, at: t, dur: 0.06, gain: 0.12, dest: d }),
    // A round starts: the random wait begins
    arm: (t, d) => voice({ type: 'triangle', freq: 440, to: 660, at: t, dur: 0.14, gain: 0.12, dest: d }),
    // Valid reaction; quality 0–1 raises the pitch for faster times
    hit: (t, d, o) => {
      const root = 72 + Math.round(clamp01(o.quality) * 7);
      voice({ type: 'sine', freq: midi(root), at: t, dur: 0.22, gain: 0.2, dest: d });
      voice({ type: 'triangle', freq: midi(root + 7), at: t + 0.07, dur: 0.3, gain: 0.12, dest: d });
    },
    record: (t, d) => {
      arpeggio([72, 76, 79, 84], t, 0.07, { type: 'triangle', dur: 0.35, gain: 0.14, dest: d });
      voice({ type: 'sine', freq: midi(96), at: t + 0.3, dur: 0.6, gain: 0.06, dest: d });
    },
    false: (t, d) => {
      voice({ type: 'sawtooth', freq: 220, to: 80, at: t, dur: 0.28, gain: 0.16, filter: { freq: 1100 }, dest: d });
      noiseBurst({ at: t, dur: 0.08, gain: 0.08, freq: 900, type: 'lowpass', dest: d });
    },
    missed: (t, d) => arpeggio([67, 62], t, 0.16, { type: 'triangle', dur: 0.22, gain: 0.14, dest: d }),
    levelUp: (t, d) => arpeggio([72, 76, 79, 84, 88], t, 0.08, { type: 'triangle', dur: 0.3, gain: 0.13, dest: d }),
    levelDown: (t, d) => arpeggio([72, 68, 65], t, 0.12, { type: 'triangle', dur: 0.3, gain: 0.12, dest: d }),
    // A power-up drops: quick rising sparkle
    powerup: (t, d) => {
      arpeggio([79, 86, 91], t, 0.05, { type: 'sine', dur: 0.2, gain: 0.1, dest: d });
      noiseBurst({ at: t, dur: 0.12, gain: 0.03, freq: 6000, dest: d });
    },
    // A power-up is used: upward sweep
    powerOn: (t, d) => {
      voice({ type: 'triangle', freq: 330, to: 990, at: t, dur: 0.24, gain: 0.12, dest: d });
      voice({ type: 'sine', freq: midi(84), at: t + 0.18, dur: 0.3, gain: 0.08, dest: d });
    },
    // The shield absorbs a failed round: metallic ping
    shield: (t, d) => {
      voice({ type: 'sine', freq: 1568, at: t, dur: 0.7, attack: 0.002, gain: 0.09, dest: d });
      voice({ type: 'sine', freq: 2349, at: t, dur: 0.45, attack: 0.002, gain: 0.04, dest: d });
    },
    achievement: (t, d) => {
      [[88, 0.12], [95, 0.06], [100, 0.035]].forEach(([n, g]) =>
        voice({ type: 'sine', freq: midi(n), at: t, dur: 1.1, attack: 0.004, gain: g, dest: d }));
      voice({ type: 'sine', freq: midi(100), at: t + 0.12, dur: 0.8, gain: 0.05, dest: d });
    },
  };

  /** Play a named effect. Options: { delay (s), quality (0–1, for "hit") }. */
  function play(name, opts = {}) {
    const { ctx, nodes } = state;
    const fx = SFX[name];
    // A context that is still resuming after the first gesture is fine: the
    // sound plays as soon as it starts.
    if (!fx || !ctx || ctx.state === 'closed' || !state.prefs.sfx) return;
    try {
      fx(ctx.currentTime + 0.005 + (opts.delay || 0), nodes.sfx, opts);
    } catch (err) {
      console.warn('[Reflex Lab] sound failed', name, err);
    }
  }

  /* ---------- Music ---------- */
  function scheduleStep(step, at) {
    const chord = PROGRESSION[Math.floor(step / 16) % PROGRESSION.length];
    const s = step % 16;
    const lvl = state.intensity;
    const dest = state.nodes.musicIn;
    const barLen = STEP * 16;

    // Pad: two detuned saws per chord note, brighter at higher levels.
    if (s === 0) {
      const cutoff = 650 + lvl * 170;
      for (const note of chord.pad) {
        for (const cents of [-7, 7]) {
          voice({ type: 'sawtooth', freq: midi(note), detune: cents, at, dur: barLen + 0.5,
            attack: 0.7, release: 0.9, gain: 0.018, filter: { freq: cutoff, q: 0.5 }, dest });
        }
      }
    }
    // Bass on beats 1 and 3, with a pickup note from level 4.
    if (s === 0 || s === 8 || (lvl >= 4 && s === 14)) {
      voice({ type: 'sine', freq: midi(chord.bass), at, dur: s === 14 ? STEP * 2 : STEP * 7,
        attack: 0.01, release: STEP * 3, gain: 0.14, dest });
    }
    // Arpeggio: quarter notes at levels 1–2, eighths at 3–4, sixteenths at 5–6.
    const every = lvl <= 2 ? 4 : lvl <= 4 ? 2 : 1;
    if (s % every === 0) {
      const note = chord.arp[(s / every) % chord.arp.length];
      voice({ type: 'triangle', freq: midi(note), at, dur: 0.28, attack: 0.004,
        gain: every === 1 ? 0.035 : 0.05, dest });
    }
    // Soft off-beat hat from level 3.
    if (lvl >= 3 && s % 4 === 2) noiseBurst({ at, dur: 0.05, gain: 0.025, freq: 7000, dest });
  }

  function tick() {
    const { ctx } = state;
    if (!ctx || ctx.state !== 'running') return;
    // After a stall (throttled tab, suspended context) skip ahead instead of
    // playing every missed note at once.
    if (state.nextTime < ctx.currentTime - 0.25) state.nextTime = ctx.currentTime + 0.05;
    while (state.nextTime < ctx.currentTime + LOOKAHEAD) {
      scheduleStep(state.step, state.nextTime);
      state.nextTime += STEP;
      state.step = (state.step + 1) % (16 * PROGRESSION.length);
    }
  }

  function startMusic() {
    if (state.timer || !state.ctx) return;
    state.step = 0;
    state.nextTime = state.ctx.currentTime + 0.1;
    state.timer = window.setInterval(tick, TICK_MS);
  }

  function stopMusic() {
    window.clearInterval(state.timer);
    state.timer = null;
  }

  /* ---------- Public API ---------- */

  /** Create or resume the audio context. Call from a user gesture. */
  function unlock() {
    if (!AudioCtor || state.failed) return false;
    try {
      if (!state.ctx) build();
      if (state.ctx.state === 'suspended') state.ctx.resume().catch(() => {});
      if (state.prefs.music) startMusic();
      return true;
    } catch (err) {
      state.failed = true;
      console.warn('[Reflex Lab] audio unavailable', err);
      return false;
    }
  }

  function setEnabled(kind, on) {
    if (kind !== 'sfx' && kind !== 'music') return;
    state.prefs[kind] = !!on;
    const { ctx, nodes } = state;
    if (!ctx) return;
    const bus = kind === 'sfx' ? nodes.sfx : nodes.music;
    const level = kind === 'music' ? MUSIC_LEVEL : 1;
    bus.gain.setTargetAtTime(on ? level : 0, ctx.currentTime, 0.08);
    if (kind === 'music') {
      if (on) startMusic();
      else window.setTimeout(() => { if (!state.prefs.music) stopMusic(); }, 500); // after the fade
    }
  }

  function setVolume(value) {
    state.prefs.volume = clamp01(Number(value));
    if (state.ctx) state.nodes.master.gain.setTargetAtTime(state.prefs.volume, state.ctx.currentTime, 0.05);
  }

  /** Lower the music while a round is running. Never call this on "go". */
  function setFocus(on) {
    if (state.ctx) state.nodes.duck.gain.setTargetAtTime(on ? DUCKED : 1, state.ctx.currentTime, 0.25);
  }

  /** Music density follows the difficulty level (1–6). */
  function setIntensity(level) {
    state.intensity = Math.max(1, Math.min(6, Math.round(Number(level) || 1)));
  }

  function setPrefs(prefs) {
    if (!prefs) return;
    if (typeof prefs.sfx === 'boolean') setEnabled('sfx', prefs.sfx);
    if (typeof prefs.music === 'boolean') setEnabled('music', prefs.music);
    if (Number.isFinite(prefs.volume)) setVolume(prefs.volume);
  }

  function suspend() {
    if (state.ctx && state.ctx.state === 'running') state.ctx.suspend().catch(() => {});
  }

  function resume() {
    if (state.ctx && state.ctx.state === 'suspended') state.ctx.resume().catch(() => {});
  }

  function dispose() {
    stopMusic();
    if (state.ctx) state.ctx.close().catch(() => {});
    state.ctx = null;
    state.nodes = null;
  }

  window.ReflexLabAudio = Object.freeze({
    supported: !!AudioCtor,
    unlock, play, setEnabled, setVolume, setFocus, setIntensity, setPrefs, suspend, resume, dispose,
    getPrefs: () => ({ ...state.prefs }),
    isUnlocked: () => !!state.ctx && state.ctx.state === 'running',
  });
})();
