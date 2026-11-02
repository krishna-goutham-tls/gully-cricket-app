import type { HeroShareData, ShareStat } from "@/components/share/ShareCard";
import { dayLabel } from "@/lib/dates";

/** What both `hero.heroDay` and `hero.matchDay` return for one player's day. */
export type HeroDay = {
  displayName: string;
  dayStart: number;
  headline: string;
  insights: string[];
  numbers: {
    matches: number;
    runs: number;
    ballsFaced: number;
    strikeRate: number;
    fours: number;
    sixes: number;
    wickets: number;
    ballsBowled: number;
    economy: number | null;
    catches: number;
  };
  miniLines: Array<{
    opponent: string;
    battingFigure: string | null;
    bowlingFigure: string | null;
    result: "won" | "lost" | "none";
  }>;
};

export function initials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

/** The Hero poster for one player's day. Used by /hero and Home's match day card. */
export function heroShareData(hero: HeroDay): HeroShareData {
  const n = hero.numbers;
  const bowlLed = n.wickets >= 3 && n.wickets * 20 >= n.runs;
  const stats: ShareStat[] = [{ label: "Matches", value: String(n.matches) }];
  if (bowlLed && n.ballsBowled > 0) {
    stats.push({
      label: "Wickets",
      value: String(n.wickets),
      accent: true,
    });
    stats.push({
      label: "Economy",
      value: n.economy !== null ? n.economy.toFixed(1) : "—",
    });
    if (n.ballsFaced > 0) {
      stats.push({ label: "Runs", value: String(n.runs) });
    }
  } else {
    if (n.ballsFaced > 0) {
      stats.push({
        label: "Runs",
        value: String(n.runs),
        accent: true,
      });
      stats.push({ label: "SR", value: n.strikeRate.toFixed(1) });
    }
    if (n.ballsBowled > 0) {
      stats.push({
        label: "Wickets",
        value: String(n.wickets),
        accent: n.ballsFaced === 0,
      });
    }
  }
  if (n.fours > 0 || n.sixes > 0) {
    stats.push({ label: "4s / 6s", value: `${n.fours}/${n.sixes}` });
  }
  if (n.catches > 0) {
    stats.push({ label: "Catches", value: String(n.catches) });
  }
  return {
    kind: "hero",
    displayName: hero.displayName,
    initials: initials(hero.displayName),
    dayLabel: dayLabel(hero.dayStart),
    headline: hero.headline,
    matchCount: n.matches,
    insights: hero.insights,
    stats: stats.slice(0, 6),
    miniLines: hero.miniLines.map((m) => ({
      opponent: m.opponent,
      battingFigure: m.battingFigure,
      bowlingFigure: m.bowlingFigure,
      result: m.result,
    })),
  };
}

/** A file name for the poster: "gully-hero-ravi-kumar.png". */
export function heroFilename(displayName: string) {
  const slug = displayName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `gully-hero-${slug || "player"}.png`;
}
