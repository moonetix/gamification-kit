/** Unix time in whole seconds (UTC). */
export type Instant = number;
/** Local calendar date as "YYYY-MM-DD". */
export type LocalDate = string;
/** IANA time zone name such as "America/New_York". */
export type TimeZone = string;

export type ErrorCode =
  | 'invalid_option'
  | 'invalid_instant'
  | 'invalid_date'
  | 'invalid_time_zone'
  | 'invalid_state'
  | 'invalid_curve'
  | 'level_out_of_range'
  | 'xp_out_of_range'
  | 'invalid_quest'
  | 'invalid_entry'
  | 'duplicate_id'
  | 'missing_reached_at';

export class GamificationError extends Error {
  readonly code: ErrorCode;
  constructor(code: ErrorCode, message: string);
}

export interface DayOptions {
  /** Minutes after local midnight when a new day starts, 0 to 1439. Default 0. */
  dayStartMinutes?: number;
}

// Time

export function localDate(at: Instant, timeZone: TimeZone, options?: DayOptions): LocalDate;
export function startOfLocalDay(date: LocalDate, timeZone: TimeZone, options?: DayOptions): Instant;

export type Period = 'day' | 'week' | 'month';

export interface PeriodWindowOptions extends DayOptions {
  period: Period;
  at: Instant;
  timeZone: TimeZone;
  /** 0 Sunday to 6 Saturday. Default 1 (Monday). */
  weekStartsOn?: number;
}

export interface PeriodWindow {
  /** "day:2026-11-11", "week:2026-11-09" or "month:2026-11". */
  key: string;
  start: Instant;
  /** Exclusive. */
  end: Instant;
  firstDate: LocalDate;
  lastDate: LocalDate;
}

export function periodWindow(options: PeriodWindowOptions): PeriodWindow;
export function addDays(date: LocalDate, n: number): LocalDate;
export function daysBetween(from: LocalDate, to: LocalDate): number;
/** 0 Sunday to 6 Saturday. */
export function weekday(date: LocalDate): number;
/** UTC offset in seconds of `timeZone` at `at`. */
export function utcOffset(at: Instant, timeZone: TimeZone): number;
export function assertTimeZone(timeZone: TimeZone): TimeZone;

// Streaks

export interface StreakState {
  lastDate?: LocalDate | null;
  streak?: number;
  longest?: number;
  freezes?: number;
  totalDays?: number;
  [extra: string]: unknown;
}

export interface CheckInOptions extends DayOptions {
  at: Instant;
  timeZone: TimeZone;
  /** A check-in this many minutes after the day boundary can count for a missed yesterday. Default 0. */
  graceMinutes?: number;
  /** The streak stops growing here. */
  maxStreak?: number | null;
  /** Length of a reward cycle; drives `cycleDay`. */
  cycleLength?: number | null;
}

export interface CheckInResult {
  counted: boolean;
  alreadyCheckedIn: boolean;
  localDate: LocalDate;
  streak: number;
  longest: number;
  cycleDay: number;
  usedFreezes: number;
  usedGrace: boolean;
  broken: boolean;
}

export interface NormalizedStreakState extends StreakState {
  lastDate: LocalDate | null;
  streak: number;
  longest: number;
  freezes: number;
  totalDays: number;
}

export function checkIn(state: StreakState | null | undefined, options: CheckInOptions): { state: NormalizedStreakState; result: CheckInResult };

export interface StreakStatus {
  alive: boolean;
  streak: number;
  checkedInToday: boolean;
  freezesNeeded: number;
  endsAt: Instant | null;
  cycleDay: number;
}

export function streakStatus(state: StreakState | null | undefined, options: CheckInOptions): StreakStatus;
export function streakReward(schedule: readonly number[], day: number): number;

// Levels

export type Curve =
  | { readonly type: 'linear'; readonly xpPerLevel: number; readonly maxLevel?: number | null }
  | { readonly type: 'polynomial'; readonly base: number; readonly exponent: 1 | 2 | 3 | 4; readonly maxLevel?: number | null }
  | { readonly type: 'table'; readonly thresholds: readonly number[]; readonly maxLevel?: number | null };

export function linearCurve(options: { xpPerLevel: number; maxLevel?: number | null }): Curve;
export function polynomialCurve(options: { base: number; exponent: 1 | 2 | 3 | 4; maxLevel?: number | null }): Curve;
export function tableCurve(thresholds: readonly number[], options?: { maxLevel?: number | null }): Curve;

export interface LevelInfo {
  level: number;
  xp: number;
  levelXp: number;
  nextLevelXp: number | null;
  xpIntoLevel: number;
  xpForNextLevel: number;
  xpToNextLevel: number;
  /** 0 to 10000. */
  progressBps: number;
  isMaxLevel: boolean;
}

export function levelForXp(curve: Curve, xp: number): LevelInfo;
export function xpForLevel(curve: Curve, level: number): number;

// Quests

export type QuestReset = 'daily' | 'weekly' | 'monthly' | 'never';

export interface QuestDefinition extends DayOptions {
  id: string;
  target: number;
  reset?: QuestReset;
  weekStartsOn?: number;
}

export interface Quest {
  readonly id: string;
  readonly target: number;
  readonly reset: QuestReset;
  readonly weekStartsOn: number;
  readonly dayStartMinutes: number;
}

export interface QuestState {
  periodKey?: string | null;
  progress?: number;
  completedAt?: Instant | null;
  completions?: number;
  [extra: string]: unknown;
}

export interface QuestResult {
  progress: number;
  target: number;
  completed: boolean;
  justCompleted: boolean;
  periodKey: string;
  resetsAt: Instant | null;
}

export function defineQuest(definition: QuestDefinition): Quest;
export function questProgress(
  state: QuestState | null | undefined,
  quest: QuestDefinition | Quest,
  options: { amount?: number; at: Instant; timeZone?: TimeZone },
): { state: Required<Pick<QuestState, 'periodKey' | 'progress' | 'completedAt' | 'completions'>> & QuestState; result: QuestResult };

// Leaderboards

export type TieRule = 'shared' | 'dense' | 'ordinal' | 'earliest';

export interface Entry {
  id: string | number;
  score: number;
  reachedAt?: Instant;
  [extra: string]: unknown;
}

export type RankedEntry<E extends Entry = Entry> = E & { rank: number };

export function rankEntries<E extends Entry>(entries: readonly E[], options?: { tie?: TieRule }): RankedEntry<E>[];
export function aroundId<E extends Entry>(ranked: readonly RankedEntry<E>[], id: string | number, radius?: number): RankedEntry<E>[];

// Caps

export interface CapState {
  date?: LocalDate | null;
  granted?: number;
  [extra: string]: unknown;
}

export interface CapResult {
  granted: number;
  capped: number;
  remaining: number;
  localDate: LocalDate;
  resetsAt: Instant;
  state: CapState & { date: LocalDate; granted: number };
}

export function applyXpCap(
  state: CapState | null | undefined,
  options: { amount: number; at: Instant; timeZone: TimeZone; dailyCap: number; dayStartMinutes?: number },
): CapResult;

export function cooldown(lastAt: Instant | null | undefined, at: Instant, seconds: number): { ready: boolean; remainingSeconds: number; readyAt: Instant };

export interface ZoneState {
  timeZone?: TimeZone | null;
  changedAt?: Instant | null;
  [extra: string]: unknown;
}

export function changeTimeZone(
  state: ZoneState | null | undefined,
  options: { timeZone: TimeZone; at: Instant; cooldownSeconds?: number },
): { changed: boolean; allowed: boolean; timeZone: TimeZone; nextChangeAt: Instant; state: ZoneState };
