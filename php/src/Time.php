<?php

declare(strict_types=1);

namespace Moonetix\Gamification;

/**
 * Calendar and time zone helpers shared by the public API.
 *
 * @internal
 */
final class Time
{
    public const MAX_INT = 9007199254740991; // 2^53 - 1, the JavaScript safe integer limit
    public const MIN_AT = -2208988800;
    public const MAX_AT = 253402300799;
    private const DAY = 86400;

    /** @var array<string, \DateTimeZone> */
    private static array $zones = [];
    /** @var array<string, string>|null */
    private static ?array $known = null;

    public static function fail(string $code, string $message): never
    {
        throw new GamificationException($code, $message);
    }

    public static function isObject(mixed $v): bool
    {
        return is_array($v) && ($v === [] || !array_is_list($v));
    }

    /** @return array<string, mixed> */
    public static function options(mixed $options, array $allowed, string $name = 'options'): array
    {
        if ($options === null) {
            return [];
        }
        if (!self::isObject($options)) {
            self::fail('invalid_option', "$name must be an object");
        }
        foreach (array_keys($options) as $key) {
            if (!in_array($key, $allowed, true)) {
                self::fail('invalid_option', "unknown option \"$key\"");
            }
        }
        return $options;
    }

    public static function int(mixed $value, string $name, int $min = -self::MAX_INT, int $max = self::MAX_INT, string $code = 'invalid_option'): int
    {
        if (!is_int($value) || $value > self::MAX_INT || $value < -self::MAX_INT) {
            self::fail($code, "$name must be an integer");
        }
        if ($value < $min || $value > $max) {
            self::fail($code, "$name must be from $min to $max");
        }
        return $value;
    }

    public static function instant(mixed $value, string $name = 'at'): int
    {
        return self::int($value, $name, self::MIN_AT, self::MAX_AT, 'invalid_instant');
    }

    public static function floorDiv(int $a, int $b): int
    {
        $q = intdiv($a, $b);
        return ($a % $b !== 0 && (($a < 0) !== ($b < 0))) ? $q - 1 : $q;
    }

    public static function zone(mixed $timeZone): \DateTimeZone
    {
        if (is_string($timeZone) && isset(self::$zones[$timeZone])) {
            return self::$zones[$timeZone];
        }
        if (!is_string($timeZone) || !preg_match('~^[A-Za-z][A-Za-z0-9_+-]*(?:/[A-Za-z0-9_+-]+)*$~', $timeZone)) {
            self::fail('invalid_time_zone', '"' . (is_string($timeZone) ? $timeZone : gettype($timeZone)) . '" is not an IANA time zone name');
        }
        if (self::$known === null) {
            self::$known = [];
            foreach (\DateTimeZone::listIdentifiers(\DateTimeZone::ALL_WITH_BC) as $id) {
                self::$known[strtolower($id)] = $id;
            }
        }
        $id = self::$known[strtolower($timeZone)] ?? null;
        if ($id === null) {
            self::fail('invalid_time_zone', "\"$timeZone\" is not an IANA time zone name");
        }
        return self::$zones[$timeZone] = new \DateTimeZone($id);
    }

    public static function assertTimeZone(mixed $timeZone): string
    {
        self::zone($timeZone);
        return $timeZone;
    }

    public static function utcOffset(int $t, \DateTimeZone $zone): int
    {
        return $zone->getOffset(new \DateTimeImmutable('@' . $t));
    }

    public static function daysFromCivil(int $y, int $m, int $d): int
    {
        $y -= $m <= 2 ? 1 : 0;
        $era = self::floorDiv($y, 400);
        $yoe = $y - $era * 400;
        $doy = intdiv(153 * ($m + ($m > 2 ? -3 : 9)) + 2, 5) + $d - 1;
        $doe = $yoe * 365 + intdiv($yoe, 4) - intdiv($yoe, 100) + $doy;
        return $era * 146097 + $doe - 719468;
    }

    /** @return array{int, int, int} */
    public static function civilFromDays(int $z): array
    {
        $z += 719468;
        $era = self::floorDiv($z, 146097);
        $doe = $z - $era * 146097;
        $yoe = intdiv($doe - intdiv($doe, 1460) + intdiv($doe, 36524) - intdiv($doe, 146096), 365);
        $doy = $doe - (365 * $yoe + intdiv($yoe, 4) - intdiv($yoe, 100));
        $mp = intdiv(5 * $doy + 2, 153);
        $d = $doy - intdiv(153 * $mp + 2, 5) + 1;
        $m = $mp < 10 ? $mp + 3 : $mp - 9;
        return [$yoe + $era * 400 + ($m <= 2 ? 1 : 0), $m, $d];
    }

    public static function formatDays(int $days): string
    {
        [$y, $m, $d] = self::civilFromDays($days);
        return sprintf('%04d-%02d-%02d', $y, $m, $d);
    }

    public static function parseDate(mixed $date, string $name = 'date'): int
    {
        if (!is_string($date) || !preg_match('/^(\d{4})-(\d{2})-(\d{2})$/', $date, $m)) {
            self::fail('invalid_date', "$name must be a \"YYYY-MM-DD\" string");
        }
        $y = (int)$m[1];
        $days = self::daysFromCivil($y, (int)$m[2], (int)$m[3]);
        if ($y < 1900 || self::formatDays($days) !== $date) {
            self::fail('invalid_date', "$name \"$date\" is not a calendar date from 1900 on");
        }
        return $days;
    }

    public static function dow(int $days): int
    {
        return ((($days + 4) % 7) + 7) % 7;
    }

    public static function dayStart(array $o): int
    {
        return array_key_exists('dayStartMinutes', $o) ? self::int($o['dayStartMinutes'], 'dayStartMinutes', 0, 1439) : 0;
    }

    public static function weekStart(array $o): int
    {
        return array_key_exists('weekStartsOn', $o) ? self::int($o['weekStartsOn'], 'weekStartsOn', 0, 6) : 1;
    }

    public static function localDays(int $at, \DateTimeZone $zone, int $startMinutes): int
    {
        return self::floorDiv($at + self::utcOffset($at, $zone) - $startMinutes * 60, self::DAY);
    }

    /**
     * First instant of local day $days: the earliest t whose local clock time is at or past
     * midnight (plus the day start). Assumes at most one offset change in the 32 hours
     * around it, which holds for every zone since 1900.
     */
    public static function startOfDays(int $days, \DateTimeZone $zone, int $startMinutes): int
    {
        $naive = $days * self::DAY + $startMinutes * 60;
        $lo = $naive - 16 * 3600;
        $hi = $naive + 16 * 3600;
        $o1 = self::utcOffset($lo, $zone);
        $o2 = self::utcOffset($hi, $zone);
        if ($o1 === $o2) {
            return $naive - $o1;
        }
        $a = $lo;
        $b = $hi;
        while ($b - $a > 1) {
            $mid = $a + intdiv($b - $a, 2);
            if (self::utcOffset($mid, $zone) === $o1) {
                $a = $mid;
            } else {
                $b = $mid;
            }
        }
        $change = $b;
        if ($naive - $o1 < $change) {
            return $naive - $o1;
        }
        return max($change, $naive - self::utcOffset($change, $zone));
    }

    /** @return array{int, int} first day and the day after the period */
    public static function periodBounds(string $period, int $days, int $weekStartsOn): array
    {
        if ($period === 'day') {
            return [$days, $days + 1];
        }
        if ($period === 'week') {
            $first = $days - ((self::dow($days) - $weekStartsOn + 7) % 7);
            return [$first, $first + 7];
        }
        [$y, $m] = self::civilFromDays($days);
        return [self::daysFromCivil($y, $m, 1), $m === 12 ? self::daysFromCivil($y + 1, 1, 1) : self::daysFromCivil($y, $m + 1, 1)];
    }

    public static function periodKey(string $period, int $firstDays): string
    {
        $date = self::formatDays($firstDays);
        return $period === 'month' ? 'month:' . substr($date, 0, 7) : "$period:$date";
    }
}
