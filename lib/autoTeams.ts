/**
 * Auto-formed teams — the logic behind "Auto form teams" on match create.
 *
 * Input is whoever is here today; output is two rosters plus (on an odd
 * turnout) the one common player who bats for both sides. Nothing here talks
 * to Convex: it takes a rating lookup and returns ids, so it can be reasoned
 * about — and corrected by hand on the draft screen — before a match exists.
 */

export type PlayerLevel = {
  /**
   * All-round leaderboard points (runs + 20/wicket + 8/catch). Someone who has
   * never played is 0 and therefore ranks last, which is what a new face is.
   */
  points: number;
  displayName: string;
};

/**
 * Today's players, strongest first, in exactly the order the Players tab of
 * the leaderboard ranks them (all-round points, ties to the alphabet). The
 * name tie-break is what keeps two identical players from swapping sides on
 * every tap — the same turnout always produces the same teams.
 */
export function rankByLevel(
  ids: string[],
  levelOf: (id: string) => PlayerLevel,
): string[] {
  return [...ids].sort((a, b) => {
    const la = levelOf(a);
    const lb = levelOf(b);
    return lb.points - la.points || la.displayName.localeCompare(lb.displayName);
  });
}

/**
 * Snake draft (A · B B · A A · B B …) down the ranked list.
 *
 * Deliberately balancing *rank positions*, not point totals: leaderboard
 * points are cumulative, so a regular who has played thirty matches outscores
 * a better player who has played three, and a sum-balancing split would hand
 * one side the veteran and the other side everyone else. Alternating picks
 * gives each team the same share of the top, middle and tail of the field.
 *
 * Odd turnout: the **last-ranked** player present becomes the common player
 * (plays both sides) and the even remainder is drafted. The rest is a
 * captain's convention — index 0 of a side is its captain, and because the
 * draft runs strongest-first that lands the two best players in charge.
 */
export function autoFormTeams(ranked: string[]): {
  teamA: string[];
  teamB: string[];
  common: string[];
} {
  const odd = ranked.length % 2 === 1;
  const common = odd ? ranked.slice(-1) : [];
  const pool = odd ? ranked.slice(0, -1) : ranked;

  const teamA: string[] = [];
  const teamB: string[] = [];
  pool.forEach((id, i) => {
    // Pairs alternate which side picks first, so the snake turns every 2 picks.
    const toA = ((Math.floor(i / 2) + (i % 2)) % 2) === 0;
    (toA ? teamA : teamB).push(id);
  });

  return { teamA, teamB, common };
}

/** `rankByLevel` + `autoFormTeams` — the one call the create screen makes. */
export function balanceTeams(
  ids: string[],
  levelOf: (id: string) => PlayerLevel,
) {
  return autoFormTeams(rankByLevel(ids, levelOf));
}
