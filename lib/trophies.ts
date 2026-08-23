import type { Profile } from "@/components/player/ProfileParts";

export type Trophy = {
  id: string;
  /** A lucide-react icon name (see components/player/ProfileParts.tsx TrophyShelf). */
  icon: string;
  label: string;
  value?: string;
  tier: "gold" | "silver";
};

/** Mirrors convex/seasons.ts award kinds — kept here so the client never imports the server module. */
export type SeasonAwardKind =
  | "pots"
  | "orange_cap"
  | "purple_cap"
  | "most_sixes"
  | "highest_sr"
  | "best_economy";

export type SeasonForTrophies = {
  _id: string;
  name: string;
  status?: string;
  awards?: Array<{
    kind: SeasonAwardKind;
    userId: string;
    value?: number;
    display?: string;
  }> | null;
};

const SEASON_AWARD_COPY: Record<
  SeasonAwardKind,
  { label: string; icon: "Crown" | "Award" }
> = {
  pots: { label: "Player of the season", icon: "Crown" },
  orange_cap: { label: "Orange Cap", icon: "Crown" },
  purple_cap: { label: "Purple Cap", icon: "Crown" },
  most_sixes: { label: "Most sixes", icon: "Award" },
  highest_sr: { label: "Highest strike rate", icon: "Award" },
  best_economy: { label: "Best economy", icon: "Award" },
};

/**
 * Gold chips for awards the player actually holds on a finished season.
 * Label keeps the season name ("Season 1 Orange Cap"). Does not replace
 * career trophies — concatenate on the shelf.
 */
export function computeSeasonTrophies(
  seasons: SeasonForTrophies[],
  userId: string,
): Trophy[] {
  const me = String(userId);
  const trophies: Trophy[] = [];
  for (const season of seasons) {
    if (season.status === "active") continue;
    for (const award of season.awards ?? []) {
      if (String(award.userId) !== me) continue;
      const copy = SEASON_AWARD_COPY[award.kind];
      if (!copy) continue;
      trophies.push({
        id: `season-${season._id}-${award.kind}`,
        icon: copy.icon,
        label: `${season.name} ${copy.label}`,
        tier: "gold",
      });
    }
  }
  return trophies;
}

/** "5/23" → 5. Best stays a display string end to end; this only reads the wicket count. */
function bestWickets(best: string | null): number {
  if (!best) return 0;
  const n = Number(best.split("/")[0]);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Curated, not comprehensive — every trophy here is something a player would
 * actually point at. Overlapping tiers of the same feat are deliberately
 * mutually exclusive (a century never also shows the half-century chip; a
 * five-for never also shows the three-for chip), so the shelf reads as a set
 * of distinct achievements rather than the same stat counted twice.
 */
export function computeTrophies(stats: Profile): Trophy[] {
  const trophies: Trophy[] = [];
  const bat = stats.batting;
  const bowl = stats.bowling;

  if (bat?.rank?.rank === 1) {
    trophies.push({
      id: "top-run-scorer",
      icon: "Crown",
      label: "Top run-scorer",
      tier: "gold",
    });
  }
  if (bowl?.rank?.rank === 1) {
    trophies.push({
      id: "top-wicket-taker",
      icon: "Crown",
      label: "Top wicket-taker",
      tier: "gold",
    });
  }

  if (bat) {
    if (bat.bestScore >= 100) {
      trophies.push({
        id: "century",
        icon: "Award",
        label: "Century",
        value: String(bat.bestScore),
        tier: "gold",
      });
    } else if (bat.bestScore >= 50) {
      trophies.push({
        id: "half-century",
        icon: "Award",
        label: "Half-century",
        value: String(bat.bestScore),
        tier: "silver",
      });
    }

    if (bat.fifties >= 2) {
      trophies.push({
        id: "fifties",
        icon: "BarChart3",
        label: "Fifties",
        value: `×${bat.fifties}`,
        tier: "silver",
      });
    }

    if (bat.sixes >= 10) {
      trophies.push({
        id: "six-machine",
        icon: "Zap",
        label: "Six machine",
        value: String(bat.sixes),
        tier: "silver",
      });
    }

    if (bat.strikeRate >= 150 && bat.balls >= 30) {
      trophies.push({
        id: "big-hitter",
        icon: "Flame",
        label: "Big hitter",
        tier: "silver",
      });
    }
  }

  if (bowl?.best) {
    const wkts = bestWickets(bowl.best);
    if (wkts >= 5) {
      trophies.push({
        id: "five-for",
        icon: "Target",
        label: "Five-for",
        value: bowl.best,
        tier: "gold",
      });
    } else if (wkts >= 3) {
      trophies.push({
        id: "three-for",
        icon: "Target",
        label: "Three-for",
        value: bowl.best,
        tier: "silver",
      });
    }
  }

  if (bowl && bowl.economy < 5 && bowl.legalBalls >= 36) {
    trophies.push({
      id: "miser",
      icon: "Lock",
      label: "Miser",
      tier: "silver",
    });
  }

  if (stats.matchesPlayed >= 20) {
    trophies.push({
      id: "veteran",
      icon: "Shield",
      label: "Veteran",
      value: String(stats.matchesPlayed),
      tier: "silver",
    });
  }

  return trophies.sort((a, b) => {
    if (a.tier !== b.tier) return a.tier === "gold" ? -1 : 1;
    return 0;
  });
}
