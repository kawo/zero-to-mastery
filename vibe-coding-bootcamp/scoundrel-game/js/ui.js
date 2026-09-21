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
  const Prefs = window.ScoundrelPrefs;
  const Stats = window.ScoundrelStats;
  const Achievements = window.ScoundrelAchievements;
  const I18n = window.ScoundrelI18n;
  const t = I18n.t;
  const td = I18n.td;

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
    endCard: $('endCard'),
    debugPanel: $('debugPanel'),
    debugDeck: $('debugDeck'),
    peekBtn: $('peekBtn'),
    seedInput: $('seedInput'),
    presetReadout: $('presetReadout'),
    settingsModal: $('settingsModal'),
    statsModal: $('statsModal'),
    welcomeModal: $('welcomeModal'),
    presetChoices: $('presetChoices'),
    langChoices: $('langChoices'),
    motionChoices: $('motionChoices'),
    showThreatToggle: $('showThreatToggle'),
    coachToggle: $('coachToggle'),
    settingsSeedInput: $('settingsSeedInput'),
    scoreboard: $('scoreboard'),
    historyList: $('historyList'),
    boardList: $('boardList'),
    trophyList: $('trophyList'),
    trophyCount: $('trophyCount'),
    soundToggle: $('soundToggle'),
    particlesToggle: $('particlesToggle'),
    toasts: $('toasts'),
  };

  /* Motion is a preference, not just an OS setting — see prefs.js. */
  const reduceMotion = () => Prefs.reduceMotion();

  /* Which slot is currently asking "weapon or bare hands?" — UI-only state. */
  let choosing = -1;
  /* Chronicle bookkeeping. */
  let lastLogId = 0;
  /* Cards already flipped face up, so they are not re-animated. */
  let revealed = new Set();

  /** The card's flavour name, translated. English lives in config.js. */
  const cardName = (card) => td(`card.${card.id}`, card.name);

  /** "Ace of Spades" / "As de Pique", for screen readers. */
  const spoken = (card) => t('card.spoken', {
    rank: card.rank > 10 ? t(`rank.${card.rank}`) : card.rank,
    suit: t(`suit.${card.suitKey}`),
  });

  const presetName = (id) => (C.PRESETS[id] ? td(`preset.${id}`, C.PRESETS[id].name) : id);
  const presetBlurb = (id) => td(`preset.${id}.blurb`, C.PRESETS[id].blurb);

  /* ------------------------------------------------------------------ *
   * HUD
   * ------------------------------------------------------------------ */

  let lastHealth = null;

  function renderHud(state) {
    const pct = (state.health / C.MAX_HEALTH) * 100;
    el.healthValue.textContent = String(state.health);
    el.healthFill.style.width = `${pct}%`;
    el.healthMeter.setAttribute('aria-valuenow', String(state.health));
    el.healthMeter.setAttribute('aria-valuetext',
      t('hud.healthOf', { n: state.health, max: C.MAX_HEALTH }));
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
    el.presetReadout.textContent = state.preset && state.preset !== C.DEFAULT_PRESET
      ? `· ${presetName(state.preset)}` : '';

    const can = Engine.canAvoid(state);
    el.avoidBtn.disabled = !can;
    el.avoidBtn.title = can ? t('hud.avoidTitle') : avoidReason(state);
  }

  function avoidReason(state) {
    if (state.status !== 'playing') return t('avoid.over');
    if (state.avoidedLast) return t('avoid.twice');
    if (state.resolved > 0) return t('avoid.touched');
    return t('avoid.short');
  }

  function renderWeapon(state) {
    const weapon = state.weapon;
    if (!weapon) {
      el.weaponPanel.dataset.empty = 'true';
      el.weaponBody.innerHTML = `<span class="panel__empty">${t('hud.bareHands')}</span>`;
      el.weaponPanel.setAttribute('aria-label', t('card.noWeaponAria'));
      return;
    }

    el.weaponPanel.dataset.empty = 'false';
    const cap = weapon.lastSlain;
    const capText = cap === null ? t('hud.weaponFresh') : t('hud.weaponCap', { n: cap });
    el.weaponBody.innerHTML = `
      <span class="weapon__card">${Art.glyph(weapon.card.suit, 16)}<b>${weapon.card.label}</b></span>
      <span class="weapon__meta">
        <span class="weapon__name">${cardName(weapon.card)}</span>
        <span class="weapon__cap" data-fresh="${cap === null}">${capText}</span>
      </span>
      ${weapon.stack.length ? `<span class="weapon__stack" title="${t('hud.weaponStackTitle')}">${
        weapon.stack.map((c) => `<i>${c.suit}${c.label}</i>`).join('')
      }</span>` : ''}
    `;
    el.weaponPanel.setAttribute(
      'aria-label',
      t('card.weaponAria', { card: spoken(weapon.card), n: weapon.card.rank })
      + (cap === null ? t('card.weaponAriaFresh') : t('card.weaponAriaCap', { cap }))
      + (weapon.stack.length ? t('card.weaponAriaSlain', { n: weapon.stack.length }) : ''),
    );
  }

  /* ------------------------------------------------------------------ *
   * Room
   * ------------------------------------------------------------------ */

  function roomHint(state) {
    if (state.status === 'won') return t('room.won');
    if (state.status === 'lost') return t('room.lost');

    const left = Engine.view.pending(state).length;
    const toGo = Math.min(C.CARDS_TO_RESOLVE, left) - state.resolved;
    if (choosing >= 0) return t('room.choosing');
    if (state.deck.length === 0 && left <= C.CARDS_TO_RESOLVE) {
      return left === 1 ? t('room.lastOne') : t('room.lastFew', { n: left });
    }
    if (toGo <= 0) return t('room.dealing');
    return t('room.toGo', { n: toGo });
  }

  function cardLabel(state, card, mode) {
    const base = `${spoken(card)}, ${cardName(card)}`;
    if (card.kind === 'weapon') return t('card.weapon', { card: base, n: card.rank });
    if (card.kind === 'potion') {
      return state.potionUsed
        ? t('card.potionWasted', { card: base, n: card.rank })
        : t('card.potion', { card: base, n: card.rank });
    }
    const bare = card.rank;
    if (mode === 'choice') {
      return t('card.monsterChoice', {
        card: base, n: card.rank, armed: Engine.previewDamage(state, card, 'weapon'), bare,
      });
    }
    return t('card.monsterBare', { card: base, n: card.rank, bare });
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
            <b>${cardName(card)}</b>
            <i>${card.kind === 'potion' ? t('card.heals', { n: card.rank }) : t('card.strength', { n: card.rank })}</i>
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
        ? t('card.resolved', { card: `${spoken(card)}, ${cardName(card)}` })
        : cardLabel(state, card, offersChoice ? 'choice' : 'direct'));
      btn.setAttribute('aria-keyshortcuts', String(index + 1));

      // Damage preview badge on monsters — the number you actually care about.
      let badge = wrap.querySelector('.card__threat');
      if (isMonster && playable && Prefs.get('showThreat')) {
        const dmg = Engine.previewDamage(state, card, offersChoice ? 'weapon' : 'bare');
        if (!badge) {
          badge = document.createElement('span');
          badge.className = 'card__threat';
          wrap.appendChild(badge);
        }
        badge.dataset.safe = String(dmg === 0);
        badge.innerHTML = `<span class="sr-only">${t('card.threatLabel')}</span>−${dmg}`;
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
          <p class="engage__title" id="engageTitle${index}">${t('engage.title', { card: `${card.suit}${card.label}` })}</p>
          <button type="button" class="engage__btn" data-act="weapon" data-index="${index}">
            <span>${t('engage.useWeapon', { card: `${state.weapon.card.suit}${state.weapon.card.label}` })}</span><b>−${armed}</b>
          </button>
          <button type="button" class="engage__btn" data-act="bare" data-index="${index}">
            <span>${t('engage.bare')}</span><b>−${bare}</b>
          </button>
          <button type="button" class="engage__cancel" data-act="cancel">${t('engage.cancel')}</button>`;
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
      if (reduceMotion()) {
        card.classList.add('is-faceup');
        return;
      }
      window.setTimeout(() => card.classList.add('is-faceup'), 90 * i);
    });

    el.roomHint.textContent = roomHint(state);

    // The room's own label carries progress, so a screen reader user can land
    // on the group and know where they are without counting cards.
    const open = Engine.view.pending(state).length;
    el.room.setAttribute(
      'aria-label',
      state.status === 'playing'
        ? t('room.label', {
          turn: state.turn,
          open: t('room.openCards', { n: open }),
          done: state.resolved,
          need: Math.min(C.CARDS_TO_RESOLVE, open + state.resolved),
        })
        : t('room.labelOver', { turn: state.turn }),
    );
  }

  /* ------------------------------------------------------------------ *
   * Chronicle
   * ------------------------------------------------------------------ */

  /**
   * Render one chronicle entry from its key and params.
   *
   * Two params are themselves translatable rather than literal: a card's
   * flavour name and a ruleset's name. The engine stores the id alongside the
   * English so this can look up the current language without the engine ever
   * having to know about one.
   */
  function logText(entry) {
    if (!entry.key) return entry.text || '';   // tolerate a stray old entry
    const p = entry.params || {};
    const params = { ...p };
    if (p.id && p.name) params.name = td(`card.${p.id}`, p.name);
    if (p.preset) params.name = presetName(p.preset);
    return t(entry.key, params);
  }

  /** Re-render the whole chronicle, e.g. after a language change. */
  function redrawLog(state) {
    el.log.replaceChildren();
    lastLogId = 0;
    renderLog(state);
  }

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
      li.querySelector('.log__text').textContent = logText(entry);
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

  /**
   * A card with no button and no flip, for display only.
   *
   * Shares the room card's markup and styling, minus the interactive parts:
   * the front face is mounted straight into `.card`, which carries the size, so
   * there is no `.card__inner` and nothing to rotate.
   */
  function staticCard(card, caption) {
    return `<figure class="trophy">
      <div class="card card--static" data-kind="${card.kind}" data-suit="${card.suitKey}">
        <div class="face face--front">
          <span class="pip pip--tl" aria-hidden="true">${card.label}${Art.glyph(card.suit, 11)}</span>
          <span class="pip pip--br" aria-hidden="true">${card.label}${Art.glyph(card.suit, 11)}</span>
          ${Art.face(card)}
          <span class="card__name"><b>${cardName(card)}</b><i>${t('card.strength', { n: card.rank })}</i></span>
        </div>
      </div>
      <figcaption class="trophy__cap">
        <span class="sr-only">${spoken(card)}, ${cardName(card)}, ${t('card.strength', { n: card.rank })}. </span>${caption}
      </figcaption>
    </figure>`;
  }

  function showEnd(state) {
    const won = state.status === 'won';
    el.endModal.dataset.result = won ? 'won' : 'lost';
    el.endEyebrow.textContent = won ? t('end.wonEyebrow') : t('end.lostEyebrow');
    el.endTitle.textContent = won
      ? t('end.wonTitle')
      : (state.killer ? t('end.lostTitle', { name: cardName(state.killer) }) : t('end.lostTitleDark'));
    // Show the monster that finished you. `killer` is a full card object and is
    // saved with the run, so this survives a reload on a finished game; older
    // saves may not carry it, hence the guard.
    if (!won && state.killer) {
      el.endCard.innerHTML = staticCard(state.killer, t('end.killerCaption'));
      el.endCard.hidden = false;
    } else {
      el.endCard.replaceChildren();
      el.endCard.hidden = true;
    }

    el.endScore.textContent = state.score > 0 ? `+${state.score}` : String(state.score);
    el.endDetail.textContent = won
      ? t('end.wonDetail', { n: state.health, max: C.MAX_HEALTH, turns: state.turn })
      : t('end.lostDetail', { n: Engine.remainingMonsterValue(state), turns: state.turn });
    if (!el.endModal.open) el.endModal.showModal();
  }

  /* ------------------------------------------------------------------ *
   * Settings
   * ------------------------------------------------------------------ */

  /**
   * Build one radio group. Real <input type="radio"> rather than buttons with
   * aria-checked, so arrow-key behaviour and the accessibility tree come from
   * the browser instead of being re-implemented here.
   */
  function choiceGroup(container, name, options, current) {
    container.replaceChildren();
    const frag = document.createDocumentFragment();
    for (const opt of options) {
      const id = `${name}-${opt.id}`;
      const label = document.createElement('label');
      label.className = 'choice';
      label.setAttribute('for', id);
      label.innerHTML = `
        <input type="radio" id="${id}" name="${name}" value="${opt.id}"${opt.id === current ? ' checked' : ''} />
        <span class="choice__body">
          <b>${opt.name}</b>
          ${opt.blurb ? `<i>${opt.blurb}</i>` : ''}
        </span>`;
      frag.appendChild(label);
    }
    container.appendChild(frag);
  }

  const motionOptions = () => [
    { id: 'system', name: t('set.motionSystem'), blurb: t('set.motionSystemBlurb') },
    { id: 'reduced', name: t('set.motionReduced'), blurb: t('set.motionReducedBlurb') },
    { id: 'full', name: t('set.motionFull'), blurb: t('set.motionFullBlurb') },
  ];

  const languageOptions = () => Object.entries(I18n.LANGS)
    .map(([id, meta]) => ({ id, name: meta.label, blurb: '' }));

  function renderSettings() {
    choiceGroup(el.langChoices, 'lang', languageOptions(), I18n.getLang());
    choiceGroup(el.presetChoices, 'preset', Object.values(C.PRESETS).map((preset) => ({
      id: preset.id, name: presetName(preset.id), blurb: presetBlurb(preset.id),
    })), Prefs.get('preset'));
    choiceGroup(el.motionChoices, 'motion', motionOptions(), Prefs.get('motion'));
    el.showThreatToggle.checked = Prefs.get('showThreat');
    el.coachToggle.checked = Prefs.get('coach');
    el.soundToggle.checked = Prefs.get('sound');
    el.particlesToggle.checked = Prefs.get('particles');
  }

  /* ------------------------------------------------------------------ *
   * Record
   * ------------------------------------------------------------------ */

  const WHEN = (ms) => {
    const mins = Math.round((Date.now() - ms) / 60000);
    if (mins < 1) return t('when.now');
    if (mins < 60) return t('when.min', { n: mins });
    const hours = Math.round(mins / 60);
    if (hours < 24) return t('when.hour', { n: hours });
    const days = Math.round(hours / 24);
    return days === 1 ? t('when.yesterday') : t('when.days', { n: days });
  };

  function renderStats(state) {
    const s = Stats.all();
    const rate = Stats.winRate();
    const cells = [
      [t('rec.runs'), s.games],
      [t('rec.won'), s.wins],
      [t('rec.winRate'), rate === null ? '—' : `${rate.toFixed(0)}%`],
      [t('rec.best'), s.bestScore === null ? '—' : (s.bestScore > 0 ? `+${s.bestScore}` : s.bestScore)],
      [t('rec.streak'), s.currentStreak],
      [t('rec.longest'), s.longestStreak],
    ];
    el.scoreboard.replaceChildren();
    const frag = document.createDocumentFragment();
    for (const [term, value] of cells) {
      const wrap = document.createElement('div');
      wrap.className = 'scoreboard__cell';
      wrap.innerHTML = `<dt>${term}</dt><dd>${value}</dd>`;
      frag.appendChild(wrap);
    }
    el.scoreboard.appendChild(frag);

    renderRuns(el.boardList, bestRuns(s.history), t('rec.emptyBoard'), true);
    renderRuns(el.historyList, s.history, t('rec.emptyHistory'), false);
    renderTrophies(state);
  }

  /**
   * The local leaderboard: your own top ten by score.
   *
   * Deliberately local. A shared board that could be trusted needs a server to
   * verify runs, and this game has none by design — the sibling projects make
   * the same call and say so rather than shipping a board anyone can edit.
   */
  function bestRuns(history) {
    return history.slice().sort((a, b) => b.score - a.score).slice(0, 10);
  }

  function renderRuns(host, runs, emptyText, ranked) {
    if (!runs.length) {
      host.innerHTML = `<p class="history__empty">${emptyText}</p>`;
      return;
    }
    const rows = document.createElement('ol');
    rows.className = 'history__list';
    runs.forEach((run, i) => {
      const li = document.createElement('li');
      li.className = 'history__row';
      li.dataset.status = run.status;
      if (ranked) li.dataset.rank = String(i + 1);
      li.innerHTML = `
        ${ranked ? `<span class="history__rank" aria-hidden="true">${i + 1}</span>` : ''}
        <span class="history__score">${run.score > 0 ? `+${run.score}` : run.score}</span>
        <span class="history__meta">
          <b>${run.status === 'won' ? t('rec.cleared') : t('rec.fell', { n: run.turns })}</b>
          <i>${t('rec.rowMeta', {
            preset: presetName(run.preset),
            seed: run.seed,
            when: WHEN(run.at),
          })}</i>
        </span>
        <button type="button" class="btn btn--sm" data-replay="${run.seed}" data-preset="${run.preset}">
          ${t('rec.replay')}<span class="sr-only">${t('rec.replayAria', { seed: run.seed })}</span>
        </button>`;
      rows.appendChild(li);
    });
    host.replaceChildren(rows);
  }

  /* ------------------------------------------------------------------ *
   * Trophies
   * ------------------------------------------------------------------ */

  function renderTrophies(state) {
    const context = { stats: Stats.all(), state: state || {}, event: { type: 'view' } };
    const list = Achievements.all(context);
    const { unlocked, total } = Achievements.count();
    el.trophyCount.textContent = t('rec.trophyCount', { n: unlocked, total });

    const frag = document.createDocumentFragment();
    for (const a of list) {
      const li = document.createElement('li');
      li.className = 'trophy-row';
      li.dataset.unlocked = String(a.unlocked);
      li.dataset.kind = a.kind;
      const bar = a.bar
        ? `<span class="trophy-bar"><span style="width:${(a.bar.current / a.bar.goal) * 100}%"></span></span>
           <span class="trophy-progress">${a.bar.current} / ${a.bar.goal}</span>`
        : '';
      li.innerHTML = `
        <span class="trophy-mark" aria-hidden="true">${a.unlocked ? '★' : '☆'}</span>
        <span class="trophy-body">
          <b>${td(`ach.${a.id}.title`, a.title)}</b>
          <i>${td(`ach.${a.id}.desc`, a.desc)}</i>
          ${bar}
        </span>
        <span class="sr-only">${a.unlocked ? t('rec.unlocked') : t('rec.locked')}</span>`;
      frag.appendChild(li);
    }
    el.trophyList.replaceChildren(frag);
  }

  /* ------------------------------------------------------------------ *
   * Toasts
   * ------------------------------------------------------------------ */

  /**
   * Announce an unlocked achievement. The host is aria-live polite, so this
   * waits its turn behind whatever the chronicle just said.
   */
  function toast(achievement) {
    const node = document.createElement('div');
    node.className = 'toast';
    node.dataset.kind = achievement.kind;
    node.innerHTML = `
      <span class="toast__mark" aria-hidden="true">★</span>
      <span class="toast__body">
        <b>${td(`ach.${achievement.id}.title`, achievement.title)}</b>
        <i>${td(`ach.${achievement.id}.desc`, achievement.desc)}</i>
      </span>`;
    el.toasts.appendChild(node);

    const life = Prefs.reduceMotion() ? 6000 : 4600;
    window.setTimeout(() => {
      node.dataset.leaving = 'true';
      window.setTimeout(() => node.remove(), 400);
    }, life);

    // Never let a pile-up push the room off screen.
    while (el.toasts.children.length > 3) el.toasts.firstChild.remove();
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
    renderSettings, renderStats, staticCard, toast, bestRuns, redrawLog, cardName,
  });
})();
