/**
 * The all-round points formula — the one number that ranks the Players
 * board, crowns Player of the Match (convex/story.ts), counts POTM days on
 * Hero (convex/hero.ts) and seeds auto-formed teams.
 *
 * Base: 1 point per run, 20 per wicket, 8 per catch.
 *
 * Milestone bonuses (agreed in the group, 2026-08-15), sized so the two
 * ladders meet: a fifty totals 65 points exactly like a 3-wicket haul, and a
 * century's 140 exactly matches a five-for. Batting milestones are per
 * *innings* (a Test's 30 & 80 earns two bonuses); the bowling haul is per
 * *match*, all innings pooled, because that's what "a five-fer in the match"
 * means. Nobody reaches these numbers inside an ODI quota, so no format
 * check is needed — the bonuses live in Tests by nature, not by rule.
 *
 * The three files above each fold the ball log into their own Agg shape, so
 * the assembly stays local to each — but every threshold and value must come
 * from here. If a number changes, it changes for history too: everything is
 * recomputed from the ball log at read time, so past POTMs can change hands.
 */

export const WICKET_POINTS = 20;
export const CATCH_POINTS = 8;

/** Total bonus for one batting innings: 25→5 · 50→15 · 75→25 · 100→40. */
export function battingMilestoneBonus(inningsScore: number): number {
  if (inningsScore >= 100) return 40;
  if (inningsScore >= 75) return 25;
  if (inningsScore >= 50) return 15;
  if (inningsScore >= 25) return 5;
  return 0;
}

/** Total bonus for one match's wickets: 3+ → 5, 5+ → 40. */
export function bowlingHaulBonus(matchWickets: number): number {
  if (matchWickets >= 5) return 40;
  if (matchWickets >= 3) return 5;
  return 0;
}

export function basePoints(runs: number, wickets: number, catches: number) {
  return runs + wickets * WICKET_POINTS + catches * CATCH_POINTS;
}

/** Receipt line shown wherever the working is printed (POTM badge). */
export const POINTS_RECEIPT =
  "runs + 20 per wicket + 8 per catch, plus milestone bonuses";
