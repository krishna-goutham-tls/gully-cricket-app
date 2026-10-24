import { Doc, Id } from "../_generated/dataModel";

/**
 * Career milestones: the rungs every player climbs, and how fast they got
 * there. Fixed ladders (Krishna, 2026-10-24) so the "fastest to 500" race
 * means the same thing in every community. Past the top rung the ladder keeps
 * going in the last step, so nobody runs out of a next target.
 */
export const RUN_LADDER = [100, 250, 500, 750, 1000, 1500, 2000];
const RUN_STEP_PAST_TOP = 500;
export const WICKET_LADDER = [10, 25, 50, 75, 100, 150];
const WICKET_STEP_PAST_TOP = 50;

export type MilestoneKind = "runs" | "wickets";

/** The moment a rung was reached: innings taken, balls used, and the day. */
export type Reach = {
  target: number;
  innings: number;
  balls: number;
  date: number;
};

export type PlayerClimb = {
  userId: Id<"users">;
  runs: { total: number; reached: Reach[] };
  wickets: { total: number; reached: Reach[] };
};

/** The rung at index i, extending the ladder past its top in fixed steps. */
function rungAt(kind: MilestoneKind, i: number): number {
  const ladder = kind === "runs" ? RUN_LADDER : WICKET_LADDER;
  if (i < ladder.length) return ladder[i];
  const step = kind === "runs" ? RUN_STEP_PAST_TOP : WICKET_STEP_PAST_TOP;
  return ladder[ladder.length - 1] + step * (i - ladder.length + 1);
}

/** The last rung at or below `total` (0 when none) and the next one above it. */
export function rungsAround(
  kind: MilestoneKind,
  total: number,
): { prev: number; next: number } {
  let i = 0;
  while (rungAt(kind, i) <= total) i += 1;
  return { prev: i === 0 ? 0 : rungAt(kind, i - 1), next: rungAt(kind, i) };
}

/**
 * One player's climb, walked innings by innings in match order. An innings
 * counts once they faced a ball or got out (the profile's own rule for a
 * score), and a spell once they bowled a legal ball or took a wicket. Inside
 * a match the stamp keeps innings in playing order, so a Test's second innings
 * comes after its first.
 */
export function climbOf(
  userId: Id<"users">,
  rows: Doc<"playerMatchStats">[],
): PlayerClimb {
  const ordered = [...rows].sort((a, b) => a.matchOrder - b.matchOrder);
  const climb: PlayerClimb = {
    userId,
    runs: { total: 0, reached: [] },
    wickets: { total: 0, reached: [] },
  };

  let batInns = 0;
  let ballsFaced = 0;
  let next = 0;
  for (const r of ordered) {
    for (const inn of r.bat?.innings ?? []) {
      if (inn.balls === 0 && inn.outs === 0) continue;
      batInns += 1;
      ballsFaced += inn.balls;
      climb.runs.total += inn.runs;
      while (rungAt("runs", next) <= climb.runs.total) {
        climb.runs.reached.push({
          target: rungAt("runs", next),
          innings: batInns,
          balls: ballsFaced,
          date: r.date,
        });
        next += 1;
      }
    }
  }

  let bowlInns = 0;
  let ballsBowled = 0;
  next = 0;
  for (const r of ordered) {
    for (const inn of r.bowl?.innings ?? []) {
      if (inn.legalBalls === 0 && inn.wickets === 0) continue;
      bowlInns += 1;
      ballsBowled += inn.legalBalls;
      climb.wickets.total += inn.wickets;
      while (rungAt("wickets", next) <= climb.wickets.total) {
        climb.wickets.reached.push({
          target: rungAt("wickets", next),
          innings: bowlInns,
          balls: ballsBowled,
          date: r.date,
        });
        next += 1;
      }
    }
  }
  return climb;
}

/** Fewest innings wins; then fewer balls; then whoever got there first. */
export function fasterReach(a: Reach, b: Reach): number {
  return a.innings - b.innings || a.balls - b.balls || a.date - b.date;
}

export type RaceEntry = { userId: Id<"users">; reach: Reach };

/**
 * Every rung somebody in `field` has reached, each with its finishers fastest
 * first. Rungs nobody reached are left out.
 */
export function racesOf(
  field: PlayerClimb[],
): Array<{ kind: MilestoneKind; target: number; finishers: RaceEntry[] }> {
  const out: Array<{
    kind: MilestoneKind;
    target: number;
    finishers: RaceEntry[];
  }> = [];
  for (const kind of ["runs", "wickets"] as const) {
    const byTarget = new Map<number, RaceEntry[]>();
    for (const c of field) {
      for (const reach of c[kind].reached) {
        const list = byTarget.get(reach.target) ?? [];
        list.push({ userId: c.userId, reach });
        byTarget.set(reach.target, list);
      }
    }
    const targets = Array.from(byTarget.keys()).sort((a, b) => a - b);
    for (const target of targets) {
      const finishers = byTarget.get(target)!;
      finishers.sort((a, b) => fasterReach(a.reach, b.reach));
      out.push({ kind, target, finishers });
    }
  }
  return out;
}
