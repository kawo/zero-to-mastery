/*
 * Scoundrel: translations (English, French).
 *
 * t(key, params) looks a key up in the current language, falls back to English,
 * then to the key itself. `{name}` placeholders are filled from params.
 * Plurals: when params.n is given and `key.one` / `key.other` exist, the right
 * form is picked — French treats 0 and 1 as singular, English does not.
 *
 * Static HTML is translated through attributes:
 *   data-i18n="key"        → textContent
 *   data-i18n-html="key"   → innerHTML (our own strings only, never user input)
 *   data-i18n-attr="title:key;aria-label:key"
 *
 * Game data — card names, achievements, rulesets — keeps its English in its own
 * file next to the thing it describes; only the French lives here, keyed by id,
 * and td(key, english) picks the right one. That way adding a card means adding
 * one name in config.js, not editing two files in lockstep.
 *
 * French typography: the non-breaking spaces required before : ; ! ? are
 * written as   so they are visible in the source rather than being
 * invisible characters someone deletes by accident.
 *
 * Exposed as window.ScoundrelI18n.
 */
(() => {
  'use strict';

  const LANGS = Object.freeze({
    en: { label: 'English', locale: 'en-GB' },
    fr: { label: 'Français', locale: 'fr-FR' },
  });

  const NB = ' '; // non-breaking space

  /* ================================================================== *
   * English
   * ================================================================== */

  const en = {
    'app.title': 'Scoundrel',
    'app.tagline': 'A dungeon of 44 cards',
    'app.skip': 'Skip to the room',
    'app.status': 'Status',

    // HUD
    'hud.health': 'Health',
    'hud.weapon': 'Weapon',
    'hud.room': 'Room',
    'hud.deck': 'Deck',
    'hud.discard': 'Discard',
    'hud.bareHands': 'Bare hands',
    'hud.avoid': 'Avoid room',
    'hud.avoidHint': 'Send all four cards to the bottom of the deck. You cannot avoid two rooms in a row.',
    'hud.avoidTitle': 'Send all four cards to the bottom of the deck',
    'hud.seed': 'Seed',
    'hud.weaponFresh': 'fresh',
    'hud.weaponCap': 'max {n}',
    'hud.weaponStackTitle': 'Monsters slain with this blade',
    'hud.healthOf': '{n} of {max} health',

    // Why avoid is unavailable
    'avoid.over': 'The run is over',
    'avoid.twice': 'You cannot avoid two rooms in a row',
    'avoid.touched': 'Too late — you have already played a card',
    'avoid.short': 'Not enough cards left to avoid',

    // Room
    'room.heading': 'The Room',
    'room.cards': 'Room cards',
    'room.hintDefault': 'Resolve three of the four cards.',
    'room.won': 'The dungeon is empty. You made it out.',
    'room.lost': 'You fell here.',
    'room.choosing': 'Weapon or bare hands?',
    'room.lastOne': 'One card between you and the door.',
    'room.lastFew': 'Last {n} cards. Play them all.',
    'room.dealing': 'Dealing the next room…',
    'room.toGo.one': 'Resolve {n} more card. The one you leave follows you in.',
    'room.toGo.other': 'Resolve {n} more cards. The one you leave follows you in.',
    'room.label': 'Room {turn}. {open} face up, {done} of {need} resolved.',
    'room.labelOver': 'Room {turn}. The run is over.',
    'room.openCards.one': '{n} card',
    'room.openCards.other': '{n} cards',

    // Card descriptions (screen readers)
    'card.weapon': '{card}. Weapon, strength {n}. Press to equip.',
    'card.potion': '{card}. Potion, heals {n}. Press to drink.',
    'card.potionWasted': '{card}. Potion worth {n}, but you have already drunk this room — it will be wasted.',
    'card.monsterChoice': '{card}. Monster, strength {n}. Press to choose: weapon for {armed} damage, or bare hands for {bare}.',
    'card.monsterBare': '{card}. Monster, strength {n}. Press to fight bare-handed for {bare} damage.',
    'card.resolved': '{card}. Resolved.',
    'card.spoken': '{rank} of {suit}',
    'rank.11': 'Jack', 'rank.12': 'Queen', 'rank.13': 'King', 'rank.14': 'Ace',
    'suit.clubs': 'Clubs', 'suit.spades': 'Spades',
    'suit.diamonds': 'Diamonds', 'suit.hearts': 'Hearts',
    'card.strength': 'strength {n}',
    'card.heals': 'heals {n}',
    'card.wasted': ' · wasted',
    'card.threatLabel': 'Damage if you take it now: ',
    'card.weaponAria': 'Weapon: {card}, strength {n}. ',
    'card.weaponAriaFresh': 'Not yet used, it can fight anything.',
    'card.weaponAriaCap': 'It can only fight monsters of value {cap} or lower.',
    'card.weaponAriaSlain': ' {n} slain.',
    'card.noWeaponAria': 'No weapon equipped. You fight bare-handed.',

    // Engage prompt
    'engage.title': 'Fight {card}',
    'engage.useWeapon': 'Use {card}',
    'engage.bare': 'Bare hands',
    'engage.cancel': 'Cancel',

    // Chronicle
    'log.heading': 'Chronicle',
    'log.start': 'You step into the dungeon. 44 cards, seed {seed}.',
    'log.ruleset': 'Ruleset: {name}.',
    'log.roomFresh': 'Room {turn}. Four cards face up.',
    'log.roomCarried': 'Room {turn}. {card} followed you in.',
    'log.avoided': 'Avoided the room — {cards} slid under the deck.',
    'log.dropped': 'Dropped {card} and its {n} trophies.',
    'log.equipped': 'Equipped {card} — {name}.',
    'log.poured': 'Poured out {card} — you can only stomach one potion a room.',
    'log.drank': 'Drank {card} — healed {n}.',
    'log.drankSpill': 'Drank {card} — healed {n}, the rest spilled (capped at {max}).',
    'log.bare': 'Fought {card} bare-handed — took {n} damage.',
    'log.killClean': '{weapon} cut down {card} clean. Blade now capped at {cap}.',
    'log.killBloody': '{weapon} killed {card} — took {n} damage. Blade now capped at {cap}.',
    'log.win': 'The dungeon is empty. You walk out with {n} health. Score {score}.',
    'log.lose': '{card} finishes you. Score {score}.',
    'log.loseDark': 'The dungeon finishes you. Score {score}.',

    // Coaching
    'coach.prefix': 'Tip: ',
    'coach.bare': 'with no weapon you take a monster’s full value. A ♦ card equips instantly.',
    'coach.equipped': 'your blade fights anything until its first kill. After that it is capped by what it killed, and the cap only falls — so spend it on something big.',
    'coach.capped': 'the blade is now capped at {cap}. Anything bigger has to be fought bare-handed, or left for the next room.',
    'coach.potion': 'only one potion works per room. A second ♥ is worth more left behind as your carry-over card.',
    'coach.avoid': 'Avoid sends all four cards to the bottom of the deck — it buys time, it does not remove them. You cannot avoid twice running.',

    // Controls
    'ctl.newGame': 'New game',
    'ctl.restart': 'Restart dungeon',
    'ctl.rules': 'Rules',
    'ctl.record': 'Record',
    'ctl.settings': 'Settings',

    // End of run
    'end.wonEyebrow': 'You walked out',
    'end.lostEyebrow': 'You did not walk out',
    'end.wonTitle': 'Dungeon cleared',
    'end.lostTitle': 'Slain by {name}',
    'end.lostTitleDark': 'Slain by the dark',
    'end.wonDetail': 'You finished with {n} of {max} health after {turns} rooms. Your score is the health you kept.',
    'end.lostDetail': '{n} points of monster were still down there after {turns} rooms — that total, negated, is your score.',
    'end.killerCaption': 'dealt the final blow',
    'end.newGame': 'New dungeon',
    'end.retry': 'Retry this one',
    'end.close': 'Look at the table',
    'end.score': 'Score',

    // Welcome
    'welcome.eyebrow': 'A solo card game',
    'welcome.title': 'Welcome to the dungeon',
    'welcome.lead': 'Three things and you can play:',
    'welcome.s1': '<b>Four cards, pick three.</b> The one you leave follows you into the next room.',
    'welcome.s2': '<b>♦ is your weapon, ♥ heals, ♣ ♠ hurt.</b> Each monster shows what it will cost you before you touch it.',
    'welcome.s3': '<b>Your blade dulls.</b> After a kill it can only fight something that size or smaller — so don’t waste a big weapon on a small monster.',
    'welcome.note': 'You start at 20 health. Clear all 44 cards to win.',
    'welcome.start': 'Start playing',
    'welcome.rules': 'Full rules',

    // Settings
    'set.title': 'Settings',
    'set.close': 'Close settings',
    'set.language': 'Language',
    'set.languageHint': 'Applies straight away, including the chronicle already written.',
    'set.ruleset': 'Ruleset',
    'set.rulesetHint': 'Applies to the next new game. A run in progress keeps the rules it was dealt with.',
    'set.motion': 'Motion',
    'set.motionHint': '“System” follows your operating system’s reduced-motion setting.',
    'set.motionSystem': 'System',
    'set.motionSystemBlurb': 'Follow your operating system’s reduced-motion setting.',
    'set.motionReduced': 'Reduced',
    'set.motionReducedBlurb': 'No card flips, no shake, no stagger.',
    'set.motionFull': 'Full',
    'set.motionFullBlurb': 'Always animate, whatever the system says.',
    'set.feel': 'Feel',
    'set.sound': 'Sound',
    'set.soundBlurb': 'Synthesised cues for hits, kills and potions. No audio files.',
    'set.particles': 'Particles',
    'set.particlesBlurb': 'Sparks and motes. Reduced motion turns these off regardless.',
    'set.help': 'Help',
    'set.threat': 'Damage preview',
    'set.threatBlurb': 'Show what each monster will cost before you play it',
    'set.coach': 'Coaching notes',
    'set.coachBlurb': 'One-off tips in the chronicle the first time something matters',
    'set.seed': 'Deal a specific dungeon',
    'set.seedHint': 'Seeds are any text. The same seed always deals the same 44 cards.',
    'set.seedPlaceholder': 'e.g. goblin',
    'set.seedGo': 'Deal it',
    'set.reset': 'Reset settings',

    // Record
    'rec.title': 'Your record',
    'rec.close': 'Close record',
    'rec.runs': 'Runs',
    'rec.won': 'Won',
    'rec.winRate': 'Win rate',
    'rec.best': 'Best score',
    'rec.streak': 'Streak',
    'rec.longest': 'Longest streak',
    'rec.bestRuns': 'Best runs',
    'rec.bestRunsHint': 'Your own top ten, kept in this browser. A shared, trustworthy leaderboard would need a server, and this game deliberately has none.',
    'rec.recent': 'Recent runs',
    'rec.trophies': 'Trophies',
    'rec.trophyCount': '{n} of {total}',
    'rec.emptyBoard': 'No finished runs yet. Your best ten will collect here.',
    'rec.emptyHistory': 'Nothing played yet.',
    'rec.cleared': 'Cleared',
    'rec.fell': 'Fell in room {n}',
    'rec.replay': 'Replay',
    'rec.replayAria': ' the dungeon from seed {seed}',
    'rec.clear': 'Clear record',
    'rec.clearConfirm': 'Clear record and trophies?',
    'rec.unlocked': 'Unlocked',
    'rec.locked': 'Locked',
    'rec.rowMeta': '{preset} · seed {seed} · {when}',

    // Relative time
    'when.now': 'just now',
    'when.min': '{n}m ago',
    'when.hour': '{n}h ago',
    'when.yesterday': 'yesterday',
    'when.days': '{n}d ago',

    // Rules modal
    'rules.title': 'How to play Scoundrel',
    'rules.close': 'Close rules',
    'rules.lead': 'Clear all 44 cards and you walk out. Reach <strong>0 health</strong> and you don’t. You start at 20.',
    'rules.deck': 'The deck',
    'rules.deckMonsters': '<b class="t-monster">26 monsters</b> — ♣ and ♠. J 11, Q 12, K 13, A 14.',
    'rules.deckWeapons': '<b class="t-weapon">9 weapons</b> — ♦2–♦10.',
    'rules.deckPotions': '<b class="t-potion">9 potions</b> — ♥2–♥10.',
    'rules.each': 'Each room',
    'rules.eachLead': 'Four cards are dealt. Either:',
    'rules.avoid': '<b>Avoid</b> — all four slide under the deck. Never twice in a row.',
    'rules.face': '<b>Face it</b> — resolve any three, in any order. The fourth leads the next room.',
    'rules.cards': 'Cards',
    'rules.cardWeapon': '<b class="t-weapon">♦ Weapon</b> — equips at once with a fresh cap, discarding your old blade and everything stacked on it.',
    'rules.cardPotion': '<b class="t-potion">♥ Potion</b> — heals its value, max 20. <b>Only the first each room works</b>; the rest are poured out.',
    'rules.cardMonster': '<b class="t-monster">♣ ♠ Monster</b> — bare-handed costs its full value. With a weapon, <code>monster − weapon</code> (min 0) — the blade always kills, and the monster stacks on it.',
    'rules.weaponRule': 'The weapon rule',
    'rules.weaponLead': 'A blade dulls: after a kill it may only fight monsters <b>of that value or lower</b>.',
    'rules.exLead': 'Equip <span class="chip">♦7</span>, then:',
    'rules.ex1': '<span class="chip">♠10</span> → take <b>3</b>, cap becomes <b>10</b>',
    'rules.ex2': '<span class="chip">♣10</span> → allowed, 10 ≤ 10. Take <b>3</b>',
    'rules.ex3': '<span class="chip">♣4</span> → take <b>0</b>, but the cap drops to <b>4</b>',
    'rules.ex4': '<span class="chip">♠9</span> → refused. Bare-hand it, or leave it for the next room.',
    'rules.score': 'Score',
    'rules.scoreWon': '<b>Survived</b> — the health you kept.',
    'rules.scoreLost': '<b>Died</b> — minus every monster still down there, the one that killed you included.',
    'rules.keyboard': 'Keyboard',
    'rules.k1': '<kbd>1</kbd>–<kbd>4</kbd> pick a card · <kbd>←</kbd> <kbd>→</kbd> move between them',
    'rules.k2': '<kbd>A</kbd> avoid the room',
    'rules.k3': '<kbd>N</kbd> new game · <kbd>R</kbd> restart the same dungeon',
    'rules.k4': '<kbd>S</kbd> settings · <kbd>T</kbd> your record',
    'rules.k5': '<kbd>?</kbd> these rules · <kbd>Esc</kbd> close / cancel',

    // Debug
    'dbg.title': 'Debug',
    'dbg.seed': 'Seed',
    'dbg.deal': 'Deal',
    'dbg.peek': 'Peek at the deck',
    'dbg.hide': 'Hide the deck',
    'dbg.note': 'Toggle with <kbd>`</kbd> or <code>?debug=1</code>',
  };

  /* ================================================================== *
   * French
   * ================================================================== */

  const fr = {
    'app.title': 'Scoundrel',
    'app.tagline': 'Un donjon de 44 cartes',
    'app.skip': 'Aller à la salle',
    'app.status': 'État',

    'hud.health': 'Vie',
    'hud.weapon': 'Arme',
    'hud.room': 'Salle',
    'hud.deck': 'Pioche',
    'hud.discard': 'Défausse',
    'hud.bareHands': 'Mains nues',
    'hud.avoid': 'Éviter la salle',
    'hud.avoidHint': `Glisse les quatre cartes sous la pioche. Impossible d${'’'}éviter deux salles de suite.`,
    'hud.avoidTitle': 'Glisser les quatre cartes sous la pioche',
    'hud.seed': 'Graine',
    'hud.weaponFresh': 'intacte',
    'hud.weaponCap': 'max {n}',
    'hud.weaponStackTitle': 'Monstres abattus avec cette lame',
    'hud.healthOf': '{n} points de vie sur {max}',

    'avoid.over': 'La partie est terminée',
    'avoid.twice': `Impossible d${'’'}éviter deux salles de suite`,
    'avoid.touched': 'Trop tard — vous avez déjà joué une carte',
    'avoid.short': 'Il ne reste pas assez de cartes pour éviter',

    'room.heading': 'La salle',
    'room.cards': 'Cartes de la salle',
    'room.hintDefault': 'Résolvez trois des quatre cartes.',
    'room.won': 'Le donjon est vide. Vous vous en sortez.',
    'room.lost': 'Vous êtes tombé ici.',
    'room.choosing': `Arme ou mains nues${NB}?`,
    'room.lastOne': 'Une seule carte vous sépare de la sortie.',
    'room.lastFew': '{n} dernières cartes. Jouez-les toutes.',
    'room.dealing': 'Distribution de la salle suivante…',
    'room.toGo.one': 'Résolvez encore {n} carte. Celle que vous laissez vous suivra.',
    'room.toGo.other': 'Résolvez encore {n} cartes. Celle que vous laissez vous suivra.',
    'room.label': 'Salle {turn}. {open} face visible, {done} sur {need} résolues.',
    'room.labelOver': 'Salle {turn}. La partie est terminée.',
    'room.openCards.one': '{n} carte',
    'room.openCards.other': '{n} cartes',

    'card.weapon': '{card}. Arme, force {n}. Appuyez pour équiper.',
    'card.potion': '{card}. Potion, soigne {n}. Appuyez pour boire.',
    'card.potionWasted': `{card}. Potion de {n}, mais vous avez déjà bu dans cette salle — elle sera perdue.`,
    'card.monsterChoice': `{card}. Monstre, force {n}. Appuyez pour choisir${NB}: arme pour {armed} dégâts, ou mains nues pour {bare}.`,
    'card.monsterBare': '{card}. Monstre, force {n}. Appuyez pour combattre à mains nues et subir {bare} dégâts.',
    'card.resolved': '{card}. Résolue.',
    'card.spoken': '{rank} de {suit}',
    'rank.11': 'Valet', 'rank.12': 'Dame', 'rank.13': 'Roi', 'rank.14': 'As',
    'suit.clubs': 'Trèfle', 'suit.spades': 'Pique',
    'suit.diamonds': 'Carreau', 'suit.hearts': 'Cœur',
    'card.strength': 'force {n}',
    'card.heals': 'soigne {n}',
    'card.wasted': ' · perdue',
    'card.threatLabel': `Dégâts si vous la prenez maintenant${NB}: `,
    'card.weaponAria': 'Arme : {card}, force {n}. ',
    'card.weaponAriaFresh': `Jamais utilisée, elle peut affronter n${'’'}importe quoi.`,
    'card.weaponAriaCap': 'Elle ne peut affronter que des monstres de valeur {cap} ou moins.',
    'card.weaponAriaSlain': ' {n} abattus.',
    'card.noWeaponAria': 'Aucune arme équipée. Vous combattez à mains nues.',

    'engage.title': 'Affronter {card}',
    'engage.useWeapon': 'Utiliser {card}',
    'engage.bare': 'Mains nues',
    'engage.cancel': 'Annuler',

    'log.heading': 'Chronique',
    'log.start': 'Vous entrez dans le donjon. 44 cartes, graine {seed}.',
    'log.ruleset': `Règles${NB}: {name}.`,
    'log.roomFresh': 'Salle {turn}. Quatre cartes face visible.',
    'log.roomCarried': 'Salle {turn}. {card} vous a suivi.',
    'log.avoided': 'Salle évitée — {cards} glissent sous la pioche.',
    'log.dropped': 'Vous abandonnez {card} et ses {n} trophées.',
    'log.equipped': 'Équipé {card} — {name}.',
    'log.poured': `Vous videz {card} — une seule potion par salle.`,
    'log.drank': 'Vous buvez {card} — {n} points de vie récupérés.',
    'log.drankSpill': 'Vous buvez {card} — {n} récupérés, le reste déborde (plafond à {max}).',
    'log.bare': 'Vous affrontez {card} à mains nues — {n} dégâts subis.',
    'log.killClean': '{weapon} abat {card} sans une égratignure. Lame plafonnée à {cap}.',
    'log.killBloody': '{weapon} tue {card} — {n} dégâts subis. Lame plafonnée à {cap}.',
    'log.win': 'Le donjon est vide. Vous sortez avec {n} points de vie. Score {score}.',
    'log.lose': `{card} vous achève. Score {score}.`,
    'log.loseDark': 'Le donjon vous achève. Score {score}.',

    'coach.prefix': `Astuce${NB}: `,
    'coach.bare': `sans arme, vous encaissez toute la valeur du monstre. Une carte ♦ s${'’'}équipe immédiatement.`,
    'coach.equipped': `votre lame affronte tout jusqu${'’'}à sa première victime. Ensuite elle est plafonnée par ce qu${'’'}elle a tué, et le plafond ne fait que descendre — dépensez-le sur du gros.`,
    'coach.capped': 'la lame est désormais plafonnée à {cap}. Tout ce qui dépasse devra être affronté à mains nues, ou laissé pour la salle suivante.',
    'coach.potion': `une seule potion agit par salle. Un second ♥ vaut mieux laissé comme carte de report.`,
    'coach.avoid': `Éviter glisse les quatre cartes sous la pioche — cela gagne du temps, cela ne les supprime pas. Impossible d${'’'}éviter deux fois de suite.`,

    'ctl.newGame': 'Nouvelle partie',
    'ctl.restart': 'Recommencer le donjon',
    'ctl.rules': 'Règles',
    'ctl.record': 'Palmarès',
    'ctl.settings': 'Réglages',

    'end.wonEyebrow': 'Vous êtes sorti',
    'end.lostEyebrow': `Vous n${'’'}êtes pas sorti`,
    'end.wonTitle': 'Donjon vidé',
    'end.lostTitle': 'Tué par {name}',
    'end.lostTitleDark': `Tué par l${'’'}obscurité`,
    'end.wonDetail': 'Vous terminez avec {n} points de vie sur {max} après {turns} salles. Votre score est la vie qu’il vous reste.',
    'end.lostDetail': `Il restait {n} points de monstre là-dessous après {turns} salles — ce total, en négatif, est votre score.`,
    'end.killerCaption': 'a porté le coup fatal',
    'end.newGame': 'Nouveau donjon',
    'end.retry': 'Rejouer celui-ci',
    'end.close': 'Regarder la table',
    'end.score': 'Score',

    'welcome.eyebrow': 'Un jeu de cartes solo',
    'welcome.title': 'Bienvenue dans le donjon',
    'welcome.lead': `Trois choses et vous pouvez jouer${NB}:`,
    'welcome.s1': '<b>Quatre cartes, choisissez-en trois.</b> Celle que vous laissez vous suit dans la salle suivante.',
    'welcome.s2': '<b>♦ est votre arme, ♥ soigne, ♣ ♠ blessent.</b> Chaque monstre affiche ce qu’il va vous coûter avant que vous y touchiez.',
    'welcome.s3': '<b>Votre lame s’émousse.</b> Après une victime, elle ne peut plus affronter que cette taille ou moins — ne gaspillez pas une grosse arme sur un petit monstre.',
    'welcome.note': 'Vous commencez à 20 points de vie. Videz les 44 cartes pour gagner.',
    'welcome.start': 'Commencer à jouer',
    'welcome.rules': 'Règles complètes',

    'set.title': 'Réglages',
    'set.close': 'Fermer les réglages',
    'set.language': 'Langue',
    'set.languageHint': 'Prend effet immédiatement, y compris sur la chronique déjà écrite.',
    'set.ruleset': 'Règles',
    'set.rulesetHint': 'Pour la prochaine partie. Une partie en cours garde les règles avec lesquelles elle a été distribuée.',
    'set.motion': 'Animations',
    'set.motionHint': '« Système » suit le réglage de mouvement réduit de votre système.',
    'set.motionSystem': 'Système',
    'set.motionSystemBlurb': 'Suivre le réglage de mouvement réduit du système.',
    'set.motionReduced': 'Réduites',
    'set.motionReducedBlurb': `Pas de retournement, pas de secousse, pas de décalage.`,
    'set.motionFull': 'Complètes',
    'set.motionFullBlurb': 'Toujours animer, quoi que dise le système.',
    'set.feel': 'Ambiance',
    'set.sound': 'Son',
    'set.soundBlurb': `Sons de synthèse pour les coups, les mises à mort et les potions. Aucun fichier audio.`,
    'set.particles': 'Particules',
    'set.particlesBlurb': 'Étincelles et poussières. Le mouvement réduit les désactive de toute façon.',
    'set.help': 'Aide',
    'set.threat': 'Aperçu des dégâts',
    'set.threatBlurb': 'Afficher ce que chaque monstre coûtera avant de le jouer',
    'set.coach': `Notes d${'’'}apprentissage`,
    'set.coachBlurb': 'Astuces ponctuelles dans la chronique, la première fois que cela compte',
    'set.seed': 'Distribuer un donjon précis',
    'set.seedHint': `Une graine est un texte quelconque. La même graine donne toujours les mêmes 44 cartes.`,
    'set.seedPlaceholder': 'par ex. gobelin',
    'set.seedGo': 'Distribuer',
    'set.reset': 'Réinitialiser les réglages',

    'rec.title': 'Votre palmarès',
    'rec.close': 'Fermer le palmarès',
    'rec.runs': 'Parties',
    'rec.won': 'Gagnées',
    'rec.winRate': 'Taux de victoire',
    'rec.best': 'Meilleur score',
    'rec.streak': 'Série',
    'rec.longest': 'Plus longue série',
    'rec.bestRuns': 'Meilleures parties',
    'rec.bestRunsHint': `Votre propre top dix, conservé dans ce navigateur. Un classement partagé et fiable exigerait un serveur, et ce jeu n${'’'}en a délibérément aucun.`,
    'rec.recent': 'Parties récentes',
    'rec.trophies': 'Trophées',
    'rec.trophyCount': '{n} sur {total}',
    'rec.emptyBoard': 'Aucune partie terminée. Vos dix meilleures apparaîtront ici.',
    'rec.emptyHistory': 'Rien de joué pour le moment.',
    'rec.cleared': 'Vidé',
    'rec.fell': 'Tombé salle {n}',
    'rec.replay': 'Rejouer',
    'rec.replayAria': ' le donjon de la graine {seed}',
    'rec.clear': 'Effacer le palmarès',
    'rec.clearConfirm': `Effacer palmarès et trophées${NB}?`,
    'rec.unlocked': 'Débloqué',
    'rec.locked': 'Verrouillé',
    'rec.rowMeta': '{preset} · graine {seed} · {when}',

    'when.now': `à l${'’'}instant`,
    'when.min': 'il y a {n} min',
    'when.hour': 'il y a {n} h',
    'when.yesterday': 'hier',
    'when.days': 'il y a {n} j',

    'rules.title': 'Comment jouer à Scoundrel',
    'rules.close': 'Fermer les règles',
    'rules.lead': `Videz les 44 cartes et vous sortez. Tombez à <strong>0 point de vie</strong> et c${'’'}est fini. Vous commencez à 20.`,
    'rules.deck': 'Le jeu',
    'rules.deckMonsters': '<b class="t-monster">26 monstres</b> — ♣ et ♠. V 11, D 12, R 13, As 14.',
    'rules.deckWeapons': '<b class="t-weapon">9 armes</b> — ♦2 à ♦10.',
    'rules.deckPotions': '<b class="t-potion">9 potions</b> — ♥2 à ♥10.',
    'rules.each': 'Chaque salle',
    'rules.eachLead': 'Quatre cartes sont distribuées. Au choix :',
    'rules.avoid': '<b>Éviter</b> — les quatre glissent sous la pioche. Jamais deux fois de suite.',
    'rules.face': '<b>Affronter</b> — résolvez-en trois, dans l’ordre que vous voulez. La quatrième ouvre la salle suivante.',
    'rules.cards': 'Les cartes',
    'rules.cardWeapon': '<b class="t-weapon">♦ Arme</b> — s’équipe aussitôt, plafond remis à neuf, en défaussant votre ancienne lame et tout ce qui s’y est empilé.',
    'rules.cardPotion': '<b class="t-potion">♥ Potion</b> — soigne sa valeur, 20 au maximum. <b>Seule la première de chaque salle agit</b> ; les autres sont vidées.',
    'rules.cardMonster': '<b class="t-monster">♣ ♠ Monstre</b> — à mains nues, il coûte toute sa valeur. Avec une arme, <code>monstre − arme</code> (minimum 0) — la lame tue toujours, et le monstre s’empile dessus.',
    'rules.weaponRule': 'La règle de l’arme',
    'rules.weaponLead': 'Une lame s’émousse : après une victime, elle ne peut affronter que des monstres <b>de cette valeur ou moins</b>.',
    'rules.exLead': 'Équipez <span class="chip">♦7</span>, puis :',
    'rules.ex1': '<span class="chip">♠10</span> → vous subissez <b>3</b>, plafond à <b>10</b>',
    'rules.ex2': '<span class="chip">♣10</span> → autorisé, 10 ≤ 10. Vous subissez <b>3</b>',
    'rules.ex3': '<span class="chip">♣4</span> → <b>0</b> dégât, mais le plafond tombe à <b>4</b>',
    'rules.ex4': '<span class="chip">♠9</span> → refusé. À mains nues, ou laissez-le pour la salle suivante.',
    'rules.score': 'Score',
    'rules.scoreWon': '<b>Survécu</b> — les points de vie qu’il vous reste.',
    'rules.scoreLost': '<b>Mort</b> — moins la valeur de tous les monstres restants, y compris celui qui vous a tué.',
    'rules.keyboard': 'Clavier',
    'rules.k1': '<kbd>1</kbd>–<kbd>4</kbd> choisir une carte · <kbd>←</kbd> <kbd>→</kbd> se déplacer',
    'rules.k2': '<kbd>A</kbd> éviter la salle',
    'rules.k3': '<kbd>N</kbd> nouvelle partie · <kbd>R</kbd> recommencer le même donjon',
    'rules.k4': '<kbd>S</kbd> réglages · <kbd>T</kbd> palmarès',
    'rules.k5': '<kbd>?</kbd> ces règles · <kbd>Esc</kbd> fermer / annuler',

    'dbg.title': 'Débogage',
    'dbg.seed': 'Graine',
    'dbg.deal': 'Distribuer',
    'dbg.peek': 'Voir la pioche',
    'dbg.hide': 'Masquer la pioche',
    'dbg.note': 'Bascule avec <kbd>`</kbd> ou <code>?debug=1</code>',
  };

  /* ================================================================== *
   * Game data — French only, keyed by id (see td()).
   * ================================================================== */

  const frData = {
    // Rulesets
    'preset.standard': 'Standard',
    'preset.standard.blurb': 'Une lame peut affronter un monstre de la valeur de sa dernière victime ou moins.',
    'preset.classic': 'Classique',
    'preset.classic.blurb': `Règles imprimées${NB}: la lame ne peut affronter que strictement plus petit. Plus difficile.`,
    'preset.relaxed': 'Souple',
    'preset.relaxed.blurb': `La lame ne s${'’'}émousse que sur une mise à mort nette, donc une bonne arme dure. Plus facile.`,

    // Clubs — wolf, wraith, skeleton
    'card.C2': 'Loup affamé',
    'card.C3': 'Chien des landes',
    'card.C4': 'Rôdeur gris',
    'card.C5': 'Loup géant',
    'card.C6': 'Lévrier noir',
    'card.C7': 'Ombre blême',
    'card.C8': 'Le Voilé',
    'card.C9': 'Pleureur creux',
    'card.C10': 'Le Linceul',
    'card.C11': `Sentinelle d${'’'}os`,
    'card.C12': 'Spectre du tertre',
    'card.C13': 'Seigneur des os',
    'card.C14': 'Le Roi Ossuaire',

    // Spades — goblin, knight, dragon
    'card.S2': 'Gobelin des caniveaux',
    'card.S3': 'Rampant nocturne',
    'card.S4': 'Diablotin des cavernes',
    'card.S5': 'Gobelin égorgeur',
    'card.S6': 'Hobgobelin',
    'card.S7': 'Sentinelle de fer',
    'card.S8': 'Chevalier des tombes',
    'card.S9': 'Gardien noir',
    'card.S10': 'Revenant de fer',
    'card.S11': 'Drake de cendre',
    'card.S12': 'Guivre de braise',
    'card.S13': 'Guivre ancienne',
    'card.S14': 'Guivre des cendres',

    // Diamonds — crossbow, axe, sword
    'card.D2': 'Arbalète légère',
    'card.D3': 'Arbalète de chasse',
    'card.D4': 'Arbalète de siège',
    'card.D5': 'Hachette',
    'card.D6': 'Hache barbue',
    'card.D7': 'Hache de guerre',
    'card.D8': 'Épée de chevalier',
    'card.D9': 'Lame du faucon',
    'card.D10': `Espadon de l${'’'}aigle`,

    // Hearts — flask
    'card.H2': 'Gorgée de pluie',
    'card.H3': 'Tonique amer',
    'card.H4': 'Baume de campagne',
    'card.H5': 'Fiole de guérison',
    'card.H6': 'Breuvage rouge',
    'card.H7': 'Flasque du clerc',
    'card.H8': `Élixir d${'’'}os`,
    'card.H9': `Philtre d${'’'}ambre`,
    'card.H10': `Breuvage de l${'’'}aube`,

    // Achievements
    'ach.first-blood.title': 'Premier sang',
    'ach.first-blood.desc': `Terminez votre première partie, quelle qu${'’'}en soit l${'’'}issue.`,
    'ach.out-alive.title': 'Sorti vivant',
    'ach.out-alive.desc': 'Videz le donjon.',
    'ach.unscathed.title': 'Indemne',
    'ach.unscathed.desc': 'Gagnez avec vos 20 points de vie.',
    'ach.by-a-thread.title': 'À un cheveu',
    'ach.by-a-thread.desc': 'Gagnez avec exactement 1 point de vie.',
    'ach.no-flight.title': 'Nulle part où fuir',
    'ach.no-flight.desc': 'Videz le donjon sans éviter une seule salle.',
    'ach.bare-knuckle.title': 'À mains nues',
    'ach.bare-knuckle.desc': 'Tuez une figure à mains nues et survivez.',
    'ach.butcher.title': 'Le Boucher',
    'ach.butcher.desc': 'Abattez cinq monstres avec la même lame.',
    'ach.surgeon.title': 'Chirurgien',
    'ach.surgeon.desc': 'Abattez un monstre à l’arme sans subir le moindre dégât.',
    'ach.giant-killer.title': 'Tueur de géants',
    'ach.giant-killer.desc': 'Tuez un as (14) avec une arme.',
    'ach.teetotal.title': 'Sobre',
    'ach.teetotal.desc': 'Gagnez sans boire une seule potion.',
    'ach.purist.title': 'Puriste',
    'ach.purist.desc': 'Gagnez une partie avec les règles Classiques.',
    'ach.streak-3.title': 'En série',
    'ach.streak-3.desc': `Gagnez trois parties d${'’'}affilée.`,
    'ach.veteran.title': 'Vétéran',
    'ach.veteran.desc': 'Terminez vingt-cinq parties.',
    'ach.cartographer.title': 'Cartographe',
    'ach.cartographer.desc': 'Atteignez la salle 15 en une seule partie.',
    'ach.hoarder.title': 'Quel gâchis',
    'ach.hoarder.desc': `Videz trois potions dans une même partie. Il fallait bien que quelqu${'’'}un le fasse.`,
  };

  const TABLES = { en, fr };

  /* ================================================================== *
   * Lookup
   * ================================================================== */

  const KEY = 'scoundrel:lang:v1';
  let lang = 'en';
  const listeners = new Set();

  /** First supported language the browser asks for, else English. */
  function detect() {
    const wanted = (navigator.languages && navigator.languages.length)
      ? navigator.languages
      : [navigator.language || 'en'];
    for (const tag of wanted) {
      const base = String(tag).toLowerCase().split('-')[0];
      if (TABLES[base]) return base;
    }
    return 'en';
  }

  function fill(text, params) {
    if (!params) return text;
    return text.replace(/\{(\w+)\}/g, (whole, name) => (
      Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : whole
    ));
  }

  /**
   * Translate a UI key.
   * @param {string} key
   * @param {object} [params] `{n}` placeholders; `n` also selects the plural
   */
  function t(key, params) {
    const table = TABLES[lang] || en;
    let entry = table[key];

    // Plurals: French counts 0 and 1 as singular, English only 1.
    if (entry === undefined && params && typeof params.n === 'number') {
      const singular = lang === 'fr' ? Math.abs(params.n) < 2 : Math.abs(params.n) === 1;
      const form = singular ? `${key}.one` : `${key}.other`;
      entry = table[form] !== undefined ? table[form] : en[form];
    }
    if (entry === undefined) entry = en[key];
    if (entry === undefined) return key;
    return fill(entry, params);
  }

  /**
   * Translate game data that keeps its English next to the thing it describes.
   * @param {string} key e.g. 'card.S14'
   * @param {string} english the text to use when there is no translation
   */
  function td(key, english, params) {
    if (lang !== 'en') {
      const entry = frData[key];
      if (entry !== undefined) return fill(entry, params);
    }
    return fill(english, params);
  }

  /* ================================================================== *
   * Applying to static HTML
   * ================================================================== */

  function apply(root = document) {
    root.querySelectorAll('[data-i18n]').forEach((node) => {
      node.textContent = t(node.dataset.i18n);
    });
    root.querySelectorAll('[data-i18n-html]').forEach((node) => {
      node.innerHTML = t(node.dataset.i18nHtml);
    });
    root.querySelectorAll('[data-i18n-attr]').forEach((node) => {
      for (const pair of node.dataset.i18nAttr.split(';')) {
        const [attr, key] = pair.split(':');
        if (attr && key) node.setAttribute(attr.trim(), t(key.trim()));
      }
    });
    document.documentElement.lang = lang;
  }

  function setLang(next) {
    if (!TABLES[next] || next === lang) return false;
    lang = next;
    try {
      window.localStorage.setItem(KEY, lang);
    } catch { /* a language that does not persist still works this session */ }
    apply();
    for (const fn of listeners) fn(lang);
    return true;
  }

  function onChange(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }

  const getLang = () => lang;
  const locale = () => (LANGS[lang] || LANGS.en).locale;

  // Saved choice wins; otherwise take the browser's.
  try {
    const saved = window.localStorage.getItem(KEY);
    lang = TABLES[saved] ? saved : detect();
  } catch {
    lang = detect();
  }

  window.ScoundrelI18n = Object.freeze({
    LANGS, t, td, apply, setLang, getLang, onChange, locale, detect,
  });
})();
