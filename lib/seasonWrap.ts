import {
  RECORD_MIN_BALLS,
  RECORD_MIN_INNINGS,
  type FeatRecord,
  type RecordGroup,
} from "@/components/leaderboard/records";
import type { StampedAwardKind } from "@/lib/trophies";
import type { SeasonShareData } from "@/components/share/ShareCard";
import { api } from "@/convex/_generated/api";
import type { FunctionReturnType } from "convex/server";

type Board = NonNullable<FunctionReturnType<typeof api.stats.leaderboard>>;

// Kind is the wide stamped union: a completed season now carries the shelf
// trophies too, and the wrap only reads the six it has cards for.
type NamedAward = {
  kind: StampedAwardKind;
  displayName: string;
  display: string;
};

const ROAST_PICK = [
  "Most ducks",
  "Most golden ducks",
  "Most expensive",
  "Butterfingers 🧈",
];

/** Legal balls to the way a scorer says it: 412.3, and 412 on the over. */
function oversText(legalBalls: number) {
  const overs = Math.floor(legalBalls / 6);
  const rem = legalBalls % 6;
  return rem === 0 ? String(overs) : `${overs}.${rem}`;
}

function monthDay(ts: number) {
  return new Date(ts).toLocaleDateString([], {
    month: "short",
    day: "numeric",
  });
}

/** Live leaders for a season that is still open — same kinds as locked awards. */
export function liveAwardsFromBoard(board: Board): NamedAward[] {
  const out: NamedAward[] = [];
  const pots = board.allRound[0];
  if (pots)
    out.push({
      kind: "pots",
      displayName: pots.displayName,
      display: String(pots.points),
    });
  const orange = board.batting[0];
  if (orange && orange.runs > 0)
    out.push({
      kind: "orange_cap",
      displayName: orange.displayName,
      display: String(orange.runs),
    });
  const purple = board.bowling[0];
  if (purple && purple.wickets > 0)
    out.push({
      kind: "purple_cap",
      displayName: purple.displayName,
      display: String(purple.wickets),
    });
  const sixes = [...board.batting].sort((a, b) => b.sixes - a.sixes)[0];
  if (sixes && sixes.sixes > 0)
    out.push({
      kind: "most_sixes",
      displayName: sixes.displayName,
      display: String(sixes.sixes),
    });
  const sr = [...board.batting]
    .filter(
      (r) => r.balls >= RECORD_MIN_BALLS && r.innings >= RECORD_MIN_INNINGS,
    )
    .sort((a, b) => b.strikeRate - a.strikeRate)[0];
  if (sr)
    out.push({
      kind: "highest_sr",
      displayName: sr.displayName,
      display: sr.strikeRate.toFixed(1),
    });
  const econ = [...board.bowling]
    .filter(
      (r) =>
        r.legalBalls >= RECORD_MIN_BALLS && r.innings >= RECORD_MIN_INNINGS,
    )
    .sort((a, b) => a.economy - b.economy)[0];
  if (econ)
    out.push({
      kind: "best_economy",
      displayName: econ.displayName,
      display: econ.economy.toFixed(1),
    });
  return out;
}

/**
 * At most six posters, each a different composition.
 * No per-award slideshow.
 */
export function buildSeasonCards(args: {
  seasonName: string;
  startedAt: number;
  endedAt: number;
  matchCount: number;
  awards: NamedAward[];
  records: RecordGroup[];
  /**
   * The board with visitors and juniors IN. Awards are regulars-only on
   * purpose — a cap should not go to a one-off walk-on — but "The Book" is
   * the season's whole ledger, and a visitor's six was still hit that season.
   * Totals come off this board and nothing else does.
   */
  totalsBoard: Board;
  allRound: Array<{ displayName: string; points: number }>;
  soFar?: boolean;
}): SeasonShareData[] {
  const cards: SeasonShareData[] = [];
  const byKind = new Map(args.awards.map((a) => [a.kind, a]));
  const range = args.soFar
    ? `from ${monthDay(args.startedAt)}`
    : `${monthDay(args.startedAt)} – ${monthDay(args.endedAt)}`;

  cards.push({
    kind: "season",
    variant: "title",
    seasonName: args.seasonName,
    kicker: args.soFar ? "Season so far" : "Season closed",
    headline: args.seasonName,
    stat: {
      value: String(args.matchCount),
      label: args.matchCount === 1 ? "match" : "matches",
    },
    line: range,
  });

  const pots = byKind.get("pots");
  if (pots) {
    cards.push({
      kind: "season",
      variant: "pots",
      seasonName: args.seasonName,
      kicker: "Player of the season",
      headline: pots.displayName,
      stat: { value: pots.display, label: "all-round points" },
    });
  }

  const orange = byKind.get("orange_cap");
  const purple = byKind.get("purple_cap");
  if (orange || purple) {
    cards.push({
      kind: "season",
      variant: "caps",
      seasonName: args.seasonName,
      kicker: "The caps",
      caps: {
        orange: orange
          ? { name: orange.displayName, value: orange.display }
          : { name: "—", value: "—" },
        purple: purple
          ? { name: purple.displayName, value: purple.display }
          : { name: "—", value: "—" },
      },
    });
  }

  const top = args.allRound.filter((r) => r.points > 0).slice(0, 5);
  const maxPts = top[0]?.points ?? 1;
  if (top.length >= 2) {
    cards.push({
      kind: "season",
      variant: "board",
      seasonName: args.seasonName,
      kicker: "The board",
      board: top.map((r, i) => ({
        rank: i + 1,
        name: r.displayName,
        value: String(r.points),
        pct: Math.round((r.points / maxPts) * 100),
      })),
    });
  }

  const roastItems: FeatRecord[] = [];
  for (const g of args.records) {
    if (g.tone !== "roast") continue;
    for (const item of g.items) {
      if (ROAST_PICK.includes(item.label)) roastItems.push(item);
    }
  }
  if (roastItems.length > 0) {
    cards.push({
      kind: "season",
      variant: "roast",
      seasonName: args.seasonName,
      kicker: "The roast",
      roasts: roastItems.slice(0, 3).map((item) => ({
        name: item.holder,
        label: item.label.replace(" 🧈", ""),
        value: item.value,
      })),
    });
  }

  if (args.matchCount > 0) {
    const t = args.totalsBoard;
    const sum = <T,>(rows: T[], pick: (r: T) => number) =>
      rows.reduce((n, r) => n + pick(r), 0);
    const legalBalls = sum(t.bowling, (r) => r.legalBalls);
    // Six disciplines, six numbers, best first — the first one still standing
    // after the zero-guard is the card's gold figure. Runs is the season's
    // scale, matches is the frame the rest are read against, and the card
    // travels alone in a chat, so it cannot borrow the title slide's count.
    const book = (
      [
        [sum(t.batting, (r) => r.runs), "runs"],
        [t.matchCount, t.matchCount === 1 ? "match" : "matches"],
        [sum(t.bowling, (r) => r.wickets), "wickets"],
        [sum(t.batting, (r) => r.sixes), "sixes"],
        [legalBalls, legalBalls === 6 ? "over" : "overs", oversText(legalBalls)],
        [sum(t.allRound, (r) => r.catches), "catches"],
      ] as Array<[number, string, string?]>
    )
      .filter(([n]) => n > 0)
      .map(([n, label, text]) => ({ value: text ?? String(n), label }));
    cards.push({
      kind: "season",
      variant: "book",
      seasonName: args.seasonName,
      kicker: "The book",
      book,
    });
  }

  return cards;
}
