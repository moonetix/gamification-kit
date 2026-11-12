import { GamificationError, fail, int, instant, checkOptions, isObject } from './errors.js';
import { assertTimeZone, dayStart, weekStart, localDays, periodBounds, periodKey, startOfDays } from './time.js';

const RESETS = { daily: 'day', weekly: 'week', monthly: 'month', never: null };

/** Validates a quest definition: { id, target, reset, weekStartsOn, dayStartMinutes }. */
export function defineQuest(definition) {
  try {
    const d = checkOptions(definition, ['id', 'target', 'reset', 'weekStartsOn', 'dayStartMinutes'], 'quest');
    if (definition === undefined) fail('invalid_quest', 'quest is required');
    if (typeof d.id !== 'string' || d.id === '') fail('invalid_quest', 'quest.id must be a non-empty string');
    const reset = d.reset ?? 'daily';
    if (!Object.hasOwn(RESETS, reset)) fail('invalid_quest', 'quest.reset must be "daily", "weekly", "monthly" or "never"');
    return Object.freeze({
      id: d.id,
      target: int(d.target, 'quest.target', 1),
      reset,
      weekStartsOn: weekStart(d),
      dayStartMinutes: dayStart(d),
    });
  } catch (e) {
    if (e instanceof GamificationError) fail('invalid_quest', e.message);
    throw e;
  }
}

function readState(state) {
  if (state === undefined || state === null) state = {};
  if (!isObject(state)) fail('invalid_state', 'state must be an object');
  const periodKeyValue = state.periodKey ?? null;
  if (periodKeyValue !== null && typeof periodKeyValue !== 'string') fail('invalid_state', 'state.periodKey must be a string or null');
  return {
    ...state,
    periodKey: periodKeyValue,
    progress: int(state.progress ?? 0, 'state.progress', 0, undefined, 'invalid_state'),
    completedAt: state.completedAt === undefined || state.completedAt === null ? null : int(state.completedAt, 'state.completedAt', undefined, undefined, 'invalid_state'),
    completions: int(state.completions ?? 0, 'state.completions', 0, undefined, 'invalid_state'),
  };
}

/**
 * Adds `amount` progress (0 just reads the current period). Progress resets when the
 * period in the user's time zone changes, stops at the target, and a quest completes once
 * per period.
 */
export function questProgress(state, quest, options) {
  const q = defineQuest(quest);
  const s = readState(state);
  const o = checkOptions(options, ['amount', 'at', 'timeZone']);
  const amount = o.amount === undefined ? 1 : int(o.amount, 'amount', 0);
  const at = instant(o.at);

  let key = 'never';
  let resetsAt = null;
  const period = RESETS[q.reset];
  if (period !== null) {
    const tz = assertTimeZone(o.timeZone);
    const [first, next] = periodBounds(period, localDays(at, tz, q.dayStartMinutes), q.weekStartsOn);
    key = periodKey(period, first);
    resetsAt = startOfDays(next, tz, q.dayStartMinutes);
  } else if (o.timeZone !== undefined) {
    assertTimeZone(o.timeZone);
  }

  let progress = s.progress;
  let completedAt = s.completedAt;
  if (s.periodKey !== key) {
    progress = 0;
    completedAt = null;
  }
  const wasComplete = completedAt !== null;
  let justCompleted = false;
  if (!wasComplete && amount > 0) {
    progress = Math.min(q.target, progress + Math.min(amount, q.target));
    if (progress >= q.target) {
      justCompleted = true;
      completedAt = at;
    }
  }
  const next = {
    ...s,
    periodKey: key,
    progress,
    completedAt,
    completions: s.completions + (justCompleted ? 1 : 0),
  };
  return {
    state: next,
    result: {
      progress,
      target: q.target,
      completed: completedAt !== null,
      justCompleted,
      periodKey: key,
      resetsAt,
    },
  };
}
