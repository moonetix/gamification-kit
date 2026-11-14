# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0] - 2026-11-14

### Changed

- The JavaScript package is on npm as [`@moonetix/gamification-kit`](https://www.npmjs.com/package/@moonetix/gamification-kit). Its name changed from `gamification-kit`, so an install from Git needs the new name in its imports. The functions and the test vectors are the same as in 1.0.0.
- The PHP package is on [Packagist](https://packagist.org/packages/moonetix/gamification-kit): `composer require moonetix/gamification-kit`.

## [1.0.0] - 2026-11-11

### Added

- JavaScript (ESM) and PHP 8.1+ implementations with the same functions, options, results and error codes.
- Calendar layer: `localDate`, `startOfLocalDay` and `periodWindow` in the user's IANA zone, with an optional day start such as 04:00, and explicit rules for nonexistent and repeated local times.
- `checkIn` and `streakStatus`: daily streaks with automatic freezes, a grace window, a streak cap, reward cycles and travel between zones.
- `streakReward` for day-by-day schedules.
- XP curves: `linearCurve`, `polynomialCurve` (integer exponents 1 to 4) and `tableCurve`, with `levelForXp` and `xpForLevel` in exact integer math.
- `defineQuest` and `questProgress` with daily, weekly, monthly or no reset.
- `rankEntries` with shared, dense, ordinal and earliest tie rules, and `aroundId`.
- `applyXpCap`, `cooldown` and `changeTimeZone` against abuse.
- Shared test vectors in `test-vectors/vectors.json`, run by both suites, with 2026 transitions in New York, Budapest, Lord Howe Island, Santiago and Beirut and date-line cases.
- TypeScript declarations in `src/index.d.ts`.

[1.1.0]: https://github.com/moonetix/gamification-kit/releases/tag/v1.1.0
[1.0.0]: https://github.com/moonetix/gamification-kit/releases/tag/v1.0.0
