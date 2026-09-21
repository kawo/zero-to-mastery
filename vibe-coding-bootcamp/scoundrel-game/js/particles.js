/*
 * Scoundrel: particle effects.
 *
 * One full-page canvas behind nothing and above everything, pointer-events
 * none. Bursts are fired at a screen rectangle — usually a card that was just
 * resolved — so callers pass an element and never think about coordinates.
 *
 * The loop only runs while particles are alive: the last dead particle stops
 * the rAF, so an idle table costs nothing. Suppressed entirely under reduced
 * motion, which is exactly the kind of decoration that setting exists for.
 *
 * Exposed as window.ScoundrelParticles.
 */
(() => {
  'use strict';

  const Prefs = window.ScoundrelPrefs;

  const MAX = 260;          // hard ceiling; bursts thin out rather than pile up
  const GRAVITY = 0.055;

  let canvas = null;
  let ctx = null;
  let dpr = 1;
  let running = false;
  const parts = [];

  function mount() {
    if (canvas) return canvas;
    canvas = document.createElement('canvas');
    canvas.className = 'fx';
    canvas.setAttribute('aria-hidden', 'true');
    document.body.appendChild(canvas);
    ctx = canvas.getContext('2d');
    resize();
    window.addEventListener('resize', resize, { passive: true });
    return canvas;
  }

  function resize() {
    if (!canvas) return;
    dpr = Math.min(window.devicePixelRatio || 1, 2); // 2x is plenty for sparks
    canvas.width = Math.floor(window.innerWidth * dpr);
    canvas.height = Math.floor(window.innerHeight * dpr);
    canvas.style.width = `${window.innerWidth}px`;
    canvas.style.height = `${window.innerHeight}px`;
  }

  const enabled = () => Prefs.get('particles') && !Prefs.reduceMotion();

  /* ------------------------------------------------------------------ *
   * The loop
   * ------------------------------------------------------------------ */

  function step() {
    if (!parts.length) {
      running = false;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      return;
    }
    running = true;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (let i = parts.length - 1; i >= 0; i -= 1) {
      const p = parts[i];
      p.life -= 1;
      if (p.life <= 0) { parts.splice(i, 1); continue; }

      p.vy += p.gravity;
      p.vx *= p.drag;
      p.vy *= p.drag;
      p.x += p.vx;
      p.y += p.vy;

      const fade = p.life / p.maxLife;
      ctx.globalAlpha = Math.max(0, Math.min(1, fade * p.alpha));
      ctx.fillStyle = p.color;

      if (p.shape === 'streak') {
        ctx.save();
        ctx.translate(p.x * dpr, p.y * dpr);
        ctx.rotate(Math.atan2(p.vy, p.vx));
        ctx.fillRect(0, 0, p.size * dpr * (1 + fade * 2), Math.max(1, p.size * dpr * 0.5));
        ctx.restore();
      } else {
        ctx.beginPath();
        ctx.arc(p.x * dpr, p.y * dpr, Math.max(0.4, p.size * fade) * dpr, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
    window.requestAnimationFrame(step);
  }

  function push(p) {
    if (parts.length >= MAX) parts.shift();
    parts.push(p);
    if (!running) {
      running = true;
      window.requestAnimationFrame(step);
    }
  }

  /** Centre of an element in page coordinates. */
  function centreOf(node) {
    const r = node.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height };
  }

  /* ------------------------------------------------------------------ *
   * Bursts
   * ------------------------------------------------------------------ */

  const PALETTE = {
    kill: ['#d9d6cd', '#a5a196', '#8fa9c4'],
    damage: ['#c2606a', '#8f2f2f', '#e6a3a8'],
    heal: ['#6fb392', '#a7dcc3', '#d9d6cd'],
    equip: ['#8fa9c4', '#d6e0ea', '#d9d6cd'],
    gold: ['#c3a059', '#e4c87a', '#f0e3c4'],
  };

  const pick = (list) => list[(Math.random() * list.length) | 0];

  /**
   * @param {Element} node the thing the burst comes from
   * @param {'kill'|'damage'|'heal'|'equip'|'gold'} kind
   * @param {number} [strength] 0–1, scales count and speed
   */
  function burst(node, kind = 'kill', strength = 0.6) {
    if (!enabled() || !node || !node.isConnected) return;
    mount();
    const { x, y } = centreOf(node);
    const colors = PALETTE[kind] || PALETTE.kill;
    const count = Math.round(12 + strength * 26);

    for (let i = 0; i < count; i += 1) {
      const angle = Math.random() * Math.PI * 2;
      const speed = (0.8 + Math.random() * 3.4) * (0.6 + strength);
      push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - (kind === 'heal' ? 1.6 : 0.4),
        gravity: kind === 'heal' ? -0.02 : GRAVITY,
        drag: 0.965,
        size: 1 + Math.random() * 2.2,
        life: 30 + Math.random() * 34,
        maxLife: 64,
        alpha: 0.9,
        color: pick(colors),
        shape: kind === 'kill' ? 'streak' : 'dot',
      });
    }
  }

  /** A slow fall of motes across the whole page, for a win. */
  function rain(kind = 'gold', count = 90) {
    if (!enabled()) return;
    mount();
    const colors = PALETTE[kind] || PALETTE.gold;
    for (let i = 0; i < count; i += 1) {
      push({
        x: Math.random() * window.innerWidth,
        y: -Math.random() * window.innerHeight * 0.5,
        vx: (Math.random() - 0.5) * 0.6,
        vy: 0.6 + Math.random() * 1.4,
        gravity: 0.004,
        drag: 0.999,
        size: 1 + Math.random() * 1.8,
        life: 150 + Math.random() * 130,
        maxLife: 280,
        alpha: 0.75,
        color: pick(colors),
        shape: 'dot',
      });
    }
  }

  /** Drop everything (new game, or the setting was switched off). */
  function clear() {
    parts.length = 0;
    if (ctx && canvas) ctx.clearRect(0, 0, canvas.width, canvas.height);
  }

  window.ScoundrelParticles = Object.freeze({ burst, rain, clear });
})();
