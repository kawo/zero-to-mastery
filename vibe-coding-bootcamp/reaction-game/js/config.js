/*
 * Reflex Lab: game settings, difficulty levels and 3D state presets.
 *
 * Loaded as a classic script before app.js (ES modules can't load over file://).
 * Everything is exposed on a single frozen global, window.ReflexLabConfig.
 */
(() => {
  'use strict';

  /** Freeze an object and everything nested inside it. */
  const deepFreeze = (obj) => {
    for (const value of Object.values(obj)) {
      if (value && typeof value === 'object' && !Object.isFrozen(value)) deepFreeze(value);
    }
    return Object.freeze(obj);
  };

  const CONFIG = {
    minDelayMs: 1000,        // earliest the stimulus can fire after a round starts
    maxDelayMs: 5000,        // latest
    anticipationMs: 100,     // faster than visual processing allows → counted as a guess
    timeoutMs: 3000,         // no reaction within this window → round voided
    historySize: 15,         // bars shown in the chart
    maxPixelRatio: 2,
    slowFrameMs: 25,         // average frame time that triggers a resolution drop
    levelUpStreak: 3,        // rounds in a row under the target to level up
    levelDownStreak: 2,      // failed rounds in a row to drop a level
    decoyDurationMs: 450,    // how long a decoy flash stays on screen
    decoyBlameMs: 1000,      // a false start this soon after a decoy is blamed on it
    tournamentPenaltyMs: 100,        // added to a player's score per false start or miss
    tournamentRoundOptions: [3, 5, 10],
    tournamentDefaultRounds: 5,
    tournamentMinPlayers: 2,
    powerUpDropChance: 0.25,         // per round beaten under the target (a new record always drops one)
    powerUpSlots: 3,
  };

  /**
   * Power-ups (solo only). They never change a measured time: records and
   * averages stay honest. They only bend the game layer: streak, level changes,
   * the pass/fail target and decoys.
   * - rounds: how many rounds the effect lasts once used; null = until it triggers
   * - color:  CSS colour for the UI; hex3d: the matching colour in the 3D scene
   */
  const POWERUPS = [
    { id: 'shield', name: 'Shield', rounds: null, color: '#93C5FD', hex3d: 0x93c5fd,
      desc: 'Your next failed round (false start, miss or over the target) won’t break your streak or count toward a level drop.' },
    { id: 'double', name: 'Double', rounds: null, color: '#F59E0B', hex3d: 0xf59e0b,
      desc: 'Your next round under the target counts twice toward levelling up.' },
    { id: 'leeway', name: 'Leeway', rounds: 3, bonusMs: 50, color: '#6EE7B7', hex3d: 0x6ee7b7,
      desc: 'The level target is 50 ms more generous for the next 3 rounds.' },
    { id: 'calm', name: 'Calm', rounds: 3, color: '#CBD5E1', hex3d: 0xcbd5e1,
      desc: 'No decoys and a calmer animation for the next 3 rounds.' },
  ];

  const COLORS = {
    idle: 0x94a3b8,
    waiting: 0xf59e0b,
    go: 0x10b981,
    result: 0x3b82f6,
    decoy: 0x3b82f6,
    error: 0xef4444,
  };

  /**
   * Progressive difficulty.
   * - target:    time to beat for a round to count towards the next level
   * - decoy:     chance per round of a fake-out flash (a cube) before the real signal
   * - subtle:    no text or border cue on "go"; only the shape itself changes
   * - agitation: speed multiplier for the waiting animation (visual noise). It is
   *              constant within a round, so it never hints at when "go" will fire.
   */
  const LEVELS = [
    { name: 'Warm-up', target: 500, decoy: 0,    subtle: false, agitation: 1,
      brief: 'Beat 500 ms three times in a row to move up.' },
    { name: 'Steady',  target: 400, decoy: 0,    subtle: false, agitation: 1.25,
      brief: 'A tighter target, and the waiting animation gets busier.' },
    { name: 'Decoys',  target: 380, decoy: 0.35, subtle: false, agitation: 1.45,
      brief: '{Decoy} cubes may flash while you wait. They’re decoys: only {go} counts.' },
    { name: 'Sharp',   target: 340, decoy: 0.45, subtle: false, agitation: 1.65,
      brief: 'Faster target, more decoys.' },
    { name: 'Subtle',  target: 320, decoy: 0.5,  subtle: true,  agitation: 1.85,
      brief: 'No “React!” text or border flash. Watch the shape itself.' },
    { name: 'Elite',   target: 290, decoy: 0.6,  subtle: true,  agitation: 2.1,
      brief: 'Top level: 290 ms target, decoys in most rounds, no text cue.' },
  ];

  // Visual preset for each scene mode. The game maps its states onto these.
  const PRESETS = {
    idle:    { shape: 'idle',    color: COLORS.idle,    spin: 0.25, radius: 2.5, orbit: 0.12, glow: 0.12, light: 0.6 },
    waiting: { shape: 'waiting', color: COLORS.waiting, spin: 0.7,  radius: 2.1, orbit: 0.45, glow: 0.3,  light: 1.3 },
    go:      { shape: 'go',      color: COLORS.go,      spin: 1.6,  radius: 3.0, orbit: 1.1,  glow: 0.75, light: 2.8 },
    result:  { shape: 'result',  color: COLORS.result,  spin: 0.35, radius: 2.6, orbit: 0.2,  glow: 0.25, light: 1.1 },
    decoy:   { shape: 'decoy',   color: COLORS.decoy,   spin: 1.3,  radius: 2.5, orbit: 0.9,  glow: 0.6,  light: 2.2 },
    error:   { shape: 'error',   color: COLORS.error,   spin: 0.9,  radius: 3.2, orbit: -0.6, glow: 0.4,  light: 1.7 },
  };

  /**
   * Colour-vision palettes for the 3D scene; css/style.css has the matching
   * [data-palette] token sets. Non-standard palettes also turn on `goRing`:
   * a bright white ring on "go", a brightness cue that doesn't depend on hue.
   * `words` name the colours in on-screen text ({go}, {wait}, {decoy} placeholders).
   */
  const PALETTES = {
    standard: {
      name: 'Standard', desc: 'The default colours.', goRing: false,
      words: { wait: 'amber', go: 'green', decoy: 'blue' },
      colors: { idle: 0x94a3b8, waiting: 0xf59e0b, go: 0x10b981, result: 0x3b82f6, decoy: 0x3b82f6, error: 0xef4444 },
    },
    redgreen: {
      name: 'Red–green safe', desc: 'For protanopia and deuteranopia: orange wait, sky-blue go, pink decoys.', goRing: true,
      words: { wait: 'orange', go: 'blue', decoy: 'pink' },
      colors: { idle: 0x94a3b8, waiting: 0xe69f00, go: 0x56b4e9, result: 0xf0e442, decoy: 0xcc79a7, error: 0xd55e00 },
    },
    blueyellow: {
      name: 'Blue–yellow safe', desc: 'For tritanopia: red-orange wait, green go, white decoys.', goRing: true,
      words: { wait: 'red', go: 'green', decoy: 'white' },
      colors: { idle: 0x94a3b8, waiting: 0xd55e00, go: 0x009e73, result: 0xcc79a7, decoy: 0xe2e8f0, error: 0xf43f5e },
    },
    mono: {
      name: 'Monochrome', desc: 'No colour needed: grey wait, white go, dark decoys. Brightness and shape only.', goRing: true,
      words: { wait: 'grey', go: 'white', decoy: 'dark' },
      colors: { idle: 0x94a3b8, waiting: 0x8a8a8a, go: 0xf8fafc, result: 0xcbd5e1, decoy: 0x6b7280, error: 0x8b8b8b },
    },
  };

  const TEXT_SCALES = [1, 1.15, 1.3, 1.5];

  window.ReflexLabConfig = deepFreeze({ CONFIG, COLORS, LEVELS, PRESETS, POWERUPS, PALETTES, TEXT_SCALES });
})();
