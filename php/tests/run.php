<?php

declare(strict_types=1);

// Plain test runner: php php/tests/run.php
// Runs the shared vectors in test-vectors/vectors.json, then the PHP-specific checks in unit.php.

require __DIR__ . '/../src/GamificationException.php';
require __DIR__ . '/../src/Time.php';
require __DIR__ . '/../src/Gamification.php';

use Moonetix\Gamification\Gamification as G;
use Moonetix\Gamification\GamificationException;

set_error_handler(static function (int $no, string $msg, string $file, int $line): bool {
    throw new ErrorException($msg, 0, $no, $file, $line);
});

$vectors = json_decode((string)file_get_contents(__DIR__ . '/../../test-vectors/vectors.json'), true, 512, JSON_THROW_ON_ERROR);

$passed = 0;
$failed = 0;

/** Sorts object keys recursively so key order does not matter, but types and values do. */
function canon(mixed $v): mixed
{
    if (!is_array($v)) {
        return $v;
    }
    $v = array_map('canon', $v);
    if (!array_is_list($v)) {
        ksort($v);
    }
    return $v;
}

function check(string $label, callable $fn, mixed $expected = null, ?string $throws = null): void
{
    global $passed, $failed;
    try {
        $got = $fn();
        if ($throws !== null) {
            $failed++;
            echo "FAIL $label: expected $throws, got " . json_encode($got) . "\n";
            return;
        }
        if (canon($got) === canon($expected)) {
            $passed++;
            return;
        }
        $failed++;
        echo "FAIL $label\n  expected " . json_encode($expected) . "\n  got      " . json_encode($got) . "\n";
    } catch (GamificationException $e) {
        if ($throws !== null && $e->getCode() === $throws) {
            $passed++;
            return;
        }
        $failed++;
        echo "FAIL $label: threw {$e->getCode()} {$e->getMessage()}\n";
    } catch (Throwable $e) {
        $failed++;
        echo "FAIL $label: " . get_class($e) . ' ' . $e->getMessage() . "\n";
    }
}

function sequence(array $c, callable $step): array
{
    $state = $c['state'];
    $out = [];
    foreach ($c['steps'] as $s) {
        $r = $step($state, $s);
        $state = $r['state'];
        $out[] = $r;
    }
    return $out;
}

$day = static fn(array $c): ?array => array_key_exists('dayStartMinutes', $c) ? ['dayStartMinutes' => $c['dayStartMinutes']] : null;
$steps = static fn(array $c): array => array_map(static fn($s) => ['state' => $s['state'], 'result' => $s['result']], $c['steps']);
$outs = static fn(array $c): array => array_map(static fn($s) => $s['out'], $c['steps']);

$runners = [
    'localDate' => [fn($c) => G::localDate($c['at'], $c['timeZone'], $day($c))],
    'startOfLocalDay' => [fn($c) => G::startOfLocalDay($c['date'], $c['timeZone'], $day($c))],
    'periodWindow' => [fn($c) => G::periodWindow($c['options'])],
    'utcOffset' => [fn($c) => G::utcOffset($c['at'], $c['timeZone'])],
    'addDays' => [fn($c) => G::addDays($c['date'], $c['n'])],
    'daysBetween' => [fn($c) => G::daysBetween($c['from'], $c['to'])],
    'weekday' => [fn($c) => G::weekday($c['date'])],
    'checkIn' => [
        fn($c) => sequence($c, fn($state, $s) => G::checkIn($state, array_merge($c['options'], ['at' => $s['at']], isset($s['timeZone']) ? ['timeZone' => $s['timeZone']] : []))),
        $steps,
    ],
    'checkInErrors' => [fn($c) => G::checkIn($c['state'], $c['options'])],
    'streakStatus' => [fn($c) => G::streakStatus($c['state'], $c['options'])],
    'streakReward' => [fn($c) => G::streakReward($c['schedule'], $c['day'])],
    'levelForXp' => [fn($c) => G::levelForXp($c['curve'], $c['xp'])],
    'xpForLevel' => [fn($c) => G::xpForLevel($c['curve'], $c['level'])],
    'curves' => [fn($c) => $c['fn'] === 'tableCurve' ? G::tableCurve($c['thresholds'], $c['options']) : G::{$c['fn']}($c['options'])],
    'defineQuest' => [fn($c) => G::defineQuest($c['quest'])],
    'questProgress' => [fn($c) => sequence($c, fn($state, $s) => G::questProgress($state, $c['quest'], $s['options'])), $steps],
    'questProgressErrors' => [fn($c) => G::questProgress($c['state'], $c['quest'], $c['options'])],
    'rankEntries' => [fn($c) => G::rankEntries($c['entries'], $c['options'])],
    'aroundId' => [fn($c) => G::aroundId($c['ranked'], $c['id'], $c['radius'])],
    'applyXpCap' => [fn($c) => sequence($c, fn($state, $s) => G::applyXpCap($state, $s['options'])), $outs],
    'applyXpCapErrors' => [fn($c) => G::applyXpCap($c['state'], $c['options'])],
    'cooldown' => [fn($c) => G::cooldown($c['lastAt'], $c['at'], $c['seconds'])],
    'changeTimeZone' => [fn($c) => sequence($c, fn($state, $s) => G::changeTimeZone($state, $s['options'])), $outs],
    'changeTimeZoneErrors' => [fn($c) => G::changeTimeZone($c['state'], $c['options'])],
];

$groups = array_keys(array_filter($vectors, 'is_array'));
sort($groups);
$names = array_keys($runners);
sort($names);
check('every vector group has a runner', fn() => $names, $groups);

foreach ($runners as $group => $runner) {
    $cases = $vectors[$group] ?? [];
    if ($cases === []) {
        $failed++;
        echo "FAIL no vectors for $group\n";
        continue;
    }
    [$run, $expected] = $runner + [1 => static fn(array $c) => $c['out'] ?? null];
    foreach ($cases as $i => $c) {
        $label = "{$group}[{$i}]" . (isset($c['name']) ? ' ' . $c['name'] : '');
        check($label, fn() => $run($c), isset($c['throws']) ? null : $expected($c), $c['throws'] ?? null);
    }
}

require __DIR__ . '/unit.php';

echo ($failed === 0 ? 'OK' : 'FAILED') . ": $passed passed, $failed failed (PHP " . PHP_VERSION . ', tz ' . date_default_timezone_get() . ")\n";
exit($failed === 0 ? 0 : 1);
