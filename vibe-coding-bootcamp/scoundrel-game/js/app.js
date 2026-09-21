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
  const el = UI.el;

  /** @type {object} the one live game */
  let state = null;
  /** Suppresses input while the next room is being dealt. */
  let busy = false;

  /* ------------------------------------------------------------------ *
   * Lifecycle
   * ------------------------------------------------------------------ */

  function commit({ checkEnd = true } = {}) {
    Storage.save(state);
    UI.render(state);
    if (checkEnd && state.status !== 'playing') {
      // Let the last card's flip and the damage flash land first.
      window.setTimeout(() => UI.showEnd(state), 420);
    }
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
    state = Engine.create(seed);
    if (el.endModal.open) el.endModal.close();
    commit({ checkEnd: false });
    if (takeFocus) focusFirstCard();
  }

  /** Same seed, same 44 cards, from the top. */
  function restart() {
    startGame(state.seed);
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
   * Actions
   * ------------------------------------------------------------------ */

  function play(index, mode) {
    if (busy || !state || state.status !== 'playing') return;
    const before = state.turn;
    // Playing a card disables its button, which would drop focus to <body>.
    // Only recover it if the player was actually working the keyboard here.
    const hadFocus = el.room.contains(document.activeElement);

    if (!Engine.resolve(state, index, mode)) return;
    UI.setChoosing(-1);

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

  el.avoidBtn.addEventListener('click', avoid);
  document.getElementById('newGameBtn').addEventListener('click', () => startGame());
  document.getElementById('restartBtn').addEventListener('click', restart);
  document.getElementById('rulesBtn').addEventListener('click', () => el.rulesModal.showModal());

  document.getElementById('endNewBtn').addEventListener('click', () => startGame());
  document.getElementById('endRetryBtn').addEventListener('click', restart);
  document.getElementById('endCloseBtn').addEventListener('click', () => el.endModal.close());

  // <dialog> gives us Esc and the focus trap; clicking the backdrop should
  // close too, which it does not do on its own.
  for (const dialog of [el.rulesModal, el.endModal]) {
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
    if (el.rulesModal.open || el.endModal.open) return;

    const key = event.key.toLowerCase();

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

  const params = new URLSearchParams(window.location.search);
  if (params.has('debug')) toggleDebug(true);

  // ?seed=… always deals that dungeon, overriding any saved run; otherwise pick
  // up where the last visit left off.
  if (params.get('seed')) startGame(params.get('seed'), false);
  else resumeOrStart();

  // Handy from the console: ScoundrelGame.state, .start('seed')
  window.ScoundrelGame = {
    get state() { return state; },
    start: startGame,
    restart,
    debug: toggleDebug,
  };
})();
