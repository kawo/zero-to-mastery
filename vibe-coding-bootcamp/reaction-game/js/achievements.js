/*
 * Reflex Lab: achievement definitions.
 *
 * Each achievement is either a one-off condition (`test`) or a counter with a
 * goal (`progress` returns [current, goal]); counters unlock when current ≥ goal
 * and show a progress bar until then.
 *
 * Both receive a context object:
 *   stats    the player's lifetime stats (see storage.js)
 *   session  { times, cleanRun, falseStreak } for the current page view
 *   last     what just happened: a round { type: 'result' | 'false' | 'missed', ms, level, passed }
 *            or a finished tournament { type: 'tournament', won, players }
 *
 * Exposed as window.ReflexLabAchievements.
 */
(() => {
  'use strict';

  const lastN = (arr, n) => (arr.length >= n ? arr.slice(-n) : null);
  const under = (ms) => (c) => c.stats.bestMs !== null && c.stats.bestMs < ms;

  // kind picks the icon: speed, focus, decoy, level, volume, fun
  const LIST = [
    { id: 'first', kind: 'speed', title: 'First Reaction',
      desc: 'Record your first valid reaction time.',
      test: (c) => c.stats.attempts >= 1 },
    { id: 'sub300', kind: 'speed', title: 'Under 300',
      desc: 'React in under 300 ms.', test: under(300) },
    { id: 'sub250', kind: 'speed', title: 'Quick Draw',
      desc: 'React in under 250 ms.', test: under(250) },
    { id: 'sub200', kind: 'speed', title: 'Lightning',
      desc: 'React in under 200 ms.', test: under(200) },
    { id: 'sub170', kind: 'speed', title: 'Superhuman?',
      desc: 'React in under 170 ms. Very few people manage this.', test: under(170) },
    { id: 'metronome', kind: 'focus', title: 'Metronome',
      desc: 'Five valid reactions in a row, all within 40 ms of each other.',
      test: (c) => {
        const five = lastN(c.session.times, 5);
        return !!five && Math.max(...five) - Math.min(...five) <= 40;
      } },
    { id: 'sharp5', kind: 'focus', title: 'Sharp Five',
      desc: 'Average under 250 ms over five reactions in a row.',
      test: (c) => c.stats.bestAvg5 !== null && c.stats.bestAvg5 < 250 },
    { id: 'clean10', kind: 'focus', title: 'Clean Run',
      desc: 'Ten rounds in a row with no false start or miss.',
      progress: (c) => [c.stats.longestClean, 10] },
    { id: 'dodger', kind: 'decoy', title: 'Not Fooled',
      desc: 'Hold steady through 10 decoys.',
      progress: (c) => [c.stats.decoysDodged, 10] },
    { id: 'level3', kind: 'level', title: 'Decoy Territory',
      desc: 'Reach level 3.', progress: (c) => [c.stats.peakLevel, 3] },
    { id: 'level5', kind: 'level', title: 'Subtle Art',
      desc: 'Reach level 5.', progress: (c) => [c.stats.peakLevel, 5] },
    { id: 'level6', kind: 'level', title: 'Elite',
      desc: 'Reach level 6, the top level.', progress: (c) => [c.stats.peakLevel, 6] },
    { id: 'elitePace', kind: 'level', title: 'Elite Pace',
      desc: 'Beat the 290 ms target on level 6.',
      test: (c) => !!c.last && c.last.type === 'result' && c.last.passed && c.last.level >= 6 },
    { id: 'marathon', kind: 'volume', title: 'Marathon',
      desc: '50 valid reactions in a single session.',
      progress: (c) => [c.session.times.length, 50] },
    { id: 'dedicated', kind: 'volume', title: 'Dedicated',
      desc: '250 valid reactions in total.',
      progress: (c) => [c.stats.attempts, 250] },
    { id: 'champion', kind: 'level', title: 'Champion',
      desc: 'Win a tournament.',
      test: (c) => c.stats.tournamentsWon >= 1 },
    { id: 'party', kind: 'fun', title: 'Party Host',
      desc: 'Finish a tournament with 4 or more players.',
      test: (c) => !!c.last && c.last.type === 'tournament' && c.last.players >= 4 },
    { id: 'jumpy', kind: 'fun', title: 'Jumpy',
      desc: 'Three false starts in a row. It happens to everyone.',
      test: (c) => c.session.falseStreak >= 3 },
  ];

  function isMet(achievement, ctx) {
    if (achievement.test) return achievement.test(ctx);
    const [current, goal] = achievement.progress(ctx);
    return current >= goal;
  }

  /** Achievements met by `ctx` that aren't in `unlocked` yet. */
  function evaluate(unlocked, ctx) {
    return LIST.filter((a) => !unlocked[a.id] && isMet(a, ctx));
  }

  /** { current, goal } for counter achievements, null for one-off ones. */
  function progressOf(achievement, ctx) {
    if (!achievement.progress) return null;
    const [current, goal] = achievement.progress(ctx);
    return { current: Math.min(current, goal), goal };
  }

  window.ReflexLabAchievements = Object.freeze({
    LIST: Object.freeze(LIST.map((a) => Object.freeze(a))),
    evaluate,
    progressOf,
  });
})();
