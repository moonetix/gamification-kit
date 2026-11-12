import { fail, int, instant, checkOptions, isObject } from './errors.js';
import { assertTimeZone, dayStart, localDays, startOfDays, formatDays, parseDate } from './time.js';

/**
 * Grants at most `dailyCap` per local day. State: { date, granted }. Also works as a count
 * limit for any action: pass amount 1 and the allowed count as dailyCap.
 */
export function applyXpCap(state, options) {
  if (state === undefined || state === null) state = {};
  if (!isObject(state)) fail('invalid_state', 'state must be an object');
  const o = checkOptions(options, ['amount', 'at', 'timeZone', 'dailyCap', 'dayStartMinutes']);
  const amount = int(o.amount, 'amount', 0);
  const cap = int(o.dailyCap, 'dailyCap', 0);
  const at = instant(o.at);
  const tz = assertTimeZone(o.timeZone);
  const ds = dayStart(o);

  const date = state.date ?? null;
  if (date !== null) {
    try {
      parseDate(date, 'state.date');
    } catch (e) {
      fail('invalid_state', e.message);
    }
  }
  const already = int(state.granted ?? 0, 'state.granted', 0, undefined, 'invalid_state');

  const today = localDays(at, tz, ds);
  const todayText = formatDays(today);
  // A date ahead of today (the user moved west) keeps its count, so a zone change cannot reopen the day.
  const used = date === null || parseDate(date) < today ? 0 : already;
  const keyDate = date !== null && parseDate(date) > today ? date : todayText;
  const granted = Math.min(amount, Math.max(0, cap - used));
  const total = used + granted;
  return {
    granted,
    capped: amount - granted,
    remaining: Math.max(0, cap - total),
    localDate: todayText,
    resetsAt: startOfDays(Math.max(today, parseDate(keyDate)) + 1, tz, ds),
    state: { ...state, date: keyDate, granted: total },
  };
}

/** Whether an action is allowed again `seconds` after `lastAt`. Elapsed time, not calendar days. */
export function cooldown(lastAt, at, seconds) {
  instant(at);
  int(seconds, 'seconds', 0);
  if (lastAt === null || lastAt === undefined) return { ready: true, remainingSeconds: 0, readyAt: at };
  instant(lastAt, 'lastAt');
  const readyAt = lastAt + seconds;
  return { ready: at >= readyAt, remainingSeconds: Math.max(0, readyAt - at), readyAt };
}

/**
 * Lets a user change the time zone that streaks, caps and quests use at most once per
 * `cooldownSeconds` (default 30 days). State: { timeZone, changedAt }.
 */
export function changeTimeZone(state, options) {
  if (state === undefined || state === null) state = {};
  if (!isObject(state)) fail('invalid_state', 'state must be an object');
  const o = checkOptions(options, ['timeZone', 'at', 'cooldownSeconds']);
  const tz = assertTimeZone(o.timeZone);
  const at = instant(o.at);
  const wait = o.cooldownSeconds === undefined ? 30 * 86400 : int(o.cooldownSeconds, 'cooldownSeconds', 0);
  const current = state.timeZone ?? null;
  const changedAt = state.changedAt ?? null;
  if (current !== null) assertTimeZone(current);
  if (changedAt !== null) instant(changedAt, 'state.changedAt');

  if (current === tz) {
    return { changed: false, allowed: true, timeZone: tz, nextChangeAt: changedAt === null ? at : Math.max(at, changedAt + wait), state };
  }
  if (current !== null && changedAt !== null && at < changedAt + wait) {
    return { changed: false, allowed: false, timeZone: current, nextChangeAt: changedAt + wait, state };
  }
  // The first zone a user sets starts no cooldown, so onboarding can fix a wrong guess.
  const nextChangedAt = current === null ? null : at;
  return {
    changed: true,
    allowed: true,
    timeZone: tz,
    nextChangeAt: nextChangedAt === null ? at : at + wait,
    state: { ...state, timeZone: tz, changedAt: nextChangedAt },
  };
}
