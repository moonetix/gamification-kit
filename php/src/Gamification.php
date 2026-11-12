<?php

declare(strict_types=1);

namespace Moonetix\Gamification;

use Moonetix\Gamification\Time as T;

/**
 * Streaks, levels, quests, leaderboards and caps that agree across time zones.
 * Same functions, options and results as the JavaScript package. Instants are integer
 * Unix seconds, dates are "YYYY-MM-DD", zones are IANA names, state is a plain array.
 */
final class Gamification
{
    private const STREAK_OPTIONS = ['at', 'timeZone', 'graceMinutes', 'dayStartMinutes', 'maxStreak', 'cycleLength'];
    private const RESETS = ['daily' => 'day', 'weekly' => 'week', 'monthly' => 'month', 'never' => null];
    private const TIES = ['shared', 'dense', 'ordinal', 'earliest'];

    // Time

    public static function localDate(mixed $at, mixed $timeZone, ?array $options = null): string
    {
        $o = T::options($options, ['dayStartMinutes']);
        $at = T::instant($at);
        return T::formatDays(T::localDays($at, T::zone($timeZone), T::dayStart($o)));
    }

    public static function startOfLocalDay(mixed $date, mixed $timeZone, ?array $options = null): int
    {
        $o = T::options($options, ['dayStartMinutes']);
        $days = T::parseDate($date);
        return T::startOfDays($days, T::zone($timeZone), T::dayStart($o));
    }

    /** @return array{key: string, start: int, end: int, firstDate: string, lastDate: string} */
    public static function periodWindow(array $options): array
    {
        $o = T::options($options, ['period', 'at', 'timeZone', 'weekStartsOn', 'dayStartMinutes']);
        $period = $o['period'] ?? null;
        if (!in_array($period, ['day', 'week', 'month'], true)) {
            T::fail('invalid_option', 'period must be "day", "week" or "month"');
        }
        $at = T::instant($o['at'] ?? null);
        $zone = T::zone($o['timeZone'] ?? null);
        $ds = T::dayStart($o);
        [$first, $next] = T::periodBounds($period, T::localDays($at, $zone, $ds), T::weekStart($o));
        return [
            'key' => T::periodKey($period, $first),
            'start' => T::startOfDays($first, $zone, $ds),
            'end' => T::startOfDays($next, $zone, $ds),
            'firstDate' => T::formatDays($first),
            'lastDate' => T::formatDays($next - 1),
        ];
    }

    public static function addDays(mixed $date, mixed $n): string
    {
        $days = T::parseDate($date);
        return T::formatDays($days + T::int($n, 'n'));
    }

    public static function daysBetween(mixed $from, mixed $to): int
    {
        return T::parseDate($to, 'to') - T::parseDate($from, 'from');
    }

    public static function weekday(mixed $date): int
    {
        return T::dow(T::parseDate($date));
    }

    public static function utcOffset(mixed $at, mixed $timeZone): int
    {
        return T::utcOffset(T::instant($at), T::zone($timeZone));
    }

    public static function assertTimeZone(mixed $timeZone): string
    {
        return T::assertTimeZone($timeZone);
    }

    // Streaks

    private static function streakState(mixed $state): array
    {
        $state ??= [];
        if (!T::isObject($state)) {
            T::fail('invalid_state', 'state must be an object');
        }
        $lastDate = $state['lastDate'] ?? null;
        $out = array_merge($state, [
            'lastDate' => $lastDate,
            'streak' => T::int($state['streak'] ?? 0, 'state.streak', 0, T::MAX_INT, 'invalid_state'),
            'longest' => T::int($state['longest'] ?? 0, 'state.longest', 0, T::MAX_INT, 'invalid_state'),
            'freezes' => T::int($state['freezes'] ?? 0, 'state.freezes', 0, T::MAX_INT, 'invalid_state'),
            'totalDays' => T::int($state['totalDays'] ?? 0, 'state.totalDays', 0, T::MAX_INT, 'invalid_state'),
        ]);
        if ($lastDate !== null) {
            try {
                T::parseDate($lastDate, 'state.lastDate');
            } catch (GamificationException $e) {
                T::fail('invalid_state', $e->getMessage());
            }
        }
        if ($lastDate === null && $out['streak'] !== 0) {
            T::fail('invalid_state', 'state.streak must be 0 when lastDate is null');
        }
        return $out;
    }

    /** @return array{at: int, zone: \DateTimeZone, ds: int, grace: int, maxStreak: ?int, cycle: ?int} */
    private static function streakOptions(array $o): array
    {
        return [
            'at' => T::instant($o['at'] ?? null),
            'zone' => T::zone($o['timeZone'] ?? null),
            'ds' => T::dayStart($o),
            'grace' => array_key_exists('graceMinutes', $o) ? T::int($o['graceMinutes'], 'graceMinutes', 0, 1439) : 0,
            'maxStreak' => ($o['maxStreak'] ?? null) === null ? null : T::int($o['maxStreak'], 'maxStreak', 1),
            'cycle' => ($o['cycleLength'] ?? null) === null ? null : T::int($o['cycleLength'], 'cycleLength', 1),
        ];
    }

    private static function cycleDay(int $streak, ?int $cycle): int
    {
        return $cycle === null || $streak === 0 ? $streak : (($streak - 1) % $cycle) + 1;
    }

    /**
     * Records a daily check-in. A second check-in on the same local day changes nothing.
     *
     * @return array{state: array<string, mixed>, result: array<string, mixed>}
     */
    public static function checkIn(?array $state, array $options): array
    {
        $s = self::streakState($state);
        $o = T::options($options, self::STREAK_OPTIONS);
        ['at' => $at, 'zone' => $zone, 'ds' => $ds, 'grace' => $grace, 'maxStreak' => $maxStreak, 'cycle' => $cycle] = self::streakOptions($o);

        $today = T::localDays($at, $zone, $ds);
        $last = $s['lastDate'] === null ? null : T::parseDate($s['lastDate']);
        $day = $today;
        $usedGrace = false;

        // A check-in just after the boundary may rescue a missed yesterday, but only while the
        // streak is still alive through yesterday; otherwise there is nothing to rescue.
        if ($grace > 0 && $last !== null && $last < $today - 1 && $today - 1 - $last - 1 <= $s['freezes']) {
            if ($at < T::startOfDays($today, $zone, $ds) + $grace * 60) {
                $day = $today - 1;
                $usedGrace = true;
            }
        }

        $result = [
            'counted' => false,
            'alreadyCheckedIn' => false,
            'localDate' => T::formatDays($day),
            'streak' => $s['streak'],
            'longest' => $s['longest'],
            'cycleDay' => self::cycleDay($s['streak'], $cycle),
            'usedFreezes' => 0,
            'usedGrace' => false,
            'broken' => false,
        ];

        if ($last !== null && $day <= $last) {
            $result['alreadyCheckedIn'] = true;
            $result['localDate'] = T::formatDays($today);
            return ['state' => $s, 'result' => $result];
        }

        if ($last === null) {
            $streak = 1;
        } else {
            $missed = $day - $last - 1;
            if ($missed <= $s['freezes']) {
                $result['usedFreezes'] = $missed;
                $streak = $s['streak'] + 1;
            } else {
                $result['broken'] = true;
                $streak = 1;
            }
        }
        if ($maxStreak !== null && $streak > $maxStreak) {
            $streak = $maxStreak;
        }

        $next = array_merge($s, [
            'lastDate' => T::formatDays($day),
            'streak' => $streak,
            'longest' => max($s['longest'], $streak),
            'freezes' => $s['freezes'] - $result['usedFreezes'],
            'totalDays' => $s['totalDays'] + 1,
        ]);
        $result['counted'] = true;
        $result['streak'] = $streak;
        $result['longest'] = $next['longest'];
        $result['cycleDay'] = self::cycleDay($streak, $cycle);
        $result['usedGrace'] = $usedGrace;
        return ['state' => $next, 'result' => $result];
    }

    /** @return array{alive: bool, streak: int, checkedInToday: bool, freezesNeeded: int, endsAt: ?int, cycleDay: int} */
    public static function streakStatus(?array $state, array $options): array
    {
        $s = self::streakState($state);
        $o = T::options($options, self::STREAK_OPTIONS);
        ['at' => $at, 'zone' => $zone, 'ds' => $ds, 'grace' => $grace, 'cycle' => $cycle] = self::streakOptions($o);
        $today = T::localDays($at, $zone, $ds);
        if ($s['lastDate'] === null) {
            return ['alive' => false, 'streak' => 0, 'checkedInToday' => false, 'freezesNeeded' => 0, 'endsAt' => null, 'cycleDay' => 0];
        }
        $last = T::parseDate($s['lastDate']);
        $lastSavingDay = $last + 1 + $s['freezes'];
        $endsAt = T::startOfDays($lastSavingDay + 1, $zone, $ds) + $grace * 60;
        $alive = $at < $endsAt;
        $missedSoFar = max(0, $today - $last - 1);
        return [
            'alive' => $alive,
            'streak' => $alive ? $s['streak'] : 0,
            'checkedInToday' => $last >= $today,
            'freezesNeeded' => $alive ? min($missedSoFar, $s['freezes']) : 0,
            'endsAt' => $alive ? $endsAt : null,
            'cycleDay' => $alive ? self::cycleDay($s['streak'], $cycle) : 0,
        ];
    }

    /** Value for day $day of a schedule such as [10, 10, 20, 20, 30, 30, 50]; past the end the last value repeats. */
    public static function streakReward(mixed $schedule, mixed $day): int
    {
        if (!is_array($schedule) || $schedule === [] || !array_is_list($schedule)) {
            T::fail('invalid_option', 'schedule must be a non-empty array');
        }
        foreach ($schedule as $i => $v) {
            T::int($v, "schedule[$i]", 0);
        }
        T::int($day, 'day', 0);
        if ($day === 0) {
            return 0;
        }
        return $schedule[min($day, count($schedule)) - 1];
    }

    // Levels

    /** @return array<string, mixed> */
    public static function linearCurve(array $options): array
    {
        return self::normalizeCurve(['type' => 'linear'] + $options);
    }

    /** @return array<string, mixed> */
    public static function polynomialCurve(array $options): array
    {
        return self::normalizeCurve(['type' => 'polynomial'] + $options);
    }

    /** @return array<string, mixed> */
    public static function tableCurve(mixed $thresholds, array $options = []): array
    {
        return self::normalizeCurve(['type' => 'table', 'thresholds' => $thresholds] + $options);
    }

    /** @return array<string, mixed> */
    public static function normalizeCurve(mixed $curve): array
    {
        if (!T::isObject($curve)) {
            T::fail('invalid_curve', 'curve must be an object');
        }
        $fields = ['linear' => ['xpPerLevel'], 'polynomial' => ['base', 'exponent'], 'table' => ['thresholds']];
        $type = $curve['type'] ?? null;
        if (!is_string($type) || !isset($fields[$type])) {
            T::fail('invalid_curve', 'curve.type must be "linear", "polynomial" or "table"');
        }
        foreach (array_keys($curve) as $k) {
            if ($k !== 'type' && $k !== 'maxLevel' && !in_array($k, $fields[$type], true)) {
                T::fail('invalid_curve', "unknown curve field \"$k\"");
            }
        }
        $maxLevel = ($curve['maxLevel'] ?? null) === null ? null : T::int($curve['maxLevel'], 'maxLevel', 1, T::MAX_INT, 'invalid_curve');
        if ($type === 'linear') {
            return ['type' => 'linear', 'xpPerLevel' => T::int($curve['xpPerLevel'] ?? null, 'xpPerLevel', 1, T::MAX_INT, 'invalid_curve'), 'maxLevel' => $maxLevel];
        }
        if ($type === 'polynomial') {
            return [
                'type' => 'polynomial',
                'base' => T::int($curve['base'] ?? null, 'base', 1, T::MAX_INT, 'invalid_curve'),
                'exponent' => T::int($curve['exponent'] ?? null, 'exponent', 1, 4, 'invalid_curve'),
                'maxLevel' => $maxLevel,
            ];
        }
        $t = $curve['thresholds'] ?? null;
        if (!is_array($t) || $t === [] || !array_is_list($t)) {
            T::fail('invalid_curve', 'thresholds must be a non-empty array');
        }
        foreach ($t as $i => $v) {
            T::int($v, "thresholds[$i]", 0, T::MAX_INT, 'invalid_curve');
            if ($i === 0 && $v !== 0) {
                T::fail('invalid_curve', 'thresholds[0] must be 0 (level 1)');
            }
            if ($i > 0 && $v <= $t[$i - 1]) {
                T::fail('invalid_curve', 'thresholds must be strictly increasing');
            }
        }
        if ($maxLevel !== null && $maxLevel > count($t)) {
            T::fail('invalid_curve', 'maxLevel is beyond the table');
        }
        return ['type' => 'table', 'thresholds' => $t, 'maxLevel' => $maxLevel ?? count($t)];
    }

    private static function mul(int $a, int $b): ?int
    {
        if ($a === 0 || $b === 0) {
            return 0;
        }
        return $a > intdiv(T::MAX_INT, $b) ? null : $a * $b;
    }

    /** Total XP for $level, or null when it exceeds 2^53 - 1. */
    private static function xpAt(array $c, int $level): ?int
    {
        if ($c['type'] === 'table') {
            return $c['thresholds'][$level - 1];
        }
        $n = $level - 1;
        if ($c['type'] === 'linear') {
            return self::mul($n, $c['xpPerLevel']);
        }
        $v = $c['base'];
        for ($i = 0; $i < $c['exponent'] && $v !== null; $i++) {
            $v = self::mul($v, $n);
        }
        return $v;
    }

    public static function xpForLevel(mixed $curve, mixed $level): int
    {
        $c = self::normalizeCurve($curve);
        T::int($level, 'level', 1, $c['maxLevel'] ?? T::MAX_INT, 'level_out_of_range');
        $v = self::xpAt($c, $level);
        if ($v === null) {
            T::fail('xp_out_of_range', "level $level needs more than 2^53 - 1 XP");
        }
        return $v;
    }

    /** floor($part * 10000 / $whole) for 0 <= $part < $whole, without overflow. */
    private static function bps(int $part, int $whole): int
    {
        $out = 0;
        for ($i = 0; $i < 4; $i++) {
            $part *= 10;
            $out = $out * 10 + intdiv($part, $whole);
            $part %= $whole;
        }
        return $out;
    }

    /** @return array<string, mixed> */
    public static function levelForXp(mixed $curve, mixed $xp): array
    {
        $c = self::normalizeCurve($curve);
        T::int($xp, 'xp', 0);
        $cap = $c['maxLevel'] ?? T::MAX_INT;
        $fits = static function (int $l) use ($c, $xp): bool {
            $v = self::xpAt($c, $l);
            return $v !== null && $v <= $xp;
        };
        $lo = 1;
        $hi = 2;
        while ($hi <= $cap && $fits($hi)) {
            $lo = $hi;
            $hi *= 2;
        }
        $hi = min($hi, $cap + 1);
        while ($hi - $lo > 1) {
            $mid = $lo + intdiv($hi - $lo, 2);
            if ($fits($mid)) {
                $lo = $mid;
            } else {
                $hi = $mid;
            }
        }
        $level = $lo;
        $levelXp = self::xpAt($c, $level);
        $nextLevelXp = $level < $cap ? self::xpAt($c, $level + 1) : null;
        if ($nextLevelXp === null) {
            return ['level' => $level, 'xp' => $xp, 'levelXp' => $levelXp, 'nextLevelXp' => null, 'xpIntoLevel' => $xp - $levelXp, 'xpForNextLevel' => 0, 'xpToNextLevel' => 0, 'progressBps' => 10000, 'isMaxLevel' => true];
        }
        $span = $nextLevelXp - $levelXp;
        return [
            'level' => $level,
            'xp' => $xp,
            'levelXp' => $levelXp,
            'nextLevelXp' => $nextLevelXp,
            'xpIntoLevel' => $xp - $levelXp,
            'xpForNextLevel' => $span,
            'xpToNextLevel' => $nextLevelXp - $xp,
            'progressBps' => self::bps($xp - $levelXp, $span),
            'isMaxLevel' => false,
        ];
    }

    // Quests

    /** @return array{id: string, target: int, reset: string, weekStartsOn: int, dayStartMinutes: int} */
    public static function defineQuest(mixed $definition): array
    {
        try {
            if ($definition === null) {
                T::fail('invalid_quest', 'quest is required');
            }
            $d = T::options($definition, ['id', 'target', 'reset', 'weekStartsOn', 'dayStartMinutes'], 'quest');
            if (!is_string($d['id'] ?? null) || $d['id'] === '') {
                T::fail('invalid_quest', 'quest.id must be a non-empty string');
            }
            $reset = $d['reset'] ?? 'daily';
            if (!is_string($reset) || !array_key_exists($reset, self::RESETS)) {
                T::fail('invalid_quest', 'quest.reset must be "daily", "weekly", "monthly" or "never"');
            }
            return [
                'id' => $d['id'],
                'target' => T::int($d['target'] ?? null, 'quest.target', 1),
                'reset' => $reset,
                'weekStartsOn' => T::weekStart($d),
                'dayStartMinutes' => T::dayStart($d),
            ];
        } catch (GamificationException $e) {
            T::fail('invalid_quest', $e->getMessage());
        }
    }

    /** @return array{state: array<string, mixed>, result: array<string, mixed>} */
    public static function questProgress(?array $state, array $quest, array $options): array
    {
        $q = self::defineQuest($quest);
        $state ??= [];
        if (!T::isObject($state)) {
            T::fail('invalid_state', 'state must be an object');
        }
        $periodKey = $state['periodKey'] ?? null;
        if ($periodKey !== null && !is_string($periodKey)) {
            T::fail('invalid_state', 'state.periodKey must be a string or null');
        }
        $s = array_merge($state, [
            'periodKey' => $periodKey,
            'progress' => T::int($state['progress'] ?? 0, 'state.progress', 0, T::MAX_INT, 'invalid_state'),
            'completedAt' => ($state['completedAt'] ?? null) === null ? null : T::int($state['completedAt'], 'state.completedAt', -T::MAX_INT, T::MAX_INT, 'invalid_state'),
            'completions' => T::int($state['completions'] ?? 0, 'state.completions', 0, T::MAX_INT, 'invalid_state'),
        ]);
        $o = T::options($options, ['amount', 'at', 'timeZone']);
        $amount = array_key_exists('amount', $o) ? T::int($o['amount'], 'amount', 0) : 1;
        $at = T::instant($o['at'] ?? null);

        $key = 'never';
        $resetsAt = null;
        $period = self::RESETS[$q['reset']];
        if ($period !== null) {
            $zone = T::zone($o['timeZone'] ?? null);
            [$first, $next] = T::periodBounds($period, T::localDays($at, $zone, $q['dayStartMinutes']), $q['weekStartsOn']);
            $key = T::periodKey($period, $first);
            $resetsAt = T::startOfDays($next, $zone, $q['dayStartMinutes']);
        } elseif (array_key_exists('timeZone', $o)) {
            T::zone($o['timeZone']);
        }

        $progress = $s['progress'];
        $completedAt = $s['completedAt'];
        if ($s['periodKey'] !== $key) {
            $progress = 0;
            $completedAt = null;
        }
        $justCompleted = false;
        if ($completedAt === null && $amount > 0) {
            $progress = min($q['target'], $progress + min($amount, $q['target']));
            if ($progress >= $q['target']) {
                $justCompleted = true;
                $completedAt = $at;
            }
        }
        $next = array_merge($s, [
            'periodKey' => $key,
            'progress' => $progress,
            'completedAt' => $completedAt,
            'completions' => $s['completions'] + ($justCompleted ? 1 : 0),
        ]);
        return [
            'state' => $next,
            'result' => [
                'progress' => $progress,
                'target' => $q['target'],
                'completed' => $completedAt !== null,
                'justCompleted' => $justCompleted,
                'periodKey' => $key,
                'resetsAt' => $resetsAt,
            ],
        ];
    }

    // Leaderboards

    private static function compareIds(int|string $a, int|string $b): int
    {
        $aInt = is_int($a);
        $bInt = is_int($b);
        if ($aInt && $bInt) {
            return $a <=> $b;
        }
        if ($aInt !== $bInt) {
            return $aInt ? -1 : 1;
        }
        return strcmp($a, $b) <=> 0;
    }

    /** @return list<array<string, mixed>> */
    public static function rankEntries(mixed $entries, ?array $options = null): array
    {
        $o = T::options($options, ['tie']);
        $tie = $o['tie'] ?? 'shared';
        if (!in_array($tie, self::TIES, true)) {
            T::fail('invalid_option', 'tie must be "shared", "dense", "ordinal" or "earliest"');
        }
        if (!is_array($entries) || !array_is_list($entries)) {
            T::fail('invalid_entry', 'entries must be an array');
        }
        $seen = [];
        $list = [];
        foreach ($entries as $i => $e) {
            if (!T::isObject($e) || $e === []) {
                T::fail('invalid_entry', "entries[$i] must be an object");
            }
            $id = $e['id'] ?? null;
            if (!(is_string($id) && $id !== '') && !(is_int($id) && abs($id) <= T::MAX_INT)) {
                T::fail('invalid_entry', "entries[$i].id must be a non-empty string or an integer");
            }
            $dupKey = gettype($id) . ':' . $id;
            if (isset($seen[$dupKey])) {
                T::fail('duplicate_id', 'duplicate id ' . json_encode($id));
            }
            $seen[$dupKey] = true;
            $out = array_merge($e, ['id' => $id, 'score' => T::int($e['score'] ?? null, "entries[$i].score", -T::MAX_INT, T::MAX_INT, 'invalid_entry')]);
            if ($tie === 'earliest') {
                if (($e['reachedAt'] ?? null) === null) {
                    T::fail('missing_reached_at', "entries[$i].reachedAt is required for tie \"earliest\"");
                }
                $out['reachedAt'] = T::int($e['reachedAt'], "entries[$i].reachedAt", -T::MAX_INT, T::MAX_INT, 'invalid_entry');
            }
            $list[] = $out;
        }

        usort($list, static function (array $a, array $b) use ($tie): int {
            return ($b['score'] <=> $a['score'])
                ?: ($tie === 'earliest' ? $a['reachedAt'] <=> $b['reachedAt'] : 0)
                ?: self::compareIds($a['id'], $b['id']);
        });

        $rank = 0;
        $dense = 0;
        foreach ($list as $i => $e) {
            $prev = $list[$i - 1] ?? null;
            $same = $prev !== null && $prev['score'] === $e['score'] && ($tie !== 'earliest' || $prev['reachedAt'] === $e['reachedAt']);
            if ($tie === 'ordinal') {
                $rank = $i + 1;
            } elseif (!$same) {
                $rank = $i + 1;
                $dense++;
            }
            $list[$i]['rank'] = $tie === 'dense' ? $dense : $rank;
        }
        return $list;
    }

    /** @return list<array<string, mixed>> */
    public static function aroundId(mixed $ranked, int|string $id, mixed $radius = 2): array
    {
        if (!is_array($ranked) || !array_is_list($ranked)) {
            T::fail('invalid_entry', 'ranked must be an array');
        }
        T::int($radius, 'radius', 0);
        foreach ($ranked as $i => $e) {
            if (is_array($e) && ($e['id'] ?? null) === $id) {
                $start = max(0, $i - $radius);
                return array_slice($ranked, $start, $i + $radius + 1 - $start);
            }
        }
        return [];
    }

    // Caps

    /** @return array{granted: int, capped: int, remaining: int, localDate: string, resetsAt: int, state: array<string, mixed>} */
    public static function applyXpCap(?array $state, array $options): array
    {
        $state ??= [];
        if (!T::isObject($state)) {
            T::fail('invalid_state', 'state must be an object');
        }
        $o = T::options($options, ['amount', 'at', 'timeZone', 'dailyCap', 'dayStartMinutes']);
        $amount = T::int($o['amount'] ?? null, 'amount', 0);
        $cap = T::int($o['dailyCap'] ?? null, 'dailyCap', 0);
        $at = T::instant($o['at'] ?? null);
        $zone = T::zone($o['timeZone'] ?? null);
        $ds = T::dayStart($o);

        $date = $state['date'] ?? null;
        if ($date !== null) {
            try {
                T::parseDate($date, 'state.date');
            } catch (GamificationException $e) {
                T::fail('invalid_state', $e->getMessage());
            }
        }
        $already = T::int($state['granted'] ?? 0, 'state.granted', 0, T::MAX_INT, 'invalid_state');

        $today = T::localDays($at, $zone, $ds);
        $todayText = T::formatDays($today);
        // A date ahead of today (the user moved west) keeps its count, so a zone change cannot reopen the day.
        $used = $date === null || T::parseDate($date) < $today ? 0 : $already;
        $keyDate = $date !== null && T::parseDate($date) > $today ? $date : $todayText;
        $granted = min($amount, max(0, $cap - $used));
        $total = $used + $granted;
        return [
            'granted' => $granted,
            'capped' => $amount - $granted,
            'remaining' => max(0, $cap - $total),
            'localDate' => $todayText,
            'resetsAt' => T::startOfDays(max($today, T::parseDate($keyDate)) + 1, $zone, $ds),
            'state' => array_merge($state, ['date' => $keyDate, 'granted' => $total]),
        ];
    }

    /** @return array{ready: bool, remainingSeconds: int, readyAt: int} */
    public static function cooldown(mixed $lastAt, mixed $at, mixed $seconds): array
    {
        T::instant($at);
        T::int($seconds, 'seconds', 0);
        if ($lastAt === null) {
            return ['ready' => true, 'remainingSeconds' => 0, 'readyAt' => $at];
        }
        T::instant($lastAt, 'lastAt');
        $readyAt = $lastAt + $seconds;
        return ['ready' => $at >= $readyAt, 'remainingSeconds' => max(0, $readyAt - $at), 'readyAt' => $readyAt];
    }

    /** @return array{changed: bool, allowed: bool, timeZone: string, nextChangeAt: int, state: array<string, mixed>} */
    public static function changeTimeZone(?array $state, array $options): array
    {
        $state ??= [];
        if (!T::isObject($state)) {
            T::fail('invalid_state', 'state must be an object');
        }
        $o = T::options($options, ['timeZone', 'at', 'cooldownSeconds']);
        $tz = T::assertTimeZone($o['timeZone'] ?? null);
        $at = T::instant($o['at'] ?? null);
        $wait = array_key_exists('cooldownSeconds', $o) ? T::int($o['cooldownSeconds'], 'cooldownSeconds', 0) : 30 * 86400;
        $current = $state['timeZone'] ?? null;
        $changedAt = $state['changedAt'] ?? null;
        if ($current !== null) {
            T::assertTimeZone($current);
        }
        if ($changedAt !== null) {
            T::instant($changedAt, 'state.changedAt');
        }

        if ($current === $tz) {
            return ['changed' => false, 'allowed' => true, 'timeZone' => $tz, 'nextChangeAt' => $changedAt === null ? $at : max($at, $changedAt + $wait), 'state' => $state];
        }
        if ($current !== null && $changedAt !== null && $at < $changedAt + $wait) {
            return ['changed' => false, 'allowed' => false, 'timeZone' => $current, 'nextChangeAt' => $changedAt + $wait, 'state' => $state];
        }
        // The first zone a user sets starts no cooldown, so onboarding can fix a wrong guess.
        $nextChangedAt = $current === null ? null : $at;
        return [
            'changed' => true,
            'allowed' => true,
            'timeZone' => $tz,
            'nextChangeAt' => $nextChangedAt === null ? $at : $at + $wait,
            'state' => array_merge($state, ['timeZone' => $tz, 'changedAt' => $nextChangedAt]),
        ];
    }
}
