/*
 * Scoundrel: engine tests.
 *
 *   node tests/engine.test.js          quick run
 *   node tests/engine.test.js --full   adds the beam-search winnability check
 *
 * The browser modules are plain IIFEs that attach to `window`, so the harness
 * builds a fake window, evaluates them into it, and tests the real code — no
 * build step, no test framework, no dependencies.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');

/* An in-memory LocalStorage, so prefs and stats are exercised for real rather
 * than silently falling back to their defaults. */
function makeStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    clear: () => map.clear(),
  };
}

const sandbox = { console, Math, Date, JSON };
sandbox.window = sandbox;
sandbox.localStorage = makeStorage();
vm.createContext(sandbox);
for (const file of ['js/config.js', 'js/prefs.js', 'js/stats.js', 'js/rng.js', 'js/engine.js']) {
  vm.runInContext(fs.readFileSync(path.join(ROOT, file), 'utf8'), sandbox, { filename: file });
}

const C = sandbox.ScoundrelConfig;
const RNG = sandbox.ScoundrelRng;
const E = sandbox.ScoundrelEngine;
const Prefs = sandbox.ScoundrelPrefs;
const Stats = sandbox.ScoundrelStats;

let passed = 0;
let failed = 0;

function check(name, condition, detail) {
  if (condition) {
    passed += 1;
    console.log(`  ok   ${name}`);
  } else {
    failed += 1;
    console.error(`  FAIL ${name}${detail === undefined ? '' : ` — ${JSON.stringify(detail)}`}`);
  }
}

const group = (name) => console.log(`\n${name}`);
const pending = (s) => s.room.filter((slot) => !slot.done);
const clone = (s) => JSON.parse(JSON.stringify(s));

/* ===================================================================== *
 * Deck
 * ===================================================================== */

group('Deck');
{
  const deck = C.buildDeck();
  const kinds = deck.reduce((acc, c) => ({ ...acc, [c.kind]: (acc[c.kind] || 0) + 1 }), {});
  check('44 cards', deck.length === 44, deck.length);
  check('26 monsters, 9 weapons, 9 potions',
    kinds.monster === 26 && kinds.weapon === 9 && kinds.potion === 9, kinds);
  check('no duplicates', new Set(deck.map((c) => c.id)).size === 44);
  check('no red face cards or red aces',
    !deck.some((c) => (c.suit === '♥' || c.suit === '♦') && c.rank > 10));
  check('ace is 14, king 13', deck.some((c) => c.label === 'A' && c.rank === 14)
    && deck.some((c) => c.label === 'K' && c.rank === 13));
  check('every card has a name', deck.every((c) => typeof c.name === 'string' && c.name.length));
}

/* ===================================================================== *
 * Shuffle
 * ===================================================================== */

group('Shuffle');
{
  check('same seed deals the same dungeon',
    JSON.stringify(E.create('goblin').deck) === JSON.stringify(E.create('goblin').deck));
  check('different seeds differ',
    JSON.stringify(E.create('goblin').deck) !== JSON.stringify(E.create('wyrm').deck));

  // Mean landing position of each card over many shuffles should sit on 21.5.
  // Note: measure RNG.shuffle directly — create() immediately deals the opening
  // room, which would leave four cards out of the tally and skew the result.
  const deck = C.buildDeck();
  const N = 20000;
  const totals = new Map(deck.map((c) => [c.id, 0]));
  for (let i = 0; i < N; i += 1) {
    RNG.shuffle(deck, RNG.make(`shuffle-${i}`))
      .forEach((c, idx) => totals.set(c.id, totals.get(c.id) + idx));
  }
  const means = [...totals.values()].map((v) => v / N);
  const lo = Math.min(...means);
  const hi = Math.max(...means);
  check('unbiased (every card averages ~21.5 of 43)', lo > 21.1 && hi < 21.9,
    { lo: +lo.toFixed(2), hi: +hi.toFixed(2) });
}

/* ===================================================================== *
 * Rules
 * ===================================================================== */

group('The weapon rule (worked example from the rules modal)');
{
  const s = E.create('example');
  s.weapon = { card: C.makeCard('♦', 7), lastSlain: null, stack: [] };

  const fight = (suit, rank) => {
    // Keep cards in the deck: resolving the last card of an empty dungeon would
    // end the run and freeze the state.
    s.deck = [2, 3, 4, 5].map((r) => C.makeCard('♥', r));
    s.room = [{ card: C.makeCard(suit, rank), done: false, dealtOn: s.turn }];
    s.resolved = 0;
    const before = s.health;
    const allowed = E.canUseWeapon(s, s.room[0].card);
    E.resolve(s, 0, 'weapon');
    return { allowed, took: before - s.health, cap: s.weapon.lastSlain };
  };

  const a = fight('♠', 10);
  check('♦7 vs ♠10 → 3 damage, cap 10', a.allowed && a.took === 3 && a.cap === 10, a);
  const b = fight('♣', 10);
  check('♦7 vs ♣10 → allowed at equal value (non-increasing), 3 damage',
    b.allowed && b.took === 3 && b.cap === 10, b);
  const c = fight('♣', 4);
  check('♦7 vs ♣4 → clean kill, 0 damage, cap drops to 4',
    c.allowed && c.took === 0 && c.cap === 4, c);
  const nine = C.makeCard('♠', 9);
  check('♦7 refuses ♠9 once capped at 4', E.canUseWeapon(s, nine) === false);
  check('a refused weapon falls back to full bare-handed damage',
    E.previewDamage(s, nine, 'weapon') === 9);
}

group('Equipping');
{
  const s = E.create('equip');
  s.weapon = { card: C.makeCard('♦', 5), lastSlain: 6, stack: [C.makeCard('♠', 6)] };
  s.deck = [C.makeCard('♥', 2)];
  s.room = [{ card: C.makeCard('♦', 9), done: false, dealtOn: s.turn }];
  s.resolved = 0;
  const discardBefore = s.discard.length;
  E.resolve(s, 0);
  check('new weapon equipped', s.weapon.card.rank === 9);
  check('history reset', s.weapon.lastSlain === null && s.weapon.stack.length === 0);
  check('old blade and its trophies discarded', s.discard.length === discardBefore + 2);
}

group('Potions');
{
  const s = E.create('potion');
  s.health = 10;
  s.deck = [C.makeCard('♣', 2), C.makeCard('♣', 3), C.makeCard('♣', 4)];
  s.room = [
    { card: C.makeCard('♥', 5), done: false, dealtOn: s.turn },
    { card: C.makeCard('♥', 6), done: false, dealtOn: s.turn },
  ];
  s.resolved = 0;
  E.resolve(s, 0);
  check('first potion heals', s.health === 15, s.health);
  E.resolve(s, 1);
  check('second potion in the same room is wasted', s.health === 15, s.health);

  const cap = E.create('cap');
  cap.health = 18;
  cap.deck = [C.makeCard('♣', 2)];
  cap.room = [{ card: C.makeCard('♥', 9), done: false, dealtOn: cap.turn }];
  cap.resolved = 0;
  E.resolve(cap, 0);
  check('healing is capped at 20', cap.health === 20, cap.health);
}

group('Rooms');
{
  const s = E.create('carry');
  const fourth = s.room[3].card.id;
  E.resolve(s, 0, 'bare'); E.resolve(s, 1, 'bare'); E.resolve(s, 2, 'bare');
  if (s.status === 'playing') {
    check('the unplayed 4th card leads the next room', s.room[0].card.id === fourth);
    check('room counter advanced', s.turn === 2, s.turn);
    check('room refilled to four', pending(s).length === 4, pending(s).length);
  } else {
    check('carry-forward (run ended early on this seed — skipped)', true);
  }
}
{
  const s = E.create('avoiding');
  const room = s.room.map((x) => x.card.id);
  const deckLength = s.deck.length;
  check('avoid is offered on a full untouched room', E.canAvoid(s) === true);
  E.avoid(s);
  check('the room goes under the deck in order',
    JSON.stringify(s.deck.slice(-4).map((c) => c.id)) === JSON.stringify(room));
  check('deck length unchanged after the refill', s.deck.length === deckLength);
  check('you cannot avoid twice in a row', E.canAvoid(s) === false);
  E.resolve(s, 0, 'bare');
  check('facing a room re-arms avoid for the next one', s.avoidedLast === false);

  const touched = E.create('touched');
  E.resolve(touched, 0, 'bare');
  check('avoid is refused once you have played a card', E.canAvoid(touched) === false);
}

group('Endings');
{
  const s = E.create('endgame');
  s.health = 15;
  s.deck = [C.makeCard('♥', 2)];
  s.room = [{ card: C.makeCard('♥', 3), done: false, dealtOn: s.turn }];
  s.resolved = 0;
  E.resolve(s, 0);
  check('a short final room is dealt rather than ending the run',
    s.status === 'playing' && pending(s).length === 1, s.status);
  E.resolve(s, 0);
  check('clearing the last card wins', s.status === 'won', s.status);
  check('win score is the health you kept', s.score === s.health, { score: s.score, health: s.health });
}
{
  const s = E.create('death');
  s.health = 3;
  s.deck = [C.makeCard('♣', 5)];
  s.room = [{ card: C.makeCard('♠', 14), done: false, dealtOn: s.turn }];
  s.resolved = 0;
  E.resolve(s, 0, 'bare');
  check('lethal damage ends the run', s.status === 'lost');
  check('health floors at 0', s.health === 0, s.health);
  check('loss score negates the monsters left, killer included', s.score === -(5 + 14), s.score);
}

/* ===================================================================== *
 * Rulesets
 * ===================================================================== */

group('Rulesets');
{
  const armed = (presetId, rank, cap) => {
    const s = E.create('ruleset', presetId);
    s.weapon = { card: C.makeCard('♦', 5), lastSlain: cap, stack: [] };
    return E.canUseWeapon(s, C.makeCard('♠', rank));
  };
  check('standard allows an equal-value monster', armed('standard', 10, 10) === true);
  check('classic refuses an equal-value monster', armed('classic', 10, 10) === false);
  check('classic allows a smaller one', armed('classic', 9, 10) === true);

  /* A bloody win: relaxed leaves the cap alone, standard drops it. */
  const swing = (presetId) => {
    const s = E.create(`swing-${presetId}`, presetId);
    s.weapon = { card: C.makeCard('♦', 5), lastSlain: null, stack: [] };
    s.deck = [C.makeCard('♥', 2)];
    s.room = [{ card: C.makeCard('♠', 12), done: false, dealtOn: s.turn }];
    s.resolved = 0;
    E.resolve(s, 0, 'weapon');
    return s.weapon;
  };
  const relaxed = swing('relaxed');
  check('relaxed: a bloody win neither stacks nor lowers the cap',
    relaxed.lastSlain === null && relaxed.stack.length === 0,
    { cap: relaxed.lastSlain, stack: relaxed.stack.length });
  const standard = swing('standard');
  check('standard: a bloody win stacks and caps the blade',
    standard.lastSlain === 12 && standard.stack.length === 1,
    { cap: standard.lastSlain, stack: standard.stack.length });

  check('an unknown preset falls back to the default',
    E.create('x', 'nonsense').preset === C.DEFAULT_PRESET);

  /* The ruleset belongs to the run, not to whatever the setting says now. */
  const run = E.create('frozen', 'classic');
  const roundTripped = JSON.parse(JSON.stringify(run));
  Prefs.set('preset', 'relaxed');
  check('a run keeps its own ruleset after the setting changes',
    E.rulesOf(run).weaponStrictlyDecreasing === true);
  check('rules survive a save/load round trip',
    E.rulesOf(roundTripped).weaponStrictlyDecreasing === true);
  check('replay keeps the ruleset', E.replay(run).preset === 'classic');
  Prefs.set('preset', C.DEFAULT_PRESET);

  /* Saves written before rulesets existed. */
  const legacy = E.create('legacy');
  delete legacy.rules;
  delete legacy.preset;
  check('a save with no ruleset falls back to the module defaults',
    E.rulesOf(legacy).weaponStrictlyDecreasing === C.WEAPON_STRICTLY_DECREASING);
}

/* ===================================================================== *
 * Preferences
 * ===================================================================== */

group('Preferences');
{
  Prefs.reset();
  check('defaults are served before anything is set',
    Prefs.get('preset') === C.DEFAULT_PRESET && Prefs.get('showThreat') === true);
  check('a valid value is accepted',
    Prefs.set('motion', 'reduced') && Prefs.get('motion') === 'reduced');
  check('a value outside the options is rejected',
    Prefs.set('motion', 'sideways') === false && Prefs.get('motion') === 'reduced');
  check('a wrongly typed value is rejected',
    Prefs.set('showThreat', 'yes') === false && Prefs.get('showThreat') === true);
  check('an unknown key is rejected', Prefs.set('nope', 1) === false);

  let fired = 0;
  const off = Prefs.onChange(() => { fired += 1; });
  Prefs.set('coach', false);
  Prefs.set('coach', false);   // same value, so no event
  off();
  Prefs.set('coach', true);    // after unsubscribing
  check('listeners fire once per real change and unsubscribe cleanly', fired === 1, fired);

  Prefs.reset();
  check('reset restores the defaults', Prefs.get('motion') === 'system');
}

/* ===================================================================== *
 * Record
 * ===================================================================== */

group('Record');
{
  Stats.reset();
  const finish = (status, score, seed = 'rec') => ({
    status,
    score,
    seed,
    preset: 'standard',
    turn: 7,
    health: status === 'won' ? score : 0,
    killer: status === 'lost' ? C.makeCard('♠', 14) : null,
  });

  check('an unfinished run is not recorded', Stats.record({ status: 'playing' }) === null);

  Stats.record(finish('won', 12));
  Stats.record(finish('won', 5));
  Stats.record(finish('lost', -30));
  let s = Stats.all();
  check('games, wins and losses counted',
    s.games === 3 && s.wins === 2 && s.losses === 1,
    { games: s.games, wins: s.wins, losses: s.losses });
  check('win rate', Math.round(Stats.winRate()) === 67, Stats.winRate());
  check('best score is the highest across all runs', s.bestScore === 12, s.bestScore);
  check('a loss breaks the streak', s.currentStreak === 0, s.currentStreak);
  check('longest streak is remembered', s.longestStreak === 2, s.longestStreak);

  Stats.record(finish('won', 3));
  s = Stats.all();
  check('the streak resumes after a loss', s.currentStreak === 1 && s.longestStreak === 2);
  check('history is newest first', s.history[0].score === 3 && s.history[3].score === 12);
  check('history keeps the seed for replay', s.history[0].seed === 'rec');

  for (let i = 0; i < C.HISTORY_LIMIT + 10; i += 1) Stats.record(finish('lost', -i, `s${i}`));
  check(`history is capped at ${C.HISTORY_LIMIT}`,
    Stats.all().history.length === C.HISTORY_LIMIT, Stats.all().history.length);

  check('all() hands back a copy, not the live array', (() => {
    const copy = Stats.all();
    copy.history.push('junk');
    return Stats.all().history.length === C.HISTORY_LIMIT;
  })());

  Stats.reset();
  check('reset clears everything',
    Stats.all().games === 0 && Stats.all().history.length === 0);
}

/* ===================================================================== *
 * Fuzzing: invariants over thousands of random games
 * ===================================================================== */

group('Fuzz (4000 random games, cycling all three rulesets)');
{
  let wins = 0;
  let stuck = 0;
  const problems = [];
  const PRESETS = Object.keys(C.PRESETS);

  for (let g = 0; g < 4000 && problems.length === 0; g += 1) {
    const rand = RNG.make(`policy-${g}`);
    const s = E.create(`fuzz-${g}`, PRESETS[g % PRESETS.length]);
    let steps = 0;

    while (s.status === 'playing') {
      if (steps += 1, steps > 600) { stuck += 1; break; }

      if (s.health < 0 || s.health > C.MAX_HEALTH) problems.push(`health ${s.health}`);
      if (pending(s).length > C.ROOM_SIZE) problems.push('room over four');
      if (s.resolved > C.CARDS_TO_RESOLVE) problems.push('resolved over three');
      if (s.resolved === 0 && s.deck.length > 0 && pending(s).length !== C.ROOM_SIZE) {
        problems.push('room under-filled at the head of a room');
      }
      if (s.weapon) {
        const ranks = s.weapon.stack.map((c) => c.rank);
        for (let i = 1; i < ranks.length; i += 1) {
          if (ranks[i] > ranks[i - 1]) problems.push(`weapon stack rose: ${ranks}`);
        }
      }
      // Spent slots stay in `room` by design and their card already sits in the
      // discard or on the weapon, so count only the pending ones.
      const all = [
        ...s.deck,
        ...pending(s).map((x) => x.card),
        ...s.discard,
        ...(s.weapon ? [s.weapon.card, ...s.weapon.stack] : []),
      ].map((c) => c.id);
      if (all.length !== 44) problems.push(`${all.length} cards in play`);
      if (new Set(all).size !== 44) problems.push('a card is in two places at once');
      if (problems.length) break;

      if (E.canAvoid(s) && rand() < 0.2) {
        E.avoid(s);
        if (E.canAvoid(s)) problems.push('two avoids in a row were allowed');
        continue;
      }
      const open = s.room.map((slot, i) => i).filter((i) => !s.room[i].done);
      const pick = open[Math.floor(rand() * open.length)];
      const card = s.room[pick].card;
      const mode = E.canUseWeapon(s, card) && rand() < 0.8 ? 'weapon' : 'bare';
      if (!E.resolve(s, pick, mode)) problems.push('a legal card was refused');
    }

    if (s.status === 'won') {
      wins += 1;
      if (s.score !== s.health) problems.push('win score mismatch');
    } else if (s.status === 'lost' && s.score >= 0) {
      problems.push(`loss score not negative: ${s.score}`);
    }
  }

  check('no invariant broken in 4000 games', problems.length === 0, problems.slice(0, 3));
  check('no game ever got stuck', stuck === 0, stuck);
  console.log(`       (random play won ${wins} of 4000 — Scoundrel punishes it, see --full)`);
}

/* ===================================================================== *
 * Winnability — is the dungeon fair? (slow, opt in with --full)
 * ===================================================================== */

if (process.argv.includes('--full')) {
  group('Winnability (beam search, ~1 min)');

  const successors = (s) => {
    const out = [];
    if (E.canAvoid(s)) { const n = clone(s); E.avoid(n); out.push(n); }
    s.room.forEach((slot, i) => {
      if (slot.done) return;
      const modes = slot.card.kind === 'monster'
        ? (E.canUseWeapon(s, slot.card) ? ['weapon', 'bare'] : ['bare'])
        : [undefined];
      for (const m of modes) { const n = clone(s); if (E.resolve(n, i, m)) out.push(n); }
    });
    return out;
  };

  // Progress through the dungeon dominates; health and a sharp blade break ties.
  const rank = (s) => (44 - s.deck.length - pending(s).length) * 100 + s.health * 10
    + (s.weapon ? s.weapon.card.rank + (s.weapon.lastSlain === null ? 14 : s.weapon.lastSlain) : 0);

  function solve(seed, width) {
    let frontier = [E.create(seed)];
    let best = null;
    for (let step = 0; step < 400 && frontier.length; step += 1) {
      const next = [];
      for (const st of frontier) {
        for (const n of successors(st)) {
          if (n.status === 'won') return n;
          if (n.status === 'lost') { if (!best || n.score > best.score) best = n; continue; }
          next.push(n);
        }
      }
      if (!next.length) break;
      next.sort((a, b) => rank(b) - rank(a));
      const seen = new Set();
      frontier = [];
      for (const n of next) {
        const key = `${n.deck.length}|${n.health}|${n.weapon ? `${n.weapon.card.rank}:${n.weapon.lastSlain}` : '-'}`
          + `|${pending(n).map((x) => x.card.id).join(',')}`;
        if (seen.has(key)) continue;
        seen.add(key);
        frontier.push(n);
        if (frontier.length >= width) break;
      }
    }
    return best;
  }

  const DEALS = 25;
  let solved = 0;
  for (let i = 0; i < DEALS; i += 1) {
    const r = solve(`beam-${i}`, 300);
    if (r && r.status === 'won') solved += 1;
  }
  check(`a planning player clears a healthy share of deals (${solved}/${DEALS})`,
    solved >= DEALS * 0.25, solved);
  console.log(`       ${((solved / DEALS) * 100).toFixed(0)}% of deals solved by beam search — the dungeon is hard but fair.`);
}

/* ===================================================================== */

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
