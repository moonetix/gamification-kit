import { fail, int, instant, checkOptions } from './errors.js';

const DAY = 86400;
const ZONE_NAME = /^[A-Za-z][A-Za-z0-9_+-]*(?:\/[A-Za-z0-9_+-]+)*$/;
const formatters = new Map();

function formatter(timeZone) {
  let f = formatters.get(timeZone);
  if (f) return f;
  if (typeof timeZone !== 'string' || !ZONE_NAME.test(timeZone)) {
    fail('invalid_time_zone', `"${timeZone}" is not an IANA time zone name`);
  }
  try {
    f = new Intl.DateTimeFormat('en-US-u-ca-gregory-nu-latn', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
    });
  } catch {
    fail('invalid_time_zone', `"${timeZone}" is not an IANA time zone name`);
  }
  formatters.set(timeZone, f);
  return f;
}

/** Throws `invalid_time_zone` unless the name is a known IANA zone. Returns the name unchanged. */
export function assertTimeZone(timeZone) {
  formatter(timeZone);
  return timeZone;
}

/** UTC offset in seconds that `timeZone` has at instant `at`. */
export function utcOffset(at, timeZone) {
  return offset(instant(at), timeZone);
}

function offset(t, timeZone) {
  const parts = {};
  for (const p of formatter(timeZone).formatToParts(new Date(t * 1000))) parts[p.type] = p.value;
  const wall = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second) / 1000;
  return wall - t;
}

export function daysFromCivil(y, m, d) {
  y -= m <= 2 ? 1 : 0;
  const era = Math.floor(y / 400);
  const yoe = y - era * 400;
  const doy = Math.floor((153 * (m + (m > 2 ? -3 : 9)) + 2) / 5) + d - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

export function civilFromDays(z) {
  z += 719468;
  const era = Math.floor(z / 146097);
  const doe = z - era * 146097;
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const d = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const m = mp < 10 ? mp + 3 : mp - 9;
  return [yoe + era * 400 + (m <= 2 ? 1 : 0), m, d];
}

const pad = (n, w = 2) => String(n).padStart(w, '0');

export function formatDays(days) {
  const [y, m, d] = civilFromDays(days);
  return `${pad(y, 4)}-${pad(m)}-${pad(d)}`;
}

/** Day number (days since 1970-01-01) of a "YYYY-MM-DD" date. */
export function parseDate(date, name = 'date') {
  const m = typeof date === 'string' ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(date) : null;
  if (!m) fail('invalid_date', `${name} must be a "YYYY-MM-DD" string`);
  const [y, mo, d] = [+m[1], +m[2], +m[3]];
  const days = daysFromCivil(y, mo, d);
  if (y < 1900 || formatDays(days) !== date) fail('invalid_date', `${name} "${date}" is not a calendar date from 1900 on`);
  return days;
}

/** The date `n` calendar days after `date` (negative goes back). */
export function addDays(date, n) {
  return formatDays(parseDate(date) + int(n, 'n'));
}

/** Calendar days from `from` to `to`: daysBetween("2026-03-07", "2026-03-09") is 2. */
export function daysBetween(from, to) {
  return parseDate(to, 'to') - parseDate(from, 'from');
}

const dow = (days) => (((days + 4) % 7) + 7) % 7;

/** Day of the week of a date: 0 Sunday to 6 Saturday. */
export function weekday(date) {
  return dow(parseDate(date));
}

export function dayStart(options) {
  return options.dayStartMinutes === undefined ? 0 : int(options.dayStartMinutes, 'dayStartMinutes', 0, 1439);
}

export function localDays(at, timeZone, startMinutes) {
  return Math.floor((at + offset(at, timeZone) - startMinutes * 60) / DAY);
}

/**
 * First instant of local day `days`: the earliest t with wall(t) >= naive, where wall is
 * local clock time. Assumes at most one offset change in the 32 hours around it, which
 * holds for every zone since 1900.
 */
export function startOfDays(days, timeZone, startMinutes) {
  const naive = days * DAY + startMinutes * 60;
  const lo = naive - 16 * 3600;
  const hi = naive + 16 * 3600;
  const o1 = offset(lo, timeZone);
  const o2 = offset(hi, timeZone);
  if (o1 === o2) return naive - o1;
  let a = lo;
  let b = hi;
  while (b - a > 1) {
    const mid = a + Math.floor((b - a) / 2);
    if (offset(mid, timeZone) === o1) a = mid;
    else b = mid;
  }
  const change = b;
  if (naive - o1 < change) return naive - o1;
  return Math.max(change, naive - offset(change, timeZone));
}

/** Local calendar date of instant `at` in `timeZone`, with an optional day start such as 04:00 (240). */
export function localDate(at, timeZone, options) {
  const o = checkOptions(options, ['dayStartMinutes']);
  return formatDays(localDays(instant(at), assertTimeZone(timeZone), dayStart(o)));
}

/** First instant (Unix seconds) of local date `date` in `timeZone`. */
export function startOfLocalDay(date, timeZone, options) {
  const o = checkOptions(options, ['dayStartMinutes']);
  return startOfDays(parseDate(date), assertTimeZone(timeZone), dayStart(o));
}

const PERIODS = ['day', 'week', 'month'];

export function periodBounds(period, days, weekStartsOn) {
  if (period === 'day') return [days, days + 1];
  if (period === 'week') {
    const first = days - ((dow(days) - weekStartsOn + 7) % 7);
    return [first, first + 7];
  }
  const [y, m] = civilFromDays(days);
  return [daysFromCivil(y, m, 1), m === 12 ? daysFromCivil(y + 1, 1, 1) : daysFromCivil(y, m + 1, 1)];
}

export function periodKey(period, firstDays) {
  const date = formatDays(firstDays);
  return period === 'month' ? `month:${date.slice(0, 7)}` : `${period}:${date}`;
}

export function weekStart(options) {
  return options.weekStartsOn === undefined ? 1 : int(options.weekStartsOn, 'weekStartsOn', 0, 6);
}

/** The day, week or month that contains `at`, in local time: { key, start, end, firstDate, lastDate }. `end` is exclusive. */
export function periodWindow(options) {
  const o = checkOptions(options, ['period', 'at', 'timeZone', 'weekStartsOn', 'dayStartMinutes']);
  if (!PERIODS.includes(o.period)) fail('invalid_option', 'period must be "day", "week" or "month"');
  const at = instant(o.at);
  const tz = assertTimeZone(o.timeZone);
  const ds = dayStart(o);
  const [first, next] = periodBounds(o.period, localDays(at, tz, ds), weekStart(o));
  return {
    key: periodKey(o.period, first),
    start: startOfDays(first, tz, ds),
    end: startOfDays(next, tz, ds),
    firstDate: formatDays(first),
    lastDate: formatDays(next - 1),
  };
}
