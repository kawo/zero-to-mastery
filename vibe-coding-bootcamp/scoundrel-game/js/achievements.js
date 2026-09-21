/*
 * Scoundrel: achievements.
 *
 * Each entry is either a one-off condition (`test`) or a counter with a goal
 * (`progress` returns [current, goal]); counters unlock when current >= goal and
 * show a bar until then.
 *
 * Both receive a context:
 *   stats   the lifetime record (see stats.js)
 *   state   the game as it stands right now
 *   event   what just happened: { type: 'resolve'|'avoid'|'end', ... }
 *
 * Deliberately weighted towards *how* you won rather than how often: "clear the
 * dungeon without ever avoiding" is a thing to attempt, "play 50 games" is a
 * thing to wait for. Only a couple of the latter, as a floor.
 *
 * Exposed as window.ScoundrelAchievements.
 */
(() => {
  'use strict';

  const C = window.ScoundrelConfig;
  const KEY = 'scoundrel:achievements:v1';

  /* kind drives the icon: survival, blade, daring, mastery, oddity */
  const LIST = [
    {
      id: 'first-blood', kind: 'survival', title: 'First Blood',
      desc: 'Finish your first run, however it ends.',
      test: (c) => c.stats.games >= 1,
    },
    {
      id: 'out-alive', kind: 'survival', title: 'Out Alive',
      desc: 'Clear the dungeon.',
      test: (c) => c.stats.wins >= 1,
    },
    {
      id: 'unscathed', kind: 'mastery', title: 'Unscathed',
      desc: 'Win with all 20 health.',
      test: (c) => c.event.type === 'end' && c.state.status === 'won' && c.state.health === 20,
    },
    {
      id: 'by-a-thread', kind: 'daring', title: 'By a Thread',
      desc: 'Win with exactly 1 health left.',
      test: (c) => c.event.type === 'end' && c.state.status === 'won' && c.state.health === 1,
    },
    {
      id: 'no-flight', kind: 'daring', title: 'Nowhere to Run',
      desc: 'Clear the dungeon without avoiding a single room.',
      test: (c) => c.event.type === 'end' && c.state.status === 'won' && c.state.avoidsUsed === 0,
    },
    {
      id: 'bare-knuckle', kind: 'daring', title: 'Bare Knuckle',
      desc: 'Kill a face card with your bare hands and live.',
      test: (c) => c.event.type === 'resolve' && c.event.bareHanded
        && c.event.card && c.event.card.rank >= 11 && c.state.health > 0,
    },
    {
      id: 'butcher', kind: 'blade', title: 'The Butcher',
      desc: 'Slay five monsters on one blade.',
      test: (c) => !!c.state.weapon && c.state.weapon.stack.length >= 5,
    },
    {
      id: 'surgeon', kind: 'blade', title: 'Surgeon',
      desc: 'Take a monster down for zero damage with a weapon.',
      test: (c) => c.event.type === 'resolve' && c.event.clean === true,
    },
    {
      id: 'giant-killer', kind: 'blade', title: 'Giant Killer',
      desc: 'Kill an ace (14) with a weapon.',
      test: (c) => c.event.type === 'resolve' && c.event.withWeapon
        && c.event.card && c.event.card.rank === 14,
    },
    {
      id: 'teetotal', kind: 'mastery', title: 'Teetotal',
      desc: 'Win without drinking a single potion.',
      test: (c) => c.event.type === 'end' && c.state.status === 'won' && c.state.potionsDrunk === 0,
    },
    {
      id: 'purist', kind: 'mastery', title: 'Purist',
      desc: 'Win a run under the Classic ruleset.',
      test: (c) => c.event.type === 'end' && c.state.status === 'won' && c.state.preset === 'classic',
    },
    {
      id: 'streak-3', kind: 'mastery', title: 'On a Roll',
      desc: 'Win three runs in a row.',
      progress: (c) => [Math.min(c.stats.currentStreak, 3), 3],
    },
    {
      id: 'veteran', kind: 'survival', title: 'Veteran',
      desc: 'Finish twenty-five runs.',
      progress: (c) => [Math.min(c.stats.games, 25), 25],
    },
    {
      id: 'cartographer', kind: 'oddity', title: 'Cartographer',
      desc: 'Reach room 15 in a single run.',
      progress: (c) => [Math.min(c.state.turn || 0, 15), 15],
    },
    {
      id: 'hoarder', kind: 'oddity', title: 'Waste Not',
      desc: 'Pour out three potions in one run. Someone had to.',
      progress: (c) => [Math.min(c.state.potionsWasted || 0, 3), 3],
    },
  ];

  const BY_ID = new Map(LIST.map((a) => [a.id, a]));

  /* ------------------------------------------------------------------ *
   * Storage
   * ------------------------------------------------------------------ */

  let unlocked = null;

  function load() {
    if (unlocked) return unlocked;
    unlocked = new Map();
    try {
      const raw = JSON.parse(window.localStorage.getItem(KEY) || '{}');
      for (const [id, at] of Object.entries(raw)) {
        if (BY_ID.has(id)) unlocked.set(id, at);
      }
    } catch { /* an unreadable trophy case is an empty one */ }
    return unlocked;
  }

  function persist() {
    try {
      window.localStorage.setItem(KEY, JSON.stringify(Object.fromEntries(load())));
    } catch { /* not worth interrupting a turn over */ }
  }

  /* ------------------------------------------------------------------ *
   * Checking
   * ------------------------------------------------------------------ */

  /**
   * Evaluate everything against what just happened.
   * @returns {object[]} the achievements newly unlocked by this event
   */
  function check(context) {
    const seen = load();
    const fresh = [];
    for (const a of LIST) {
      if (seen.has(a.id)) continue;
      let hit = false;
      try {
        if (a.test) hit = !!a.test(context);
        else if (a.progress) {
          const [current, goal] = a.progress(context);
          hit = current >= goal;
        }
      } catch {
        hit = false; // a broken condition must not break the turn
      }
      if (hit) {
        seen.set(a.id, Date.now());
        fresh.push(a);
      }
    }
    if (fresh.length) persist();
    return fresh;
  }

  /** Everything, with unlock state and progress, for the trophy case. */
  function all(context) {
    const seen = load();
    return LIST.map((a) => {
      let bar = null;
      if (a.progress && !seen.has(a.id)) {
        try {
          const [current, goal] = a.progress(context);
          bar = { current, goal };
        } catch { bar = null; }
      }
      return {
        id: a.id,
        kind: a.kind,
        title: a.title,
        desc: a.desc,
        at: seen.get(a.id) || null,
        unlocked: seen.has(a.id),
        bar,
      };
    });
  }

  const count = () => ({ unlocked: load().size, total: LIST.length });

  function reset() {
    unlocked = new Map();
    persist();
  }

  window.ScoundrelAchievements = Object.freeze({ check, all, count, reset, LIST });
})();
