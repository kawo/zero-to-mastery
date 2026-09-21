/*
 * Scoundrel: wiring.
 *
 * Owns the single mutable `state`, translates input into engine calls, and
 * saves after anything that changed. Load order matters — config, rng, art,
 * storage, engine and ui must all be on window before this runs.
 */
(() => {
  'use strict';

  const missing = [
    ['ScoundrelI18n', 'js/i18n.js'],
    ['ScoundrelConfig', 'js/config.js'],
    ['ScoundrelPrefs', 'js/prefs.js'],
    ['ScoundrelStats', 'js/stats.js'],
    ['ScoundrelAchievements', 'js/achievements.js'],
    ['ScoundrelAudio', 'js/audio.js'],
    ['ScoundrelParticles', 'js/particles.js'],
    ['ScoundrelRng', 'js/rng.js'],
    ['ScoundrelArt', 'js/art.js'],
    ['ScoundrelStorage', 'js/storage.js'],
    ['ScoundrelEngine', 'js/engine.js'],
    ['ScoundrelUI', 'js/ui.js'],
  ].filter(([name]) => !window[name]).map(([, file]) => file);

  if (missing.length) {
    console.error('[Scoundrel] missing scripts:', missing.join(', '));
    document.body.insertAdjacentHTML(
      'afterbegin',
      `<p role="alert" style="padding:1rem;color:#f3d2d2;background:#3a1414">Could not start: ${missing.join(', ')} failed to load.</p>`,
    );
    return;
  }

  const Engine = window.ScoundrelEngine;
  const Storage = window.ScoundrelStorage;
  const UI = window.ScoundrelUI;
  const Prefs = window.ScoundrelPrefs;
  const Stats = window.ScoundrelStats;
  const Achievements = window.ScoundrelAchievements;
  const Audio = window.ScoundrelAudio;
  const Fx = window.ScoundrelParticles;
  const I18n = window.ScoundrelI18n;
  const t = I18n.t;
  const C = window.ScoundrelConfig;
  const el = UI.el;

  /** @type {object} the one live game */
  let state = null;
  /** Suppresses input while the next room is being dealt. */
  let busy = false;

  /* ------------------------------------------------------------------ *
   * Lifecycle
   * ------------------------------------------------------------------ */

  function commit({ checkEnd = true } = {}) {
    if (state.status !== 'playing') recordOnce();
    Storage.save(state);
    UI.render(state);
    if (checkEnd && state.status !== 'playing') {
      const won = state.status === 'won';
      // Let the last card's flip and the damage flash land first.
      window.setTimeout(() => {
        UI.showEnd(state);
        Audio.play(won ? 'win' : 'lose');
        if (won) Fx.rain('gold');
      }, 420);
      checkAchievements({ type: 'end' });
    }
  }

  /**
   * Fold a finished run into the lifetime record, once and only once.
   *
   * The guard lives on the state because the state is what gets saved: finish a
   * run, close the tab, come back, and the end screen shows again — but the run
   * must not be counted a second time. Saving immediately after makes the flag
   * durable.
   */
  function recordOnce() {
    if (!state || state.recorded) return;
    state.recorded = true;
    Stats.record(state);
    Storage.save(state);
  }

  /**
   * @param {string} [seed]
   * @param {boolean} [takeFocus] true when the player asked for this game, so
   *   focus should land on the new room. False on first paint — grabbing focus
   *   before anyone has interacted is disorienting and can scroll the page.
   */
  function startGame(seed, takeFocus = true) {
    UI.setChoosing(-1);
    UI.reset();
    Fx.clear();
    state = Engine.create(seed, Prefs.get('preset'));
    if (el.endModal.open) el.endModal.close();
    commit({ checkEnd: false });
    if (takeFocus) focusFirstCard();
  }

  /** Same seed and ruleset, from the top. */
  function restart() {
    const seed = state.seed;
    const preset = state.preset;
    UI.setChoosing(-1);
    UI.reset();
    state = Engine.create(seed, preset);
    if (el.endModal.open) el.endModal.close();
    commit({ checkEnd: false });
    focusFirstCard();
  }

  /** Deal a past run again, with the ruleset it was played under. */
  function replaySeed(seed, preset) {
    if (preset && Prefs.get('preset') !== preset) Prefs.set('preset', preset);
    startGame(seed);
  }

  function resumeOrStart() {
    const saved = Storage.load();
    if (saved) {
      state = saved;
      UI.render(state);
      if (state.status !== 'playing') UI.showEnd(state);
      return;
    }
    startGame(undefined, false);
  }

  /* ------------------------------------------------------------------ *
   * Feedback
   *
   * Sound and particles are driven off the engine's outcome object, so the
   * presentation never re-derives what happened from the state — it is told.
   * ------------------------------------------------------------------ */

  /** The card element a burst should come from, if it is still on screen. */
  const nodeFor = (card) =>
    el.room.querySelector(`.slot[data-card-id="${card.id}"] .card`) || el.room;

  function feedback(outcome) {
    if (!outcome) return;
    const node = nodeFor(outcome.card);

    if (outcome.kind === 'weapon') {
      Audio.play('equip');
      Fx.burst(node, 'equip', 0.5);
      return;
    }
    if (outcome.kind === 'potion') {
      if (outcome.wasted) return;              // a wasted potion gets no fanfare
      Audio.play('potion');
      Fx.burst(node, 'heal', Math.min(1, outcome.healed / 8));
      return;
    }
    // Monster. A clean kill and a costly one should not feel the same.
    if (outcome.clean) {
      Audio.play('kill');
      Fx.burst(node, 'kill', 0.85);
    } else {
      Audio.play('hit', outcome.damage);
      Fx.burst(node, 'damage', Math.min(1, outcome.damage / 10));
      if (!Prefs.reduceMotion()) {
        document.body.classList.remove('is-struck');
        void document.body.offsetWidth;        // restart the animation
        document.body.classList.add('is-struck');
      }
    }
  }

  /* ------------------------------------------------------------------ *
   * Achievements
   * ------------------------------------------------------------------ */

  function checkAchievements(event) {
    if (!state) return;
    let fresh = [];
    try {
      fresh = Achievements.check({ stats: Stats.all(), state, event });
    } catch (err) {
      console.warn('[Scoundrel] achievement check failed:', err);
      return;
    }
    fresh.forEach((a, i) => {
      // Stagger so two at once do not land on the same frame.
      window.setTimeout(() => {
        UI.toast(a);
        Audio.play('unlock');
      }, 260 + i * 700);
    });
  }

  /* ------------------------------------------------------------------ *
   * Coaching
   *
   * One-off notes pushed into the chronicle the first time something that
   * needs explaining actually happens. Teaching a rule at the moment it bites
   * beats front-loading it in a modal nobody reads twice. Each fires once per
   * browser and the whole thing can be switched off in Settings.
   * ------------------------------------------------------------------ */

  const COACH_KEY = 'scoundrel:coached:v1';
  let coached = null;

  function coachSeen() {
    if (coached) return coached;
    try {
      coached = new Set(JSON.parse(window.localStorage.getItem(COACH_KEY) || '[]'));
    } catch {
      coached = new Set();
    }
    return coached;
  }

  /**
   * Push a one-off tip into the chronicle, stored as a key like every other
   * entry so it re-translates when the language changes.
   */
  function coach(id, params) {
    if (!Prefs.get('coach') || !state || state.status !== 'playing') return;
    const seen = coachSeen();
    if (seen.has(id)) return;
    seen.add(id);
    try {
      window.localStorage.setItem(COACH_KEY, JSON.stringify([...seen]));
    } catch { /* a lost tip is not worth breaking the turn over */ }
    state.log.push({
      id: (state.logSeq += 1),
      key: `coach.${id}`,
      params: params || null,
      kind: 'coach',
      turn: state.turn,
    });
  }

  /** Watch what just happened and teach the rule behind it. */
  function coachOn(before) {
    if (!state.weapon) {
      if (before.health > state.health) coach('bare');
    } else if (!before.weapon || before.weapon.card.id !== state.weapon.card.id) {
      coach('equipped');
    } else if (state.weapon.lastSlain !== null && before.weapon.lastSlain === null) {
      coach('capped', { cap: state.weapon.lastSlain });
    }
    if (state.potionUsed && !before.potionUsed) coach('potion');
    if (Engine.canAvoid(state) && state.turn >= 2) coach('avoid');
  }

  /* ------------------------------------------------------------------ *
   * Actions
   * ------------------------------------------------------------------ */

  function play(index, mode) {
    if (busy || !state || state.status !== 'playing') return;
    const before = state.turn;
    // Playing a card disables its button, which would drop focus to <body>.
    // Only recover it if the player was actually working the keyboard here.
    const hadFocus = el.room.contains(document.activeElement);
    const snapshot = {
      health: state.health,
      potionUsed: state.potionUsed,
      weapon: state.weapon && { card: state.weapon.card, lastSlain: state.weapon.lastSlain },
    };

    const outcome = Engine.resolve(state, index, mode);
    if (!outcome) return;
    feedback(outcome);
    UI.setChoosing(-1);
    coachOn(snapshot);

    // If that card closed the room, the board is about to change completely;
    // hold input for the deal so a fast click does not land on a card that
    // slid into a slot under the cursor.
    if (state.turn !== before && state.status === 'playing') {
      busy = true;
      window.setTimeout(() => { busy = false; }, 260);
    }
    commit();
    checkAchievements({ type: 'resolve', ...outcome });
    if (hadFocus && state.status === 'playing') focusFirstCard();
  }

  function avoid() {
    if (busy || !state || !Engine.canAvoid(state)) return;
    // The Avoid button disables itself the moment it works, so send focus into
    // the new room rather than letting it fall to <body>.
    const fromKeyboard = document.activeElement === el.avoidBtn || el.room.contains(document.activeElement);
    UI.setChoosing(-1);
    Engine.avoid(state);
    Audio.play('avoid');
    busy = true;
    window.setTimeout(() => { busy = false; }, 260);
    commit();
    checkAchievements({ type: 'avoid' });
    if (fromKeyboard && state.status === 'playing') focusFirstCard();
  }

  /**
   * A card was pressed. Monsters that the weapon could legally take open the
   * weapon-or-fists prompt instead of resolving straight away; everything else
   * resolves on the spot.
   */
  function pressCard(index) {
    if (busy || !state || state.status !== 'playing') return;
    const slot = state.room[index];
    if (!slot || slot.done) return;

    if (slot.card.kind === 'monster' && Engine.canUseWeapon(state, slot.card)) {
      UI.setChoosing(UI.getChoosing() === index ? -1 : index);
      UI.render(state);
      const btn = el.room.querySelector(`.engage__btn[data-index="${index}"]`);
      if (btn) btn.focus();
      return;
    }
    play(index, 'bare');
  }

  function cancelChoice() {
    if (UI.getChoosing() < 0) return;
    const index = UI.getChoosing();
    UI.setChoosing(-1);
    UI.render(state);
    const btn = el.room.querySelector(`.card__btn[data-index="${index}"]`);
    if (btn) btn.focus();
  }

  function focusFirstCard() {
    const btn = el.room.querySelector('.card__btn:not([disabled])');
    if (btn) btn.focus({ preventScroll: true });
  }

  /* ------------------------------------------------------------------ *
   * Events
   * ------------------------------------------------------------------ */

  el.room.addEventListener('click', (event) => {
    const engageBtn = event.target.closest('[data-act]');
    if (engageBtn) {
      const act = engageBtn.dataset.act;
      if (act === 'cancel') cancelChoice();
      else play(Number(engageBtn.dataset.index), act);
      return;
    }
    const cardBtn = event.target.closest('.card__btn');
    if (cardBtn && !cardBtn.disabled) pressCard(Number(cardBtn.dataset.index));
  });

  /* ---- settings, record, welcome ---- */

  function openSettings() { UI.renderSettings(); el.settingsModal.showModal(); }
  function openStats() { UI.renderStats(state); el.statsModal.showModal(); }

  el.settingsModal.addEventListener('change', (event) => {
    const target = event.target;
    if (target.name === 'lang') I18n.setLang(target.value);
    else if (target.name === 'preset') Prefs.set('preset', target.value);
    else if (target.name === 'motion') Prefs.set('motion', target.value);
    else if (target.id === 'showThreatToggle') { Prefs.set('showThreat', target.checked); UI.render(state); }
    else if (target.id === 'coachToggle') Prefs.set('coach', target.checked);
    else if (target.id === 'soundToggle') {
      Prefs.set('sound', target.checked);
      if (target.checked) { Audio.unlock(); Audio.play('flip'); } // confirm it works
    } else if (target.id === 'particlesToggle') {
      Prefs.set('particles', target.checked);
      if (target.checked) Fx.burst(el.avoidBtn, 'gold', 0.4);
      else Fx.clear();
    }
  });

  document.getElementById('settingsSeedForm').addEventListener('submit', (event) => {
    event.preventDefault();
    const seed = el.settingsSeedInput.value.trim();
    el.settingsModal.close();
    startGame(seed || undefined);
  });

  document.getElementById('resetPrefsBtn').addEventListener('click', () => {
    Prefs.reset();
    UI.renderSettings();
    UI.render(state);
  });

  document.getElementById('resetStatsBtn').addEventListener('click', (event) => {
    const btn = event.currentTarget;
    // Two-step: clearing a record is not undoable, so make it deliberate.
    if (btn.dataset.armed !== 'true') {
      btn.dataset.armed = 'true';
      btn.textContent = t('rec.clearConfirm');
      window.setTimeout(() => {
        btn.dataset.armed = 'false';
        btn.textContent = t('rec.clear');
      }, 4000);
      return;
    }
    // Several trophies are derived from the record, so leaving them unlocked
    // after wiping it would be incoherent.
    Stats.reset();
    Achievements.reset();
    btn.dataset.armed = 'false';
    btn.textContent = t('rec.clear');
    UI.renderStats(state);
  });

  el.statsModal.addEventListener('click', (event) => {
    const btn = event.target.closest('[data-replay]');
    if (!btn) return;
    el.statsModal.close();
    replaySeed(btn.dataset.replay, btn.dataset.preset);
  });

  document.getElementById('welcomeStartBtn').addEventListener('click', () => {
    el.welcomeModal.close();
    focusFirstCard();
  });
  document.getElementById('welcomeRulesBtn').addEventListener('click', () => {
    el.welcomeModal.close();
    el.rulesModal.showModal();
  });

  el.avoidBtn.addEventListener('click', avoid);
  document.getElementById('statsBtn').addEventListener('click', openStats);
  document.getElementById('settingsBtn').addEventListener('click', openSettings);
  document.getElementById('newGameBtn').addEventListener('click', () => startGame());
  document.getElementById('restartBtn').addEventListener('click', restart);
  document.getElementById('rulesBtn').addEventListener('click', () => el.rulesModal.showModal());

  document.getElementById('endNewBtn').addEventListener('click', () => startGame());
  document.getElementById('endRetryBtn').addEventListener('click', restart);
  document.getElementById('endCloseBtn').addEventListener('click', () => el.endModal.close());

  // <dialog> gives us Esc and the focus trap; clicking the backdrop should
  // close too, which it does not do on its own.
  for (const dialog of [el.rulesModal, el.endModal, el.settingsModal, el.statsModal]) {
    dialog.addEventListener('click', (event) => {
      if (event.target === dialog) dialog.close();
    });
  }

  /*
   * A language change repaints everything that holds text: the static page via
   * i18n.apply(), then the parts this file renders. The chronicle is rebuilt
   * from scratch because its entries are keys — the history you have already
   * written comes back in the new language rather than staying behind.
   */
  I18n.onChange(() => {
    if (!state) return;
    UI.redrawLog(state);
    UI.render(state);
    UI.renderSettings();
    if (el.statsModal.open) UI.renderStats(state);
    if (state.status !== 'playing' && el.endModal.open) UI.showEnd(state);
    el.peekBtn.textContent = el.debugDeck.hidden ? t('dbg.peek') : t('dbg.hide');
  });

  /* ------------------------------------------------------------------ *
   * Keyboard
   * ------------------------------------------------------------------ */

  const typing = (node) =>
    node && (node.tagName === 'INPUT' || node.tagName === 'TEXTAREA' || node.isContentEditable);

  document.addEventListener('keydown', (event) => {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (typing(event.target)) return;

    if (event.key === 'Escape' && UI.getChoosing() >= 0 && !el.rulesModal.open && !el.endModal.open) {
      event.preventDefault();
      cancelChoice();
      return;
    }
    if (el.rulesModal.open || el.endModal.open
      || el.settingsModal.open || el.statsModal.open || el.welcomeModal.open) return;

    const key = event.key.toLowerCase();

    // Arrow keys walk the playable cards, so the room behaves like one control
    // rather than four separate tab stops.
    if (['arrowleft', 'arrowright', 'home', 'end'].includes(key)) {
      const cards = [...el.room.querySelectorAll('.card__btn:not([disabled])')];
      if (cards.length) {
        event.preventDefault();
        const at = cards.indexOf(document.activeElement);
        const next = key === 'home' ? 0
          : key === 'end' ? cards.length - 1
            : at < 0 ? 0
              : (at + (key === 'arrowright' ? 1 : cards.length - 1)) % cards.length;
        cards[next].focus();
      }
      return;
    }

    if (key >= '1' && key <= '4') {
      event.preventDefault();
      pressCard(Number(key) - 1);
      return;
    }
    switch (key) {
      case 'a':
        event.preventDefault();
        avoid();
        break;
      case 'n':
        event.preventDefault();
        startGame();
        break;
      case 'r':
        event.preventDefault();
        restart();
        break;
      case '?':
      case 'h':
        event.preventDefault();
        el.rulesModal.showModal();
        break;
      case 's':
        event.preventDefault();
        openSettings();
        break;
      case 't':
        event.preventDefault();
        openStats();
        break;
      case '`':
        event.preventDefault();
        toggleDebug();
        break;
      default:
        break;
    }
  });

  /* ------------------------------------------------------------------ *
   * Debug panel — hidden unless asked for
   * ------------------------------------------------------------------ */

  function toggleDebug(force) {
    const show = force === undefined ? el.debugPanel.hidden : force;
    el.debugPanel.hidden = !show;
    if (show && state) UI.renderDebug(state);
  }

  document.getElementById('seedForm').addEventListener('submit', (event) => {
    event.preventDefault();
    const value = el.seedInput.value.trim();
    startGame(value || undefined);
    toggleDebug(true);
  });

  document.getElementById('peekBtn').addEventListener('click', (event) => {
    const open = el.debugDeck.hidden;
    el.debugDeck.hidden = !open;
    event.currentTarget.setAttribute('aria-expanded', String(open));
    event.currentTarget.textContent = open ? t('dbg.hide') : t('dbg.peek');
  });

  /* ------------------------------------------------------------------ *
   * Go
   * ------------------------------------------------------------------ */

  // Eleven illustrations cover the whole deck; fetch them before the first
  // flip so no card turns over to an empty rectangle.
  window.ScoundrelArt.preload();

  // Translate the static markup before anything is rendered on top of it.
  I18n.apply();

  // Browsers refuse to start an AudioContext before the player has interacted
  // with the page. Create it on the first gesture, once.
  for (const type of ['pointerdown', 'keydown']) {
    window.addEventListener(type, function once() {
      window.removeEventListener('pointerdown', once);
      window.removeEventListener('keydown', once);
      if (Prefs.get('sound')) Audio.unlock();
    }, { once: false });
  }

  const params = new URLSearchParams(window.location.search);
  if (params.has('debug')) toggleDebug(true);

  // ?seed=… always deals that dungeon, overriding any saved run; otherwise pick
  // up where the last visit left off.
  if (params.get('seed')) startGame(params.get('seed'), false);
  else resumeOrStart();

  // First visit ever: a three-point primer instead of dropping someone into a
  // dungeon with no explanation. Shown once, then never again.
  if (!Prefs.get('seenWelcome')) {
    Prefs.set('seenWelcome', true);
    el.welcomeModal.showModal();
  }

  // Handy from the console: ScoundrelGame.state, .start('seed')
  window.ScoundrelGame = {
    get state() { return state; },
    start: startGame,
    restart,
    replay: replaySeed,
    debug: toggleDebug,
    stats: () => Stats.all(),
    prefs: () => Prefs.all(),
    lang: (next) => (next ? I18n.setLang(next) : I18n.getLang()),
    achievements: () => Achievements.all({ stats: Stats.all(), state, event: { type: 'view' } }),
  };
})();
