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
    ['ScoundrelConfig', 'js/config.js'],
    ['ScoundrelPrefs', 'js/prefs.js'],
    ['ScoundrelStats', 'js/stats.js'],
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
      // Let the last card's flip and the damage flash land first.
      window.setTimeout(() => UI.showEnd(state), 420);
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

  function coach(id, text) {
    if (!Prefs.get('coach') || !state || state.status !== 'playing') return;
    const seen = coachSeen();
    if (seen.has(id)) return;
    seen.add(id);
    try {
      window.localStorage.setItem(COACH_KEY, JSON.stringify([...seen]));
    } catch { /* a lost tip is not worth breaking the turn over */ }
    state.log.push({ id: (state.logSeq += 1), text: `Tip: ${text}`, kind: 'coach', turn: state.turn });
  }

  /** Watch what just happened and teach the rule behind it. */
  function coachOn(before) {
    if (!state.weapon) {
      if (before.health > state.health) {
        coach('bare', 'with no weapon you take a monster’s full value. A ♦ card equips instantly.');
      }
    } else if (!before.weapon || before.weapon.card.id !== state.weapon.card.id) {
      coach('equipped', 'your blade fights anything until its first kill. After that it is capped by what it killed, and the cap only falls — so spend it on something big.');
    } else if (state.weapon.lastSlain !== null && before.weapon.lastSlain === null) {
      coach('capped', `the blade is now capped at ${state.weapon.lastSlain}. Anything bigger has to be fought bare-handed, or left for the next room.`);
    }
    if (state.potionUsed && !before.potionUsed) {
      coach('potion', 'only one potion works per room. A second ♥ is worth more left behind as your carry-over card.');
    }
    if (Engine.canAvoid(state) && state.turn >= 2) {
      coach('avoid', 'Avoid sends all four cards to the bottom of the deck — it buys time, it does not remove them. You cannot avoid twice running.');
    }
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

    if (!Engine.resolve(state, index, mode)) return;
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
    if (hadFocus && state.status === 'playing') focusFirstCard();
  }

  function avoid() {
    if (busy || !state || !Engine.canAvoid(state)) return;
    // The Avoid button disables itself the moment it works, so send focus into
    // the new room rather than letting it fall to <body>.
    const fromKeyboard = document.activeElement === el.avoidBtn || el.room.contains(document.activeElement);
    UI.setChoosing(-1);
    Engine.avoid(state);
    busy = true;
    window.setTimeout(() => { busy = false; }, 260);
    commit();
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
  function openStats() { UI.renderStats(); el.statsModal.showModal(); }

  el.settingsModal.addEventListener('change', (event) => {
    const t = event.target;
    if (t.name === 'preset') Prefs.set('preset', t.value);
    else if (t.name === 'motion') Prefs.set('motion', t.value);
    else if (t.id === 'showThreatToggle') { Prefs.set('showThreat', t.checked); UI.render(state); }
    else if (t.id === 'coachToggle') Prefs.set('coach', t.checked);
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
      btn.textContent = 'Really clear it?';
      window.setTimeout(() => {
        btn.dataset.armed = 'false';
        btn.textContent = 'Clear record';
      }, 4000);
      return;
    }
    Stats.reset();
    btn.dataset.armed = 'false';
    btn.textContent = 'Clear record';
    UI.renderStats();
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
    event.currentTarget.textContent = open ? 'Hide the deck' : 'Peek at the deck';
  });

  /* ------------------------------------------------------------------ *
   * Go
   * ------------------------------------------------------------------ */

  // Eleven illustrations cover the whole deck; fetch them before the first
  // flip so no card turns over to an empty rectangle.
  window.ScoundrelArt.preload();

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
  };
})();
