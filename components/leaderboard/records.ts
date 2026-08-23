import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import type { FunctionReturnType } from "convex/server";

type Board = NonNullable<FunctionReturnType<typeof api.stats.leaderboard>>;

export type FeatRecord = {
  label: string;
  value: string;
  holder: string;
  holderId: Id<"users">;
};
export type RecordGroup = {
  title: string;
  /** honour = hall of fame (gold); roast = wall of shame (the hot seat). */
  tone: "honour" | "roast";
  items: FeatRecord[];
};

/**
 * A record needs a real body of work behind it — four overs AND three innings,
 * in the discipline the record is about. Deliberately its own bar, well above
 * the leaderboard's `MIN_BALLS_FACED`/`MIN_LEGAL_BALLS_BOWLED` (6): there a thin
 * sample only sorts to the bottom, here it would outright *win*. Reusing the
 * leaderboard's bar is what once handed "best economy" to a two-over spell over
 * a thirty-three-over season.
 *
 * Both bars must clear, not either. Three innings on its own lets a player who
 * has faced sixteen balls own a percentage record, which is the exact unfairness
 * this is here to stop.
 */
export const RECORD_MIN_BALLS = 24;
export const RECORD_MIN_INNINGS = 3;

/**
 * Best of a measure, with an explicit tie-break.
 *
 * Ties are the whole point of this helper. Without one the winner was simply
 * whoever came first in the board's own ordering — which is sorted by runs — so
 * a four-way tie on ducks silently went to the *best batsman* in it. The roast
 * therefore rewarded scoring runs, which is precisely backwards.
 *
 * Zeroes are dropped by default because "Most sixes: 0" is noise, but a
 * lower-is-better measure has to keep them — a qualified bowler who has conceded
 * nothing owns the best economy in the org.
 */
function bestBy<T extends { displayName: string }>(
  rows: T[],
  measure: (r: T) => number,
  opts: {
    better?: (a: number, b: number) => boolean;
    keepZero?: boolean;
    /** True if `a` should take the record from `b` on an equal measure. */
    tieBreak?: (a: T, b: T) => boolean;
  } = {},
): T | null {
  const better = opts.better ?? ((a, b) => a > b);
  let best: T | null = null;
  for (const r of rows) {
    if (!opts.keepZero && measure(r) <= 0) continue;
    if (!best) {
      best = r;
      continue;
    }
    const value = measure(r);
    const incumbent = measure(best);
    if (better(value, incumbent)) best = r;
    else if (value === incumbent && opts.tieBreak?.(r, best)) best = r;
  }
  return best;
}

/**
 * Tie-breaks, by group. An honour is a contest the better player deserves to
 * win; a roast is not — being the org's leading run-scorer should never be what
 * puts your name on "most ducks". Name order settles a dead heat so the board
 * is stable between renders rather than dependent on aggregation order.
 */
type Named = { displayName: string };
const byName = (a: Named, b: Named) =>
  a.displayName.localeCompare(b.displayName) < 0;

const tieHonourBat = <T extends Named & { runs: number }>(a: T, b: T) =>
  a.runs !== b.runs ? a.runs > b.runs : byName(a, b);
const tieHonourBowl = <T extends Named & { wickets: number }>(a: T, b: T) =>
  a.wickets !== b.wickets ? a.wickets > b.wickets : byName(a, b);
const tieRoastBat = <T extends Named & { runs: number }>(a: T, b: T) =>
  a.runs !== b.runs ? a.runs < b.runs : byName(a, b);
const tieRoastBowl = <T extends Named & { wickets: number }>(a: T, b: T) =>
  a.wickets !== b.wickets ? a.wickets < b.wickets : byName(a, b);
/**
 * Catches and turnout belong to neither discipline, so runs is the wrong
 * yardstick for them — it once handed "most matches" to the leading run-scorer
 * over a player with the same eight appearances and a hundred more all-round
 * points. Ranked on the same points the Players tab already sorts by.
 */
const tieHonourAllRound = <T extends Named & { points: number }>(a: T, b: T) =>
  a.points !== b.points ? a.points > b.points : byName(a, b);
const tieRoastAllRound = <T extends Named & { points: number }>(a: T, b: T) =>
  a.points !== b.points ? a.points < b.points : byName(a, b);

/**
 * The org's record book, grouped by discipline. Every value comes straight off
 * rows the leaderboard query already returns — no extra backend work. Empty
 * feats (nobody has done the thing yet) drop out, and a group with no feats
 * left drops entirely, so the page never shows a hollow heading.
 *
 * Pass `{ season: true }` for the current stretch: the bar is looser so a
 * short season still has names. All-time keeps the hard bar.
 */
export function buildRecords(
  board: Board,
  opts: { season?: boolean } = {},
): RecordGroup[] {
  const push = <T extends { displayName: string; userId: Id<"users"> }>(
    items: FeatRecord[],
    label: string,
    row: T | null,
    value: (r: T) => string,
  ) => {
    if (row)
      items.push({
        label,
        value: value(row),
        holder: row.displayName,
        holderId: row.userId,
      });
  };

  // Everyone with enough of a body of work to hold a record, per discipline.
  // Counts and rates draw from the same pool on purpose: "most ducks" off two
  // innings is no more meaningful than a two-over economy.
  const minBalls = opts.season ? 6 : RECORD_MIN_BALLS;
  const minInns = opts.season ? 1 : RECORD_MIN_INNINGS;
  const bat = board.batting.filter(
    (r) => r.balls >= minBalls && r.innings >= minInns,
  );
  const bowl = board.bowling.filter(
    (r) => r.legalBalls >= minBalls && r.innings >= minInns,
  );
  // Catches and turnout belong to neither discipline's ball count, so they
  // qualify on having cleared the bar as a batter or as a bowler — i.e. on
  // being an established player at all.
  const established = new Set<string>([
    ...bat.map((r) => String(r.userId)),
    ...bowl.map((r) => String(r.userId)),
  ]);
  const allRound = board.allRound.filter((r) =>
    established.has(String(r.userId)),
  );

  const dotPct = (r: { dots: number; balls: number }) =>
    r.balls > 0 ? r.dots / r.balls : 0;

  // Honours — the glory board. Marquee career totals first, then the rate
  // feats, then the flourishes and turnout.
  const honour: FeatRecord[] = [];
  push(
    honour,
    "Most runs",
    bestBy(bat, (r) => r.runs, { tieBreak: tieHonourBat }),
    (r) => String(r.runs),
  );
  push(
    honour,
    "Most wickets",
    bestBy(bowl, (r) => r.wickets, { tieBreak: tieHonourBowl }),
    (r) => String(r.wickets),
  );
  push(
    honour,
    "Best score",
    bestBy(bat, (r) => r.bestScore, { tieBreak: tieHonourBat }),
    (r) => String(r.bestScore),
  );
  // `best` arrives as "3/12" — parse rather than re-derive, so the record can
  // never disagree with the row it came from.
  const parsed = bowl
    .map((r) => {
      const m = /^(\d+)\/(\d+)$/.exec(r.best);
      return m ? { row: r, wickets: Number(m[1]), runs: Number(m[2]) } : null;
    })
    .filter((x): x is NonNullable<typeof x> => x !== null && x.wickets > 0);
  const figures = parsed.reduce<(typeof parsed)[number] | null>((a, b) => {
    if (!a) return b;
    if (b.wickets !== a.wickets) return b.wickets > a.wickets ? b : a;
    if (b.runs !== a.runs) return b.runs < a.runs ? b : a;
    return tieHonourBowl(b.row, a.row) ? b : a;
  }, null);
  if (figures) {
    honour.push({
      label: "Best spell",
      value: figures.row.best,
      holder: figures.row.displayName,
      holderId: figures.row.userId,
    });
  }
  push(
    honour,
    "Super striker",
    bestBy(bat, (r) => r.strikeRate, { tieBreak: tieHonourBat }),
    (r) => r.strikeRate.toFixed(0),
  );
  push(
    honour,
    "Best economy",
    bestBy(bowl, (r) => r.economy, {
      better: (a, b) => a < b,
      keepZero: true,
      tieBreak: tieHonourBowl,
    }),
    (r) => r.economy.toFixed(1),
  );
  push(
    honour,
    "Most fours",
    bestBy(bat, (r) => r.fours, { tieBreak: tieHonourBat }),
    (r) => String(r.fours),
  );
  push(
    honour,
    "Most sixes",
    bestBy(bat, (r) => r.sixes, { tieBreak: tieHonourBat }),
    (r) => String(r.sixes),
  );
  push(
    honour,
    "Most catches",
    bestBy(allRound, (r) => r.catches, { tieBreak: tieHonourAllRound }),
    (r) => String(r.catches),
  );
  push(
    honour,
    "Most dots",
    bestBy(bowl, (r) => r.dots, { tieBreak: tieHonourBowl }),
    (r) => String(r.dots),
  );
  /**
   * Turnout, not `allRound.matches` — the latter counts only matches a player
   * did something in, so a game spent fielding all day never showed up. Both
   * the turnout honour and its roast have to read the same number, or they'd
   * name the same player as the most and least regular on the same page.
   *
   * Restricted to established players on purpose: without that, "most
   * irregular" is won every time by whichever guest turned up once, which
   * isn't the joke — the joke is about a regular who keeps skipping.
   */
  const pointsOf = new Map(
    board.allRound.map((r) => [String(r.userId), r.points]),
  );
  const attendance = board.turnout
    .filter((r) => established.has(String(r.userId)))
    .map((r) => ({ ...r, points: pointsOf.get(String(r.userId)) ?? 0 }));

  push(
    honour,
    "Most matches",
    bestBy(attendance, (r) => r.matches, { tieBreak: tieHonourAllRound }),
    (r) => String(r.matches),
  );

  // The Roast — the hot seat. Bad-thing counts keep zeroes out (a spotless
  // record isn't a roast), and every tie goes to the *least* accomplished
  // player in it: the joke only lands downward.
  const roast: FeatRecord[] = [];
  push(
    roast,
    "Most ducks",
    bestBy(bat, (r) => r.ducks, { tieBreak: tieRoastBat }),
    (r) => String(r.ducks),
  );
  push(
    roast,
    "Most golden ducks",
    bestBy(bat, (r) => r.goldenDucks, { tieBreak: tieRoastBat }),
    (r) => String(r.goldenDucks),
  );
  push(roast, "Mr. Defensive", bestBy(bat, dotPct, { tieBreak: tieRoastBat }), (r) =>
    `${Math.round(dotPct(r) * 100)}%`,
  );
  push(
    roast,
    "Most expensive",
    bestBy(bowl, (r) => r.economy, {
      better: (a, b) => a > b,
      tieBreak: tieRoastBowl,
    }),
    (r) => r.economy.toFixed(1),
  );
  push(
    roast,
    "Most wides & no-balls",
    bestBy(bowl, (r) => r.widesNoballs, { tieBreak: tieRoastBowl }),
    (r) => String(r.widesNoballs),
  );
  push(
    roast,
    "Most sixes conceded",
    bestBy(bowl, (r) => r.sixesConceded, { tieBreak: tieRoastBowl }),
    (r) => String(r.sixesConceded),
  );
  // Only a joke once somebody has actually missed a game — with a full-house
  // squad this would crown whoever played every match as "most irregular".
  // keepZero, because the lowest turnout is the record here, not a zero to skip.
  if (attendance.some((r) => r.matches < board.matchCount)) {
    push(
      roast,
      "Most irregular",
      bestBy(attendance, (r) => r.matches, {
        better: (a, b) => a < b,
        keepZero: true,
        tieBreak: tieRoastAllRound,
      }),
      (r) => `${r.matches} of ${board.matchCount}`,
    );
  }
  // Same established-player restriction as every other roast: a guest who
  // showed up once and shelled the only chance they got isn't the joke.
  const drops = board.drops
    .filter((r) => established.has(String(r.userId)))
    .map((r) => ({ ...r, points: pointsOf.get(String(r.userId)) ?? 0 }));
  push(
    roast,
    "Butterfingers 🧈",
    bestBy(drops, (r) => r.drops, { tieBreak: tieRoastAllRound }),
    (r) => String(r.drops),
  );

  return [
    { title: "Honours", tone: "honour" as const, items: honour },
    { title: "The Roast", tone: "roast" as const, items: roast },
  ].filter((g) => g.items.length > 0);
}
