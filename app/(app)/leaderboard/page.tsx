"use client";

import { RankedList, type RankRow } from "@/components/leaderboard/RankedList";
import {
  RECORD_MIN_BALLS,
  RECORD_MIN_INNINGS,
} from "@/components/leaderboard/records";
import { useAuth } from "@/components/providers/AuthProvider";
import { AppHeader } from "@/components/shell/AppHeader";
import type { LeaderboardShareData } from "@/components/share/ShareCard";
import { ShareButton } from "@/components/share/ShareButton";
import { EmptyState } from "@/components/ui/EmptyState";
import { api } from "@/convex/_generated/api";
import { PLAYER_TAG_COPY, type PlayerTag } from "@/lib/playerLabel";
import { cn } from "@/lib/utils";
import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useMemo, useState } from "react";

type Board = NonNullable<FunctionReturnType<typeof api.stats.leaderboard>>;
type BatRow = Board["batting"][number];
type BowlRow = Board["bowling"][number];

/** "260 runs · 6 wkts · 4 catches" — plural handled, zero parts omitted. */
function allRoundMeta(r: Board["allRound"][number]): string {
  const parts: string[] = [];
  if (r.runs > 0) parts.push(`${r.runs} run${r.runs === 1 ? "" : "s"}`);
  if (r.wickets > 0) parts.push(`${r.wickets} wkt${r.wickets === 1 ? "" : "s"}`);
  if (r.catches > 0)
    parts.push(`${r.catches} catch${r.catches === 1 ? "" : "es"}`);
  return parts.join(" · ");
}

const inns = (n: number) => `${n} inn${n === 1 ? "" : "s"}`;

/**
 * Two-level navigation: the tab picks a *discipline*, the chip picks *how it's
 * ranked*. Before this, "4s & 6s" sat as a fourth tab — but it is a measure of
 * batting, not a discipline of its own, and that mismatch is what filled the
 * tab bar at four on a phone. Folding it into Batting's chips restores one
 * consistent model and leaves room for nine boards without a scrolling rail.
 */
const TABS = ["batting", "bowling", "players"] as const;
type Tab = (typeof TABS)[number];
const TAB_LABEL: Record<Tab, string> = {
  batting: "Batting",
  bowling: "Bowling",
  players: "Players",
};

type MeasureKey =
  | "runs"
  | "batAvg"
  | "batSr"
  | "boundaries"
  | "wickets"
  | "bowlAvg"
  | "econ"
  | "points"
  | "matches"
  | "winPct"
  | "contribution";

type Measure = {
  key: MeasureKey;
  tab: Tab;
  /** Chip label. Kept short — four must fit 375px without scrolling. */
  label: string;
  /** Averages and economy: smallest wins, so the bar has to invert. */
  lowerIsBetter?: boolean;
  /**
   * Only the three original boards carry weekly arrows. `prevRank` is computed
   * server-side against that board's own ordering, so drawing it on a
   * differently-sorted board would report a move nobody made — the same reason
   * 4s & 6s has never shown them.
   */
  movement?: boolean;
  cutLabel: string;
  shareTitle: string;
  rows: (d: Board) => RankRow[];
};

/**
 * Rate boards use the record-grade sample bar, not the leaderboard's loose one.
 * On a volume board a thin sample merely sorts to the bottom; on an average or
 * an economy it *wins* — which is the exact failure `records.ts` documents,
 * where a two-over spell once took best economy off a thirty-three-over season.
 */
const RATE_CUT = `Under ${RECORD_MIN_BALLS} balls or ${RECORD_MIN_INNINGS} innings`;
const batRated = (r: BatRow) =>
  r.balls >= RECORD_MIN_BALLS && r.innings >= RECORD_MIN_INNINGS;
const bowlRated = (r: BowlRow) =>
  r.legalBalls >= RECORD_MIN_BALLS && r.innings >= RECORD_MIN_INNINGS;

/** Qualified rows first, then the measure, so the cut line stays one block. */
function rank<T extends { qualified: boolean }>(
  rows: T[],
  by: (r: T) => number,
  lowerIsBetter = false,
) {
  return rows
    .slice()
    .sort(
      (a, b) =>
        Number(b.qualified) - Number(a.qualified) ||
        (lowerIsBetter ? by(a) - by(b) : by(b) - by(a)),
    );
}

const MEASURES: Measure[] = [
  {
    key: "runs",
    tab: "batting",
    label: "Runs",
    movement: true,
    cutLabel: "Too few balls faced to rank",
    shareTitle: "Run leaders",
    rows: (d) =>
      d.batting.map((r) => ({
        userId: r.userId,
        displayName: r.displayName,
        value: r.runs,
        meta: `${inns(r.innings)} · SR ${r.strikeRate.toFixed(0)} · best ${r.bestScore}`,
        qualified: r.qualified,
        prevRank: r.prevRank,
      })),
  },
  {
    key: "batAvg",
    tab: "batting",
    label: "Avg",
    cutLabel: RATE_CUT,
    shareTitle: "Best batting averages",
    rows: (d) => {
      const rows = d.batting.map((r) => {
        const dismissals = Math.max(0, r.innings - r.notOuts);
        // A player never dismissed has no average — the stored value falls back
        // to their run total, which would put them top of this board on a
        // technicality. They stay below the cut and print "—".
        const ranked = batRated(r) && dismissals > 0;
        return {
          userId: r.userId,
          displayName: r.displayName,
          value: ranked ? r.average : 0,
          display: ranked ? r.average.toFixed(1) : "—",
          meta: `${r.runs} runs · ${inns(r.innings)} · ${r.notOuts} not out`,
          qualified: ranked,
        };
      });
      return rank(rows, (r) => r.value);
    },
  },
  {
    key: "batSr",
    tab: "batting",
    label: "SR",
    cutLabel: RATE_CUT,
    shareTitle: "Best strike rates",
    rows: (d) =>
      rank(
        d.batting.map((r) => ({
          userId: r.userId,
          displayName: r.displayName,
          value: r.strikeRate,
          display: r.strikeRate.toFixed(0),
          meta: `${r.runs} runs off ${r.balls} balls · ${inns(r.innings)}`,
          qualified: batRated(r),
        })),
        (r) => r.value,
      ),
  },
  {
    key: "boundaries",
    tab: "batting",
    label: "4s & 6s",
    cutLabel: "Too few balls faced to rank",
    shareTitle: "Boundary leaders",
    rows: (d) =>
      d.batting
        .slice()
        .sort(
          (a, b) =>
            Number(b.qualified) - Number(a.qualified) ||
            b.fours + b.sixes - (a.fours + a.sixes) ||
            b.sixes - a.sixes ||
            b.runs - a.runs,
        )
        .map((r) => ({
          userId: r.userId,
          displayName: r.displayName,
          value: r.fours + r.sixes,
          meta: `${r.fours}×4 · ${r.sixes}×6 · ${inns(r.innings)}`,
          qualified: r.qualified,
        })),
  },
  {
    key: "wickets",
    tab: "bowling",
    label: "Wickets",
    movement: true,
    cutLabel: "Too few overs bowled to rank",
    shareTitle: "Wicket leaders",
    rows: (d) =>
      d.bowling.map((r) => ({
        userId: r.userId,
        displayName: r.displayName,
        value: r.wickets,
        meta: `${inns(r.innings)} · ${r.oversText} ov · econ ${r.economy.toFixed(1)}`,
        qualified: r.qualified,
        prevRank: r.prevRank,
      })),
  },
  {
    key: "bowlAvg",
    tab: "bowling",
    label: "Avg",
    lowerIsBetter: true,
    cutLabel: RATE_CUT,
    shareTitle: "Best bowling averages",
    rows: (d) => {
      const rows = d.bowling.map((r) => {
        // Runs per wicket is undefined without a wicket, and unlike batting
        // there is no sensible fallback — wicketless bowlers sit below the cut.
        const ranked = bowlRated(r) && r.wickets > 0;
        const avg = r.wickets > 0 ? r.runs / r.wickets : 0;
        return {
          userId: r.userId,
          displayName: r.displayName,
          value: ranked ? avg : 0,
          display: ranked ? avg.toFixed(1) : "—",
          meta: `${r.wickets} wkts · ${r.runs} conceded · ${inns(r.innings)}`,
          qualified: ranked,
        };
      });
      return rank(rows, (r) => r.value, true);
    },
  },
  {
    key: "econ",
    tab: "bowling",
    label: "Econ",
    lowerIsBetter: true,
    cutLabel: RATE_CUT,
    shareTitle: "Best economy",
    rows: (d) =>
      rank(
        d.bowling.map((r) => ({
          userId: r.userId,
          displayName: r.displayName,
          value: r.economy,
          display: r.economy.toFixed(2),
          meta: `${r.oversText} ov · ${r.runs} conceded · ${inns(r.innings)}`,
          qualified: bowlRated(r),
        })),
        (r) => r.value,
        true,
      ),
  },
  {
    key: "points",
    tab: "players",
    label: "All-round",
    movement: true,
    // Every all-rounder row is "qualified" — there is no minimum-sample bar for
    // the combined board, so no rows fall below a cut line.
    cutLabel: "",
    shareTitle: "Top all-rounders",
    rows: (d) =>
      d.allRound.map((r) => ({
        userId: r.userId,
        displayName: r.displayName,
        value: r.points,
        meta: allRoundMeta(r),
        qualified: true,
        prevRank: r.prevRank,
      })),
  },
  {
    key: "matches",
    tab: "players",
    label: "Played",
    cutLabel: "",
    shareTitle: "Most regular",
    rows: (d) =>
      d.turnout.map((r) => ({
        userId: r.userId,
        displayName: r.displayName,
        value: r.matches,
        meta:
          d.matchCount > 0 ? `${r.matches} of ${d.matchCount}` : "",
        qualified: true,
      })),
  },
  {
    key: "winPct",
    tab: "players",
    label: "Win%",
    cutLabel: "Under 3 matches with a result",
    shareTitle: "Win rate",
    rows: (d) =>
      rank(
        d.records.map((r) => ({
          userId: r.userId,
          displayName: r.displayName,
          value: r.qualifiedWin ? r.winPct : 0,
          display: r.qualifiedWin ? `${Math.round(r.winPct)}%` : "—",
          meta: `${r.wins} won · ${r.decided} with a result`,
          qualified: r.qualifiedWin,
        })),
        (r) => r.value,
      ),
  },
  {
    key: "contribution",
    tab: "players",
    label: "Contrib",
    cutLabel: "Under 3 matches with a result",
    shareTitle: "Contribution",
    rows: (d) =>
      rank(
        d.records.map((r) => ({
          userId: r.userId,
          displayName: r.displayName,
          value: r.qualifiedContrib ? r.contributionPct : 0,
          display: r.qualifiedContrib
            ? `${Math.round(r.contributionPct)}%`
            : "—",
          meta: "Share of the team's work",
          qualified: r.qualifiedContrib,
        })),
        (r) => r.value,
      ),
  },
];

const DEFAULT_MEASURE: Record<Tab, MeasureKey> = {
  batting: "runs",
  bowling: "wickets",
  players: "points",
};

export default function LeaderboardPage() {
  const { token, activeOrgId, user, activeOrg } = useAuth();
  const [tab, setTab] = useState<Tab>("batting");
  const [measureKey, setMeasureKey] = useState<MeasureKey>("runs");
  // Default: visitors and juniors off the board. Anyone can flip Everyone.
  const [includeExtras, setIncludeExtras] = useState(false);
  const data = useQuery(
    api.stats.leaderboard,
    token && activeOrgId
      ? {
          token,
          orgId: activeOrgId,
          includeVisitorsAndJuniors: includeExtras,
        }
      : "skip",
  );

  const chips = useMemo(() => MEASURES.filter((m) => m.tab === tab), [tab]);
  const measure =
    MEASURES.find((m) => m.key === measureKey && m.tab === tab) ?? chips[0];

  const selectTab = (t: Tab) => {
    setTab(t);
    setMeasureKey(DEFAULT_MEASURE[t]);
  };

  const rows = useMemo(() => {
    const raw = data ? measure.rows(data) : ([] as RankRow[]);
    if (!data || !includeExtras) return raw;
    const byId = new Map<string, PlayerTag[]>();
    for (const r of [
      ...data.batting,
      ...data.bowling,
      ...data.allRound,
      ...data.turnout,
      ...data.drops,
      ...data.records,
    ]) {
      byId.set(String(r.userId), r.playerTags);
    }
    return raw.map((r) => {
      const tags = byId.get(String(r.userId)) ?? [];
      return {
        ...r,
        tags:
          tags.length === 0 ? undefined : tags.map((t) => PLAYER_TAG_COPY[t]),
      };
    });
  }, [data, measure, includeExtras]);

  const hasData = data && data.matchCount > 0 && rows.length > 0;
  const showMovement =
    !!measure.movement && !!data && data.weekly.baselineMatches > 0;

  const shareData: LeaderboardShareData | null = useMemo(() => {
    if (!data) return null;
    const subtitle = `${activeOrg?.orgName ?? "Gully"} · ${data.matchCount} match${
      data.matchCount === 1 ? "" : "es"
    }`;
    return {
      kind: "leaderboard" as const,
      title: measure.shareTitle,
      subtitle,
      rows: rows
        .filter((r) => r.qualified)
        .slice(0, 5)
        .map((r, i) => ({
          rank: i + 1,
          name: r.displayName,
          value: r.display ?? String(r.value),
        })),
    };
  }, [data, rows, measure, activeOrg]);

  return (
    <div>
      <AppHeader title="Leaders" />
      <main className="mx-auto max-w-md px-4 py-4">
        <div className="flex rounded-2xl border border-line bg-surface p-1">
          {TABS.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => selectTab(t)}
              aria-current={tab === t}
              className={cn(
                "min-h-10 flex-1 rounded-xl text-[14px] font-semibold transition",
                tab === t ? "bg-ink text-bg" : "text-muted active:bg-line/60",
              )}
            >
              {TAB_LABEL[t]}
            </button>
          ))}
        </div>

        {/* Level two, deliberately lighter than the filled pill above it: two
            identical segmented controls stacked would leave the reader working
            out which one is which. Text plus a gold underline reads as "sort",
            not as a second set of tabs. */}
        <div
          role="tablist"
          aria-label="Rank by"
          className="mt-2 flex items-stretch gap-1"
        >
          {chips.map((m) => {
            const on = m.key === measure.key;
            return (
              <button
                key={m.key}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => setMeasureKey(m.key)}
                className={cn(
                  "min-h-9 flex-1 rounded-lg border-b-2 px-1 text-[12.5px] font-semibold leading-tight transition",
                  on
                    ? "border-accent text-ink"
                    : "border-transparent text-faint active:bg-line/50",
                )}
              >
                {m.label}
              </button>
            );
          })}
        </div>

        <div className="mt-2.5 flex items-center justify-between gap-2">
          <div
            className="flex min-w-0 flex-1 rounded-xl border border-line bg-surface p-0.5"
            role="group"
            aria-label="Who appears on the board"
          >
            <button
              type="button"
              aria-pressed={!includeExtras}
              onClick={() => setIncludeExtras(false)}
              className={cn(
                "min-h-8 flex-1 rounded-[10px] px-2 text-[12px] font-semibold transition",
                !includeExtras
                  ? "bg-ink text-bg"
                  : "text-muted active:bg-line/60",
              )}
            >
              Regulars
            </button>
            <button
              type="button"
              aria-pressed={includeExtras}
              onClick={() => setIncludeExtras(true)}
              className={cn(
                "min-h-8 flex-1 rounded-[10px] px-2 text-[12px] font-semibold transition",
                includeExtras
                  ? "bg-ink text-bg"
                  : "text-muted active:bg-line/60",
              )}
            >
              Everyone
            </button>
          </div>
        </div>

        <div className="mt-2 flex items-center justify-between gap-2 px-1">
          <p className="min-w-0 flex-1 text-[11px] text-faint">
            {data === undefined
              ? "Loading…"
              : !data
                ? "All-time"
                : `All-time · ${data.matchCount} completed ${
                    data.matchCount === 1 ? "match" : "matches"
                  }${
                    !includeExtras && data.excludedCount > 0
                      ? " · visitors & juniors hidden"
                      : ""
                  }${showMovement ? " · arrows show this week's movement" : ""}`}
          </p>
          {hasData && shareData ? (
            <ShareButton
              data={shareData}
              filename={`gully-leaders-${measure.key}.png`}
              tone="light"
              className="-mr-1"
            />
          ) : null}
        </div>

        {data === undefined ? (
          <div className="mt-3 space-y-2">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-12 animate-pulse rounded-2xl bg-line" />
            ))}
          </div>
        ) : !hasData ? (
          <div className="mt-3">
            <EmptyState
              title="No completed matches yet"
              body="Leaderboards build up as matches finish."
            />
          </div>
        ) : (
          <div className="mt-3">
            <RankedList
              rows={rows}
              youId={user?._id}
              showMovement={showMovement}
              lowerIsBetter={measure.lowerIsBetter}
              cutLabel={measure.cutLabel}
            />
          </div>
        )}
      </main>
    </div>
  );
}
