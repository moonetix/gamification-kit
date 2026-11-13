import {
  checkIn,
  streakStatus,
  streakReward,
  polynomialCurve,
  levelForXp,
  xpForLevel,
  defineQuest,
  questProgress,
  rankEntries,
  aroundId,
  applyXpCap,
  periodWindow,
  localDate,
  startOfLocalDay,
  addDays,
  utcOffset,
  weekday,
} from './src/index.js';

const ZONES = [
  'America/Los_Angeles',
  'America/New_York',
  'America/Santiago',
  'Europe/London',
  'Europe/Budapest',
  'Asia/Beirut',
  'Asia/Kolkata',
  'Asia/Kathmandu',
  'Asia/Tokyo',
  'Australia/Lord_Howe',
  'Pacific/Kiritimati',
  'Pacific/Pago_Pago',
  'UTC',
];
const SCHEDULE = [10, 10, 20, 20, 30, 30, 50];
const CYCLE = 7;
const MATCH_XP = 60;
const DAILY_CAP = 300;
const CURVE = polynomialCurve({ base: 100, exponent: 2 });
const QUESTS = [
  { id: 'play-3-matches', label: 'Play 3 matches', target: 3, reset: 'daily' },
  { id: 'check-in-5-days', label: 'Check in on 5 days', target: 5, reset: 'weekly' },
  { id: 'earn-1000-xp', label: 'Earn 1,000 XP', target: 1000, reset: 'monthly' },
];
const BOTS = [
  { id: 'leo', score: 640 },
  { id: 'mia', score: 420 },
  { id: 'ava', score: 420 },
  { id: 'kai', score: 300 },
  { id: 'noa', score: 120 },
  { id: 'zoe', score: 60 },
];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const WINDOW = 14;
const icon = (id) => `<svg class="ic" aria-hidden="true" focusable="false"><use href="#i-${id}"/></svg>`;
const MARKS = {
  counted: icon('check'),
  freeze: icon('snow'),
  pending: icon('snow'),
  missed: icon('x'),
  open: '',
  none: '',
};
const LEGEND = [
  ['counted', 'Counted'],
  ['freeze', 'Freeze used'],
  ['pending', 'Freeze due at next check-in'],
  ['missed', 'Missed, streak broke'],
  ['open', 'Open'],
  ['none', 'No check-in'],
];

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const num = (n) => n.toLocaleString('en-US');
const mod = (a, b) => ((a % b) + b) % b;
const pad = (n) => String(n).padStart(2, '0');
const city = (tz) => tz.split('/').pop().replace(/_/g, ' ');

let S;

function fresh(tz, at) {
  return {
    tz,
    at,
    grace: 0,
    dayStart: 0,
    tie: S ? S.tie : 'shared',
    streak: { lastDate: null, streak: 0, longest: 0, freezes: 0, totalDays: 0 },
    days: {},
    xp: 0,
    cap: null,
    quests: {},
    week: { key: null, xp: 0 },
    log: [],
    call: null,
    hint: '',
  };
}

function wall(at, tz) {
  const off = utcOffset(at, tz);
  const d = new Date((at + off) * 1000);
  const date = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  return { date, time: `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`, off, secs: mod(at + off, 86400) };
}

function wallToInstant(date, secs, tz) {
  const [y, m, d] = date.split('-').map(Number);
  const naive = Date.UTC(y, m - 1, d) / 1000 + secs;
  const guess = naive - utcOffset(naive, tz);
  return naive - utcOffset(guess, tz);
}

function fmtOffset(off) {
  const a = Math.abs(off);
  return `UTC${off < 0 ? '-' : '+'}${pad(Math.floor(a / 3600))}:${pad(Math.floor((a % 3600) / 60))}`;
}

function fmtLocal(at, tz) {
  const w = wall(at, tz);
  return `${DAYS[weekday(w.date)]} ${w.date} ${w.time}`;
}

function fmtSpan(sec) {
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (d > 0) return `${d} d ${h} h`;
  if (h > 0) return `${h} h ${m} min`;
  return `${m} min`;
}

function dayLength(date, tz) {
  return startOfLocalDay(addDays(date, 1), tz) - startOfLocalDay(date, tz);
}

function fmtHours(sec) {
  const h = sec / 3600;
  return `${Number.isInteger(h) ? h : h.toFixed(1)} h`;
}

function streakOptions() {
  return { at: S.at, timeZone: S.tz, graceMinutes: S.grace, dayStartMinutes: S.dayStart, cycleLength: CYCLE };
}

function questDef(q) {
  return defineQuest({ id: q.id, target: q.target, reset: q.reset, dayStartMinutes: S.dayStart });
}

function bumpQuest(id, amount) {
  const q = QUESTS.find((x) => x.id === id);
  const r = questProgress(S.quests[id] ?? null, questDef(q), { amount, at: S.at, timeZone: S.tz });
  S.quests[id] = r.state;
  return r.result;
}

function weekKey() {
  return periodWindow({ period: 'week', at: S.at, timeZone: 'UTC' }).key;
}

function grantXp(amount) {
  const options = { amount, at: S.at, timeZone: S.tz, dailyCap: DAILY_CAP, dayStartMinutes: S.dayStart };
  const r = applyXpCap(S.cap, options);
  S.cap = r.state;
  S.xp += r.granted;
  const key = weekKey();
  if (S.week.key !== key) S.week = { key, xp: 0 };
  S.week.xp += r.granted;
  bumpQuest('earn-1000-xp', r.granted);
  return { r, options };
}

function addLog(action, result, extra = {}) {
  const w = wall(S.at, S.tz);
  S.log.unshift({
    at: S.at,
    tz: S.tz,
    local: `${DAYS[weekday(w.date)]} ${w.time}`,
    date: localDate(S.at, S.tz, { dayStartMinutes: S.dayStart }),
    utc: new Date(S.at * 1000).toISOString().slice(0, 10),
    action,
    result,
    streak: S.streak.streak,
    xp: extra.xp ?? null,
    tone: extra.tone ?? '',
  });
  if (S.log.length > 40) S.log.length = 40;
}

function doCheckIn() {
  const before = S.streak;
  const options = streakOptions();
  const { state, result } = checkIn(before, options);
  S.streak = state;
  if (result.counted) {
    if (before.lastDate !== null) {
      const kind = result.broken ? 'missed' : 'freeze';
      for (let d = addDays(before.lastDate, 1); d < state.lastDate; d = addDays(d, 1)) S.days[d] = { kind };
    }
    S.days[state.lastDate] = { kind: 'counted', grace: result.usedGrace, streak: result.streak };
  }
  S.call = { name: 'checkIn', args: [before, options], result };
  let text;
  let tone = 'good';
  let xp = null;
  if (result.alreadyCheckedIn) {
    text = result.localDate === before.lastDate
      ? `Not counted: ${result.localDate} is already counted`
      : `Not counted: today is ${result.localDate} and ${before.lastDate} is already counted`;
    tone = 'warn';
  } else {
    const parts = [`Counted for ${result.localDate}`];
    if (result.usedGrace) parts.push('grace window counted it for yesterday');
    if (result.usedFreezes) parts.push(`${result.usedFreezes} freeze${result.usedFreezes > 1 ? 's' : ''} covered the gap`);
    if (result.broken) {
      parts.push('missed days broke the streak, back to 1');
      tone = 'bad';
    }
    text = parts.join(', ');
    const reward = streakReward(SCHEDULE, result.cycleDay);
    const g = grantXp(reward);
    xp = g.r.granted;
    if (g.r.capped) text += `, ${g.r.capped} XP over the daily cap`;
    bumpQuest('check-in-5-days', 1);
  }
  addLog('Check in', text, { xp, tone });
}

function doMatch() {
  const g = grantXp(MATCH_XP);
  const q = bumpQuest('play-3-matches', 1);
  S.call = { name: 'applyXpCap', args: [null, g.options], result: { ...g.r, state: S.cap } };
  let text = g.r.capped ? `Daily XP cap reached, ${g.r.capped} XP not granted` : `${MATCH_XP} XP`;
  if (q.justCompleted) text += ', quest "Play 3 matches" completed';
  addLog('Play a match', text, { xp: g.r.granted, tone: g.r.capped ? 'warn' : '' });
}

function doFreeze() {
  S.streak = { ...S.streak, freezes: S.streak.freezes + 1 };
  addLog('Give a freeze', `User now holds ${S.streak.freezes}`);
}

function travel(tz, hours) {
  const from = S.tz;
  S.at += hours * 3600;
  S.tz = tz;
  addLog(`Fly ${city(from)} to ${city(tz)}`, `${hours} h in the air, local clock now ${fmtLocal(S.at, S.tz)}`);
}

function setWall(date, time) {
  const [h, m] = time.split(':').map(Number);
  S.at = wallToInstant(date, h * 3600 + m * 60, S.tz);
}

function move(kind) {
  const w = wall(S.at, S.tz);
  if (kind === 'hour') S.at += 3600;
  else if (kind === 'six') S.at += 6 * 3600;
  else if (kind === 'next' || kind === 'skip') {
    S.at = wallToInstant(addDays(w.date, kind === 'next' ? 1 : 2), w.secs, S.tz);
  } else if (kind === 'dst') {
    for (let i = 1; i <= 400; i++) {
      const d = addDays(w.date, i);
      if (dayLength(d, S.tz) !== 86400) {
        S.at = startOfLocalDay(d, S.tz) + 1800;
        S.hint = `${d} is ${fmtHours(dayLength(d, S.tz))} long in ${S.tz}. Use +1 hour to watch the clock change.`;
        render();
        return;
      }
    }
    S.hint = `${S.tz} has no clock change in the next 400 days.`;
    render();
    return;
  }
  S.hint = '';
  render();
}

const SCENARIOS = [
  {
    label: 'New York: 25-hour day',
    tz: 'America/New_York',
    hint: 'Clocks fall back on 2026-11-01, so that day lasts 25 hours. The last check-in comes 24 h 15 min after the one before it and is still the same local day, so it is not counted twice.',
    run() {
      setWall('2026-10-30', '21:00');
      doCheckIn();
      setWall('2026-10-31', '21:00');
      doCheckIn();
      setWall('2026-11-01', '00:30');
      doCheckIn();
      setWall('2026-11-01', '23:20');
      doMatch();
      setWall('2026-11-01', '23:30');
      doMatch();
      setWall('2026-11-01', '23:40');
      doMatch();
      setWall('2026-11-01', '23:45');
      doCheckIn();
    },
  },
  {
    label: 'Santiago: missing midnight',
    tz: 'America/Santiago',
    hint: 'On 2026-09-06 Santiago skips from 23:59:59 to 01:00, so midnight never happens and the day is 23 hours long. The day starts at 01:00 and the 01:05 check-in counts for it.',
    run() {
      setWall('2026-09-04', '22:00');
      doCheckIn();
      setWall('2026-09-05', '23:50');
      doCheckIn();
      S.at = startOfLocalDay('2026-09-06', S.tz) + 300;
      doCheckIn();
    },
  },
  {
    label: 'Fly Tokyo to Los Angeles',
    tz: 'Asia/Tokyo',
    hint: 'After a 10-hour flight west it is still 2026-11-10 in Los Angeles. That date was already counted in Tokyo, so flying west cannot replay a day. Press "Next day, same time" and check in again.',
    run() {
      setWall('2026-11-09', '20:00');
      doCheckIn();
      setWall('2026-11-10', '20:00');
      doCheckIn();
      travel('America/Los_Angeles', 10);
      doCheckIn();
    },
  },
  {
    label: 'Fly Los Angeles to Tokyo',
    tz: 'America/Los_Angeles',
    hint: 'A late flight east lands on 2026-11-12, so 2026-11-11 never shows on the user\'s clock. The user held one freeze, which covers the skipped date, and the streak continues.',
    run() {
      setWall('2026-11-09', '22:00');
      doFreeze();
      setWall('2026-11-09', '22:30');
      doCheckIn();
      setWall('2026-11-10', '22:30');
      doCheckIn();
      travel('Asia/Tokyo', 12);
      setWall('2026-11-12', '08:00');
      doCheckIn();
    },
  },
  {
    label: 'Grace window',
    tz: 'America/New_York',
    grace: 120,
    hint: 'With a 120-minute grace window, a check-in at 01:15 rescues the missed 2026-11-10, because the streak was still alive through that day. The evening check-in then counts for 2026-11-11.',
    run() {
      setWall('2026-11-09', '21:00');
      doCheckIn();
      setWall('2026-11-11', '01:15');
      doCheckIn();
      setWall('2026-11-11', '21:00');
      doCheckIn();
    },
  },
  {
    label: 'Freeze, then a break',
    tz: 'Europe/Budapest',
    hint: 'The user holds one freeze. It covers the missed 2026-11-05, so the streak goes on to 4. Then two days are missed with no freeze left: the streak breaks and the next check-in starts again at 1.',
    run() {
      setWall('2026-11-02', '19:00');
      doFreeze();
      setWall('2026-11-02', '19:05');
      doCheckIn();
      setWall('2026-11-03', '19:00');
      doCheckIn();
      setWall('2026-11-04', '19:00');
      doCheckIn();
      setWall('2026-11-06', '19:00');
      doCheckIn();
      setWall('2026-11-09', '19:00');
      doCheckIn();
    },
  },
];

function markPicked(id) {
  for (const b of document.querySelectorAll('#scenarios button')) b.setAttribute('aria-pressed', String(b.dataset.sc === String(id)));
}

function runScenario(sc) {
  markPicked(SCENARIOS.indexOf(sc));
  S = fresh(sc.tz, 0);
  S.grace = sc.grace ?? 0;
  sc.run();
  S.hint = sc.hint;
  render();
}

function startNow() {
  let tz = 'UTC';
  try {
    tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    utcOffset(0, tz);
  } catch {
    tz = 'UTC';
  }
  if (!ZONES.includes(tz)) ZONES.push(tz);
  markPicked('now');
  S = fresh(tz, Math.floor(Date.now() / 1000));
  S.hint = `Empty state in ${tz} at the current time. Check in, move the clock and change the zone.`;
  render();
}

function renderClock() {
  const w = wall(S.at, S.tz);
  const kitDate = localDate(S.at, S.tz, { dayStartMinutes: S.dayStart });
  const utcDate = new Date(S.at * 1000).toISOString().slice(0, 10);
  const len = dayLength(w.date, S.tz);
  $('clock').textContent = fmtLocal(S.at, S.tz);
  const rows = [
    ['Zone', `${esc(S.tz)}, ${fmtOffset(w.off)}`],
    ['Streak day (kit)', kitDate + (S.dayStart ? ' (day starts 04:00)' : '')],
    ['UTC date', utcDate + (utcDate !== kitDate ? ' <span class="tag warn">differs</span>' : '')],
    ['Local day length', fmtHours(len) + (len !== 86400 ? ' <span class="tag warn">clock change</span>' : '')],
    ['Unix time', `<span class="mono">${S.at}</span>`],
  ];
  $('clock-facts').innerHTML = rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('');
  const sel = $('tz');
  if (sel.options.length !== ZONES.length) sel.innerHTML = ZONES.map((z) => `<option value="${esc(z)}">${esc(z)}</option>`).join('');
  sel.value = S.tz;
  $('grace').value = String(S.grace);
  $('daystart').value = String(S.dayStart);
  $('tie').value = S.tie;
  $('hint').textContent = S.hint;
  const last = S.log[0];
  $('last').textContent = last ? `Last action: ${last.action}. ${last.result}${last.action === 'Check in' && last.xp ? `, +${last.xp} XP` : ''}.` : 'No action yet. Press Check in.';
  $('last').className = `last small ${last ? last.tone : ''}`.trim();
}

function bar(bps, label) {
  const pct = (bps / 100).toFixed(2);
  return `<div class="bar" role="progressbar" aria-label="${esc(label)}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(bps / 100)}"><span data-w="${pct}"></span></div>`;
}

function dayView() {
  const options = streakOptions();
  const st = streakStatus(S.streak, options);
  const next = checkIn(S.streak, options).result;
  const today = localDate(S.at, S.tz, { dayStartMinutes: S.dayStart });
  const last = S.streak.lastDate;
  const view = { ...S.days };
  if (!next.alreadyCheckedIn) {
    if (last !== null) {
      for (let d = addDays(last, 1); d < next.localDate; d = addDays(d, 1)) view[d] = { kind: next.broken ? 'missed' : 'pending', ahead: true };
    }
    view[next.localDate] = { kind: 'open', target: true };
    if (today !== next.localDate) view[today] = { kind: 'open' };
  }
  let runStart = null;
  if (st.alive) {
    for (let d = last; S.days[d] && S.days[d].kind !== 'missed'; d = addDays(d, -1)) {
      runStart = d;
      if (S.days[d].kind === 'counted' && S.days[d].streak === 1) break;
    }
  }
  const end = last !== null && last > today ? last : today;
  const cells = [];
  for (let i = WINDOW - 1; i >= 0; i--) {
    const date = addDays(end, -i);
    const v = view[date] ?? { kind: 'none' };
    cells.push({ date, ...v, today: date === today, run: runStart !== null && date >= runStart && date <= last });
  }
  return { st, next, today, cells };
}

function dayText(c) {
  if (c.kind === 'counted') return `counted${c.grace ? ' through the grace window' : ''}, streak ${c.streak}`;
  if (c.kind === 'freeze') return 'covered by a freeze';
  if (c.kind === 'pending') return 'not counted, the next check-in spends a freeze on it';
  if (c.kind === 'missed') return c.ahead ? 'missed, the streak has ended' : 'missed, the streak broke';
  if (c.kind === 'open') return c.target ? 'open, a check-in now counts for this day' : 'not counted yet';
  return 'no check-in';
}

function streakTag(st) {
  if (S.streak.lastDate === null) return '<span class="tag">Not started</span>';
  if (!st.alive) return '<span class="tag bad">Ended</span>';
  if (st.checkedInToday) return '<span class="tag good">Counted today</span>';
  return '<span class="tag warn">Open today</span>';
}

function dayCell(c) {
  const text = `${DAYS[weekday(c.date)]} ${c.date}: ${dayText(c)}${c.today ? ', today' : ''}${c.run ? ', in the current streak' : ''}`;
  return `<li class="day k-${c.kind}${c.run ? ' run' : ''}${c.today ? ' today' : ''}" title="${esc(text)}"><span class="day-n" aria-hidden="true">${Number(c.date.slice(8))}</span><span class="mk" aria-hidden="true">${MARKS[c.kind]}</span><span class="sr">${esc(text)}</span></li>`;
}

function renderHero({ st, cells }) {
  const lv = levelForXp(CURVE, S.xp);
  const w = wall(S.at, S.tz);
  const len = dayLength(w.date, S.tz);
  const strip = cells.slice(-7);
  $('hero-zone').textContent = S.tz;
  $('hero-preview').innerHTML = `
    <div class="pv-top">
      <p class="pv-num"><b>${st.streak}</b><span>day${st.streak === 1 ? '' : 's'} in a row</span></p>
      ${streakTag(st)}
    </div>
    <p class="pv-when"><span class="mono">${fmtLocal(S.at, S.tz)}</span><span>in ${esc(city(S.tz))}</span>${len !== 86400 ? `<span class="tag warn">${fmtHours(len)} day</span>` : ''}</p>
    <div class="wk">${strip.map((c) => `<span>${DAYS[weekday(c.date)]}</span>`).join('')}</div>
    <ol class="cal">${strip.map(dayCell).join('')}</ol>
    <div class="pv-xp">
      <p class="pv-xp-top"><b>Level ${lv.level}</b><span>${num(lv.xp)} XP</span></p>
      <div class="bar"><span data-w="${(lv.progressBps / 100).toFixed(2)}"></span></div>
      <p class="pv-xp-sub"><span>${num(lv.xpIntoLevel)} of ${num(lv.xpForNextLevel)} XP into level ${lv.level}</span><span>${num(lv.xpToNextLevel)} to level ${lv.level + 1}</span></p>
    </div>`;
}

function renderStreak({ st, next, cells }) {
  const ends = st.endsAt === null ? 'No active streak' : `${fmtLocal(st.endsAt, S.tz)} <span class="nowrap">(in ${fmtSpan(st.endsAt - S.at)})</span>`;
  const reward = SCHEDULE.map((_, i) => {
    const day = i + 1;
    const on = st.alive && st.cycleDay === day;
    return `<li class="${on ? 'on' : ''}"${on ? ' aria-current="true"' : ''}><span>Day ${day}</span><b>${streakReward(SCHEDULE, day)}</b></li>`;
  }).join('');
  $('streak-tag').innerHTML = streakTag(st);
  const count = (kind) => cells.filter((c) => c.kind === kind).length;
  const pending = count('pending');
  const notes = [`${count('counted')} counted, ${count('freeze')} covered by a freeze, ${count('missed')} missed.`];
  if (pending) notes.push(`The next check-in spends ${pending} freeze${pending > 1 ? 's' : ''}.`);
  if (S.streak.lastDate !== null && !st.alive) notes.push('The streak has ended, the next check-in starts again at 1.');
  if (next.usedGrace) notes.push('The grace window is open: a check-in now counts for yesterday.');
  const week = cells.slice(0, 7).map((c) => `<span>${DAYS[weekday(c.date)]}</span>`).join('');
  const days = cells.map(dayCell).join('');
  const legend = LEGEND.filter(([kind]) => kind !== 'pending' || pending).map(([kind, label]) => `<li class="k-${kind}"><span class="mk" aria-hidden="true">${MARKS[kind]}</span>${label}</li>`).join('');
  $('streak').innerHTML = `
    <p class="big"><b>${st.streak}</b> <span>day${st.streak === 1 ? '' : 's'} in a row</span></p>
    <div class="cal-top"><h4>Last ${WINDOW} days in the user's zone</h4><span class="small muted mono">${cells[0].date} to ${cells[WINDOW - 1].date}</span></div>
    <div class="wk" aria-hidden="true">${week}</div>
    <ol class="cal" aria-label="Last ${WINDOW} days, oldest first">${days}</ol>
    <ul class="legend" aria-label="Legend">${legend}<li class="k-today"><span class="mk" aria-hidden="true"></span>Today</li><li class="k-run"><span class="mk" aria-hidden="true"></span>Current streak</li></ul>
    <p class="small cal-note">${notes.join(' ')}</p>
    <dl class="kv">
      <div><dt>Longest</dt><dd>${S.streak.longest}</dd></div>
      <div><dt>Freezes held</dt><dd>${S.streak.freezes}</dd></div>
      <div><dt>Counted days, total</dt><dd>${S.streak.totalDays}</dd></div>
      <div><dt>Ends without a check-in</dt><dd>${ends}</dd></div>
    </dl>
    <div class="cycle-box">
      <p class="small muted">Check-in XP, a ${CYCLE}-day cycle from <code>streakReward</code>:</p>
      <ol class="cycle">${reward}</ol>
    </div>`;
}

function renderLevel() {
  const lv = levelForXp(CURVE, S.xp);
  const cap = applyXpCap(S.cap, { amount: 0, at: S.at, timeZone: S.tz, dailyCap: DAILY_CAP, dayStartMinutes: S.dayStart });
  const first = Math.max(1, lv.level - 1);
  const ladder = Array.from({ length: 5 }, (_, i) => first + i).map((l) => {
    const need = xpForLevel(CURVE, l);
    const on = l === lv.level;
    const state = l < lv.level ? 'Reached' : on ? 'Current' : `${num(need - lv.xp)} XP to go`;
    return `<li class="${on ? 'on' : ''}"${on ? ' aria-current="true"' : ''}><span>Level ${l}</span><span class="state">${state}</span><b>${num(need)} XP</b></li>`;
  }).join('');
  $('level').innerHTML = `
    <p class="big"><b>${lv.level}</b> <span>${num(lv.xp)} XP total</span></p>
    ${bar(lv.progressBps, `Progress to level ${lv.level + 1}`)}
    <p class="small bar-cap"><span>${num(lv.xpIntoLevel)} of ${num(lv.xpForNextLevel)} XP (${num(lv.progressBps)} bps)</span><span>${num(lv.xpToNextLevel)} to level ${lv.level + 1}</span></p>
    <p class="small muted ladder-h">Curve 100 x (L - 1)^2, thresholds from <code>xpForLevel</code>:</p>
    <ol class="ladder">${ladder}</ol>
    <dl class="kv">
      <div><dt>Granted today</dt><dd>${num(DAILY_CAP - cap.remaining)} of ${num(DAILY_CAP)} XP</dd></div>
      <div><dt>Daily cap resets</dt><dd>${fmtLocal(cap.resetsAt, S.tz)}</dd></div>
    </dl>`;
}

function renderQuests() {
  $('quests').innerHTML = `<ul class="quests">${QUESTS.map((q) => {
    const r = questProgress(S.quests[q.id] ?? null, questDef(q), { amount: 0, at: S.at, timeZone: S.tz }).result;
    const pct = Math.floor((r.progress * 10000) / r.target);
    return `<li>
      <div class="q-top"><span>${esc(q.label)}</span><span class="q-n">${num(r.progress)} / ${num(r.target)}${r.completed ? ' <span class="tag good">done</span>' : ''}</span></div>
      ${bar(pct, q.label)}
      <p class="small muted"><span class="mono">${esc(r.periodKey)}</span>, resets ${fmtLocal(r.resetsAt, S.tz)}</p>
    </li>`;
  }).join('')}</ul>
    <p class="small muted quests-note">Progress resets when the period key changes: daily at the day start, weekly on Monday, monthly on the 1st, all in the user's zone.</p>`;
}

function renderBoard() {
  const win = periodWindow({ period: 'week', at: S.at, timeZone: 'UTC' });
  const mine = S.week.key === win.key ? S.week.xp : 0;
  const ranked = rankEntries([...BOTS, { id: 'you', score: mine }], { tie: S.tie });
  const near = aroundId(ranked, 'you', 1).map((e) => `${e.id === 'you' ? 'You' : e.id} (${e.rank})`).join(', ');
  const rows = ranked.map((e) => `<tr class="${e.id === 'you' ? 'me' : ''}"><td>${e.rank}</td><td>${e.id === 'you' ? 'You' : esc(e.id)}</td><td class="r">${num(e.score)}</td></tr>`).join('');
  $('board').innerHTML = `
    <table><thead><tr><th scope="col">Rank</th><th scope="col">Player</th><th scope="col" class="r">XP this week</th></tr></thead><tbody>${rows}</tbody></table>
    <p class="small muted">Week <span class="mono">${win.firstDate}</span> to <span class="mono">${win.lastDate}</span> in UTC, one zone for everyone. Around you: ${near}.</p>`;
}

function renderLog() {
  if (!S.log.length) {
    $('log').innerHTML = '<p class="muted">Nothing yet. Check in or pick a scenario.</p>';
    return;
  }
  const rows = S.log.map((e) => `<tr class="${e.tone}">
    <td><span class="nowrap">${esc(e.local)}</span> <span class="muted">${esc(city(e.tz))}</span><br><span class="small muted">day ${e.date}${e.utc !== e.date ? `, UTC ${e.utc}` : ''}</span></td>
    <td><b>${esc(e.action)}</b><br><span class="res">${esc(e.result)}</span></td>
    <td class="r num" data-k="Streak">${e.streak}</td>
    <td class="r num" data-k="XP">${e.xp === null ? '' : `+${e.xp}`}</td>
  </tr>`).join('');
  $('log').innerHTML = `<table class="log"><thead><tr><th scope="col">User's time</th><th scope="col">Action and result</th><th scope="col" class="r">Streak</th><th scope="col" class="r">XP</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function renderCall() {
  if (!S.call) {
    $('call').textContent = 'No call yet.';
    return;
  }
  const args = S.call.args.map((a) => `  ${JSON.stringify(a)}`).join(',\n');
  $('call').textContent = `${S.call.name}(\n${args}\n)\n-> ${JSON.stringify(S.call.result)}`;
}

function render() {
  const view = dayView();
  renderClock();
  renderHero(view);
  renderStreak(view);
  renderLevel();
  renderQuests();
  renderBoard();
  renderLog();
  renderCall();
  for (const el of document.querySelectorAll('.bar span[data-w]')) el.style.width = `${el.dataset.w}%`;
}

function guard(fn) {
  return (...args) => {
    try {
      $('err').hidden = true;
      fn(...args);
    } catch (e) {
      $('err').textContent = `The library rejected that step: ${e.message}`;
      $('err').hidden = false;
    }
  };
}

function act(fn) {
  return guard(() => {
    S.hint = '';
    fn();
    render();
  });
}

const TICK = '<svg class="ic tick" aria-hidden="true" focusable="false"><use href="#i-check"/></svg>';
$('scenarios').innerHTML = SCENARIOS.map((sc, i) => `<button class="btn" type="button" data-sc="${i}" aria-pressed="false">${TICK}${esc(sc.label)}</button>`).join('') +
  `<button class="btn" type="button" data-sc="now" aria-pressed="false">${TICK}Start empty, now</button>`;
$('scenarios').addEventListener('click', guard((ev) => {
  const b = ev.target.closest('button[data-sc]');
  if (!b) return;
  if (b.dataset.sc === 'now') startNow();
  else runScenario(SCENARIOS[Number(b.dataset.sc)]);
}));
document.querySelectorAll('[data-move]').forEach((b) => b.addEventListener('click', guard(() => move(b.dataset.move))));
$('do-checkin').addEventListener('click', act(doCheckIn));
$('do-match').addEventListener('click', act(doMatch));
$('do-freeze').addEventListener('click', act(doFreeze));
$('tz').addEventListener('change', guard((ev) => {
  const from = S.tz;
  S.tz = ev.target.value;
  addLog(`Change zone ${city(from)} to ${city(S.tz)}`, `Same instant, local clock now ${fmtLocal(S.at, S.tz)}`);
  S.hint = '';
  render();
}));
$('grace').addEventListener('change', guard((ev) => {
  S.grace = Number(ev.target.value);
  render();
}));
$('daystart').addEventListener('change', guard((ev) => {
  S.dayStart = Number(ev.target.value);
  render();
}));
$('tie').addEventListener('change', guard((ev) => {
  S.tie = ev.target.value;
  render();
}));

guard(() => runScenario(SCENARIOS[0]))();
