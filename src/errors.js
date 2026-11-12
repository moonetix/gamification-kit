/** Error thrown for invalid input. `code` is stable and identical in the PHP port. */
export class GamificationError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'GamificationError';
    this.code = code;
  }
}

export const MAX_INT = Number.MAX_SAFE_INTEGER;
export const MIN_AT = -2208988800; // 1900-01-01T00:00:00Z
export const MAX_AT = 253402300799; // 9999-12-31T23:59:59Z

export function fail(code, message) {
  throw new GamificationError(code, message);
}

export function isObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

export function checkOptions(options, allowed, name = 'options') {
  if (options === undefined || options === null) return {};
  if (!isObject(options)) fail('invalid_option', `${name} must be an object`);
  for (const key of Object.keys(options)) {
    if (!allowed.includes(key)) fail('invalid_option', `unknown option "${key}"`);
  }
  return options;
}

export function int(value, name, min = -MAX_INT, max = MAX_INT, code = 'invalid_option') {
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) fail(code, `${name} must be an integer`);
  if (value < min || value > max) fail(code, `${name} must be from ${min} to ${max}`);
  return value;
}

export function instant(value, name = 'at') {
  return int(value, name, MIN_AT, MAX_AT, 'invalid_instant');
}
