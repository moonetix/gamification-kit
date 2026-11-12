import { fail, int, isObject, checkOptions } from './errors.js';

const TIES = ['shared', 'dense', 'ordinal', 'earliest'];
const encoder = new TextEncoder();

// Integers first in numeric order, then strings by UTF-8 bytes, so the PHP port sorts identically.
function compareIds(a, b) {
  const aInt = typeof a === 'number';
  const bInt = typeof b === 'number';
  if (aInt && bInt) return a - b;
  if (aInt !== bInt) return aInt ? -1 : 1;
  const x = encoder.encode(a);
  const y = encoder.encode(b);
  const n = Math.min(x.length, y.length);
  for (let i = 0; i < n; i++) if (x[i] !== y[i]) return x[i] - y[i];
  return x.length - y.length;
}

/**
 * Sorts entries by score (highest first) and assigns ranks.
 * shared: 1, 1, 3. dense: 1, 1, 2. ordinal: 1, 2, 3 (ties broken by id).
 * earliest: equal scores ranked by reachedAt, earlier first; equal reachedAt share a rank.
 */
export function rankEntries(entries, options) {
  const o = checkOptions(options, ['tie']);
  const tie = o.tie ?? 'shared';
  if (!TIES.includes(tie)) fail('invalid_option', 'tie must be "shared", "dense", "ordinal" or "earliest"');
  if (!Array.isArray(entries)) fail('invalid_entry', 'entries must be an array');
  const seen = new Set();
  const list = entries.map((e, i) => {
    if (!isObject(e)) fail('invalid_entry', `entries[${i}] must be an object`);
    const id = e.id;
    if (!(typeof id === 'string' && id !== '') && !(typeof id === 'number' && Number.isSafeInteger(id))) {
      fail('invalid_entry', `entries[${i}].id must be a non-empty string or an integer`);
    }
    const dupKey = `${typeof id}:${id}`;
    if (seen.has(dupKey)) fail('duplicate_id', `duplicate id ${JSON.stringify(id)}`);
    seen.add(dupKey);
    const score = int(e.score, `entries[${i}].score`, undefined, undefined, 'invalid_entry');
    const out = { ...e, id, score };
    if (tie === 'earliest') {
      if (e.reachedAt === undefined || e.reachedAt === null) fail('missing_reached_at', `entries[${i}].reachedAt is required for tie "earliest"`);
      out.reachedAt = int(e.reachedAt, `entries[${i}].reachedAt`, undefined, undefined, 'invalid_entry');
    }
    return out;
  });

  list.sort((a, b) => b.score - a.score || (tie === 'earliest' ? a.reachedAt - b.reachedAt : 0) || compareIds(a.id, b.id));

  let rank = 0;
  let dense = 0;
  return list.map((e, i) => {
    const prev = list[i - 1];
    const same = prev !== undefined && prev.score === e.score && (tie !== 'earliest' || prev.reachedAt === e.reachedAt);
    if (tie === 'ordinal') rank = i + 1;
    else if (!same) {
      rank = i + 1;
      dense += 1;
    }
    return { ...e, rank: tie === 'dense' ? dense : rank };
  });
}

/** Entries within `radius` places of `id` in a ranked list, for "you and the players around you". */
export function aroundId(ranked, id, radius = 2) {
  if (!Array.isArray(ranked)) fail('invalid_entry', 'ranked must be an array');
  int(radius, 'radius', 0);
  const i = ranked.findIndex((e) => isObject(e) && e.id === id);
  if (i < 0) return [];
  return ranked.slice(Math.max(0, i - radius), i + radius + 1);
}
