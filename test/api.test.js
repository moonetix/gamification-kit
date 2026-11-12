import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as kit from '../src/index.js';

test('errors carry a stable code', () => {
  try {
    kit.localDate(0, 'Not/AZone');
    assert.fail('should throw');
  } catch (e) {
    assert.ok(e instanceof kit.GamificationError);
    assert.ok(e instanceof Error);
    assert.equal(e.code, 'invalid_time_zone');
    assert.equal(e.name, 'GamificationError');
  }
});

test('checkIn does not mutate the state it is given', () => {
  const state = Object.freeze({ lastDate: '2026-11-10', streak: 2, longest: 5, freezes: 1, totalDays: 9 });
  const { state: next } = kit.checkIn(state, { at: 1794398400, timeZone: 'UTC' });
  assert.equal(state.streak, 2);
  assert.equal(next.streak, 3);
  assert.notEqual(next, state);
});

test('a full year of daily check-ins in Lord Howe keeps one unbroken streak', () => {
  let state = null;
  for (let d = '2026-01-01'; d !== '2027-01-01'; d = kit.addDays(d, 1)) {
    const at = kit.startOfLocalDay(d, 'Australia/Lord_Howe') + 23 * 3600;
    const { state: next, result } = kit.checkIn(state, { at, timeZone: 'Australia/Lord_Howe' });
    assert.ok(result.counted && !result.broken, d);
    assert.equal(result.localDate, d);
    state = next;
  }
  assert.equal(state.streak, 365);
});

test('adding 86400 seconds is not the next day on a 25-hour day', () => {
  const tz = 'America/New_York';
  const at = kit.startOfLocalDay('2026-11-01', tz) + 30 * 60; // 00:30
  assert.equal(kit.localDate(at, tz), '2026-11-01');
  assert.equal(kit.localDate(at + 86400, tz), '2026-11-01'); // 23:30 the same day
  const first = kit.checkIn(null, { at, timeZone: tz });
  const again = kit.checkIn(first.state, { at: at + 86400, timeZone: tz });
  assert.equal(again.result.alreadyCheckedIn, true);
});

test('curves are frozen and reusable', () => {
  const curve = kit.polynomialCurve({ base: 100, exponent: 2, maxLevel: 50 });
  assert.ok(Object.isFrozen(curve));
  assert.equal(kit.xpForLevel(curve, 50), 100 * 49 * 49);
  assert.equal(kit.levelForXp(curve, 10 ** 9).level, 50);
});

test('levelForXp and xpForLevel agree on every level boundary', () => {
  for (const curve of [kit.linearCurve({ xpPerLevel: 250 }), kit.polynomialCurve({ base: 7, exponent: 3 }), kit.tableCurve([0, 1, 3, 10, 30, 100])]) {
    for (let level = 1; level <= 6; level++) {
      const xp = kit.xpForLevel(curve, level);
      assert.equal(kit.levelForXp(curve, xp).level, level);
      if (xp > 0) assert.equal(kit.levelForXp(curve, xp - 1).level, level - 1);
    }
  }
});

test('XP beyond 2^53 - 1 is rejected rather than rounded', () => {
  assert.throws(() => kit.levelForXp(kit.linearCurve({ xpPerLevel: 1 }), 2 ** 53), { code: 'invalid_option' });
});

test('quests reset at local midnight, not at UTC midnight', () => {
  const quest = kit.defineQuest({ id: 'daily', target: 1 });
  const tz = 'Pacific/Kiritimati';
  const first = kit.questProgress(null, quest, { at: kit.startOfLocalDay('2026-11-11', tz) + 60, timeZone: tz });
  assert.equal(first.result.justCompleted, true);
  const sameDay = kit.questProgress(first.state, quest, { at: first.result.resetsAt - 1, timeZone: tz });
  assert.equal(sameDay.result.justCompleted, false);
  const nextDay = kit.questProgress(sameDay.state, quest, { at: first.result.resetsAt, timeZone: tz });
  assert.equal(nextDay.result.justCompleted, true);
  assert.equal(nextDay.state.completions, 2);
});

test('rankEntries keeps extra fields and does not reorder the input', () => {
  const input = [{ id: 'a', score: 1, name: 'Ann' }, { id: 'b', score: 2, name: 'Bo' }];
  const ranked = kit.rankEntries(input);
  assert.deepEqual(ranked.map((e) => [e.id, e.rank, e.name]), [['b', 1, 'Bo'], ['a', 2, 'Ann']]);
  assert.equal(input[0].id, 'a');
  assert.equal('rank' in input[0], false);
});

test('unknown options are rejected so typos do not pass silently', () => {
  assert.throws(() => kit.localDate(0, 'UTC', { dayStart: 240 }), { code: 'invalid_option' });
  assert.throws(() => kit.applyXpCap({}, { amount: 1, at: 0, timeZone: 'UTC', cap: 5 }), { code: 'invalid_option' });
});
