/**
 * Win rate and contribution share.
 *
 * Contribution is all-round *base* points (runs + 20/wkt + 8/catch), win or
 * lose. A common player's match share is their points on both sides over
 * both sides' points — one number, weighted by how much cricket got played
 * in the match, not an average of two percentages.
 *
 * Win credit: one-side players take the team's result. Commons only get the
 * W if their share of the *winning* side is at least 1/N (N = named on that
 * side). Missing that bar is not a loss — they played both shirts.
 */

export type Side = "A" | "B";

export function share(playerPoints: number, teamPoints: number): number | null {
  if (teamPoints <= 0) return null;
  return playerPoints / teamPoints;
}

export function fairShare(sideSize: number): number {
  if (sideSize <= 0) return 1;
  return 1 / sideSize;
}

/** One-side: player / that team. Common: (pA + pB) / (teamA + teamB). */
export function matchContribution(args: {
  onA: boolean;
  onB: boolean;
  pointsA: number;
  pointsB: number;
  teamA: number;
  teamB: number;
}): number | null {
  if (args.onA && args.onB) {
    return share(args.pointsA + args.pointsB, args.teamA + args.teamB);
  }
  if (args.onA) return share(args.pointsA, args.teamA);
  if (args.onB) return share(args.pointsB, args.teamB);
  return null;
}

/**
 * Career contribution is the same totals-over-totals, summed across matches.
 * Matches where the denominator is 0 (nobody scored a point) drop out.
 */
export function careerContribution(
  rows: Array<{ playerPoints: number; teamPoints: number }>,
): number | null {
  let player = 0;
  let team = 0;
  for (const r of rows) {
    if (r.teamPoints <= 0) continue;
    player += r.playerPoints;
    team += r.teamPoints;
  }
  return share(player, team);
}

export function matchResult(args: {
  onA: boolean;
  onB: boolean;
  winnerSide: Side | undefined;
  pointsA: number;
  pointsB: number;
  teamA: number;
  teamB: number;
  sizeA: number;
  sizeB: number;
}): "won" | "lost" | "none" {
  if (!args.winnerSide) return "none";
  const both = args.onA && args.onB;
  if (!both) {
    const side = args.onA ? "A" : args.onB ? "B" : null;
    if (!side) return "none";
    return side === args.winnerSide ? "won" : "lost";
  }
  const winPts = args.winnerSide === "A" ? args.pointsA : args.pointsB;
  const winTeam = args.winnerSide === "A" ? args.teamA : args.teamB;
  const winN = args.winnerSide === "A" ? args.sizeA : args.sizeB;
  const s = share(winPts, winTeam);
  if (s == null) return "none";
  return s + 1e-9 >= fairShare(winN) ? "won" : "none";
}

export function asPct(unit: number | null): number | null {
  if (unit == null) return null;
  return unit * 100;
}
