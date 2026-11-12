// gamification-kit: streaks, levels, quests, leaderboards and caps that agree across time zones.
// Instants are integer Unix seconds, dates are "YYYY-MM-DD", zones are IANA names.

export { GamificationError } from './errors.js';
export { localDate, startOfLocalDay, periodWindow, addDays, daysBetween, weekday, utcOffset, assertTimeZone } from './time.js';
export { checkIn, streakStatus, streakReward } from './streaks.js';
export { linearCurve, polynomialCurve, tableCurve, levelForXp, xpForLevel } from './levels.js';
export { defineQuest, questProgress } from './quests.js';
export { rankEntries, aroundId } from './leaderboard.js';
export { applyXpCap, cooldown, changeTimeZone } from './caps.js';
