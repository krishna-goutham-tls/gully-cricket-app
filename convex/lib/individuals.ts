import type { Doc, Id } from "../_generated/dataModel";
import { matchPoints } from "./points";

/**
 * Individuals mode (Krishna, 2026-11-14): every player is on their own. One
 * innings, one batter at a time, everyone else fields. Limited gives each
 * batter the same balls; Unlimited bats till out or retired. An out ends the
 * turn and the score stands: there is no pot.
 *
 * The match stores every player on both sides, so the engine's "common
 * player" paths (bat and bowl in one match) do the work. Nothing about sides
 * means anything here: no team result, no win streak, no win %.
 *
 * The winner has the most points (convex/lib/points.ts), so bowling and
 * catching count, not only the top score. Ties go to more runs, then fewer
 * balls faced, then more boundaries. Still level: the win is shared.
 */

type RulesLike = { play?: "individuals" };

export function isIndividuals(
  match: { ruleSnapshot: RulesLike } | null | undefined,
): boolean {
  return match?.ruleSnapshot.play === "individuals";
}

/** The same check on a stamp row. */
export function isIndividualsStamp(row: { play?: "individuals" }): boolean {
  return row.play === "individuals";
}

/** What decides an individuals match, for one player. */
export type StandingRow = {
  userId: Id<"users">;
  points: number;
  runs: number;
  balls: number;
  boundaries: number;
};

type StampLike = Pick<
  Doc<"playerMatchStats">,
  "userId" | "bat" | "bowl" | "catches" | "pts" | "offJuniors" | "real"
>;

/**
 * One player's row. Points are counted points, exactly as Player of the
 * Match counts them. Runs, balls and boundaries read like the scorecard, so
 * the tie-break matches what people see.
 */
export function standingOf(r: StampLike): StandingRow {
  const runs = r.real?.runs ?? (r.bat?.runs ?? 0) + (r.offJuniors?.runs ?? 0);
  const balls = r.real?.ballsFaced ?? r.bat?.balls ?? 0;
  const boundaries =
    (r.real?.fours ?? r.bat?.fours ?? 0) + (r.real?.sixes ?? r.bat?.sixes ?? 0);
  return {
    userId: r.userId,
    points: matchPoints(r as Doc<"playerMatchStats">),
    runs,
    balls,
    boundaries,
  };
}

/** Negative when `a` ranks above `b`. 0 = level on every tie-break. */
export function compareStanding(a: StandingRow, b: StandingRow): number {
  return (
    b.points - a.points ||
    b.runs - a.runs ||
    a.balls - b.balls ||
    b.boundaries - a.boundaries
  );
}

/** Best first. Stable, so level players keep their batting order. */
export function rankStandings(rows: StandingRow[]): StandingRow[] {
  return rows.slice().sort(compareStanding);
}

/**
 * Everyone level with the top row on every tie-break. Empty when nobody
 * scored a point: a day with no runs, wickets or catches has no winner.
 */
export function winnersOf(rows: StandingRow[]): StandingRow[] {
  const ranked = rankStandings(rows);
  const top = ranked[0];
  if (!top || top.points <= 0) return [];
  return ranked.filter((r) => compareStanding(r, top) === 0);
}

/** "Ravi won · 64 pts", or "Ravi and Teja share the win · 40 pts". */
export function individualsResultText(
  winners: Array<{ name: string; points: number }>,
): string {
  if (winners.length === 0) return "No winner";
  const pts = `${winners[0].points} pts`;
  if (winners.length === 1) return `${winners[0].name} won · ${pts}`;
  const names =
    winners.length === 2
      ? `${winners[0].name} and ${winners[1].name}`
      : `${winners
          .slice(0, -1)
          .map((w) => w.name)
          .join(", ")} and ${winners[winners.length - 1].name}`;
  return `${names} share the win · ${pts}`;
}
