import { Id } from "../_generated/dataModel";

/**
 * The six kinds stamped on every season that has already ended. They keep
 * their ids forever — a completed season is frozen data, and renaming one
 * would fail validation on rows nobody can rewrite.
 */
export type LegacyAwardKind =
  | "pots"
  | "orange_cap"
  | "purple_cap"
  | "most_sixes"
  | "highest_sr"
  | "best_economy";

/**
 * The trophy shelf. Ids match the image filenames in public/trophies, so a
 * rename here is a rename on disk too. `run_machine` and `six_machine` measure
 * the same thing as the Orange Cap and Most sixes on purpose: the caps are a
 * Leaders idea, the shelf is its own list, and both get to name a winner.
 */
export type ShelfAwardKind =
  | "run_machine"
  | "six_machine"
  | "boundary_king"
  | "the_anchor"
  | "nudger"
  | "wicket_taker"
  | "workhorse"
  | "the_miser"
  | "safe_hands"
  | "dot_magnet"
  | "duck_collector"
  | "butterfingers";

export type SeasonAwardKind = LegacyAwardKind | ShelfAwardKind;

export type AwardTone = "honor" | "roast";

export type SeasonAward = {
  kind: SeasonAwardKind;
  userId: Id<"users">;
  value: number;
  display: string;
};

/**
 * A roast needs a body of work behind it. One duck in your only match is bad
 * luck; five matches in, it is a habit worth a trophy. Honours have no floor —
 * scoring the most runs is the whole qualification.
 */
export const ROAST_MIN_MATCHES = 5;

/**
 * Everything the tie-break ladder needs from a row, whatever board it came
 * from. `at` maps a counter name to the timestamp of the ball that last moved
 * it — for a number that only goes up, that IS when the player reached their
 * final total, which is rung (c) without replaying the log a second time.
 */
export type Contender = {
  userId: Id<"users">;
  displayName: string;
  /** Matches turned out for inside the window. Rung (b), and the roast floor. */
  turnoutMatches: number;
  at: Map<string, number>;
};

export type Named = { userId: Id<"users">; displayName: string };

export type Winner<T> = {
  row: T;
  value: number;
  /** Everyone else who matched on the raw measure — the tie is reported, not hidden. */
  tiedWith: Named[];
};

type LadderRow = Pick<Contender, "userId" | "turnoutMatches" | "at">;

/** Latest of the counters that feed a measure: when its final value was set. */
function reachedAt(row: LadderRow, counters: string[]): number | undefined {
  let latest: number | undefined;
  for (const c of counters) {
    const at = row.at.get(c);
    if (at === undefined) continue;
    if (latest === undefined || at > latest) latest = at;
  }
  return latest;
}

/**
 * Rungs (b) → (d) of the ladder, once the measure itself has tied.
 *
 * (b) fewer matches wins: the same output off less cricket is the better
 * season, and for a roast it is more shame per game. (c) whoever got there
 * first. (d) userId, which nobody sees but which stops the same tie landing
 * on a different name each time the query runs. Names are deliberately not in
 * here — "wins because his name starts with A" is not a tie-break.
 */
function ladder(a: LadderRow, b: LadderRow, counters: string[]): number {
  if (a.turnoutMatches !== b.turnoutMatches)
    return a.turnoutMatches - b.turnoutMatches;
  const atA = reachedAt(a, counters);
  const atB = reachedAt(b, counters);
  if (atA !== undefined && atB !== undefined && atA !== atB) return atA - atB;
  return String(a.userId).localeCompare(String(b.userId));
}

export function pickWinner<T extends Contender>(
  rows: T[],
  measure: (r: T) => number,
  opts: {
    better?: (a: number, b: number) => boolean;
    keepZero?: boolean;
    /** Counters behind `measure`, for rung (c). Omit and the rung is skipped. */
    counters?: string[];
  } = {},
): Winner<T> | null {
  const better = opts.better ?? ((a: number, b: number) => a > b);
  const counters = opts.counters ?? [];

  const pool = rows.filter((r) => opts.keepZero || measure(r) > 0);
  if (pool.length === 0) return null;

  let best = measure(pool[0]);
  for (const r of pool) {
    const value = measure(r);
    if (better(value, best)) best = value;
  }

  const tied = pool
    .filter((r) => measure(r) === best)
    .sort((a, b) => ladder(a, b, counters));
  const [winner, ...rest] = tied;
  return {
    row: winner,
    value: best,
    tiedWith: rest.map((r) => ({
      userId: r.userId,
      displayName: r.displayName,
    })),
  };
}

/**
 * The bar for a rate award: four overs and three innings. Same numbers as
 * components/leaderboard/records.ts, which this file must not import.
 */
export const AWARD_MIN_BALLS = 24;
export const AWARD_MIN_INNINGS = 3;

/** The counters behind economy, for rung (c). */
export const ECONOMY_COUNTERS = ["bowl.runs", "bowl.legalBalls"];

type EconomyRow = {
  userId: Id<"users">;
  innings: number;
  countedBalls: number;
  countedEconomy: number;
};

/** Balls bowled to juniors do not help a bowler reach the bar. */
export function economyQualifies(r: EconomyRow): boolean {
  return r.countedBalls >= AWARD_MIN_BALLS && r.innings >= AWARD_MIN_INNINGS;
}

/** Runs behind `countedEconomy`, for a screen that prints them beside the rate. */
export function countedRunsConceded(r: EconomyRow): number {
  return Math.round((r.countedEconomy * r.countedBalls) / 6);
}

/**
 * Economy order for the screens, using the same pool and ladder as the saved
 * award. Rows that miss the bar come last, and a bowler with no counted balls
 * comes last of all, because their 0.0 is not a rate.
 *
 * Board rows from the leaderboard query carry no `at`, so rung (c) is skipped
 * here: an exact tie on economy and on matches falls to userId on a screen.
 */
export function rankEconomy<T extends EconomyRow>(
  rows: T[],
  turnout: Array<{ userId: Id<"users">; matches: number }>,
): T[] {
  const matches = new Map(turnout.map((t) => [String(t.userId), t.matches]));
  const contender = (r: T): LadderRow => ({
    userId: r.userId,
    turnoutMatches: matches.get(String(r.userId)) ?? 0,
    at: new Map(),
  });
  return rows.slice().sort(
    (a, b) =>
      Number(economyQualifies(b)) - Number(economyQualifies(a)) ||
      Number(b.countedBalls > 0) - Number(a.countedBalls > 0) ||
      a.countedEconomy - b.countedEconomy ||
      ladder(contender(a), contender(b), ECONOMY_COUNTERS),
  );
}

/** The Best economy winner a screen shows. Null when nobody clears the bar. */
export function bestEconomyRow<T extends EconomyRow>(
  rows: T[],
  turnout: Array<{ userId: Id<"users">; matches: number }>,
): T | null {
  const top = rankEconomy(rows, turnout)[0];
  return top && economyQualifies(top) ? top : null;
}

/** One regular's whole window, raw. The shelf reads every award off this. */
export type ShelfRow = Contender & {
  runs: number;
  fours: number;
  sixes: number;
  ballsFaced: number;
  singles: number;
  dotsFaced: number;
  ducks: number;
  wickets: number;
  legalBallsBowled: number;
  dotsConceded: number;
  catches: number;
  drops: number;
};

type ShelfSpec = {
  kind: ShelfAwardKind;
  tone: AwardTone;
  measure: (r: ShelfRow) => number;
  counters: string[];
};

/**
 * Render order, and the whole definition of the shelf: honours first, roasts
 * last. Add a kind here and to the schema union and it appears everywhere —
 * the shelf and the stamped season.
 */
const SHELF: ShelfSpec[] = [
  {
    kind: "run_machine",
    tone: "honor",
    measure: (r) => r.runs,
    counters: ["bat.runs"],
  },
  {
    kind: "six_machine",
    tone: "honor",
    measure: (r) => r.sixes,
    counters: ["bat.sixes"],
  },
  {
    kind: "boundary_king",
    tone: "honor",
    measure: (r) => r.fours * 4 + r.sixes * 6,
    counters: ["bat.fours", "bat.sixes"],
  },
  {
    kind: "the_anchor",
    tone: "honor",
    measure: (r) => r.ballsFaced,
    counters: ["bat.balls"],
  },
  {
    kind: "nudger",
    tone: "honor",
    measure: (r) => r.singles,
    counters: ["bat.singles"],
  },
  {
    kind: "wicket_taker",
    tone: "honor",
    measure: (r) => r.wickets,
    counters: ["bowl.wickets"],
  },
  {
    kind: "workhorse",
    tone: "honor",
    measure: (r) => r.legalBallsBowled,
    counters: ["bowl.legalBalls"],
  },
  {
    kind: "the_miser",
    tone: "honor",
    measure: (r) => r.dotsConceded,
    counters: ["bowl.dots"],
  },
  {
    kind: "safe_hands",
    tone: "honor",
    measure: (r) => r.catches,
    counters: ["field.catches"],
  },
  {
    kind: "dot_magnet",
    tone: "roast",
    measure: (r) => r.dotsFaced,
    counters: ["bat.dots"],
  },
  {
    kind: "duck_collector",
    tone: "roast",
    measure: (r) => r.ducks,
    counters: ["bat.ducks"],
  },
  {
    kind: "butterfingers",
    tone: "roast",
    measure: (r) => r.drops,
    counters: ["field.drops"],
  },
];

/**
 * The twelve shelf kinds in render order. A stamped season carries all
 * eighteen in one array, so anything rebuilding a shelf out of a stamp needs
 * both this order and the test below to drop the six legacy caps.
 */
export const SHELF_KINDS: ShelfAwardKind[] = SHELF.map((s) => s.kind);

const SHELF_KIND_SET = new Set<string>(SHELF_KINDS);

/**
 * The order a saved award list keeps: the six caps, then the shelf. Season
 * pages and profile trophies print awards in saved order, so a kind that
 * returns goes back to its own place, not to the end.
 */
const AWARD_KIND_ORDER: SeasonAwardKind[] = [
  "pots",
  "orange_cap",
  "purple_cap",
  "most_sixes",
  "highest_sr",
  "best_economy",
  ...SHELF_KINDS,
];

/**
 * Every kind a season keeps on a recompute. A season saved before `awardKinds`
 * existed has only its saved kinds, so it gains no brand-new kind.
 */
export function seasonAwardKinds(
  saved: SeasonAwardKind[],
  remembered: string[] | undefined,
): SeasonAwardKind[] {
  const kinds = new Set<string>(["pots", ...saved, ...(remembered ?? [])]);
  return AWARD_KIND_ORDER.filter((kind) => kinds.has(kind));
}

export function isShelfKind(kind: string): kind is ShelfAwardKind {
  return SHELF_KIND_SET.has(kind);
}

/** Honours are all six legacy kinds; nothing stamped before today was a roast. */
const LEGACY_TONE: Record<LegacyAwardKind, AwardTone> = {
  pots: "honor",
  orange_cap: "honor",
  purple_cap: "honor",
  most_sixes: "honor",
  highest_sr: "honor",
  best_economy: "honor",
};

const SHELF_TONE = new Map<string, AwardTone>(
  SHELF.map((s) => [s.kind as string, s.tone]),
);

export function awardTone(kind: string): AwardTone {
  return (
    SHELF_TONE.get(kind) ??
    LEGACY_TONE[kind as LegacyAwardKind] ??
    ("honor" as const)
  );
}

export type ShelfAward = {
  kind: ShelfAwardKind;
  userId: Id<"users">;
  displayName: string;
  value: number;
  display: string;
  tone: AwardTone;
  tiedWith: Named[];
};

/**
 * One winner per shelf award, in SHELF order. An award with nobody qualified
 * is absent rather than present-and-empty — the card renders its own blank.
 */
export function awardsFromShelf(rows: ShelfRow[]): ShelfAward[] {
  const out: ShelfAward[] = [];
  for (const spec of SHELF) {
    const pool =
      spec.tone === "roast"
        ? rows.filter((r) => r.turnoutMatches >= ROAST_MIN_MATCHES)
        : rows;
    const won = pickWinner(pool, spec.measure, { counters: spec.counters });
    if (!won) continue;
    out.push({
      kind: spec.kind,
      userId: won.row.userId,
      displayName: won.row.displayName,
      value: won.value,
      display: String(won.value),
      tone: spec.tone,
      tiedWith: won.tiedWith,
    });
  }
  return out;
}
