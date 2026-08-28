import type { FeatRecord, RecordGroup } from "@/components/leaderboard/records";
import type { SeasonAwardKind } from "@/lib/trophies";
import type { SeasonShareData } from "@/components/share/ShareCard";

type NamedAward = {
  kind: SeasonAwardKind;
  displayName: string;
  display: string;
};

const AWARD_CARD: Record<
  SeasonAwardKind,
  { kicker: string; statLabel: string; line: (name: string) => string }
> = {
  pots: {
    kicker: "Player of the season",
    statLabel: "all-round points",
    line: (name) =>
      `${name} led the board that this community actually argues on — runs, wickets, and catches, counted together.`,
  },
  orange_cap: {
    kicker: "Orange Cap",
    statLabel: "runs",
    line: (name) => `${name} scored more runs than anyone else this season.`,
  },
  purple_cap: {
    kicker: "Purple Cap",
    statLabel: "wickets",
    line: (name) => `${name} took more wickets than anyone else this season.`,
  },
  most_sixes: {
    kicker: "Most sixes",
    statLabel: "sixes",
    line: (name) => `${name} cleared the rope more often than the rest.`,
  },
  highest_sr: {
    kicker: "Highest strike rate",
    statLabel: "strike rate",
    line: (name) => `${name} scored faster than anyone who faced enough balls to count.`,
  },
  best_economy: {
    kicker: "Best economy",
    statLabel: "economy",
    line: (name) => `${name} was the hardest to score off, among bowlers who sent down a real spell.`,
  },
};

const AWARD_ORDER: SeasonAwardKind[] = [
  "pots",
  "orange_cap",
  "purple_cap",
  "most_sixes",
  "highest_sr",
  "best_economy",
];

const ROAST_PICK = [
  "Most ducks",
  "Most golden ducks",
  "Most expensive",
  "Butterfingers 🧈",
];

function monthDay(ts: number) {
  return new Date(ts).toLocaleDateString([], { month: "short", day: "numeric" });
}

/**
 * One idea per card. Order is celebrate, then roast, then the book.
 * Empty feats drop out so a short season does not show hollow slides.
 */
export function buildSeasonCards(args: {
  seasonName: string;
  startedAt: number;
  endedAt: number;
  matchCount: number;
  awards: NamedAward[];
  records: RecordGroup[];
  sixes: number;
  wickets: number;
}): SeasonShareData[] {
  const cards: SeasonShareData[] = [];
  const range = `${monthDay(args.startedAt)} – ${monthDay(args.endedAt)}`;

  cards.push({
    kind: "season",
    seasonName: args.seasonName,
    kicker: "Season closed",
    headline: args.seasonName,
    stat: {
      value: String(args.matchCount),
      label: args.matchCount === 1 ? "match" : "matches",
    },
    line: `The book for this stretch of cricket, ${range}.`,
    tone: "gold",
  });

  const byKind = new Map(args.awards.map((a) => [a.kind, a]));
  for (const kind of AWARD_ORDER) {
    const a = byKind.get(kind);
    if (!a) continue;
    const copy = AWARD_CARD[kind];
    cards.push({
      kind: "season",
      seasonName: args.seasonName,
      kicker: copy.kicker,
      headline: a.displayName,
      stat: { value: a.display, label: copy.statLabel },
      line: copy.line(a.displayName),
      tone: "gold",
    });
  }

  const roastItems: FeatRecord[] = [];
  for (const g of args.records) {
    if (g.tone !== "roast") continue;
    for (const item of g.items) {
      if (ROAST_PICK.includes(item.label)) roastItems.push(item);
    }
  }
  for (const item of roastItems.slice(0, 3)) {
    cards.push({
      kind: "season",
      seasonName: args.seasonName,
      kicker: "The roast",
      headline: item.holder,
      stat: { value: item.value, label: item.label.replace(" 🧈", "") },
      line: `${item.holder} takes this one. The numbers are on the card.`,
      tone: "roast",
    });
  }

  if (args.matchCount > 0) {
    const bits = [`${args.matchCount} match${args.matchCount === 1 ? "" : "es"}`];
    if (args.wickets > 0) bits.push(`${args.wickets} wickets`);
    if (args.sixes > 0) bits.push(`${args.sixes} sixes`);
    cards.push({
      kind: "season",
      seasonName: args.seasonName,
      kicker: "The book",
      headline: "What we played",
      line: `${bits.join(". ")}. Same ball log. Same community.`,
      tone: "ink",
    });
  }

  return cards;
}
