/**
 * Impact players: value per match, measured against the community's average
 * player in the window being ranked (a season or all time).
 *
 * Every number comes from that community's own balls. Nothing is tuned to one
 * community: a high-scoring ground gets bigger values on its own.
 *
 * - Bat: runs above what an average batter makes off the same balls, minus a
 *   wicket's worth for each time out above the average rate.
 * - Bowl: runs saved against the average economy, plus a wicket's worth for
 *   each wicket above the average rate.
 * - Field: half a wicket's worth per catch (the fielder's share), the same off
 *   per drop.
 * - A wicket's worth is the community's runs per innings: a wicket ends an
 *   innings, so it costs an average one. Per innings, not per dismissal,
 *   because innings grow with every match while dismissals can be few (a new
 *   community, or one where most innings end at the ball limit), and a
 *   handful of outs would make a wicket worth hundreds of runs.
 *
 * Bat and Bowl each add up to zero across the community, so neither outweighs
 * the other. The total is divided by matches played, so a player who turns out
 * less is not ranked lower for it.
 *
 * Counted numbers only: runs, balls, wickets and catches against juniors stay
 * out, the same rule as all-round points (`points.ts` `earnsPoints`).
 */

/** Share of the window's matches a player must play to be ranked. */
export const IMPACT_MIN_SHARE = 0.25;
/** The floor, so a new community's first matches do not crown anyone. */
export const IMPACT_MIN_MATCHES = 3;

export type ImpactTotals = {
  matches: number;
  runs: number;
  ballsFaced: number;
  /** Times out while batting. */
  outs: number;
  /** Innings batted. */
  innings: number;
  legalBalls: number;
  runsGiven: number;
  wickets: number;
  catches: number;
  drops: number;
};

export type ImpactBaseline = {
  /** Runs off the bat per ball faced. */
  runsPerBall: number;
  /** Times out per ball faced. */
  outsPerBall: number;
  /** Runs given per legal ball bowled. */
  givenPerBall: number;
  /** Wickets per legal ball bowled. */
  wicketsPerBall: number;
  /** Runs a wicket is worth: the community's runs per innings. */
  wicketValue: number;
  /** Runs a catch is worth, and a drop costs: half a wicket. */
  catchValue: number;
};

export function emptyImpactTotals(): ImpactTotals {
  return {
    matches: 0,
    runs: 0,
    ballsFaced: 0,
    outs: 0,
    innings: 0,
    legalBalls: 0,
    runsGiven: 0,
    wickets: 0,
    catches: 0,
    drops: 0,
  };
}

/** The window's average player, from every player's counted balls. */
export function impactBaseline(all: Iterable<ImpactTotals>): ImpactBaseline {
  let runs = 0;
  let faced = 0;
  let outs = 0;
  let innings = 0;
  let given = 0;
  let legal = 0;
  let wickets = 0;
  for (const t of Array.from(all)) {
    runs += t.runs;
    faced += t.ballsFaced;
    outs += t.outs;
    innings += t.innings;
    given += t.runsGiven;
    legal += t.legalBalls;
    wickets += t.wickets;
  }
  const per = (x: number, n: number) => (n > 0 ? x / n : 0);
  const wicketValue = per(runs, innings);
  return {
    runsPerBall: per(runs, faced),
    outsPerBall: per(outs, faced),
    givenPerBall: per(given, legal),
    wicketsPerBall: per(wickets, legal),
    wicketValue,
    catchValue: wicketValue / 2,
  };
}

export function impactMinMatches(matchCount: number): number {
  return Math.max(IMPACT_MIN_MATCHES, Math.ceil(matchCount * IMPACT_MIN_SHARE));
}

export type ImpactScore = {
  /** Runs per match above an average batter off the same balls, outs included. */
  bat: number;
  /** Runs saved per match against average economy, wickets included. */
  bowl: number;
  /** Catches minus drops, per match. */
  field: number;
  /** The three added. */
  total: number;
};

export function impactScore(
  t: ImpactTotals,
  base: ImpactBaseline,
): ImpactScore {
  if (t.matches <= 0) return { bat: 0, bowl: 0, field: 0, total: 0 };
  const w = base.wicketValue;
  const bat =
    t.runs -
    t.ballsFaced * base.runsPerBall -
    (t.outs - t.ballsFaced * base.outsPerBall) * w;
  const bowl =
    t.legalBalls * base.givenPerBall -
    t.runsGiven +
    (t.wickets - t.legalBalls * base.wicketsPerBall) * w;
  const field = (t.catches - t.drops) * base.catchValue;
  const per = (x: number) => x / t.matches;
  return {
    bat: per(bat),
    bowl: per(bowl),
    field: per(field),
    total: per(bat + bowl + field),
  };
}
