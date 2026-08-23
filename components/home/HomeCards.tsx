"use client";

import { Button } from "@/components/ui/Button";
import { TruncText } from "@/components/ui/TruncText";
import { api } from "@/convex/_generated/api";
import { cn } from "@/lib/utils";
import type { FunctionReturnType } from "convex/server";
import { ChevronRight, MoreVertical, Pencil, Trophy } from "lucide-react";
import Link from "next/link";

/**
 * Home's cards.
 *
 * Two rules shape all of them:
 *
 * 1. **One team name per line.** "Team Amarnath vs Team Na…" on a shared line
 *    is worse than useless — you cannot tell Naman from Nagesh. Names get a
 *    full-width line each, so what truncates is the tail of one name rather
 *    than the identity of a side.
 * 2. **Every card says what kind of match it was.** Overs alone lie about a
 *    Test (it carries whatever cap was typed at create), so the meta line
 *    always leads with the format.
 */

export type MatchRow = FunctionReturnType<typeof api.matches.list>[number];
export type SeriesRow = FunctionReturnType<typeof api.tournaments.list>[number];

export function matchType(m: Pick<MatchRow, "format" | "overs">) {
  return m.format === "test" ? "Test" : `${m.overs} ov`;
}

/**
 * resultText reads "{winner} won by 5 runs", and the winner's name is already
 * the first line of the card — strip the duplicate so the meta line carries
 * the margin and nothing else. Anything unexpected falls through whole.
 */
function marginText(resultText: string | undefined, winnerName?: string) {
  if (!resultText) return null;
  if (winnerName && resultText.startsWith(`${winnerName} `)) {
    return resultText.slice(winnerName.length + 1);
  }
  return resultText;
}

/**
 * A close finish, read straight off the result sentence. With two regular
 * sides, every card carries the same two names — the margin is what makes one
 * game different from the next, so a nail-biter earns a mark: down to the
 * last pair (≤1 wicket) or a handful of runs (≤5).
 */
function isThriller(resultText: string | undefined) {
  if (!resultText) return false;
  const m = /won by (\d+) (run|wicket)/.exec(resultText);
  if (!m) return false;
  const n = Number(m[1]);
  return m[2] === "wicket" ? n <= 1 : n <= 5;
}

function ThrillerChip() {
  return (
    <span className="shrink-0 rounded-full bg-accent-soft px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-accent-deep">
      Thriller
    </span>
  );
}

function TournamentChip({ name, dark }: { name: string; dark?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex min-w-0 max-w-full items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold",
        dark ? "bg-white/10 text-bg/70" : "bg-ink/[0.06] text-muted",
      )}
    >
      <Trophy className="h-3 w-3 shrink-0" />
      <span className="truncate">{name}</span>
    </span>
  );
}

function LivePill({ dark }: { dark?: boolean }) {
  return (
    <span
      className={cn(
        "flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide",
        dark ? "bg-accent/20 text-accent" : "bg-accent-soft text-accent-deep",
      )}
    >
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />
      Live
    </span>
  );
}

/** Options menu shared by the hero and the ordinary cards. */
export function MatchMenu({
  match,
  label,
  menuOpen,
  onToggleMenu,
  onEnd,
  onDelete,
  dark,
}: {
  match: MatchRow;
  label: string;
  menuOpen: boolean;
  onToggleMenu: () => void;
  onEnd: (matchId: string, label: string) => void;
  onDelete: (matchId: string, label: string) => void;
  dark?: boolean;
}) {
  const canEnd = match.status === "live" || match.status === "scheduled";
  return (
    <>
      <button
        type="button"
        aria-label={`Options for ${label}`}
        onClick={onToggleMenu}
        className={cn(
          "absolute right-0.5 top-0.5 flex h-11 w-11 items-center justify-center rounded-xl",
          dark ? "text-bg/70 active:bg-white/10" : "text-faint active:bg-bg",
        )}
      >
        <MoreVertical className="h-5 w-5" />
      </button>

      {menuOpen ? (
        <>
          <button
            type="button"
            aria-label="Close menu"
            onClick={onToggleMenu}
            className="fixed inset-0 z-10 cursor-default"
          />
          <div className="absolute right-2 top-12 z-20 w-44 overflow-hidden rounded-2xl border border-line bg-surface shadow-lift">
            {canEnd ? (
              <button
                type="button"
                onClick={() => onEnd(match._id, label)}
                className="block min-h-11 w-full px-4 py-3 text-left text-sm font-medium text-ink active:bg-bg hover:bg-bg"
              >
                End without result
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => onDelete(match._id, label)}
              className="block min-h-11 w-full border-t border-line px-4 py-3 text-left text-sm font-medium text-danger active:bg-danger-soft hover:bg-danger-soft"
            >
              Delete match
            </button>
          </div>
        </>
      ) : null}
    </>
  );
}

/**
 * The live match, front and centre. Tapping the card watches (read-only, since
 * everyone in the org can score and a mis-tap on the pad corrupts the match);
 * "Resume scoring" is the one deliberate way onto the pad.
 */
export function LiveHero({
  match,
  menuOpen,
  onToggleMenu,
  onEnd,
  onDelete,
}: {
  match: MatchRow;
  menuOpen: boolean;
  onToggleMenu: () => void;
  onEnd: (matchId: string, label: string) => void;
  onDelete: (matchId: string, label: string) => void;
}) {
  const label = `${match.sideAName} vs ${match.sideBName}`;
  // Mid-break the score belongs to the innings that just ended while
  // battingSide already points at whoever is next — don't pin one to the other.
  const scoring = match.live && !match.live.inBreak;
  const battingName =
    match.live?.battingSide === "A" ? match.sideAName : match.sideBName;
  const otherName =
    match.live?.battingSide === "A" ? match.sideBName : match.sideAName;

  return (
    <div className="relative rounded-2xl bg-ink text-bg shadow-card">
      <Link
        href={`/matches/${match._id}/watch`}
        className="block px-4 pb-4 pt-4 active:opacity-80"
      >
        <div className="flex min-w-0 flex-wrap items-center gap-1.5 pr-11">
          <LivePill dark />
          <span className="shrink-0 rounded-full bg-white/10 px-2 py-0.5 text-[11px] font-semibold text-bg/70">
            {matchType(match)}
          </span>
          {match.tournamentName ? (
            <TournamentChip dark name={match.tournamentName} />
          ) : null}
        </div>

        {scoring ? (
          <>
            <TruncText
              lines={2}
              className="mt-3 text-[15px] font-semibold text-bg"
            >
              {battingName}
            </TruncText>
            <p className="tabular mt-0.5 flex items-baseline gap-2 text-[2.5rem] font-semibold leading-none tracking-tight text-bg">
              {match.live!.totalRuns}
              <span className="text-bg/70">/</span>
              {match.live!.wickets}
              <span className="text-[13px] font-normal text-bg/70">
                {match.live!.oversText} ov
              </span>
            </p>
            <TruncText lines={2} className="mt-2 text-[13px] text-bg/70">
              {`v ${otherName}`}
            </TruncText>
            {match.live!.target ? (
              <p className="tabular mt-0.5 text-[13px] text-accent">
                Chasing {match.live!.target}
              </p>
            ) : null}
          </>
        ) : (
          <>
            <TruncText
              lines={2}
              className="mt-3 text-[15px] font-semibold text-bg"
            >
              {match.sideAName}
            </TruncText>
            <TruncText
              lines={2}
              className="mt-0.5 text-[15px] font-semibold text-bg/70"
            >
              {match.sideBName}
            </TruncText>
            <p className="mt-2 text-[13px] text-bg/70">
              {match.live?.inBreak ? "Innings break" : "Match in progress"}
            </p>
          </>
        )}
      </Link>

      <div className="px-4 pb-4">
        <Button
          href={`/matches/${match._id}/score`}
          fullWidth
          className="bg-bg text-ink shadow-none active:bg-bg/90"
        >
          <Pencil className="h-[18px] w-[18px]" strokeWidth={2.4} />
          Resume scoring
        </Button>
      </div>

      <MatchMenu
        dark
        match={match}
        label={label}
        menuOpen={menuOpen}
        onToggleMenu={onToggleMenu}
        onEnd={onEnd}
        onDelete={onDelete}
      />
    </div>
  );
}

export function MatchCard({
  match,
  menuOpen,
  onToggleMenu,
  onEnd,
  onDelete,
}: {
  match: MatchRow;
  menuOpen: boolean;
  onToggleMenu: () => void;
  onEnd: (matchId: string, label: string) => void;
  onDelete: (matchId: string, label: string) => void;
}) {
  const isLive = match.status === "live";
  // Live goes to the read-only watch view — the pad is one deliberate tap on.
  const href = isLive
    ? `/matches/${match._id}/watch`
    : match.status === "scheduled"
      ? `/matches/${match._id}/score`
      : `/matches/${match._id}`;
  const label = `${match.sideAName} vs ${match.sideBName}`;

  // A finished match leads with whoever won: the trophy and the running order
  // answer "who won" before you read a word of the result.
  const decided = match.status === "completed" && match.winnerSide !== undefined;
  const winnerName =
    match.winnerSide === "A"
      ? match.sideAName
      : match.winnerSide === "B"
        ? match.sideBName
        : undefined;
  const [first, second] = (
    decided && match.winnerSide === "B"
      ? [
          { name: match.sideBName, score: match.scoreB },
          { name: match.sideAName, score: match.scoreA },
        ]
      : [
          { name: match.sideAName, score: match.scoreA },
          { name: match.sideBName, score: match.scoreB },
        ]
  ) as Array<{ name: string; score: string | null }>;

  const battingName =
    match.live?.battingSide === "A" ? match.sideAName : match.sideBName;

  const meta =
    isLive && match.live && !match.live.inBreak
      ? `${battingName} ${match.live.totalRuns}/${match.live.wickets} (${match.live.oversText})`
      : isLive && match.live?.inBreak
        ? "Innings break"
        : match.status === "live"
          ? "In progress"
          : match.status === "scheduled"
            ? "Tap to continue setup"
            : match.status === "abandoned"
              ? (match.resultText ?? "No result")
              : (marginText(match.resultText, winnerName) ?? "Result pending");

  return (
    <div
      className={cn(
        "relative rounded-2xl border bg-surface transition",
        isLive ? "border-accent/50 shadow-card" : "border-line",
      )}
    >
      {/* One left edge per card, and the same one on every card: the trophy
          gets a reserved gutter rather than indenting the winner's name past
          everybody else's. */}
      <Link href={href} className="block min-h-12 px-4 py-3 pr-11 active:opacity-70">
        {match.tournamentName ? (
          <div className="mb-1.5">
            <TournamentChip name={match.tournamentName} />
          </div>
        ) : null}
        <div className="flex gap-1.5">
          {/* The trophy has to sit against the winner's name, so the gutter
              starts here rather than above the tournament tag. */}
          <span className="w-4 shrink-0">
            {decided ? (
              <Trophy className="mt-1 h-3.5 w-3.5 text-accent-deep" />
            ) : null}
          </span>
          <div className="min-w-0 flex-1">
            {/* Each side gets its line: name left, scoreline right. The score
                is what makes game N different from game N+1 between the same
                two teams — it reads in the same tabular ink as a scorecard. */}
            <div className="flex items-baseline gap-2">
              <TruncText
                lines={2}
                className="flex-1 text-[15px] font-semibold text-ink"
              >
                {first.name}
              </TruncText>
              {isLive ? <LivePill /> : null}
              {decided && isThriller(match.resultText) ? <ThrillerChip /> : null}
              {first.score ? (
                <span className="tabular shrink-0 text-[14px] font-semibold text-ink">
                  {first.score}
                </span>
              ) : null}
            </div>
            <div className="flex items-baseline gap-2">
              <TruncText lines={2} className="flex-1 text-[15px] text-muted">
                {second.name}
              </TruncText>
              {second.score ? (
                <span className="tabular shrink-0 text-[14px] font-medium text-muted">
                  {second.score}
                </span>
              ) : null}
            </div>

            {/* The margin is what tells this game apart from every other
                between the same two sides — it reads in ink, not faint. */}
            <p className="tabular mt-1.5 text-[12px] text-muted">
              <span className="font-medium text-muted">{matchType(match)}</span>
              {" · "}
              <span className={decided ? "font-medium text-ink" : undefined}>
                {meta}
              </span>
            </p>
          </div>
        </div>
      </Link>

      <MatchMenu
        match={match}
        label={label}
        menuOpen={menuOpen}
        onToggleMenu={onToggleMenu}
        onEnd={onEnd}
        onDelete={onDelete}
      />
    </div>
  );
}

/**
 * The running series. Wins sit in a column beside the squad names rather than
 * inline as "A 0 — 1 B", which put two team names on one line, and the pips
 * make "how far in are we" a shape instead of a sentence.
 */
export function SeriesCard({
  series,
  nested,
}: {
  series: SeriesRow;
  /** Inside a season card — same anatomy, no second outer border. */
  nested?: boolean;
}) {
  const left = Math.max(0, series.matchCount - series.played);
  return (
    <Link
      href={`/tournaments/${series._id}`}
      className={
        nested
          ? "block min-h-12 rounded-xl bg-bg px-3 py-2.5 transition active:opacity-70"
          : "block min-h-12 rounded-2xl border border-line bg-surface px-4 py-3 transition active:opacity-70"
      }
    >
      <div className="flex items-center gap-2">
        <Trophy className="h-4 w-4 shrink-0 text-accent-deep" />
        <TruncText lines={2} className="flex-1 text-[15px] font-semibold text-ink">
          {series.name}
        </TruncText>
        <span className="shrink-0 rounded-full bg-ink/[0.06] px-2 py-0.5 text-[11px] font-semibold text-muted">
          {series.format === "test" ? "Test" : "ODI"}
        </span>
        <ChevronRight className="h-4 w-4 shrink-0 text-faint" />
      </div>

      <div className="mt-2 space-y-0.5">
        {[
          { name: series.sideAName, wins: series.winsA },
          { name: series.sideBName, wins: series.winsB },
        ].map((side) => (
          <div key={side.name} className="flex items-baseline gap-2">
            <span className="min-w-0 flex-1 truncate text-[15px] text-ink">
              {side.name}
            </span>
            <span
              className={cn(
                "tabular shrink-0 text-[15px] font-semibold",
                side.wins > 0 ? "text-ink" : "text-faint",
              )}
            >
              {side.wins}
            </span>
          </div>
        ))}
      </div>

      <div className="mt-2.5 flex items-center gap-2">
        {/* Discrete pips, not a continuous meter — a series is a countable
            number of matches, so the bar should be countable too. */}
        <span className="flex flex-1 gap-1">
          {Array.from({ length: series.matchCount }, (_, i) => (
            <span
              key={i}
              className={cn(
                "h-1.5 flex-1 rounded-full",
                i < series.played ? "bg-accent" : "bg-line",
              )}
            />
          ))}
        </span>
        <span className="tabular shrink-0 text-[11px] text-faint">
          {series.played}/{series.matchCount} played
          {left > 0 ? ` · ${left} to go` : ""}
        </span>
      </div>
    </Link>
  );
}
