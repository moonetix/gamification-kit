import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { localDate, startOfLocalDay, addDays, utcOffset } from '../src/index.js';

// Every 2026 day whose length is not 24 hours, from the published tz rules.
const unusualDays = {
  'America/New_York': { '2026-03-08': 23 * 3600, '2026-11-01': 25 * 3600 },
  'Europe/Budapest': { '2026-03-29': 23 * 3600, '2026-10-25': 25 * 3600 },
  'Australia/Lord_Howe': { '2026-04-05': 24.5 * 3600, '2026-10-04': 23.5 * 3600 },
  'America/Santiago': { '2026-04-04': 25 * 3600, '2026-09-06': 23 * 3600 },
  'Asia/Beirut': { '2026-03-29': 23 * 3600, '2026-10-24': 25 * 3600 },
  'Pacific/Kiritimati': {},
  'Pacific/Pago_Pago': {},
};

for (const [zone, expected] of Object.entries(unusualDays)) {
  test(`${zone}: day lengths over all of 2026`, () => {
    const found = {};
    for (let d = '2026-01-01'; d !== '2027-01-01'; d = addDays(d, 1)) {
      const length = startOfLocalDay(addDays(d, 1), zone) - startOfLocalDay(d, zone);
      if (length !== 86400) found[d] = length;
    }
    assert.deepEqual(found, expected);
  });

  test(`${zone}: localDate agrees with Intl for every hour and half hour of 2026`, () => {
    const intl = new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' });
    for (let t = 1767225600 - 86400; t < 1798761600 + 86400; t += 1800) {
      assert.equal(localDate(t, zone), intl.format(new Date(t * 1000)), `${zone} at ${t}`);
    }
  });

  test(`${zone}: each day starts exactly once`, () => {
    for (let d = '2026-01-01'; d !== '2027-01-01'; d = addDays(d, 1)) {
      const start = startOfLocalDay(d, zone);
      assert.equal(localDate(start, zone), d);
      assert.equal(localDate(start - 1, zone), addDays(d, -1));
    }
  });
}

test('Lord Howe moves by 30 minutes, not an hour', () => {
  assert.equal(utcOffset(1775314799, 'Australia/Lord_Howe'), 11 * 3600);
  assert.equal(utcOffset(1775314800, 'Australia/Lord_Howe'), 10.5 * 3600);
});

test('results do not depend on the host time zone', () => {
  const script = `import('${new URL('../src/index.js', import.meta.url).href}').then((k) => {
    process.stdout.write(JSON.stringify([k.localDate(1788667199, 'America/Santiago'), k.startOfLocalDay('2026-03-29', 'Europe/Budapest'), k.periodWindow({ period: 'week', at: 1793512800, timeZone: 'America/New_York' })]));
  })`;
  const outputs = ['UTC', 'Pacific/Kiritimati', 'Pacific/Pago_Pago', 'Asia/Kathmandu'].map((tz) => {
    const r = spawnSync(process.execPath, ['--input-type=module', '-e', script], { env: { ...process.env, TZ: tz }, encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    return r.stdout;
  });
  assert.equal(new Set(outputs).size, 1, outputs.join('\n'));
});
