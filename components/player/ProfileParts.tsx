"use client";

import { api } from "@/convex/_generated/api";
import { shortDate } from "@/lib/dates";
import type { Trophy } from "@/lib/trophies";
import { cn } from "@/lib/utils";
import type { FunctionReturnType } from "convex/server";
import {
  Award,
  BarChart3,
  ChevronDown,
  Crown,
  Flame,
  Lock,
  Shield,
  Target,
  TrendingDown,
  TrendingUp,
  Zap,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";

export type Profile = NonNullable<
  FunctionReturnType<typeof api.stats.playerStats>
>;
export type LogRow = Profile["log"][number];

/** A single number with its label. The workhorse of both discipline cards. */
export function StatTile({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="min-w-0">
      <p className="truncate text-[11px] font-semibold uppercase tracking-wide text-faint">
        {label}
      </p>
      {/* Proportional figures — these are standalone values, not a column. */}
      <p className="mt-0.5 truncate text-[18px] font-semibold leading-none text-ink">
        {value}
      </p>
      {hint ? (
        <p className="mt-0.5 truncate text-[11px] leading-tight text-faint">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/**
 * A share of a whole — what fraction of the runs came in boundaries, how many
 * deliveries went by without a run. One ratio against its limit, so it gets a
 * meter rather than another bare number.
 */
export function Meter({
  label,
  pct,
  caption,
}: {
  label: string;
  pct: number;
  caption: string;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <p className="truncate text-[13px] text-muted">{label}</p>
        <p className="tabular shrink-0 text-[13px] font-semibold text-ink">
          {Math.round(pct)}%
        </p>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-line">
        <div
          className="h-full rounded-r-full bg-accent"
          style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
        />
      </div>
      <p className="mt-1 truncate text-[11px] leading-tight text-faint">
        {caption}
      </p>
    </div>
  );
}

/**
 * Recent form — the first thing anyone actually wants to know about a player.
 * Newest first, with anything that counts as a performance lit in gold so the
 * run of scores reads at a glance rather than digit by digit.
 */
export function FormStrip({
  entries,
}: {
  entries: Array<{ text: string; good: boolean }>;
}) {
  if (entries.length === 0) return null;
  return (
    <div className="mt-2 flex items-center gap-1.5">
      <span className="shrink-0 text-[11px] font-semibold uppercase tracking-wide text-faint">
        Last {entries.length}
      </span>
      <span className="flex min-w-0 flex-wrap gap-1">
        {entries.map((e, i) => (
          <span
            key={i}
            className={cn(
              "tabular rounded-md px-1.5 py-0.5 text-[13px] font-semibold",
              e.good
                ? "bg-accent-soft text-accent-deep"
                : "bg-ink/[0.05] text-muted",
            )}
          >
            {e.text}
          </span>
        ))}
      </span>
    </div>
  );
}

const TROPHY_ICON: Record<string, LucideIcon> = {
  Crown,
  Award,
  BarChart3,
  Zap,
  Flame,
  Target,
  Lock,
  Shield,
};

/**
 * The trophy shelf — a single horizontal-scroll row of medal chips so the
 * biggest scroll problem on this page (stacking sections top to bottom)
 * never gains one more section. Gold chips are the rare, first-tap feats
 * (rank-1s, centuries, five-fors); silver is everything solid but not
 * headline. Renders nothing when the player hasn't earned anything yet —
 * an empty shelf reads as failure, not a section worth keeping.
 */
export function TrophyShelf({ trophies }: { trophies: Trophy[] }) {
  if (trophies.length === 0) return null;
  return (
    <div className="-mx-5 overflow-x-auto px-5">
      <div className="no-scrollbar flex w-max gap-2">
        {trophies.map((t) => {
          const Icon = TROPHY_ICON[t.icon] ?? Award;
          return (
            <div
              key={t.id}
              className={cn(
                "flex shrink-0 items-center gap-1.5 rounded-full px-3 py-2",
                t.tier === "gold"
                  ? "bg-accent-soft text-accent-deep ring-1 ring-inset ring-accent/30"
                  : "bg-ink/[0.05] text-muted",
              )}
            >
              <Icon
                className={cn(
                  "h-3.5 w-3.5 shrink-0",
                  t.tier === "gold" ? "text-accent-deep" : "text-muted",
                )}
              />
              <span className="whitespace-nowrap text-[13px] font-semibold">
                {t.label}
                {t.value ? (
                  <span
                    className={cn(
                      "ml-1",
                      t.tier === "gold" ? "text-accent-deep" : "text-ink",
                    )}
                  >
                    {t.value}
                  </span>
                ) : null}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const WICKET_LABEL: Record<string, string> = {
  bowled: "Bowled",
  caught: "Caught",
  lbw: "LBW",
  runout: "Run out",
  stumped: "Stumped",
  hitwicket: "Hit wicket",
  other: "Other",
};

/** "Caught 5 · Bowled 3 · LBW 1" — the shape of how someone gets out. */
export function ModeLine({
  title,
  modes,
}: {
  title: string;
  modes: Array<{ type: string; count: number }>;
}) {
  if (modes.length === 0) return null;
  return (
    <p className="truncate text-[11px] text-faint">
      <span className="font-medium text-muted">{title} </span>
      {modes
        .slice(0, 3)
        .map((m) => `${WICKET_LABEL[m.type] ?? m.type} ${m.count}`)
        .join(" · ")}
    </p>
  );
}

/**
 * Match-ups — the bit people will actually screenshot and send to each other.
 *
 * Four facts, and the whole design problem is making it impossible to misread
 * which player is which. "With the bat · Naman" fails: it names the owner's
 * discipline but the opponent's name. So the situation is spelled out in the
 * owner's own name ("When Krishna bats"), and each cell's label names the
 * opponent's role ("toughest bowler"), which only leaves one reading.
 *
 * Tough and easy sit side by side because they are opposites — reading across
 * is the comparison — and they are told apart by background before a word is
 * read. Every cell then carries the same evidence in the same format, so
 * nothing needs converting in the reader's head.
 */
export function NemesisCard({
  matchups,
  firstName,
}: {
  matchups: Profile["matchups"];
  firstName: string;
}) {
  const { batting, bowling, fielder } = matchups;
  const hasBatting = batting.toughest || batting.easiest;
  const hasBowling = bowling.toughest || bowling.easiest;
  if (!hasBatting && !hasBowling) return null;

  return (
    <div className="space-y-3">
      {hasBatting ? (
        <Situation
          title={`When ${firstName} bats`}
          toughLabel="Toughest bowler"
          easyLabel="Easiest bowler"
          tough={batting.toughest}
          easy={batting.easiest}
          footnote={
            fielder
              ? `${fielder.displayName} has fielded ${fielder.outs} of the dismissals`
              : undefined
          }
        />
      ) : null}

      {hasBowling ? (
        <Situation
          title={`When ${firstName} bowls`}
          toughLabel="Toughest batter"
          easyLabel="Easiest batter"
          tough={bowling.toughest}
          easy={bowling.easiest}
        />
      ) : null}
    </div>
  );
}

type Opponent = {
  userId: string;
  displayName: string;
  runs: number;
  balls: number;
  outs: number;
};

function Situation({
  title,
  toughLabel,
  easyLabel,
  tough,
  easy,
  footnote,
}: {
  title: string;
  toughLabel: string;
  easyLabel: string;
  tough: Opponent | null;
  easy: Opponent | null;
  footnote?: string;
}) {
  return (
    <div>
      <p className="px-1 text-[11px] font-semibold text-muted">{title}</p>
      <div className="mt-1.5 flex gap-2">
        {tough ? <Cell label={toughLabel} who={tough} tone="tough" /> : null}
        {easy ? <Cell label={easyLabel} who={easy} tone="easy" /> : null}
      </div>
      {footnote ? (
        <p className="mt-1.5 px-1 text-[11px] text-faint">{footnote}</p>
      ) : null}
    </div>
  );
}

/** One opponent. Same three lines whichever cell it lands in. */
function Cell({
  label,
  who,
  tone,
}: {
  label: string;
  who: Opponent;
  tone: "tough" | "easy";
}) {
  return (
    <Link
      href={`/players/${who.userId}`}
      className={cn(
        "min-h-12 min-w-0 flex-1 rounded-xl px-3 py-2.5 active:opacity-70",
        tone === "easy" ? "bg-accent-soft" : "bg-ink/[0.05]",
      )}
    >
      <span className="flex items-center gap-1">
        {tone === "easy" ? (
          <TrendingUp className="h-3 w-3 shrink-0 text-accent-deep" />
        ) : (
          <TrendingDown className="h-3 w-3 shrink-0 text-muted" />
        )}
        <span
          className={cn(
            "min-w-0 truncate text-[11px] font-semibold uppercase tracking-wide",
            tone === "easy" ? "text-accent-deep" : "text-muted",
          )}
        >
          {label}
        </span>
      </span>
      <span className="mt-1 block truncate text-[15px] font-semibold text-ink">
        {who.displayName}
      </span>
      {/* Units spelled out, and "wickets" rather than "out 3×" — a wicket
          always belongs to whoever was bowling, and the situation heading
          above already says who that is. Nothing to decode either way. */}
      <span className="tabular mt-0.5 block text-[11px] leading-snug text-muted">
        {who.runs} runs off {who.balls}
        {who.outs > 0
          ? ` · ${who.outs} wicket${who.outs === 1 ? "" : "s"}`
          : ""}
      </span>
    </Link>
  );
}

type MatchupRow = Profile["vsBowlers"][number];

const MATCHUP_PREVIEW = 5;

/**
 * The full head-to-head, read as a proper stat table — the way a scorecard is
 * read, so it carries real weight on the page instead of a stray line. One row
 * per opponent, deepest rivalries (most balls) first; top five, the tail one
 * tap away.
 *
 * `kind` flips the columns to how cricket judges each side of the contest:
 * batting shows strike rate + how often that bowler dismissed you; bowling
 * shows economy + how often you took that batter's wicket. Dot% rides both —
 * the anchor-vs-hitter axis that the headline rate alone hides. The standout
 * cell is coloured, and the number that tells the rivalry (dismissals) sits in
 * its own column: red when a bowler owns you, gold when you own a batter.
 */
/** One labelled figure in an expanded match-up row. */
function MatchupStat({ label, value }: { label: string; value: string }) {
  return (
    <span className="flex items-baseline gap-1">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-faint">
        {label}
      </span>
      <span className="tabular text-[13px] font-semibold text-ink">{value}</span>
    </span>
  );
}

export function MatchupTable({
  title,
  rows,
  kind,
  bare = false,
}: {
  title: string;
  rows: MatchupRow[];
  kind: "bat" | "bowl";
  /** Skips the own title + top border — for nesting under an expander row
   * that already announces what this table is. */
  bare?: boolean;
}) {
  const [all, setAll] = useState(false);
  const [open, setOpen] = useState<Set<string>>(new Set());
  if (rows.length === 0) return null;
  const shown = all ? rows : rows.slice(0, MATCHUP_PREVIEW);
  const bat = kind === "bat";

  // Highlight the standout rate across the shown rows: the bowler scored
  // quickest against (batting), or the batter kept tightest (bowling).
  const rate = (r: MatchupRow) =>
    bat ? r.strikeRate : r.balls > 0 ? r.runs / (r.balls / 6) : Infinity;
  const bestRate = shown.reduce(
    (best, r) => (bat ? Math.max(best, rate(r)) : Math.min(best, rate(r))),
    bat ? 0 : Infinity,
  );
  const toggle = (id: string) =>
    setOpen((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  return (
    <div className={bare ? undefined : "mt-4 border-t border-line pt-3.5"}>
      {bare ? null : (
        <p className="px-1 pb-2 text-[11px] font-semibold uppercase tracking-wide text-faint">
          {title}
        </p>
      )}
      <div className="overflow-hidden rounded-2xl border border-line bg-surface">
        {/* Column labels for the collapsed rows below. Rows expand for the full
            texture (4s, 6s, dot%) so the top line stays thumb-scannable. */}
        <div className="flex items-center gap-2 border-b border-line px-3.5 py-2 text-[11px] font-semibold uppercase tracking-wide text-faint">
          <span className="flex-1">{bat ? "Bowler" : "Batter"}</span>
          <span className="w-14 text-right">R (B)</span>
          <span className="w-11 text-right">{bat ? "SR" : "Econ"}</span>
          <span className="w-7 text-right">{bat ? "Out" : "W"}</span>
          <span className="w-4" aria-hidden />
        </div>
        {shown.map((r) => {
          const id = String(r.userId);
          const isOpen = open.has(id);
          const econ = r.balls > 0 ? r.runs / (r.balls / 6) : 0;
          const dotPct = r.balls > 0 ? Math.round((r.dots / r.balls) * 100) : 0;
          const standout = r.balls > 0 && rate(r) === bestRate;
          const rateText = bat ? r.strikeRate.toFixed(0) : econ.toFixed(1);
          return (
            <div key={id} className="border-b border-line/60 last:border-b-0">
              <button
                type="button"
                onClick={() => toggle(id)}
                aria-expanded={isOpen}
                className="flex min-h-12 w-full items-center gap-2 px-3.5 py-2.5 text-left text-[13px] active:bg-bg"
              >
                <span className="min-w-0 flex-1 truncate text-[15px] font-semibold text-ink">
                  {r.displayName}
                </span>
                <span className="tabular w-14 text-right text-muted">
                  {r.runs}
                  <span className="text-faint">&nbsp;({r.balls})</span>
                </span>
                <span
                  className={cn(
                    "tabular w-11 text-right font-semibold",
                    standout ? "text-accent-deep" : "text-ink",
                  )}
                >
                  {rateText}
                </span>
                <span
                  className={cn(
                    "tabular w-7 text-right font-semibold",
                    r.outs === 0
                      ? "text-faint"
                      : bat
                        ? "text-danger"
                        : "text-accent-deep",
                  )}
                >
                  {r.outs > 0 ? r.outs : "–"}
                </span>
                <ChevronDown
                  className={cn(
                    "h-4 w-4 shrink-0 text-faint transition-transform",
                    isOpen && "rotate-180",
                  )}
                />
              </button>
              {isOpen ? (
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line/60 bg-bg/50 px-3.5 py-2.5">
                  <MatchupStat label="Dot%" value={`${dotPct}%`} />
                  <MatchupStat label="4s" value={String(r.fours)} />
                  <MatchupStat label="6s" value={String(r.sixes)} />
                  <MatchupStat label="Balls" value={String(r.balls)} />
                  <MatchupStat
                    label={bat ? "Dismissed" : "Wickets"}
                    value={String(r.outs)}
                  />
                  <Link
                    href={`/players/${r.userId}`}
                    className="ml-auto text-[13px] font-semibold text-accent-deep active:opacity-70"
                  >
                    View →
                  </Link>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
      {rows.length > MATCHUP_PREVIEW ? (
        <button
          type="button"
          onClick={() => setAll((v) => !v)}
          className="mt-2 flex min-h-11 w-full items-center justify-center gap-1 rounded-xl border border-line bg-surface text-[13px] font-semibold text-muted active:bg-bg"
        >
          {all ? "Show fewer" : `Show all ${rows.length}`}
          <ChevronDown
            className={cn("h-3.5 w-3.5 transition-transform", all && "rotate-180")}
          />
        </button>
      ) : null}
    </div>
  );
}

/** "34*(21)", or "34 & 12*" across a Test's two innings. */
export function batFigure(row: LogRow) {
  const played = row.bat.filter((b) => b.balls > 0 || b.out);
  if (played.length === 0) return null;
  return played
    .map((b) => `${b.runs}${b.out ? "" : "*"}(${b.balls})`)
    .join(" & ");
}

export function bowlFigure(row: LogRow) {
  const spells = row.bowl.filter((s) => s.legalBalls > 0);
  if (spells.length === 0) return null;
  return spells.map((s) => `${s.wickets}/${s.runs}`).join(" & ");
}

/**
 * Innings by innings. Each row is one match: who it was against, what they did
 * with bat and ball, and whether the side won — the actual record behind every
 * average on the page, and a way back into the match itself.
 */
export function InningsLog({ rows }: { rows: LogRow[] }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-surface">
      {rows.map((row) => {
        const bat = batFigure(row);
        const bowl = bowlFigure(row);
        return (
          <Link
            key={String(row.matchId)}
            href={`/matches/${row.matchId}`}
            className="block min-h-12 border-b border-line/60 px-4 py-2.5 last:border-b-0 active:bg-bg"
          >
            <div className="flex items-baseline gap-2">
              <p className="min-w-0 flex-1 truncate text-[15px] font-semibold text-ink">
                {row.bothSides ? row.opponent : `v ${row.opponent}`}
              </p>
              {row.contributionPct != null ? (
                <span className="tabular shrink-0 text-[13px] text-faint">
                  {Math.round(row.contributionPct)}%
                </span>
              ) : null}
              {row.result === "none" ? null : (
                <span
                  className={cn(
                    "shrink-0 rounded-full px-1.5 py-0.5 text-[11px] font-bold uppercase",
                    row.result === "won"
                      ? "bg-accent-soft text-accent-deep"
                      : "bg-ink/[0.06] text-muted",
                  )}
                >
                  {row.result === "won" ? "Won" : "Lost"}
                </span>
              )}
            </div>
            <p className="tabular mt-0.5 truncate text-[13px] text-faint">
              {shortDate(row.date)}
              {row.format === "test" ? " · Test" : ""}
              {bat ? (
                <>
                  {" · "}
                  <span className="font-medium text-muted">{bat}</span>
                </>
              ) : null}
              {bowl ? (
                <>
                  {" · "}
                  <span className="font-medium text-muted">{bowl}</span>
                </>
              ) : null}
              {!bat && !bowl ? " · did not bat or bowl" : ""}
            </p>
          </Link>
        );
      })}
    </div>
  );
}
