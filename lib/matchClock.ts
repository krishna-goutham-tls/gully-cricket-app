/** Client view of a Test clock. Convex stores timestamps; this file never writes. */

export type MatchClock = {
  durationMs: number;
  dayCount: number;
  startedAt?: number;
  pausedAt?: number | null;
  pauseAccumulatedMs: number;
  overtime?: boolean;
};

export type ClockView = {
  day: number;
  dayCount: number;
  remainingDayMs: number;
  remainingMatchMs: number;
  paused: boolean;
  overtime: boolean;
  /** True when the match budget is spent and overtime is not set. */
  timeUp: boolean;
};

export function formatClockMs(ms: number) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function clockView(clock: MatchClock, now: number): ClockView | null {
  if (!clock.startedAt) return null;
  const pauseLive = clock.pausedAt ? Math.max(0, now - clock.pausedAt) : 0;
  const elapsed = Math.max(
    0,
    now - clock.startedAt - clock.pauseAccumulatedMs - pauseLive,
  );
  const duration = clock.durationMs;
  const days = clock.dayCount || 5;
  const dayMs = duration / days;
  const overtime = !!clock.overtime;
  const spent = overtime || elapsed >= duration;
  const capped = spent ? duration : elapsed;
  let day = spent ? days : Math.min(days, Math.floor(capped / dayMs) + 1);
  if (day < 1) day = 1;
  const intoDay = spent ? dayMs : capped - (day - 1) * dayMs;
  const remainingDayMs = spent ? 0 : Math.max(0, dayMs - intoDay);
  return {
    day,
    dayCount: days,
    remainingDayMs,
    remainingMatchMs: Math.max(0, duration - elapsed),
    paused: !!clock.pausedAt,
    overtime,
    timeUp: spent && !overtime,
  };
}
