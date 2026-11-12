import { fail, int, isObject, MAX_INT } from './errors.js';

const MAX = BigInt(MAX_INT);

function maxLevelOpt(v) {
  return v === undefined || v === null ? null : int(v, 'maxLevel', 1, undefined, 'invalid_curve');
}

/** Every level costs the same: level L needs (L - 1) x xpPerLevel XP. */
export function linearCurve(options = {}) {
  return normalizeCurve({ ...options, type: 'linear' });
}

/** Level L needs base x (L - 1)^exponent XP. Integer exponent from 1 to 4. */
export function polynomialCurve(options = {}) {
  return normalizeCurve({ ...options, type: 'polynomial' });
}

/** Explicit totals: thresholds[0] is level 1 and must be 0. */
export function tableCurve(thresholds, options = {}) {
  return normalizeCurve({ ...options, type: 'table', thresholds });
}

export function normalizeCurve(curve) {
  if (!isObject(curve)) fail('invalid_curve', 'curve must be an object');
  const allowed = { linear: ['xpPerLevel'], polynomial: ['base', 'exponent'], table: ['thresholds'] }[curve.type];
  if (!allowed) fail('invalid_curve', 'curve.type must be "linear", "polynomial" or "table"');
  for (const k of Object.keys(curve)) {
    if (k !== 'type' && k !== 'maxLevel' && !allowed.includes(k)) fail('invalid_curve', `unknown curve field "${k}"`);
  }
  const maxLevel = maxLevelOpt(curve.maxLevel);
  if (curve.type === 'linear') {
    return Object.freeze({ type: 'linear', xpPerLevel: int(curve.xpPerLevel, 'xpPerLevel', 1, undefined, 'invalid_curve'), maxLevel });
  }
  if (curve.type === 'polynomial') {
    return Object.freeze({
      type: 'polynomial',
      base: int(curve.base, 'base', 1, undefined, 'invalid_curve'),
      exponent: int(curve.exponent, 'exponent', 1, 4, 'invalid_curve'),
      maxLevel,
    });
  }
  const t = curve.thresholds;
  if (!Array.isArray(t) || t.length === 0) fail('invalid_curve', 'thresholds must be a non-empty array');
  t.forEach((v, i) => {
    int(v, `thresholds[${i}]`, 0, undefined, 'invalid_curve');
    if (i === 0 && v !== 0) fail('invalid_curve', 'thresholds[0] must be 0 (level 1)');
    if (i > 0 && v <= t[i - 1]) fail('invalid_curve', 'thresholds must be strictly increasing');
  });
  if (maxLevel !== null && maxLevel > t.length) fail('invalid_curve', 'maxLevel is beyond the table');
  return Object.freeze({ type: 'table', thresholds: Object.freeze([...t]), maxLevel: maxLevel ?? t.length });
}

/** Total XP for `level` on a normalized curve, or null when it exceeds 2^53 - 1. */
function xpAt(c, level) {
  if (c.type === 'table') return c.thresholds[level - 1];
  const n = BigInt(level - 1);
  const v = c.type === 'linear' ? n * BigInt(c.xpPerLevel) : BigInt(c.base) * n ** BigInt(c.exponent);
  return v > MAX ? null : Number(v);
}

const capOf = (c) => c.maxLevel ?? MAX_INT;

/** Total XP needed to reach `level`. */
export function xpForLevel(curve, level) {
  const c = normalizeCurve(curve);
  int(level, 'level', 1, capOf(c), 'level_out_of_range');
  const v = xpAt(c, level);
  if (v === null) fail('xp_out_of_range', `level ${level} needs more than 2^53 - 1 XP`);
  return v;
}

function bps(part, whole) {
  return Number((BigInt(part) * 10000n) / BigInt(whole));
}

/** Level, progress and the XP still missing for a total of `xp`. */
export function levelForXp(curve, xp) {
  const c = normalizeCurve(curve);
  int(xp, 'xp', 0, undefined, 'invalid_option');
  const cap = capOf(c);
  const fits = (l) => {
    const v = xpAt(c, l);
    return v !== null && v <= xp;
  };
  let lo = 1;
  let hi = 2;
  while (hi <= cap && fits(hi)) {
    lo = hi;
    hi *= 2;
  }
  hi = Math.min(hi, cap + 1);
  while (hi - lo > 1) {
    const mid = lo + Math.floor((hi - lo) / 2);
    if (fits(mid)) lo = mid;
    else hi = mid;
  }
  const level = lo;
  const levelXp = xpAt(c, level);
  const nextLevelXp = level < cap ? xpAt(c, level + 1) : null;
  if (nextLevelXp === null) {
    return { level, xp, levelXp, nextLevelXp: null, xpIntoLevel: xp - levelXp, xpForNextLevel: 0, xpToNextLevel: 0, progressBps: 10000, isMaxLevel: true };
  }
  const span = nextLevelXp - levelXp;
  return {
    level,
    xp,
    levelXp,
    nextLevelXp,
    xpIntoLevel: xp - levelXp,
    xpForNextLevel: span,
    xpToNextLevel: nextLevelXp - xp,
    progressBps: bps(xp - levelXp, span),
    isMaxLevel: false,
  };
}
