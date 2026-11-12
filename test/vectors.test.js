import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as kit from '../src/index.js';

const vectors = JSON.parse(readFileSync(new URL('../test-vectors/vectors.json', import.meta.url), 'utf8'));

const plain = (v) => JSON.parse(JSON.stringify(v));

function sequence(c, step) {
  let state = c.state;
  return c.steps.map((s) => {
    const r = step(state, s);
    state = r.state;
    return plain(r);
  });
}

const runners = {
  localDate: (c) => kit.localDate(c.at, c.timeZone, c.dayStartMinutes === undefined ? undefined : { dayStartMinutes: c.dayStartMinutes }),
  startOfLocalDay: (c) => kit.startOfLocalDay(c.date, c.timeZone, c.dayStartMinutes === undefined ? undefined : { dayStartMinutes: c.dayStartMinutes }),
  periodWindow: (c) => kit.periodWindow(c.options),
  utcOffset: (c) => kit.utcOffset(c.at, c.timeZone),
  addDays: (c) => kit.addDays(c.date, c.n),
  daysBetween: (c) => kit.daysBetween(c.from, c.to),
  weekday: (c) => kit.weekday(c.date),
  checkIn: [
    (c) => sequence(c, (state, s) => kit.checkIn(state, { ...c.options, at: s.at, ...(s.timeZone ? { timeZone: s.timeZone } : {}) })),
    (c) => c.steps.map((s) => ({ state: s.state, result: s.result })),
  ],
  checkInErrors: (c) => kit.checkIn(c.state, c.options),
  streakStatus: (c) => kit.streakStatus(c.state, c.options),
  streakReward: (c) => kit.streakReward(c.schedule, c.day),
  levelForXp: (c) => kit.levelForXp(c.curve, c.xp),
  xpForLevel: (c) => kit.xpForLevel(c.curve, c.level),
  curves: (c) => plain(c.fn === 'tableCurve' ? kit.tableCurve(c.thresholds, c.options) : kit[c.fn](c.options)),
  defineQuest: (c) => plain(kit.defineQuest(c.quest)),
  questProgress: [
    (c) => sequence(c, (state, s) => kit.questProgress(state, c.quest, s.options)),
    (c) => c.steps.map((s) => ({ state: s.state, result: s.result })),
  ],
  questProgressErrors: (c) => kit.questProgress(c.state, c.quest, c.options),
  rankEntries: (c) => kit.rankEntries(c.entries, c.options ?? undefined),
  aroundId: (c) => kit.aroundId(c.ranked, c.id, c.radius),
  applyXpCap: [(c) => sequence(c, (state, s) => kit.applyXpCap(state, s.options)), (c) => c.steps.map((s) => s.out)],
  applyXpCapErrors: (c) => kit.applyXpCap(c.state, c.options),
  cooldown: (c) => kit.cooldown(c.lastAt, c.at, c.seconds),
  changeTimeZone: [(c) => sequence(c, (state, s) => kit.changeTimeZone(state, s.options)), (c) => c.steps.map((s) => s.out)],
  changeTimeZoneErrors: (c) => kit.changeTimeZone(c.state, c.options),
};

for (const [group, runner] of Object.entries(runners)) {
  const [run, expected] = Array.isArray(runner) ? runner : [runner, (c) => c.out];
  test(`vectors: ${group}`, () => {
    const cases = vectors[group];
    assert.ok(Array.isArray(cases) && cases.length > 0, `no vectors for ${group}`);
    cases.forEach((c, i) => {
      const label = `${group}[${i}]${c.name ? ` ${c.name}` : ''}`;
      if (c.throws) {
        assert.throws(() => run(c), (err) => err instanceof kit.GamificationError && err.code === c.throws, label);
      } else {
        assert.deepEqual(plain(run(c)), expected(c), label);
      }
    });
  });
}

test('every vector group has a runner', () => {
  const groups = Object.keys(vectors).filter((k) => Array.isArray(vectors[k]));
  assert.deepEqual(groups.sort(), Object.keys(runners).sort());
});
