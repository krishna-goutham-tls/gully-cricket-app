"use client";

import {
  FormStrip,
  InningsLog,
  MatchupTable,
  Meter,
  ModeLine,
  NemesisCard,
  StatTile,
  TrophyShelf,
  type LogRow,
  type Profile,
} from "@/components/player/ProfileParts";
import { useAuth } from "@/components/providers/AuthProvider";
import type { PlayerShareData, ShareStat } from "@/components/share/ShareCard";
import { ShareButton } from "@/components/share/ShareButton";
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
import { useParams } from "next/navigation";
import { useState } from "react";

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
function defaultDiscipline(stats: Profile): "bat" | "bowl" {
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
 * The one line the app says about a player, in words rather than numbers —
 * strictly what the figures already show, no personality guesswork.
 */
function summaryLine(stats: Profile): string | null {
  const parts: string[] = [];
  const bat = stats.batting;
  const bowl = stats.bowling;
  if (bat?.rank?.rank === 1) parts.push("Top of the run charts");
  else if (bowl?.rank?.rank === 1) parts.push("Leads the wicket charts");

  if (bat && bat.balls >= 20) {
    parts.push(`strikes at ${bat.strikeRate.toFixed(0)}`);
  }
  if (bowl?.strikeRate != null && bowl.wickets >= 3) {
    parts.push(`a wicket every ${bowl.strikeRate.toFixed(0)} balls`);
  }
  if (parts.length === 0) return null;
  const [first, ...rest] = parts;
  return [first, ...rest].join(" · ");
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
  };
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
          <span className="ml-1.5 text-[12px] font-normal text-faint">
            runs · {b.innings} batting inn{b.innings === 1 ? "" : "s"}
          </span>
        </p>
        <RankChip rank={b.rank} by="runs" />
      </div>

      <FormStrip entries={battingForm(log)} />

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
        <StatTile label="4s / 6s" value={`${b.fours}/${b.sixes}`} />
        <StatTile label="Fifties" value={String(b.fifties)} />
        <StatTile label="Thirties" value={String(b.thirties)} hint="30 to 49" />
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
  const dotPct = b.legalBalls > 0 ? (b.dots / b.legalBalls) * 100 : 0;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        {/* Bowling innings, not the header's career figure — economy, average
            and balls/wkt below are all read against these. */}
        <p className="text-[28px] font-semibold leading-none text-ink">
          {b.wickets}
          <span className="ml-1.5 text-[12px] font-normal text-faint">
            wicket{b.wickets === 1 ? "" : "s"} · {b.innings} bowling inn
            {b.innings === 1 ? "" : "s"}
          </span>
        </p>
        <RankChip rank={b.rank} by="wickets" />
      </div>

      <FormStrip entries={bowlingForm(log)} />

      <div className="mt-3 grid grid-cols-3 gap-y-3">
        <StatTile
          label="Economy"
          value={b.economy.toFixed(1)}
          hint={`${b.runs} conceded`}
        />
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
      </div>

      <div className="mt-3.5 space-y-3 border-t border-line pt-3">
        <Meter
          label="Dot balls"
          pct={dotPct}
          caption={`${b.dots} of ${b.legalBalls} deliveries cost nothing`}
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

export default function PlayerDetailPage() {
  const params = useParams();
  const userId = params.id as Id<"users">;
  const { token, activeOrgId, isAdmin } = useAuth();
  const togglePlayerTag = useMutation(api.players.togglePlayerTag);
  const [showAll, setShowAll] = useState(false);
  const [labelBusy, setLabelBusy] = useState(false);
  const [labelError, setLabelError] = useState<string | null>(null);
  // Null until the viewer taps the toggle — lets the default follow the
  // player's role/innings split once `stats` loads, without a hook that has
  // to run conditionally.
  const [discipline, setDiscipline] = useState<"bat" | "bowl" | null>(null);
  const stats = useQuery(
    api.stats.playerStats,
    token && activeOrgId ? { token, orgId: activeOrgId, userId } : "skip",
  );
  const seasons = useQuery(
    api.seasons.list,
    token && activeOrgId ? { token, orgId: activeOrgId } : "skip",
  );

  if (stats === undefined) {
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
          body="They may have been removed from this group, or you followed an old link."
          action={
            <Button href="/players">Back to players</Button>
          }
        />
      </div>
    );
  }

  const role = stats.primaryRole ?? stats.secondaryRole;
  const log = showAll ? stats.log : stats.log.slice(0, LOG_PREVIEW);
  const summary = summaryLine(stats);
  const firstName = stats.displayName.trim().split(/\s+/)[0];
  // The section label must not survive on its own when nobody qualifies yet.
  const m = stats.matchups;
  const hasMatchups = Boolean(
    m.batting.toughest ||
      m.batting.easiest ||
      m.bowling.toughest ||
      m.bowling.easiest,
  );
  const trophies = [
    ...computeSeasonTrophies(seasons ?? [], String(stats.userId)),
    ...computeTrophies(stats),
  ];
  const hasBothDisciplines = Boolean(stats.batting && stats.bowling);
  const activeDiscipline = discipline ?? defaultDiscipline(stats);
  const shareData = buildShareData(stats, trophies[0]);
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
            <Link
              href="/players"
              aria-label="Back to players"
              className="-ml-2 flex h-11 w-11 items-center justify-center rounded-xl text-bg/70 active:bg-white/10"
            >
              <ArrowLeft className="h-5 w-5" />
            </Link>
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

          {/* The whole career in one line, before any card is read. Innings
              sits next to matches on purpose — a Test where they came out
              twice is 2 innings inside 1 match, and that gap is worth
              showing before the reader gets to a single average or rate.
              This one is every innings they took the field in, batting OR
              bowling, so it reads higher than the batting innings the average
              below is built from — hence the split spelled out underneath,
              which is the only thing stopping it being misread as "times I
              came out to bat". */}
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
              {
                label: "Innings",
                value: String(stats.inningsPlayed),
                hint: `${stats.batting?.innings ?? 0} bat · ${
                  stats.bowling?.innings ?? 0
                } bowl`,
              },
              { label: "Runs", value: String(stats.batting?.runs ?? 0) },
              { label: "Wickets", value: String(stats.bowling?.wickets ?? 0) },
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

          {summary ? (
            <p className="mt-2.5 text-[13px] leading-snug text-accent">
              {summary}
            </p>
          ) : null}

          {stats.bio ? (
            <p className="mt-2 text-[13px] leading-snug text-bg/70">
              {stats.bio}
            </p>
          ) : null}
        </div>
      </header>

      <main className="mx-auto max-w-md space-y-6 px-5 py-4">
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

        <TrophyShelf trophies={trophies} />

        {/* High on the page deliberately — rivalries are the most human thing
            here, and they land in the first fold. */}
        {hasMatchups ? (
          <Section title="Match-ups">
            <NemesisCard matchups={stats.matchups} firstName={firstName} />
          </Section>
        ) : null}

        {stats.batting || stats.bowling ? (
          <section>
            {/* Same segmented-pill visual as the Test innings rail on a
                match page — one discipline on screen at a time is the
                single biggest scroll cut on this page. Skipped entirely
                for a player who only has one discipline to show. */}
            {hasBothDisciplines ? (
              <div className="mb-3 flex gap-1.5 rounded-2xl border border-line bg-surface p-1">
                <button
                  type="button"
                  onClick={() => setDiscipline("bat")}
                  aria-current={activeDiscipline === "bat"}
                  className={cn(
                    "min-h-11 min-w-0 flex-1 rounded-xl text-center text-[13px] font-semibold transition",
                    activeDiscipline === "bat"
                      ? "bg-ink text-bg"
                      : "text-muted active:bg-line/60",
                  )}
                >
                  Batting
                </button>
                <button
                  type="button"
                  onClick={() => setDiscipline("bowl")}
                  aria-current={activeDiscipline === "bowl"}
                  className={cn(
                    "min-h-11 min-w-0 flex-1 rounded-xl text-center text-[13px] font-semibold transition",
                    activeDiscipline === "bowl"
                      ? "bg-ink text-bg"
                      : "text-muted active:bg-line/60",
                  )}
                >
                  Bowling
                </button>
              </div>
            ) : null}

            {stats.batting && (!hasBothDisciplines || activeDiscipline === "bat") ? (
              <BattingCard b={stats.batting} log={stats.log} vs={stats.vsBowlers} />
            ) : null}
            {stats.bowling && (!hasBothDisciplines || activeDiscipline === "bowl") ? (
              <BowlingCard b={stats.bowling} log={stats.log} vs={stats.vsBatters} />
            ) : null}
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
            title="Nothing scored yet"
            body="Stats appear here once they have batted or bowled in a completed match."
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
