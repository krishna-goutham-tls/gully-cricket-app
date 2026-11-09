/**
 * MVP: impact per match, measured against this community's average player.
 *
 * Every ball has an average value in the window being ranked: runs and
 * wickets. A batter earns the runs they score above what an average batter
 * makes off the same balls, and pays a wicket's worth for each time out above
 * the average rate. A bowler earns the runs they save against the average
 * economy, and a wicket's worth for each wicket above the average rate. Both
 * columns add up to zero across the community, so neither outweighs the
 * other. A fielder earns per catch and loses the same per drop. The three add
 * up because they are all in runs. The sum is divided by matches played, so a
 * player who turns out less is not ranked lower for it.
 *
 * Counted numbers only: runs, balls, wickets and catches against juniors stay
 * out, the same rule as all-round points (`points.ts` `earnsPoints`).
 */

/** Runs a wicket is worth. Under the 16 a batter scores per dismissal, because the next batter still faces the balls. */
export const MVP_WICKET = 12;
/** The fielder's share of a caught wicket. A drop is the same chance missed. */
export const MVP_CATCH = 6;
export const MVP_DROP = 6;
/** Share of the window's matches a player must play to be ranked. */
export const MVP_MIN_SHARE = 0.25;
export const MVP_MIN_MATCHES = 3;

export type MvpTotals = {
  matches: number;
  runs: number;
  ballsFaced: number;
  /** Times out while batting. */
  outs: number;
  legalBalls: number;
  runsGiven: number;
  wickets: number;
  catches: number;
  drops: number;
};

export type MvpBaseline = {
  /** Runs off the bat per ball faced. */
  runsPerBall: number;
  /** Times out per ball faced. */
  outsPerBall: number;
  /** Runs given per legal ball bowled. */
  givenPerBall: number;
  /** Wickets per legal ball bowled. */
  wicketsPerBall: number;
};

export function emptyMvpTotals(): MvpTotals {
  return {
    matches: 0,
    runs: 0,
    ballsFaced: 0,
    outs: 0,
    legalBalls: 0,
    runsGiven: 0,
    wickets: 0,
    catches: 0,
    drops: 0,
  };
}

/** The window's average player, from every player's counted balls. */
export function mvpBaseline(all: Iterable<MvpTotals>): MvpBaseline {
  let runs = 0;
  let faced = 0;
  let outs = 0;
  let given = 0;
  let legal = 0;
  let wickets = 0;
  for (const t of Array.from(all)) {
    runs += t.runs;
    faced += t.ballsFaced;
    outs += t.outs;
    given += t.runsGiven;
    legal += t.legalBalls;
    wickets += t.wickets;
  }
  const per = (x: number, balls: number) => (balls > 0 ? x / balls : 0);
  return {
    runsPerBall: per(runs, faced),
    outsPerBall: per(outs, faced),
    givenPerBall: per(given, legal),
    wicketsPerBall: per(wickets, legal),
  };
}

export function mvpMinMatches(matchCount: number): number {
  return Math.max(MVP_MIN_MATCHES, Math.ceil(matchCount * MVP_MIN_SHARE));
}

export type MvpScore = {
  /** Runs per match above an average batter off the same balls, outs included. */
  bat: number;
  /** Runs saved per match against average economy, wickets included. */
  bowl: number;
  /** Catches minus drops, per match. */
  field: number;
  /** The three added. */
  total: number;
};

export function mvpScore(t: MvpTotals, base: MvpBaseline): MvpScore {
  if (t.matches <= 0) return { bat: 0, bowl: 0, field: 0, total: 0 };
  const bat =
    t.runs -
    t.ballsFaced * base.runsPerBall -
    (t.outs - t.ballsFaced * base.outsPerBall) * MVP_WICKET;
  const bowl =
    t.legalBalls * base.givenPerBall -
    t.runsGiven +
    (t.wickets - t.legalBalls * base.wicketsPerBall) * MVP_WICKET;
  const field = t.catches * MVP_CATCH - t.drops * MVP_DROP;
  const per = (x: number) => x / t.matches;
  return {
    bat: per(bat),
    bowl: per(bowl),
    field: per(field),
    total: per(bat + bowl + field),
  };
}
