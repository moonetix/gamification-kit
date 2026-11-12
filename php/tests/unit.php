<?php

declare(strict_types=1);

// PHP-specific checks, included by run.php after the shared vectors.

use Moonetix\Gamification\Gamification as G;
use Moonetix\Gamification\GamificationException;

// Every 2026 day whose length is not 24 hours, from the published tz rules.
$unusualDays = [
    'America/New_York' => ['2026-03-08' => 23 * 3600, '2026-11-01' => 25 * 3600],
    'Europe/Budapest' => ['2026-03-29' => 23 * 3600, '2026-10-25' => 25 * 3600],
    'Australia/Lord_Howe' => ['2026-04-05' => 88200, '2026-10-04' => 84600],
    'America/Santiago' => ['2026-04-04' => 25 * 3600, '2026-09-06' => 23 * 3600],
    'Asia/Beirut' => ['2026-03-29' => 23 * 3600, '2026-10-24' => 25 * 3600],
    'Pacific/Kiritimati' => [],
    'Pacific/Pago_Pago' => [],
];

foreach ($unusualDays as $zone => $expected) {
    check("$zone: day lengths over all of 2026", function () use ($zone) {
        $found = [];
        for ($d = '2026-01-01'; $d !== '2027-01-01'; $d = G::addDays($d, 1)) {
            $length = G::startOfLocalDay(G::addDays($d, 1), $zone) - G::startOfLocalDay($d, $zone);
            if ($length !== 86400) {
                $found[$d] = $length;
            }
        }
        return $found;
    }, $expected);

    check("$zone: localDate agrees with DateTimeImmutable for every half hour of 2026", function () use ($zone) {
        $tz = new DateTimeZone($zone);
        for ($t = 1767225600 - 86400; $t < 1798761600 + 86400; $t += 1800) {
            $native = (new DateTimeImmutable('@' . $t))->setTimezone($tz)->format('Y-m-d');
            if (G::localDate($t, $zone) !== $native) {
                return "differs at $t";
            }
        }
        return 'ok';
    }, 'ok');

    // PHP resolves a skipped midnight by moving forward by the gap, which lands on the same
    // instant as our rule in these zones; the check documents that, it is not relied upon.
    check("$zone: startOfLocalDay agrees with PHP's own midnight for 2026", function () use ($zone) {
        $tz = new DateTimeZone($zone);
        for ($d = '2026-01-01'; $d !== '2027-01-01'; $d = G::addDays($d, 1)) {
            $native = (new DateTimeImmutable("$d 00:00:00", $tz))->getTimestamp();
            if (G::startOfLocalDay($d, $zone) !== $native) {
                return "differs on $d";
            }
        }
        return 'ok';
    }, 'ok');
}

check('Lord Howe moves by 30 minutes, not an hour', fn() => [G::utcOffset(1775314799, 'Australia/Lord_Howe'), G::utcOffset(1775314800, 'Australia/Lord_Howe')], [39600, 37800]);

check('results do not depend on date.timezone', function () {
    $saved = date_default_timezone_get();
    $out = [];
    foreach (['UTC', 'Pacific/Kiritimati', 'Pacific/Pago_Pago', 'Asia/Kathmandu'] as $host) {
        date_default_timezone_set($host);
        $out[] = json_encode([
            G::localDate(1788667199, 'America/Santiago'),
            G::startOfLocalDay('2026-03-29', 'Europe/Budapest'),
            G::periodWindow(['period' => 'week', 'at' => 1793512800, 'timeZone' => 'America/New_York']),
        ]);
    }
    date_default_timezone_set($saved);
    return count(array_unique($out));
}, 1);

check('GamificationException is an InvalidArgumentException with a string code', function () {
    try {
        G::localDate(0, 'Not/AZone');
    } catch (GamificationException $e) {
        return [$e instanceof InvalidArgumentException, $e->getCode()];
    }
    return null;
}, [true, 'invalid_time_zone']);

check('a list is not accepted as options', fn() => G::localDate(0, 'UTC', [240]), null, 'invalid_option');
check('a list is not accepted as state', fn() => G::checkIn([1, 2], ['at' => 0, 'timeZone' => 'UTC']), null, 'invalid_state');
check('XP of 2^53 is rejected for parity with JavaScript', fn() => G::levelForXp(G::linearCurve(['xpPerLevel' => 1]), 2 ** 53), null, 'invalid_option');
check('a float that looks whole is still not an integer', fn() => G::localDate(1794304800.0, 'UTC'), null, 'invalid_instant');

check('progress near 2^53 does not overflow to float', function () {
    $r = G::levelForXp(G::linearCurve(['xpPerLevel' => 9007199254740991]), 9007199254740990);
    return [is_int($r['progressBps']), $r['progressBps']];
}, [true, 9999]);

check('a full year of daily check-ins in Lord Howe keeps one unbroken streak', function () {
    $state = null;
    for ($d = '2026-01-01'; $d !== '2027-01-01'; $d = G::addDays($d, 1)) {
        $r = G::checkIn($state, ['at' => G::startOfLocalDay($d, 'Australia/Lord_Howe') + 23 * 3600, 'timeZone' => 'Australia/Lord_Howe']);
        if (!$r['result']['counted'] || $r['result']['broken'] || $r['result']['localDate'] !== $d) {
            return "broke on $d";
        }
        $state = $r['state'];
    }
    return $state['streak'];
}, 365);

check('levelForXp and xpForLevel agree on every level boundary', function () {
    foreach ([G::linearCurve(['xpPerLevel' => 250]), G::polynomialCurve(['base' => 7, 'exponent' => 3]), G::tableCurve([0, 1, 3, 10, 30, 100])] as $curve) {
        for ($level = 1; $level <= 6; $level++) {
            $xp = G::xpForLevel($curve, $level);
            if (G::levelForXp($curve, $xp)['level'] !== $level || ($xp > 0 && G::levelForXp($curve, $xp - 1)['level'] !== $level - 1)) {
                return "mismatch at level $level";
            }
        }
    }
    return 'ok';
}, 'ok');
