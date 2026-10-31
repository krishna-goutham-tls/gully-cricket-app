"use client";

import {
  FormStrip,
  InningsLog,
  MatchupTable,
  Meter,
  ModeLine,
  NemesisCard,
  StatTile,
  FeatChips,
  MilestoneLadder,
  type LogRow,
  type Profile,
} from "@/components/player/ProfileParts";
import { CountStrip, InningsBars } from "@/components/player/Charts";
import { useAuth } from "@/components/providers/AuthProvider";
import { shortDate } from "@/lib/dates";
import type { PlayerShareData, ShareStat } from "@/components/share/ShareCard";
import { ShareButton } from "@/components/share/ShareButton";
import {
  SeasonScopeMenu,
  type Scope,
} from "@/components/shelf/SeasonScopeMenu";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { PlayerTagEditor, PlayerTagList } from "@/components/player/LabelTag";
import type { PlayerTag } from "@/lib/playerLabel";
import { computeSeasonTrophies, computeTrophies, type Trophy } from "@/lib/trophies";
import { cn, errorMessage } from "@/lib/utils";
import { useMutation, useQuery } from "convex/react";
import { ArrowLeft, ChevronDown, Sparkles } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useRef, useState } from "react";

const LOG_PREVIEW = 8;

function initials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

/**
 * Newest innings first. The log runs newest match first, but a Test's two
 * innings sit in playing order inside it — so reverse within the match.
 */
function battingForm(log: LogRow[]) {
  return log
    .flatMap((r) => [...r.bat].reverse())
    .filter((b) => b.balls > 0 || b.out)
    .slice(0, 5)
    .map((b) => ({ text: `${b.runs}${b.out ? "" : "*"}`, good: b.runs >= 30 }));
}

function bowlingForm(log: LogRow[]) {
  return log
    .flatMap((r) => [...r.bowl].reverse())
    .filter((s) => s.legalBalls > 0)
    .slice(0, 5)
    .map((s) => ({ text: `${s.wickets}/${s.runs}`, good: s.wickets >= 2 }));
}

/** "#3 of 14 by runs" — where they stand, on the Leaders tab's own ordering. */
function RankChip({
  rank,
  by,
}: {
  rank: { rank: number; of: number } | null;
  by: string;
}) {
  if (!rank) return null;
  return (
    <span
      className={cn(
        "tabular shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold",
        rank.rank === 1
          ? "bg-accent-soft text-accent-deep"
          : "bg-ink/[0.06] text-muted",
      )}
    >
      #{rank.rank} of {rank.of} by {by}
    </span>
  );
}

/**
 * A section is a label and its content, sitting on the page. Wrapping each
 * one in a bordered card gave four identical boxes and no hierarchy — the
 * page read as a form. The label is the spine; the content varies in form
 * (sentences, then numbers, then a list) so the eye can tell them apart.
 */
function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <p className="px-1 pb-2 text-[11px] font-semibold uppercase tracking-wide text-faint">
        {title}
      </p>
      {children}
    </section>
  );
}

/**
 * A full-width tap row that reveals heavy content on demand — the second
 * biggest scroll win on this page after the batting/bowling toggle. Styled
 * to match the app's other disclosure controls (MatchupTable's own
 * "Show all", InningsLog's "Show all matches"): a bordered surface pill,
 * never a bare text link, so it reads as tappable before it's read at all.
 */
function Expander({
  label,
  defaultOpen = false,
  bordered = true,
  children,
}: {
  label: string;
  defaultOpen?: boolean;
  /** Top hairline + spacing, for nesting under a card's own content
   * (StatTiles, Meters). Standalone sections turn it off — the space-y-6
   * page rhythm already separates them. */
  bordered?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={bordered ? "mt-4 border-t border-line pt-3.5" : undefined}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex min-h-11 w-full items-center justify-between rounded-xl border border-line bg-surface px-3.5 text-[13px] font-semibold text-ink active:bg-bg"
      >
        {label}
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-faint transition-transform",
            open && "rotate-180",
          )}
        />
      </button>
      {open ? <div className="mt-3">{children}</div> : null}
    </div>
  );
}

/**
 * Which discipline a profile opens on: the player's own stated role if it
 * clearly says bowler, otherwise batting; failing that, whichever discipline
 * they've actually played more of, so a specialist bowler with no role set
 * still opens on bowling.
 */
function defaultDiscipline(stats: Profile): Discipline {
  if (!stats.batting && !stats.bowling) return "field";
  if (!stats.batting) return "bowl";
  if (!stats.bowling) return "bat";
  const role = stats.primaryRole ?? stats.secondaryRole;
  if (role === "bowler") return "bowl";
  if (role === "batsman" || role === "keeper" || role === "all-rounder") {
    return "bat";
  }
  return stats.bowling.innings > stats.batting.innings ? "bowl" : "bat";
}

/**
 * The stat block a player would actually want to flex, picked from whichever
 * disciplines they have. Batting and bowling each contribute up to 2 headline
 * figures (3 if it's their only discipline) so the card never has empty
 * slots or a wall of six numbers. Exactly one number gets the gold accent —
 * runs if they bat, otherwise wickets.
 */
function buildShareStats(stats: Profile): ShareStat[] {
  const out: ShareStat[] = [];
  const bat = stats.batting;
  const bowl = stats.bowling;
  const soloDiscipline = Boolean(bat) !== Boolean(bowl);

  if (bat) {
    out.push({ label: "Runs", value: String(bat.runs), accent: true });
    out.push({ label: "Strike rate", value: bat.strikeRate.toFixed(0) });
    if (soloDiscipline) {
      out.push({ label: "Best", value: String(bat.bestScore) });
    }
  }
  if (bowl) {
    out.push({
      label: "Wickets",
      value: String(bowl.wickets),
      accent: !bat,
    });
    out.push({ label: "Economy", value: bowl.economy.toFixed(1) });
    if (soloDiscipline) {
      out.push({ label: "Best figures", value: bowl.best ?? "—" });
    }
  }
  return out;
}

function buildShareData(
  stats: Profile,
  topTrophy: Trophy | undefined,
  season: string | undefined,
): PlayerShareData {
  return {
    kind: "player",
    displayName: stats.displayName,
    initials: initials(stats.displayName),
    isGuest: stats.isGuest,
    role: stats.primaryRole ?? stats.secondaryRole ?? null,
    matchesPlayed: stats.matchesPlayed,
    stats: buildShareStats(stats),
    trophy: topTrophy ?? null,
    season,
  };
}

/** Below this many innings, "last 10" is most of the career and says nothing new. */
const FORM_MIN_INNINGS = 15;
const FORM_WINDOW = 10;

/**
 * Last 10 innings against the career, in words: the one line that says
 * whether a player is in form, without a chart or a legend.
 */
/** Bars beyond this many get too thin to tap on a phone. */
const CHART_INNINGS = 40;

function battingBars(log: LogRow[]) {
  return log
    .flatMap((r) =>
      [...r.bat].reverse().map((b) => ({ ...b, date: r.date })),
    )
    .filter((b) => b.balls > 0 || b.out)
    .slice(0, CHART_INNINGS)
    .reverse()
    .map((b) => ({
      value: b.runs,
      highlight: b.runs >= 30,
      label: `${shortDate(b.date)} · ${b.runs}${b.out ? "" : "*"} off ${b.balls}`,
    }));
}

function bowlingBars(log: LogRow[]) {
  return log
    .flatMap((r) =>
      [...r.bowl].reverse().map((s) => ({ ...s, date: r.date })),
    )
    .filter((s) => s.legalBalls > 0)
    .slice(0, CHART_INNINGS)
    .reverse()
    .map((s) => ({
      value: s.wickets,
      highlight: s.wickets >= 3,
      label: `${shortDate(s.date)} · ${s.wickets}/${s.runs} in ${s.oversText} overs`,
    }));
}

function BattingForm({
  b,
  log,
}: {
  b: NonNullable<Profile["batting"]>;
  log: LogRow[];
}) {
  if (b.innings < FORM_MIN_INNINGS) return null;
  const recent = log
    .flatMap((r) => [...r.bat].reverse())
    .filter((x) => x.balls > 0 || x.out)
    .slice(0, FORM_WINDOW);
  const runs = recent.reduce((t, x) => t + x.runs, 0);
  const balls = recent.reduce((t, x) => t + x.balls, 0);
  const outs = recent.filter((x) => x.out).length;
  const avg = outs > 0 ? runs / outs : runs;
  const sr = balls > 0 ? (runs / balls) * 100 : 0;
  return (
    <p className="mt-2 text-[13px] leading-snug text-muted">
      Last {FORM_WINDOW} innings: average{" "}
      <span className="font-semibold text-ink">{avg.toFixed(0)}</span> (career{" "}
      {b.average.toFixed(0)}), strike rate{" "}
      <span className="font-semibold text-ink">{sr.toFixed(0)}</span> (career{" "}
      {b.strikeRate.toFixed(0)}).
    </p>
  );
}

function BowlingForm({
  b,
  log,
}: {
  b: NonNullable<Profile["bowling"]>;
  log: LogRow[];
}) {
  if (b.innings < FORM_MIN_INNINGS) return null;
  const recent = log
    .flatMap((r) => [...r.bowl].reverse())
    .filter((x) => x.legalBalls > 0)
    .slice(0, FORM_WINDOW);
  const runs = recent.reduce((t, x) => t + x.runs, 0);
  const balls = recent.reduce((t, x) => t + x.legalBalls, 0);
  const wickets = recent.reduce((t, x) => t + x.wickets, 0);
  const econ = balls > 0 ? runs / (balls / 6) : 0;
  return (
    <p className="mt-2 text-[13px] leading-snug text-muted">
      Last {FORM_WINDOW} spells:{" "}
      <span className="font-semibold text-ink">{wickets}</span> wicket
      {wickets === 1 ? "" : "s"}, economy{" "}
      <span className="font-semibold text-ink">{econ.toFixed(1)}</span> (career{" "}
      {b.economy.toFixed(1)}).
    </p>
  );
}

function BattingCard({
  b,
  log,
  vs,
}: {
  b: NonNullable<Profile["batting"]>;
  log: LogRow[];
  vs: Profile["vsBowlers"];
}) {
  const boundaryPct = b.runs > 0 ? (b.boundaryRuns / b.runs) * 100 : 0;
  const dotPct = b.balls > 0 ? (b.dots / b.balls) * 100 : 0;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        {/* Runs and the innings they came from, together — every rate below
            (average, strike rate) is built from this innings count, not the
            career innings in the header, which also counts bowling. */}
        <p className="text-[28px] font-semibold leading-none text-ink">
          {b.runs}
          <span className="ml-1.5 text-[13px] font-normal text-faint">
            runs · {b.innings} batting inn{b.innings === 1 ? "" : "s"}
          </span>
        </p>
        <RankChip rank={b.rank} by="runs" />
      </div>

      <FormStrip entries={battingForm(log)} />
      <BattingForm b={b} log={log} />

      <div className="mt-3 grid grid-cols-3 gap-y-3">
        <StatTile
          label="Average"
          value={b.average.toFixed(1)}
          hint={`${b.notOuts} not out`}
        />
        <StatTile
          label="Strike rate"
          value={b.strikeRate.toFixed(0)}
          hint={`${b.balls} balls`}
        />
        {/* Innings moved up beside the runs, so the hint here is free to say
            what the best score actually is. */}
        <StatTile label="Best" value={String(b.bestScore)} hint="highest" />
        <StatTile label="Fours" value={String(b.fours)} />
        <StatTile label="Sixes" value={String(b.sixes)} />
        <StatTile label="Not outs" value={String(b.notOuts)} />
      </div>

      <div className="mt-4">
        <CountStrip
          items={[
            { label: "30s", value: b.thirties, hint: "30-49" },
            { label: "50s", value: b.fifties, hint: "50-69" },
            { label: "70s", value: b.seventies, hint: "70-99" },
            { label: "100s", value: b.hundreds, hint: "100+" },
          ]}
        />
      </div>

      <div className="mt-4 border-t border-line pt-3">
        <InningsBars
          bars={battingBars(log)}
          reference={
            b.innings >= 3
              ? { value: b.average, label: `avg ${b.average.toFixed(0)}` }
              : undefined
          }
          hint="Every innings. Gold is 30 or more. Tap a bar."
        />
      </div>

      {/* The character read: where the runs come from, and how often a ball
          goes by without one. */}
      <div className="mt-3.5 space-y-3 border-t border-line pt-3">
        <Meter
          label="Runs in boundaries"
          pct={boundaryPct}
          caption={`${b.boundaryRuns} of ${b.runs} runs in fours and sixes`}
        />
        <Meter
          label="Dot balls"
          pct={dotPct}
          caption={`${b.dots} of ${b.balls} balls faced went for nothing`}
        />
        <ModeLine title="Out" modes={b.dismissalTypes} />
      </div>

      {vs.length > 0 ? (
        <Expander label="Against each bowler ›">
          <MatchupTable title="Against each bowler" rows={vs} kind="bat" bare />
        </Expander>
      ) : null}
    </div>
  );
}

function BowlingCard({
  b,
  log,
  vs,
}: {
  b: NonNullable<Profile["bowling"]>;
  log: LogRow[];
  vs: Profile["vsBatters"];
}) {
  const dotPct = b.countedBalls > 0 ? (b.dots / b.countedBalls) * 100 : 0;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        {/* Bowling innings, not the header's career figure — economy, average
            and balls/wkt below are all read against these. */}
        <p className="text-[28px] font-semibold leading-none text-ink">
          {b.wickets}
          <span className="ml-1.5 text-[13px] font-normal text-faint">
            wicket{b.wickets === 1 ? "" : "s"} · {b.innings} bowling inn
            {b.innings === 1 ? "" : "s"}
          </span>
        </p>
        <RankChip rank={b.rank} by="wickets" />
      </div>

      <FormStrip entries={bowlingForm(log)} />
      <BowlingForm b={b} log={log} />

      <div className="mt-3 grid grid-cols-3 gap-y-3">
        <StatTile label="Economy" value={b.economy.toFixed(1)} />
        <StatTile
          label="Average"
          value={b.average === null ? "—" : b.average.toFixed(1)}
          hint="runs per wkt"
        />
        <StatTile
          label="Balls/wkt"
          value={b.strikeRate === null ? "—" : b.strikeRate.toFixed(1)}
          hint="strike rate"
        />
        <StatTile label="Best" value={b.best ?? "—"} />
        {/* "Spells" was this same innings count under another name; it now sits
            beside the wickets, so showing it twice would only re-open the
            question of which innings number is which. */}
        <StatTile label="Overs" value={b.oversText} />
        <StatTile label="Conceded" value={String(b.runs)} hint="runs" />
      </div>

      <div className="mt-4">
        <CountStrip
          items={[
            { label: "3-fors", value: b.threeFors, hint: "3-4 wickets" },
            { label: "5-fors", value: b.fiveFors, hint: "5+ wickets" },
          ]}
        />
      </div>

      <div className="mt-4 border-t border-line pt-3">
        <InningsBars
          bars={bowlingBars(log)}
          hint="Wickets in every spell. Gold is 3 or more. Tap a bar."
        />
      </div>

      <div className="mt-3.5 space-y-3 border-t border-line pt-3">
        <Meter
          label="Dot balls"
          pct={dotPct}
          caption={`${b.dots} of ${b.countedBalls} deliveries cost nothing`}
        />
        <ModeLine title="Wickets" modes={b.wicketTypes} />
      </div>

      {vs.length > 0 ? (
        <Expander label="Against each batter ›">
          <MatchupTable title="Against each batter" rows={vs} kind="bowl" bare />
        </Expander>
      ) : null}
    </div>
  );
}

function FieldingCard({ f }: { f: Profile["fielding"] }) {
  const chances = f.realCatches + f.drops;
  const heldPct = chances > 0 ? (f.realCatches / chances) * 100 : 0;
  return (
    <div>
      <p className="text-[28px] font-semibold leading-none text-ink">
        {f.catches}
        <span className="ml-1.5 text-[13px] font-normal text-faint">
          catch{f.catches === 1 ? "" : "es"}
        </span>
      </p>
      <div className="mt-3 grid grid-cols-3 gap-y-3">
        <StatTile label="Catches" value={String(f.catches)} />
        <StatTile label="Run-outs" value={String(f.runOuts)} />
        <StatTile label="Drops" value={String(f.drops)} />
      </div>
      {chances > 0 ? (
        <div className="mt-3.5 border-t border-line pt-3">
          <Meter
            label="Catches held"
            pct={heldPct}
            caption={`${f.realCatches} of ${chances} chances taken`}
          />
        </div>
      ) : null}
    </div>
  );
}

type Discipline = "bat" | "bowl" | "field";
const DISCIPLINE_LABEL: Record<Discipline, string> = {
  bat: "Batting",
  bowl: "Bowling",
  field: "Fielding",
};

type FormatPick = "all" | "test" | "limited";
const FORMAT_LABEL: Record<FormatPick, string> = {
  all: "All",
  test: "Test",
  limited: "Limited",
};

export default function PlayerDetailPage() {
  const params = useParams();
  const router = useRouter();
  const userId = params.id as Id<"users">;
  const { token, activeOrgId, isAdmin } = useAuth();
  const togglePlayerTag = useMutation(api.players.togglePlayerTag);
  const [showAll, setShowAll] = useState(false);
  const [labelBusy, setLabelBusy] = useState(false);
  const [labelError, setLabelError] = useState<string | null>(null);
  // Null until the viewer taps the toggle — lets the default follow the
  // player's role/innings split once `stats` loads, without a hook that has
  // to run conditionally.
  const [discipline, setDiscipline] = useState<Discipline | null>(null);
  // A profile opens on the whole career; a season is one tap away.
  const [scope, setScope] = useState<Scope>("all");
  const [format, setFormat] = useState<FormatPick>("all");
  const seasons = useQuery(
    api.seasons.list,
    token && activeOrgId ? { token, orgId: activeOrgId } : "skip",
  );
  const selectedSeason =
    scope === "all"
      ? null
      : (seasons?.find((s) => s._id === scope.seasonId) ?? null);
  const fresh = useQuery(
    api.stats.playerStats,
    token && activeOrgId
      ? {
          token,
          orgId: activeOrgId,
          userId,
          ...(selectedSeason ? { seasonId: selectedSeason._id } : {}),
          ...(format !== "all" ? { format } : {}),
        }
      : "skip",
  );
  // Milestones are a whole-career race, so they only show on the default view.
  const careerView = scope === "all" && format === "all";
  const milestones = useQuery(
    api.stats.milestones,
    token && activeOrgId && careerView
      ? { token, orgId: activeOrgId, userId }
      : "skip",
  );
  const climb = careerView ? (milestones?.player ?? null) : null;
  // Switching season keeps the last numbers on screen, dimmed, until the new
  // ones land — no spinner flash. Keyed by player so another profile never
  // shows this one's numbers.
  const kept = useRef<{ userId: string; stats: typeof fresh }>();
  if (fresh !== undefined) kept.current = { userId, stats: fresh };
  const stats =
    fresh !== undefined
      ? fresh
      : kept.current?.userId === userId
        ? kept.current.stats
        : undefined;
  const switching = fresh === undefined && stats !== undefined;
  // Both, or neither. The season chips are prepended to the career chips, so a
  // `seasons` that lands a tick after `stats` reorders the row under the
  // reader's thumb — and a share tapped in that window builds its poster
  // around the wrong headline trophy. `seasons` is one small table read; the
  // profile already waits on something far heavier.
  if (stats === undefined || seasons === undefined) {
    return (
      <div className="flex items-center justify-center bg-bg py-24">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-line border-t-accent" />
      </div>
    );
  }
  if (stats === null) {
    return (
      <div className="px-5 py-8">
        <EmptyState
          title="Player not found"
          body="They may have been removed from this community, or you followed an old link."
          action={
            <Button href="/players">Back to players</Button>
          }
        />
      </div>
    );
  }

  const role = stats.primaryRole ?? stats.secondaryRole;
  const log = showAll ? stats.log : stats.log.slice(0, LOG_PREVIEW);
  const firstName = stats.displayName.trim().split(/\s+/)[0];
  // The section label must not survive on its own when nobody qualifies yet.
  const m = stats.matchups;
  const hasMatchups = Boolean(
    m.batting.toughest ||
      m.batting.easiest ||
      m.bowling.toughest ||
      m.bowling.easiest,
  );
  // `?? []` is safe: null is a membership we could not read, and `stats` is
  // null on the same failure, so the page has already shown "Player not found"
  // before this line can matter.
  const trophies = [
    ...computeSeasonTrophies(
      selectedSeason ? [selectedSeason] : (seasons ?? []),
      String(stats.userId),
    ),
    ...computeTrophies(stats),
  ];
  const f = stats.fielding;
  const disciplines: Discipline[] = [
    ...(stats.batting ? (["bat"] as const) : []),
    ...(stats.bowling ? (["bowl"] as const) : []),
    ...(f.realCatches + f.drops + f.runOuts > 0 ? (["field"] as const) : []),
  ];
  const activeDiscipline =
    discipline && disciplines.includes(discipline)
      ? discipline
      : defaultDiscipline(stats);
  const showFormats = stats.formats.test > 0 && stats.formats.limited > 0;
  const scopeLabel =
    [selectedSeason?.name, format === "all" ? null : FORMAT_LABEL[format]]
      .filter(Boolean)
      .join(" · ") || undefined;
  const shareData = buildShareData(stats, trophies[0], scopeLabel);
  const shareSlug = stats.displayName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return (
    <div className="bg-bg pb-4">
      <header className="bg-ink px-5 pb-4 pt-[calc(var(--safe-top)+0.5rem)] text-bg">
        <div className="mx-auto max-w-md">
          <div className="flex items-center justify-between">
            <button
              type="button"
              aria-label="Back"
              onClick={() => router.back()}
              className="-ml-2 flex h-11 w-11 items-center justify-center rounded-lg text-bg/70 active:bg-white/10"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div className="-mr-2 flex items-center gap-1">
              <Link
                href={`/hero?playerId=${stats.userId}`}
                aria-label="Hero — one day's flex"
                className="flex h-11 w-11 items-center justify-center rounded-xl text-bg/70 active:bg-white/10"
              >
                <Sparkles className="h-5 w-5" />
              </Link>
              <ShareButton
                data={shareData}
                filename={`gully-${shareSlug || "player"}.png`}
              />
            </div>
          </div>

          <div className="mt-2 flex items-center gap-3">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/10 text-[17px] font-semibold text-bg">
              {initials(stats.displayName)}
            </span>
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-xl font-semibold tracking-tight text-bg">
                {stats.displayName}
              </h1>
              <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                {role ? (
                  <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] font-medium capitalize text-bg/70">
                    {role}
                  </span>
                ) : null}
                <PlayerTagList tags={stats.playerTags} tone="dark" />
              </div>
            </div>
          </div>

          {(seasons && seasons.length > 0) || showFormats || format !== "all" ? (
            <div className="mt-1 flex items-center justify-between gap-3">
              {seasons && seasons.length > 0 ? (
                <SeasonScopeMenu
                  seasons={seasons}
                  selected={selectedSeason}
                  onSelect={(next) => {
                    setScope(next);
                    // A season may hold one format only; start it on both.
                    setFormat("all");
                  }}
                  tone="dark"
                />
              ) : (
                <span />
              )}
              {showFormats || format !== "all" ? (
                <div className="flex shrink-0 rounded-xl bg-white/10 p-1">
                  {(["all", "test", "limited"] as const).map((k) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setFormat(k)}
                      aria-current={format === k}
                      className={cn(
                        "min-h-11 rounded-lg px-3 text-[13px] font-semibold transition",
                        format === k
                          ? "bg-bg text-ink"
                          : "text-bg/70 active:bg-white/10",
                      )}
                    >
                      {FORMAT_LABEL[k]}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}

          {/* The whole career in one line, before any card is read: one
              number per discipline, so Catches sits beside Runs and Wickets. */}
          <div className="mt-3 flex gap-4 border-t border-white/10 pt-3">
            {[
              {
                label: "Matches",
                value: String(stats.matchesPlayed),
                hint:
                  stats.record.decided > 0
                    ? `${stats.record.wins} won`
                    : undefined,
              },
              { label: "Runs", value: String(stats.batting?.runs ?? 0) },
              { label: "Wickets", value: String(stats.bowling?.wickets ?? 0) },
              { label: "Catches", value: String(f.catches) },
            ].map((s) => (
              <div key={s.label} className="min-w-0">
                <p className="text-[22px] font-semibold leading-none text-bg">
                  {s.value}
                </p>
                <p className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-bg/70">
                  {s.label}
                </p>
                {s.hint ? (
                  <p className="mt-0.5 whitespace-nowrap text-[11px] leading-tight text-bg/70">
                    {s.hint}
                  </p>
                ) : null}
              </div>
            ))}
          </div>

          {stats.record.winPct != null || stats.record.contributionPct != null ? (
            <p className="mt-2.5 text-[13px] leading-snug text-bg/70">
              {stats.record.winPct != null ? (
                <>
                  <span className="font-semibold text-bg">
                    {Math.round(stats.record.winPct)}%
                  </span>{" "}
                  wins
                </>
              ) : null}
              {stats.record.winPct != null &&
              stats.record.contributionPct != null
                ? " · "
                : null}
              {stats.record.contributionPct != null ? (
                <>
                  <span className="font-semibold text-bg">
                    {Math.round(stats.record.contributionPct)}%
                  </span>{" "}
                  contribution
                </>
              ) : null}
            </p>
          ) : null}

          {stats.bio ? (
            <p className="mt-2 text-[13px] leading-snug text-bg/70">
              {stats.bio}
            </p>
          ) : null}
        </div>
      </header>

      <main
        className={cn(
          "mx-auto max-w-md space-y-6 px-5 py-4 transition-opacity",
          switching && "opacity-60",
        )}
      >
        {isAdmin && token && activeOrgId ? (
          <Section title="Tags">
            <PlayerTagEditor
              tags={stats.playerTags}
              busy={labelBusy}
              onToggle={async (tag: PlayerTag) => {
                setLabelBusy(true);
                setLabelError(null);
                try {
                  await togglePlayerTag({
                    token,
                    orgId: activeOrgId,
                    userId: stats.userId,
                    tag,
                  });
                } catch (e) {
                  setLabelError(
                    errorMessage(e, "Could not update that tag"),
                  );
                } finally {
                  setLabelBusy(false);
                }
              }}
            />
            {labelError ? (
              <p className="mt-1 text-[13px] text-danger">{labelError}</p>
            ) : null}
          </Section>
        ) : null}

        <FeatChips trophies={trophies} />

        {/* High on the page deliberately — rivalries are the most human thing
            here, and they land in the first fold. */}
        {hasMatchups ? (
          <Section title="Match-ups">
            <NemesisCard matchups={stats.matchups} firstName={firstName} />
          </Section>
        ) : null}

        {/* The chase: high on the page, because it is the number a player
            comes back to check. Whole career only. */}
        {climb && (climb.runs.total > 0 || climb.wickets.total > 0) ? (
          <Section title="Milestones">
            <MilestoneLadder climb={climb} />
          </Section>
        ) : null}

        {disciplines.length > 0 ? (
          <section>
            {/* One discipline on screen at a time is the single biggest
                scroll cut on this page. Skipped for a player with one. */}
            {disciplines.length > 1 ? (
              <div className="mb-3 flex gap-1.5 rounded-2xl border border-line bg-surface p-1">
                {disciplines.map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setDiscipline(d)}
                    aria-current={activeDiscipline === d}
                    className={cn(
                      "min-h-11 min-w-0 flex-1 rounded-xl text-center text-[13px] font-semibold transition",
                      activeDiscipline === d
                        ? "bg-ink text-bg"
                        : "text-muted active:bg-line/60",
                    )}
                  >
                    {DISCIPLINE_LABEL[d]}
                  </button>
                ))}
              </div>
            ) : null}

            {stats.batting && activeDiscipline === "bat" ? (
              <BattingCard b={stats.batting} log={stats.log} vs={stats.vsBowlers} />
            ) : null}
            {stats.bowling && activeDiscipline === "bowl" ? (
              <BowlingCard b={stats.bowling} log={stats.log} vs={stats.vsBatters} />
            ) : null}
            {activeDiscipline === "field" ? <FieldingCard f={f} /> : null}
          </section>
        ) : null}

        {stats.log.length > 0 ? (
          <section>
            <Expander label="All innings ›" bordered={false}>
              <InningsLog rows={log} />
              {stats.log.length > LOG_PREVIEW ? (
                <button
                  type="button"
                  onClick={() => setShowAll((v) => !v)}
                  className="mt-2 min-h-11 w-full rounded-2xl border border-line bg-surface text-[13px] font-semibold text-muted active:bg-bg"
                >
                  {showAll
                    ? "Show less"
                    : `Show all ${stats.log.length} matches`}
                </button>
              ) : null}
            </Expander>
          </section>
        ) : null}

        {!stats.batting && !stats.bowling ? (
          <EmptyState
            title={selectedSeason ? "Nothing this season" : "Nothing scored yet"}
            body={
              selectedSeason
                ? `No batting or bowling in ${selectedSeason.name} yet.`
                : "Stats appear here once they have batted or bowled in a completed match."
            }
          />
        ) : null}

        {stats.isGuest ? (
          <section className="rounded-2xl border border-accent/30 bg-accent-soft px-4 py-3">
            <p className="text-[13px] font-semibold text-accent-deep">
              This is still a guest profile
            </p>
            <p className="mt-1 text-[13px] leading-relaxed text-ink">
              Every run and wicket here is already saved. When{" "}
              {stats.displayName} signs up with the same phone number, this whole
              record becomes their account — nothing to transfer, nothing lost.
            </p>
          </section>
        ) : null}
      </main>
    </div>
  );
}
