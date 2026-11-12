import { checkIn, streakStatus, polynomialCurve, levelForXp, defineQuest, questProgress, applyXpCap, rankEntries } from 'gamification-kit';

const timeZone = 'America/New_York'; // the user's zone, saved on their profile
const at = 1794450600; // 2026-11-11 21:30 in New York; in production Math.floor(Date.now() / 1000)

// Daily check-in: load the saved state, check in, save the returned state.
const saved = { lastDate: '2026-11-09', streak: 4, longest: 9, freezes: 1 };
const { state, result } = checkIn(saved, { at, timeZone });
console.log(JSON.stringify({ streak: result.streak, usedFreezes: result.usedFreezes, lastDate: state.lastDate }));
// -> {"streak":5,"usedFreezes":1,"lastDate":"2026-11-11"}

// An hour later: today is done, and the streak lasts until Nov 13 starts in New York.
console.log(JSON.stringify(streakStatus(state, { at: at + 3600, timeZone })));
// -> {"alive":true,"streak":5,"checkedInToday":true,"freezesNeeded":0,"endsAt":1794546000,"cycleDay":5}

// Levels: level L needs 100 x (L - 1)^2 XP.
const curve = polynomialCurve({ base: 100, exponent: 2 });
const level = levelForXp(curve, 950);
console.log(JSON.stringify([level.level, level.xpToNextLevel, level.progressBps]));
// -> [4,650,714]

// A daily quest that resets at local midnight.
const quest = defineQuest({ id: 'win-3-matches', target: 3, reset: 'daily' });
const q = questProgress(null, quest, { amount: 1, at, timeZone });
console.log(JSON.stringify(q.result));
// -> {"progress":1,"target":3,"completed":false,"justCompleted":false,"periodKey":"day:2026-11-11","resetsAt":1794459600}

// At most 500 XP a day: 450 were already granted today.
const cap = applyXpCap({ date: '2026-11-11', granted: 450 }, { amount: 100, at, timeZone, dailyCap: 500 });
console.log(JSON.stringify([cap.granted, cap.capped]));
// -> [50,50]

// A weekly board with shared ranks for ties.
const board = rankEntries(
  [
    { id: 'mia', score: 1200 },
    { id: 'leo', score: 1500 },
    { id: 'ava', score: 1200 },
    { id: 'kai', score: 900 },
  ],
  { tie: 'shared' },
);
console.log(board.map((e) => `${e.rank}. ${e.id}`).join(', '));
// -> 1. leo, 2. ava, 2. mia, 4. kai
