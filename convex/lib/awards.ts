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

/** Latest of the counters that feed a measure: when its final value was set. */
function reachedAt(row: Contender, counters: string[]): number | undefined {
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
function ladder(a: Contender, b: Contender, counters: string[]): number {
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
 * the shelf, the stamped season, the profile cabinet.
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

/** Stamped order for anything holding a mixed bag of kinds (the cabinet). */
const KIND_ORDER: string[] = [
  "pots",
  "orange_cap",
  "purple_cap",
  "most_sixes",
  "highest_sr",
  "best_economy",
  ...SHELF.map((s) => s.kind as string),
];

export function kindRank(kind: string): number {
  const i = KIND_ORDER.indexOf(kind);
  return i < 0 ? KIND_ORDER.length : i;
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
