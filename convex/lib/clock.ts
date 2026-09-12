export const TEST_CLOCK_DAYS = 5;
export const DEFAULT_TEST_MINUTES = 90;
export const MIN_TEST_MINUTES = 15;
export const MAX_TEST_MINUTES = 180;

export type MatchClock = {
  durationMs: number;
  dayCount: number;
  startedAt?: number;
  pausedAt?: number;
  pauseAccumulatedMs: number;
  pauses: Array<{ at: number; until?: number }>;
  overtime?: boolean;
};

/** Client payload — no pause log. */
export function publicMatchClock(clock: MatchClock | undefined) {
  if (!clock) return null;
  return {
    durationMs: clock.durationMs,
    dayCount: clock.dayCount,
    startedAt: clock.startedAt,
    pausedAt: clock.pausedAt,
    pauseAccumulatedMs: clock.pauseAccumulatedMs,
    overtime: clock.overtime,
  };
}

/** Always 5 days. Day length is duration/5. */
export function buildMatchClock(minutes: number): MatchClock {
  if (
    !Number.isInteger(minutes) ||
    minutes < MIN_TEST_MINUTES ||
    minutes > MAX_TEST_MINUTES
  ) {
    throw new Error("Match duration must be between 15 and 180 minutes");
  }
  return {
    durationMs: minutes * 60000,
    dayCount: TEST_CLOCK_DAYS,
    pauseAccumulatedMs: 0,
    pauses: [],
  };
}

export function pauseMatchClock(
  clock: MatchClock,
  now: number,
): MatchClock | null {
  if (clock.pausedAt !== undefined) return null;
  return {
    ...clock,
    pausedAt: now,
    pauses: [...clock.pauses, { at: now }],
  };
}

export function resumeMatchClock(
  clock: MatchClock,
  now: number,
): MatchClock | null {
  if (clock.pausedAt === undefined) return null;
  const pauses = clock.pauses.slice();
  const last = pauses[pauses.length - 1];
  if (last && last.until === undefined) {
    pauses[pauses.length - 1] = { ...last, until: now };
  }
  return {
    ...clock,
    pausedAt: undefined,
    pauseAccumulatedMs: clock.pauseAccumulatedMs + (now - clock.pausedAt),
    pauses,
  };
}
