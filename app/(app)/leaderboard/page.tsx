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
import type { Id } from "@/convex/_generated/dataModel";
import { PLAYER_TAG_COPY, type PlayerTag } from "@/lib/playerLabel";
import { cn } from "@/lib/utils";
import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { Check, ChevronDown } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

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
  players: "All-round",
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

type FormatScope = "all" | "test" | "limited";

function WordToggle<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
}: {
  value: T;
  options: { id: T; label: string }[];
  onChange: (next: T) => void;
  ariaLabel: string;
}) {
  return (
    <div className="flex shrink-0" role="group" aria-label={ariaLabel}>
      {options.map((o) => {
        const on = value === o.id;
        return (
          <button
            key={o.id}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(o.id)}
            className={cn(
              "min-h-11 whitespace-nowrap px-1 text-[13px] font-semibold active:opacity-70",
              on ? "text-ink" : "text-muted",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

type Season = NonNullable<FunctionReturnType<typeof api.seasons.list>>[number];

/**
 * What the reader picked. A season id means that season, live or finished.
 * The page holds `Scope | null`, where `null` is "not picked yet" and resolves
 * to the live season if one is running, else All time.
 */
type Scope = "all" | { seasonId: Id<"seasons"> };

const SCOPE_ROW =
  "flex min-h-11 w-full items-center justify-between gap-2 px-4 text-left text-[15px] text-ink active:bg-bg";

/**
 * Seasons newest first, All time last under a hairline. Before this it was a
 * two-row menu — this season or all time — so the day Season-02 started,
 * Season-01's board had no route back. Same control, more rows: a community
 * on its first season sees exactly what it saw before.
 */
function ScopeMenu({
  seasons,
  selected,
  onSelect,
}: {
  seasons: Season[];
  /** null = All time. */
  selected: Season | null;
  onSelect: (next: Scope) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="-mx-1 flex h-11 items-center gap-1 rounded-lg px-1 text-[13px] font-semibold text-muted active:bg-bg"
      >
        <span className="whitespace-nowrap">
          {selected ? selected.name : "All time"}
        </span>
        <ChevronDown className="h-4 w-4 shrink-0" />
      </button>
      {open ? (
        <div
          role="listbox"
          // Capped and scrollable: a long-running community must not get a
          // menu taller than the board it is covering.
          className="absolute left-0 z-20 mt-1 max-h-72 w-52 overflow-y-auto overscroll-contain rounded-xl border border-line bg-surface shadow-lift"
        >
          {seasons.map((s) => {
            const on = selected?._id === s._id;
            return (
              <button
                key={s._id}
                type="button"
                role="option"
                aria-selected={on}
                onClick={() => {
                  onSelect({ seasonId: s._id });
                  setOpen(false);
                }}
                className={cn(SCOPE_ROW, on && "font-semibold text-accent-deep")}
              >
                <span className="truncate" title={s.name}>
                  {s.name}
                </span>
                {on ? <Check className="h-4 w-4 shrink-0" /> : null}
              </button>
            );
          })}
          <button
            type="button"
            role="option"
            aria-selected={selected === null}
            onClick={() => {
              onSelect("all");
              setOpen(false);
            }}
            className={cn(
              SCOPE_ROW,
              seasons.length > 0 && "border-t border-line",
              selected === null && "font-semibold text-accent-deep",
            )}
          >
            All time
            {selected === null ? <Check className="h-4 w-4 shrink-0" /> : null}
          </button>
        </div>
      ) : null}
    </div>
  );
}

/** Empty board reads differently for a season that is over than one under way. */
function emptyCopy(format: FormatScope, season: Season | null) {
  const noun =
    format === "test" ? "Tests" : format === "limited" ? "ODIs" : null;
  const play =
    format === "test"
      ? "Play a Test. The board starts at zero."
      : format === "limited"
        ? "Play an ODI. The board starts at zero."
        : "Play a match. The board starts at zero.";
  if (!season)
    return {
      title: noun ? `No ${noun} yet` : "No completed matches yet",
      body: noun ? play : "Leaderboards build up as matches finish.",
    };
  if (season.status === "complete")
    return {
      title: `No ${noun ?? "games"} in ${season.name}`,
      body: "That season is done. Nothing landed on this board.",
    };
  return {
    title: `No ${noun ?? "games"} in this season yet`,
    body: play,
  };
}

export default function LeaderboardPage() {
  const { token, activeOrgId, user, activeOrg } = useAuth();
  const cap = useSearchParams().get("cap");
  const [tab, setTab] = useState<Tab>(
    cap === "purple" ? "bowling" : "batting",
  );
  const [measureKey, setMeasureKey] = useState<MeasureKey>(
    cap === "purple" ? "wickets" : "runs",
  );
  // Default: visitors and juniors off the board. Anyone can flip Everyone.
  const [includeExtras, setIncludeExtras] = useState(false);
  // Mixed board is how the community already argues. Tests / ODI is the slice.
  const [format, setFormat] = useState<FormatScope>("all");
  // null = not chosen yet, which resolves to the live season when one is
  // running and All time otherwise. A cap link from Home means the *current*
  // season, and that is exactly what the unchosen default gives it.
  const [scope, setScope] = useState<Scope | null>(null);
  // One round trip: `current` is the active row inside this list, so the two
  // can never land on different ticks.
  const seasons = useQuery(
    api.seasons.list,
    token && activeOrgId ? { token, orgId: activeOrgId } : "skip",
  );
  const currentSeason = useMemo(
    () => seasons?.find((s) => s.status === "active") ?? null,
    [seasons],
  );
  // A stale id (season deleted, org switched) falls back to the live season
  // rather than querying a board that is not this org's.
  const selectedSeason = useMemo(() => {
    if (!seasons) return null;
    if (scope === null) return currentSeason;
    if (scope === "all") return null;
    return seasons.find((s) => s._id === scope.seasonId) ?? currentSeason;
  }, [seasons, scope, currentSeason]);
  const usingSeason = selectedSeason !== null;
  const data = useQuery(
    api.stats.leaderboard,
    token && activeOrgId && seasons !== undefined
      ? {
          token,
          orgId: activeOrgId,
          includeVisitorsAndJuniors: includeExtras,
          ...(selectedSeason ? { seasonId: selectedSeason._id } : {}),
          ...(format === "all" ? {} : { format }),
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
  // Arrows read a 7-day lookback. Inside a season that window is clipped to
  // the season, and on a finished one it is frozen at `endedAt` — so the move
  // it would report is not the one anyone watched. All time only.
  const showMovement =
    !usingSeason &&
    !!measure.movement &&
    !!data &&
    data.weekly.baselineMatches > 0;

  const shareData: LeaderboardShareData | null = useMemo(() => {
    if (!data) return null;
    const org = activeOrg?.orgName ?? "Gully";
    const count = `${data.matchCount} match${data.matchCount === 1 ? "" : "es"}`;
    const formatBit =
      format === "test"
        ? "Tests"
        : format === "limited"
          ? "ODI"
          : null;
    const subtitle =
      selectedSeason
        ? [org, selectedSeason.name, formatBit, count].filter(Boolean).join(" · ")
        : [org, formatBit, count].filter(Boolean).join(" · ");
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
  }, [data, rows, measure, activeOrg, selectedSeason, format]);

  const [scrolled, setScrolled] = useState(false);
  const [chipsOpen, setChipsOpen] = useState(false);
  useEffect(() => {
    function onScroll() {
      const next = window.scrollY > 24;
      setScrolled(next);
      if (!next) setChipsOpen(false);
    }
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  const compactChips = scrolled && !chipsOpen;

  const empty = emptyCopy(format, selectedSeason);

  const capLabel =
    format === "all" && usingSeason && measure.key === "runs"
      ? "Orange Cap"
      : format === "all" && usingSeason && measure.key === "wickets"
        ? "Purple Cap"
        : null;

  const disciplineTabs = (
    <div className="flex rounded-xl border border-line bg-surface p-1">
      {TABS.map((t) => (
        <button
          key={t}
          type="button"
          onClick={() => selectTab(t)}
          aria-current={tab === t}
          className={cn(
            "min-h-11 flex-1 rounded-lg text-[13px] font-semibold transition",
            tab === t ? "bg-ink text-bg" : "text-muted active:bg-line/60",
          )}
        >
          {TAB_LABEL[t]}
        </button>
      ))}
    </div>
  );

  return (
    <div>
      <AppHeader
        title="Leaders"
        subtitle={
          seasons && seasons.length > 0 ? (
            <ScopeMenu
              seasons={seasons}
              selected={selectedSeason}
              onSelect={setScope}
            />
          ) : undefined
        }
        trailing={
          hasData && shareData ? (
            <ShareButton
              data={shareData}
              filename={`gully-leaders-${measure.key}.png`}
              tone="light"
            />
          ) : null
        }
        below={disciplineTabs}
      />
      <main className="mx-auto max-w-md px-5 py-3">
        {/* Gold underline = sort, not a second tab set. */}
        {compactChips ? (
          <button
            type="button"
            aria-expanded={false}
            onClick={() => setChipsOpen(true)}
            className="flex min-h-11 w-full items-center justify-between rounded-lg border-b-2 border-accent px-1 text-[13px] font-semibold text-ink active:bg-bg"
          >
            {measure.label}
            <ChevronDown className="h-4 w-4 text-muted" />
          </button>
        ) : (
          <div role="tablist" aria-label="Rank by" className="flex items-stretch gap-1">
            {chips.map((m) => {
              const on = m.key === measure.key;
              return (
                <button
                  key={m.key}
                  type="button"
                  role="tab"
                  aria-selected={on}
                  onClick={() => {
                    setMeasureKey(m.key);
                    setChipsOpen(false);
                  }}
                  className={cn(
                    "min-h-11 flex-1 rounded-lg border-b-2 px-1 text-[13px] font-semibold leading-tight transition",
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
        )}

        {!scrolled ? (
          <div className="mt-1 flex items-center justify-center">
            <WordToggle
              ariaLabel="Test or ODI"
              value={format}
              onChange={setFormat}
              options={[
                { id: "test", label: "Tests" },
                { id: "limited", label: "ODI" },
                { id: "all", label: "All" },
              ]}
            />
            <span className="mx-1 h-4 w-px shrink-0 bg-line" aria-hidden />
            <WordToggle
              ariaLabel="Who appears on the board"
              value={includeExtras ? "everyone" : "regulars"}
              onChange={(next) => setIncludeExtras(next === "everyone")}
              options={[
                { id: "regulars", label: "Regulars" },
                { id: "everyone", label: "Everyone" },
              ]}
            />
          </div>
        ) : null}

        {data === undefined ? (
          <div className="mt-3 space-y-2">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-12 animate-pulse rounded-2xl bg-line" />
            ))}
          </div>
        ) : data === null ? (
          // Null is a membership we could not read, not a board with nothing
          // on it — "No completed matches yet" would be a false empty state.
          <div className="mt-3">
            <EmptyState
              title="Leaders unavailable"
              body="Sign in to this community to see its boards."
            />
          </div>
        ) : !hasData ? (
          <div className="mt-3">
            <EmptyState title={empty.title} body={empty.body} />
          </div>
        ) : (
          <div className="mt-3">
            <RankedList
              rows={rows}
              youId={user?._id}
              showMovement={showMovement}
              lowerIsBetter={measure.lowerIsBetter}
              cutLabel={measure.cutLabel}
              capLabel={capLabel}
            />
          </div>
        )}
      </main>
    </div>
  );
}
