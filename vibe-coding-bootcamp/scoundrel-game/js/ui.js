/*
 * Scoundrel: rendering.
 *
 * One direction only — the engine owns the state, this file turns it into DOM.
 * Nothing here decides a rule; when a card is clicked it calls back into app.js,
 * which asks the engine and then asks for a re-render.
 *
 * The room is rebuilt from scratch on every render (four cards is nothing), with
 * two exceptions that need continuity:
 *   - the chronicle appends only new entries, so the live region announces the
 *     one thing that just happened rather than the whole history;
 *   - cards keep their DOM node if the same card is still in the same slot, so
 *     a carried-over card does not re-flip when the room around it changes.
 *
 * Exposed as window.ScoundrelUI.
 */
(() => {
  'use strict';

  const C = window.ScoundrelConfig;
  const Engine = window.ScoundrelEngine;
  const Art = window.ScoundrelArt;

  const $ = (id) => document.getElementById(id);

  const el = {
    app: $('app'),
    healthValue: $('healthValue'),
    healthMeter: $('healthMeter'),
    healthFill: $('healthFill'),
    healthGauge: $('healthGauge'),
    weaponPanel: $('weaponPanel'),
    weaponBody: $('weaponBody'),
    turnCount: $('turnCount'),
    deckCount: $('deckCount'),
    discardCount: $('discardCount'),
    avoidBtn: $('avoidBtn'),
    room: $('room'),
    roomHint: $('roomHint'),
    log: $('log'),
    seedReadout: $('seedReadout'),
    rulesModal: $('rulesModal'),
    endModal: $('endModal'),
    endEyebrow: $('endEyebrow'),
    endTitle: $('endTitle'),
    endScore: $('endScore'),
    endDetail: $('endDetail'),
    debugPanel: $('debugPanel'),
    debugDeck: $('debugDeck'),
    seedInput: $('seedInput'),
  };

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  /* Which slot is currently asking "weapon or bare hands?" — UI-only state. */
  let choosing = -1;
  /* Chronicle bookkeeping. */
  let lastLogId = 0;
  /* Cards already flipped face up, so they are not re-animated. */
  let revealed = new Set();

  const RANK_WORD = { 11: 'Jack', 12: 'Queen', 13: 'King', 14: 'Ace' };
  const spoken = (card) => `${RANK_WORD[card.rank] || card.rank} of ${card.suitName}`;

  /* ------------------------------------------------------------------ *
   * HUD
   * ------------------------------------------------------------------ */

  let lastHealth = null;

  function renderHud(state) {
    const pct = (state.health / C.MAX_HEALTH) * 100;
    el.healthValue.textContent = String(state.health);
    el.healthFill.style.width = `${pct}%`;
    el.healthMeter.setAttribute('aria-valuenow', String(state.health));
    el.healthMeter.setAttribute('aria-valuetext', `${state.health} of ${C.MAX_HEALTH} health`);
    el.healthGauge.dataset.level = state.health <= 5 ? 'critical' : state.health <= 10 ? 'low' : 'ok';

    // Flash the meter when it drops, so damage is felt and not just read.
    if (lastHealth !== null && state.health < lastHealth) {
      el.healthGauge.classList.remove('is-hit');
      void el.healthGauge.offsetWidth; // restart the animation
      el.healthGauge.classList.add('is-hit');
    }
    lastHealth = state.health;

    renderWeapon(state);

    el.turnCount.textContent = String(state.turn);
    el.deckCount.textContent = String(state.deck.length);
    el.discardCount.textContent = String(state.discard.length);
    el.seedReadout.textContent = state.seed;

    const can = Engine.canAvoid(state);
    el.avoidBtn.disabled = !can;
    el.avoidBtn.title = can
      ? 'Send all four cards to the bottom of the deck'
      : avoidReason(state);
  }

  function avoidReason(state) {
    if (state.status !== 'playing') return 'The run is over';
    if (state.avoidedLast) return 'You cannot avoid two rooms in a row';
    if (state.resolved > 0) return 'Too late — you have already played a card';
    return 'Not enough cards left to avoid';
  }

  function renderWeapon(state) {
    const weapon = state.weapon;
    if (!weapon) {
      el.weaponPanel.dataset.empty = 'true';
      el.weaponBody.innerHTML = '<span class="panel__empty">Bare hands</span>';
      el.weaponPanel.setAttribute('aria-label', 'No weapon equipped. You fight bare-handed.');
      return;
    }

    el.weaponPanel.dataset.empty = 'false';
    const cap = weapon.lastSlain;
    const capText = cap === null ? 'fresh' : `max ${cap}`;
    el.weaponBody.innerHTML = `
      <span class="weapon__card">${Art.glyph(weapon.card.suit, 16)}<b>${weapon.card.label}</b></span>
      <span class="weapon__meta">
        <span class="weapon__name">${weapon.card.name}</span>
        <span class="weapon__cap" data-fresh="${cap === null}">${capText}</span>
      </span>
      ${weapon.stack.length ? `<span class="weapon__stack" title="Monsters slain with this blade">${
        weapon.stack.map((c) => `<i>${c.suit}${c.label}</i>`).join('')
      }</span>` : ''}
    `;
    el.weaponPanel.setAttribute(
      'aria-label',
      `Weapon: ${spoken(weapon.card)}, strength ${weapon.card.rank}. `
      + (cap === null
        ? 'Not yet used, it can fight anything.'
        : `It can only fight monsters of value ${cap} or lower.`)
      + (weapon.stack.length ? ` ${weapon.stack.length} slain.` : ''),
    );
  }

  /* ------------------------------------------------------------------ *
   * Room
   * ------------------------------------------------------------------ */

  function roomHint(state) {
    if (state.status === 'won') return 'The dungeon is empty. You made it out.';
    if (state.status === 'lost') return 'You fell here.';

    const left = Engine.view.pending(state).length;
    const toGo = Math.min(C.CARDS_TO_RESOLVE, left) - state.resolved;
    if (choosing >= 0) return 'Weapon or bare hands?';
    if (state.deck.length === 0 && left <= C.CARDS_TO_RESOLVE) {
      return left === 1 ? 'One card between you and the door.' : `Last ${left} cards. Play them all.`;
    }
    if (toGo <= 0) return 'Dealing the next room…';
    return `Resolve ${toGo} more ${toGo === 1 ? 'card' : 'cards'}. The one you leave follows you in.`;
  }

  function cardLabel(state, card, mode) {
    const base = `${spoken(card)}, ${card.name}`;
    if (card.kind === 'weapon') return `${base}. Weapon, strength ${card.rank}. Press to equip.`;
    if (card.kind === 'potion') {
      return state.potionUsed
        ? `${base}. Potion worth ${card.rank}, but you have already drunk this room — it will be wasted.`
        : `${base}. Potion, heals ${card.rank}. Press to drink.`;
    }
    const bare = card.rank;
    if (mode === 'choice') {
      const armed = Engine.previewDamage(state, card, 'weapon');
      return `${base}. Monster, strength ${card.rank}. Press to choose: weapon for ${armed} damage, or bare hands for ${bare}.`;
    }
    return `${base}. Monster, strength ${card.rank}. Press to fight bare-handed for ${bare} damage.`;
  }

  function buildCard(slot, index) {
    const card = slot.card;
    const li = document.createElement('li');
    li.className = 'slot';
    li.dataset.cardId = card.id;

    const wrap = document.createElement('div');
    wrap.className = 'card';
    wrap.dataset.kind = card.kind;
    wrap.dataset.suit = card.suitKey;

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'card__btn';
    btn.dataset.index = String(index);
    btn.innerHTML = `
      <span class="card__inner">
        <span class="face face--back">${Art.back()}</span>
        <span class="face face--front">
          <span class="pip pip--tl" aria-hidden="true">${card.label}${Art.glyph(card.suit, 11)}</span>
          <span class="pip pip--br" aria-hidden="true">${card.label}${Art.glyph(card.suit, 11)}</span>
          ${Art.face(card)}
          <span class="card__name">
            <b>${card.name}</b>
            <i>${card.kind === 'potion' ? `heals ${card.rank}` : card.kind === 'weapon' ? `strength ${card.rank}` : `strength ${card.rank}`}</i>
          </span>
        </span>
      </span>`;
    wrap.appendChild(btn);
    li.appendChild(wrap);
    return li;
  }

  function renderRoom(state) {
    const slots = Engine.view.slots(state);
    const frag = document.createDocumentFragment();
    const seenIds = new Set();

    slots.forEach((slot, index) => {
      const card = slot.card;
      seenIds.add(card.id);

      // Reuse the existing node when the same card is still in the same place,
      // so a carried-over card stays put instead of flipping again.
      let li = el.room.querySelector(`.slot[data-card-id="${card.id}"]`);
      if (li) li.remove();
      else li = buildCard(slot, index);

      const wrap = li.querySelector('.card');
      const btn = li.querySelector('.card__btn');
      btn.dataset.index = String(index);

      const isMonster = card.kind === 'monster';
      const offersChoice = isMonster && Engine.canUseWeapon(state, card);
      const playable = state.status === 'playing' && !slot.done;

      wrap.dataset.done = String(slot.done);
      wrap.dataset.choosing = String(choosing === index);
      wrap.dataset.wasted = String(card.kind === 'potion' && state.potionUsed && !slot.done);
      btn.disabled = !playable;
      btn.setAttribute('aria-label', slot.done
        ? `${spoken(card)}, ${card.name}. Resolved.`
        : cardLabel(state, card, offersChoice ? 'choice' : 'direct'));
      btn.setAttribute('aria-keyshortcuts', String(index + 1));

      // Damage preview badge on monsters — the number you actually care about.
      let badge = wrap.querySelector('.card__threat');
      if (isMonster && playable) {
        const dmg = Engine.previewDamage(state, card, offersChoice ? 'weapon' : 'bare');
        if (!badge) {
          badge = document.createElement('span');
          badge.className = 'card__threat';
          wrap.appendChild(badge);
        }
        badge.dataset.safe = String(dmg === 0);
        badge.innerHTML = `<span class="sr-only">Damage if you take it now: </span>−${dmg}`;
      } else if (badge) {
        badge.remove();
      }

      // The weapon-or-fists prompt, as real buttons so it is keyboard-operable.
      let engage = wrap.querySelector('.engage');
      if (choosing === index && playable && offersChoice) {
        const armed = Engine.previewDamage(state, card, 'weapon');
        const bare = Engine.previewDamage(state, card, 'bare');
        if (!engage) {
          engage = document.createElement('div');
          engage.className = 'engage';
          wrap.appendChild(engage);
        }
        engage.innerHTML = `
          <p class="engage__title" id="engageTitle${index}">Fight ${card.suit}${card.label}</p>
          <button type="button" class="engage__btn" data-act="weapon" data-index="${index}">
            <span>Use ${state.weapon.card.suit}${state.weapon.card.label}</span><b>−${armed}</b>
          </button>
          <button type="button" class="engage__btn" data-act="bare" data-index="${index}">
            <span>Bare hands</span><b>−${bare}</b>
          </button>
          <button type="button" class="engage__cancel" data-act="cancel">Cancel</button>`;
      } else if (engage) {
        engage.remove();
      }

      frag.appendChild(li);
    });

    // Pad the grid so the layout does not jump as the room empties.
    for (let i = slots.length; i < C.ROOM_SIZE; i += 1) {
      const ghost = document.createElement('li');
      ghost.className = 'slot slot--empty';
      ghost.setAttribute('aria-hidden', 'true');
      frag.appendChild(ghost);
    }

    el.room.replaceChildren(frag);
    revealed = new Set([...revealed].filter((id) => seenIds.has(id)));

    // Cards already seen are face up straight away; only genuinely new arrivals
    // flip, staggered left to right.
    const nodes = [...el.room.querySelectorAll('.slot[data-card-id]')];
    const fresh = nodes.filter((li) => !revealed.has(li.dataset.cardId));
    nodes.forEach((li) => {
      if (revealed.has(li.dataset.cardId)) li.querySelector('.card').classList.add('is-faceup');
    });
    fresh.forEach((li, i) => {
      revealed.add(li.dataset.cardId);
      const card = li.querySelector('.card');
      if (reduceMotion.matches) {
        card.classList.add('is-faceup');
        return;
      }
      window.setTimeout(() => card.classList.add('is-faceup'), 90 * i);
    });

    el.roomHint.textContent = roomHint(state);
  }

  /* ------------------------------------------------------------------ *
   * Chronicle
   * ------------------------------------------------------------------ */

  function renderLog(state) {
    const newest = state.log.length ? state.log[state.log.length - 1].id : 0;
    if (newest < lastLogId) {
      // A new run: start the chronicle over.
      el.log.replaceChildren();
      lastLogId = 0;
    }

    const pendingEntries = state.log.filter((entry) => entry.id > lastLogId);
    if (!pendingEntries.length) return;

    const frag = document.createDocumentFragment();
    for (const entry of pendingEntries) {
      const li = document.createElement('li');
      li.className = 'log__row';
      li.dataset.kind = entry.kind;
      li.innerHTML = `<span class="log__turn" aria-hidden="true">${entry.turn}</span><span class="log__text"></span>`;
      li.querySelector('.log__text').textContent = entry.text;
      frag.appendChild(li);
    }
    el.log.appendChild(frag);
    lastLogId = newest;

    // Trim the DOM alongside the state's own cap.
    while (el.log.children.length > C.LOG_LIMIT) el.log.removeChild(el.log.firstChild);
    el.log.scrollTop = el.log.scrollHeight;
  }

  /* ------------------------------------------------------------------ *
   * End of run
   * ------------------------------------------------------------------ */

  function showEnd(state) {
    const won = state.status === 'won';
    el.endModal.dataset.result = won ? 'won' : 'lost';
    el.endEyebrow.textContent = won ? 'You walked out' : 'You did not walk out';
    el.endTitle.textContent = won ? 'Dungeon cleared' : `Slain by ${state.killer ? state.killer.name : 'the dark'}`;
    el.endScore.textContent = state.score > 0 ? `+${state.score}` : String(state.score);
    el.endDetail.textContent = won
      ? `You finished with ${state.health} of ${C.MAX_HEALTH} health after ${state.turn} rooms. Your score is the health you kept.`
      : `${Engine.remainingMonsterValue(state)} points of monster were still down there after ${state.turn} rooms — that total, negated, is your score.`;
    if (!el.endModal.open) el.endModal.showModal();
  }

  /* ------------------------------------------------------------------ *
   * Debug
   * ------------------------------------------------------------------ */

  function renderDebug(state) {
    if (el.debugPanel.hidden) return;
    el.seedInput.placeholder = state.seed;
    el.debugDeck.replaceChildren();
    const frag = document.createDocumentFragment();
    state.deck.forEach((card, i) => {
      const li = document.createElement('li');
      li.textContent = `${String(i + 1).padStart(2, '0')}  ${card.suit}${card.label}  ${card.name}`;
      frag.appendChild(li);
    });
    el.debugDeck.appendChild(frag);
  }

  /* ------------------------------------------------------------------ *
   * Entry point
   * ------------------------------------------------------------------ */

  function render(state) {
    el.app.dataset.status = state.status;
    renderHud(state);
    renderRoom(state);
    renderLog(state);
    renderDebug(state);
  }

  /**
   * Forget per-run UI memory (called when a fresh dungeon is dealt).
   *
   * Clearing the chronicle here rather than inferring it in renderLog matters:
   * a new run restarts the log ids at 1, so starting a game and immediately
   * starting another would leave lastLogId equal to the new run's newest id and
   * silently skip every entry.
   */
  function reset() {
    choosing = -1;
    revealed = new Set();
    lastHealth = null;
    lastLogId = 0;
    el.room.replaceChildren();
    el.log.replaceChildren();
  }

  const setChoosing = (index) => { choosing = index; };
  const getChoosing = () => choosing;

  window.ScoundrelUI = Object.freeze({
    el, render, reset, showEnd, setChoosing, getChoosing, renderDebug,
  });
})();
