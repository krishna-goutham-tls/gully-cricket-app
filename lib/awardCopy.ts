/**
 * Every word the app says about an award, in one place — the shelf and the
 * share card both read from here so a trophy is never called two things on
 * two screens.
 *
 * `unit` is what the number counts, so `${display} ${unit}` always reads as
 * English ("412 runs", "4 ducks"). `earn` is the one line that says how you
 * get it — the empty slot's whole content, and the share card's kicker line.
 *
 * The twelve shelf kinds have a photograph in `public/trophies`, named after
 * the kind with hyphens. The six legacy kinds — stamped on seasons that ended
 * before the shelf existed — have none, and never will: they render as a gold
 * medallion instead of a broken image.
 */
import type { StampedAwardKind } from "@/lib/trophies";

export type AwardCopy = {
  name: string;
  /** What the number counts. Plural — every one of these is a "most". */
  unit: string;
  /** How you earn it. Sentence case, no full stop. */
  earn: string;
  /** False for the six legacy kinds, which have no photograph. */
  hasImage: boolean;
};

const COPY: Record<StampedAwardKind, AwardCopy> = {
  // The shelf — twelve photographed trophies, nine honours then three roasts.
  run_machine: {
    name: "Run Machine",
    unit: "runs",
    earn: "Most runs",
    hasImage: true,
  },
  six_machine: {
    name: "Six Machine",
    unit: "sixes",
    earn: "Most sixes",
    hasImage: true,
  },
  boundary_king: {
    name: "Boundary King",
    unit: "runs in boundaries",
    earn: "Most runs in boundaries",
    hasImage: true,
  },
  the_anchor: {
    name: "The Anchor",
    unit: "balls faced",
    earn: "Most balls faced",
    hasImage: true,
  },
  nudger: {
    name: "Nudger",
    unit: "singles",
    earn: "Most singles",
    hasImage: true,
  },
  wicket_taker: {
    name: "Wicket Taker",
    unit: "wickets",
    earn: "Most wickets",
    hasImage: true,
  },
  workhorse: {
    name: "Workhorse",
    unit: "balls bowled",
    earn: "Most balls bowled",
    hasImage: true,
  },
  the_miser: {
    name: "The Miser",
    unit: "dots bowled",
    earn: "Most dot balls bowled",
    hasImage: true,
  },
  safe_hands: {
    name: "Safe Hands",
    unit: "catches",
    earn: "Most catches",
    hasImage: true,
  },
  dot_magnet: {
    name: "Dot Magnet",
    unit: "dots faced",
    earn: "Most dot balls faced",
    hasImage: true,
  },
  duck_collector: {
    name: "Duck Collector",
    unit: "ducks",
    earn: "Most ducks",
    hasImage: true,
  },
  butterfingers: {
    name: "Butterfingers",
    unit: "drops",
    earn: "Most drops",
    hasImage: true,
  },

  // Stamped on finished seasons before the shelf existed. Season pages only.
  pots: {
    name: "Player of the Season",
    unit: "points",
    earn: "Most points across the season",
    hasImage: false,
  },
  orange_cap: {
    name: "Orange Cap",
    unit: "runs",
    earn: "Most runs in the season",
    hasImage: false,
  },
  purple_cap: {
    name: "Purple Cap",
    unit: "wickets",
    earn: "Most wickets in the season",
    hasImage: false,
  },
  most_sixes: {
    name: "Most Sixes",
    unit: "sixes",
    earn: "Most sixes in the season",
    hasImage: false,
  },
  highest_sr: {
    name: "Highest Strike Rate",
    unit: "strike rate",
    earn: "Highest strike rate in the season",
    hasImage: false,
  },
  best_economy: {
    name: "Best Economy",
    unit: "economy",
    earn: "Best economy in the season",
    hasImage: false,
  },
};

/**
 * Never throws on an unknown kind. A season stamped by a newer build than the
 * one running must still render — as its raw id, which is ugly and honest,
 * rather than as a crash on a page somebody opened to look at their trophies.
 */
export function awardCopy(kind: string): AwardCopy {
  return (
    COPY[kind as StampedAwardKind] ?? {
      name: kind.replace(/_/g, " "),
      unit: "",
      earn: "",
      hasImage: false,
    }
  );
}

/** `public/trophies/six-machine.webp` — the filename IS the kind. */
export function trophyImage(kind: string): string {
  return `/trophies/${kind.replace(/_/g, "-")}.webp`;
}

/** "412 runs" — the number and what it counts, as one readable phrase. */
export function awardValueLine(kind: string, display: string): string {
  const { unit } = awardCopy(kind);
  return unit ? `${display} ${unit}` : display;
}
