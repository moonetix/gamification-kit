import { fail, int, instant, checkOptions, isObject } from './errors.js';
import { assertTimeZone, dayStart, localDays, startOfDays, parseDate, formatDays } from './time.js';

function readState(state) {
  if (state === undefined || state === null) state = {};
  if (!isObject(state)) fail('invalid_state', 'state must be an object');
  const lastDate = state.lastDate ?? null;
  const out = {
    ...state,
    lastDate,
    streak: int(state.streak ?? 0, 'state.streak', 0, undefined, 'invalid_state'),
    longest: int(state.longest ?? 0, 'state.longest', 0, undefined, 'invalid_state'),
    freezes: int(state.freezes ?? 0, 'state.freezes', 0, undefined, 'invalid_state'),
    totalDays: int(state.totalDays ?? 0, 'state.totalDays', 0, undefined, 'invalid_state'),
  };
  if (lastDate !== null) {
    try {
      parseDate(lastDate, 'state.lastDate');
    } catch (e) {
      fail('invalid_state', e.message);
    }
  }
  if (lastDate === null && out.streak !== 0) fail('invalid_state', 'state.streak must be 0 when lastDate is null');
  return out;
}

function readCommon(o) {
  return {
    at: instant(o.at),
    tz: assertTimeZone(o.timeZone),
    ds: dayStart(o),
    grace: o.graceMinutes === undefined ? 0 : int(o.graceMinutes, 'graceMinutes', 0, 1439),
    maxStreak: o.maxStreak === undefined || o.maxStreak === null ? null : int(o.maxStreak, 'maxStreak', 1),
    cycle: o.cycleLength === undefined || o.cycleLength === null ? null : int(o.cycleLength, 'cycleLength', 1),
  };
}

const OPTIONS = ['at', 'timeZone', 'graceMinutes', 'dayStartMinutes', 'maxStreak', 'cycleLength'];

const cycleDay = (streak, cycle) => (cycle === null || streak === 0 ? streak : ((streak - 1) % cycle) + 1);

/**
 * Records a daily check-in. Returns the new state and what happened. Pure: store the returned
 * state. A second check-in on the same local day changes nothing.
 */
export function checkIn(state, options) {
  const s = readState(state);
  const o = checkOptions(options, OPTIONS);
  const { at, tz, ds, grace, maxStreak, cycle } = readCommon(o);

  const today = localDays(at, tz, ds);
  const last = s.lastDate === null ? null : parseDate(s.lastDate);
  let day = today;
  let usedGrace = false;

  // A check-in just after the boundary may rescue a missed yesterday, but only while the
  // streak is still alive through yesterday; otherwise there is nothing to rescue.
  if (grace > 0 && last !== null && last < today - 1 && today - 1 - last - 1 <= s.freezes) {
    if (at < startOfDays(today, tz, ds) + grace * 60) {
      day = today - 1;
      usedGrace = true;
    }
  }

  const result = {
    counted: false,
    alreadyCheckedIn: false,
    localDate: formatDays(day),
    streak: s.streak,
    longest: s.longest,
    cycleDay: cycleDay(s.streak, cycle),
    usedFreezes: 0,
    usedGrace: false,
    broken: false,
  };

  if (last !== null && day <= last) {
    result.alreadyCheckedIn = true;
    result.localDate = formatDays(today);
    return { state: s, result };
  }

  let streak;
  if (last === null) {
    streak = 1;
  } else {
    const missed = day - last - 1;
    if (missed <= s.freezes) {
      result.usedFreezes = missed;
      streak = s.streak + 1;
    } else {
      result.broken = true;
      streak = 1;
    }
  }
  if (maxStreak !== null && streak > maxStreak) streak = maxStreak;

  const next = {
    ...s,
    lastDate: formatDays(day),
    streak,
    longest: Math.max(s.longest, streak),
    freezes: s.freezes - result.usedFreezes,
    totalDays: s.totalDays + 1,
  };
  Object.assign(result, {
    counted: true,
    streak,
    longest: next.longest,
    cycleDay: cycleDay(streak, cycle),
    usedGrace,
  });
  return { state: next, result };
}

/**
 * Read-only view for the UI: is the streak still alive at `at`, was today counted, and when
 * does it end without a check-in (`endsAt`, Unix seconds, null when there is no streak).
 */
export function streakStatus(state, options) {
  const s = readState(state);
  const o = checkOptions(options, OPTIONS);
  const { at, tz, ds, grace, cycle } = readCommon(o);
  const today = localDays(at, tz, ds);
  if (s.lastDate === null) {
    return { alive: false, streak: 0, checkedInToday: false, freezesNeeded: 0, endsAt: null, cycleDay: 0 };
  }
  const last = parseDate(s.lastDate);
  // The latest day a check-in can still count for, using every freeze.
  const lastSavingDay = last + 1 + s.freezes;
  const endsAt = startOfDays(lastSavingDay + 1, tz, ds) + grace * 60;
  const alive = at < endsAt;
  const missedSoFar = Math.max(0, today - last - 1);
  return {
    alive,
    streak: alive ? s.streak : 0,
    checkedInToday: last >= today,
    freezesNeeded: alive ? Math.min(missedSoFar, s.freezes) : 0,
    endsAt: alive ? endsAt : null,
    cycleDay: alive ? cycleDay(s.streak, cycle) : 0,
  };
}

/** Value for day `day` of a streak schedule such as [10, 10, 20, 20, 30, 30, 50]. Past the end, the last value repeats. */
export function streakReward(schedule, day) {
  if (!Array.isArray(schedule) || schedule.length === 0) fail('invalid_option', 'schedule must be a non-empty array');
  schedule.forEach((v, i) => int(v, `schedule[${i}]`, 0));
  int(day, 'day', 0);
  if (day === 0) return 0;
  return schedule[Math.min(day, schedule.length) - 1];
}
