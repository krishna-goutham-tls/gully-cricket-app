"use client";

import { useAuth } from "@/components/providers/AuthProvider";
import {
  TestClockLine,
  TestClockOverlays,
  TestClockProvider,
  TestClockStatus,
} from "@/components/match/TestClock";
import { OverTracker } from "@/components/match/OverTracker";
import { ShareLinkButton } from "@/components/share/ShareLinkButton";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { matchBoardLabel, matchBoardLine } from "@/lib/matchBoard";
import { publicMatchUrl } from "@/lib/share";
import { cn } from "@/lib/utils";
import { useQuery } from "convex/react";
import { ArrowLeft, ClipboardList, Pencil } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";

/**
 * Read-only live view. Every active member can score, so a spectator tapping a
 * live match used to land on the pad and could corrupt it by mis-tap. This
 * route must never import a mutation — scoring is one deliberate tap away.
 */

export default function WatchPage() {
  const params = useParams();
  const matchId = params.id as Id<"matches">;
  const { token, isSandbox } = useAuth();
  const state = useQuery(
    api.scoring.liveState,
    token ? { token, matchId } : "skip",
  );

  const scoreHref = `/matches/${matchId}/score`;
  const cardHref = `/matches/${matchId}`;

  if (state === undefined) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-bg">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-line border-t-accent" />
      </div>
    );
  }
  if (state === null) {
    return (
      <div className="px-5 py-8">
        <EmptyState title="Match not found" />
      </div>
    );
  }

  const done = state.status === "completed" || state.status === "abandoned";
  // matchLiveState survives an innings break with the *finished* innings'
  // totals still in totalRuns/wickets/oversText while battingSide already
  // points at whoever bats next — so a completed match or a break both fall
  // through to the waitingText branch instead of misattributing the score.
  const live =
    done || state.phase === "innings_break" ? null : state.live;
  const solo = state.ruleSnapshot.battingModeDefault === "single";
  const isTest = state.ruleSnapshot.inningsPerSide === 2;

  const battingName =
    live?.battingSide === "A" ? state.sideA.name : state.sideB.name;
  const board =
    live?.battingSide
      ? matchBoardLine({
          inningsPerSide: state.ruleSnapshot.inningsPerSide ?? 1,
          innings: state.innings,
          live: {
            battingSide: live.battingSide,
            totalRuns: live.totalRuns,
            inningsNo: live.inningsNo,
            currentInningsId: live.currentInningsId,
            target: live.target,
          },
        })
      : null;

  const waitingText = (() => {
    switch (state.phase) {
      case "need_batting_side":
        return "Waiting for the toss";
      case "need_openers":
        return "Waiting for the openers";
      case "innings_break":
        return state.breakInfo?.leadText ?? "Innings break";
      case "need_batsman":
        return "Next batter coming in";
      case "need_bowler":
        return "New bowler coming on";
      default:
        return null;
    }
  })();

  return (
    <TestClockProvider
      clock={done ? null : state.clock}
      role="watcher"
      matchId={matchId}
    >
    <div className="min-h-dvh bg-bg">
      <header className="bg-ink px-4 pb-6 pt-[calc(var(--safe-top)+1rem)] text-bg">
        <div className="flex items-center justify-between gap-2">
          <Link
            href="/home"
            aria-label="Back to home"
            className="-ml-2 flex h-11 w-11 items-center justify-center rounded-xl text-bg/70 active:bg-white/10"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <p className="min-w-0 truncate text-[13px] font-medium text-bg/70">
            {live
              ? `Innings ${live.inningsNo}${isTest ? " of 4" : ""} · ${battingName}`
              : `${state.sideA.name} vs ${state.sideB.name}`}
          </p>
          <div className="flex shrink-0 items-center gap-0.5">
            {done ? (
              <span className="shrink-0 rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-bg/70">
                {state.status === "abandoned" ? "Ended" : "Result"}
              </span>
            ) : (
              <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-accent/20 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-accent">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />
                Live
              </span>
            )}
            {/* The no-login page, for the group chat. Sandbox games are
                practice and have no public page. */}
            {isSandbox ? null : (
              <ShareLinkButton
                url={() => publicMatchUrl(matchId)}
                text={`${state.sideA.name} vs ${state.sideB.name} — ${
                  done ? (state.resultText ?? "full score") : "live score"
                }`}
                className="-mr-2"
              />
            )}
          </div>
        </div>
        <TestClockLine />

        {live ? (
          <>
            <div className="mt-2 text-center">
              <p className="tabular text-[4.75rem] font-semibold leading-none tracking-tight text-bg">
                {live.totalRuns}
                <span className="text-bg/70">/</span>
                {live.wickets}
              </p>
              <p className="tabular mt-2 text-[13px] text-bg/70">
                {live.oversText} ov
                {live.runRate > 0 ? ` · RR ${live.runRate.toFixed(1)}` : ""}
              </p>
              {board?.kind === "target" ? (
                <p className="tabular mt-1.5 inline-block rounded-full bg-accent/15 px-3 py-1 text-[13px] font-medium text-accent">
                  {matchBoardLabel(board)}
                  {!isTest && live.requiredRunRate != null
                    ? ` · ${live.requiredRunRate.toFixed(1)}/ov`
                    : ""}
                </p>
              ) : board ? (
                <p className="tabular mt-1.5 inline-block rounded-full bg-white/10 px-3 py-1 text-[13px] font-medium text-bg/70">
                  {matchBoardLabel(board)}
                </p>
              ) : null}
            </div>

            <div
              className={cn(
                "mt-4 grid gap-2 text-center text-[11px]",
                solo ? "grid-cols-2" : "grid-cols-3",
              )}
            >
              <div className="rounded-2xl bg-accent/20 px-2 py-2 ring-1 ring-accent/60">
                <p className="font-semibold uppercase tracking-wide text-accent">
                  {solo ? "Batting" : "On strike"}
                </p>
                <p
                  className="mt-0.5 line-clamp-2 text-[15px] font-semibold text-bg [overflow-wrap:anywhere]"
                  title={live.striker?.displayName ?? undefined}
                >
                  {live.striker?.displayName ?? "—"}
                  {solo ? null : <span className="text-accent">*</span>}
                </p>
                {live.figures.striker ? (
                  <p className="tabular mt-0.5 text-[13px] text-bg/70">
                    {live.figures.striker.runs}({live.figures.striker.balls})
                  </p>
                ) : null}
              </div>
              {solo ? null : (
                <div className="rounded-2xl bg-white/[0.05] px-2 py-2">
                  <p className="font-semibold uppercase tracking-wide text-bg/70">
                    Non-striker
                  </p>
                  <p
                    className="mt-0.5 line-clamp-2 text-[15px] font-semibold text-bg/70 [overflow-wrap:anywhere]"
                    title={live.nonStriker?.displayName ?? undefined}
                  >
                    {live.nonStriker?.displayName ?? "—"}
                  </p>
                  {live.figures.nonStriker ? (
                    <p className="tabular mt-0.5 text-[13px] text-bg/70">
                      {live.figures.nonStriker.runs}(
                      {live.figures.nonStriker.balls})
                    </p>
                  ) : null}
                </div>
              )}
              <div className="rounded-2xl bg-white/[0.05] px-2 py-2">
                <p className="font-semibold uppercase tracking-wide text-bg/70">
                  Bowling
                </p>
                <p
                  className="mt-0.5 line-clamp-2 text-[15px] font-semibold text-bg [overflow-wrap:anywhere]"
                  title={live.bowler?.displayName ?? undefined}
                >
                  {live.bowler?.displayName ?? "—"}
                </p>
                {live.figures.bowler ? (
                  <p className="tabular mt-0.5 text-[13px] text-bg/70">
                    {live.figures.bowler.wickets}-{live.figures.bowler.runs}
                  </p>
                ) : null}
              </div>
            </div>

            <OverTracker
              current={live.currentOverBalls}
              prev={live.prevOverBalls}
              ballsPerOver={state.ruleSnapshot.ballsPerOver}
            />
          </>
        ) : (
          <div className="mt-6 text-center">
            <p className="text-xl font-semibold text-bg">
              {done
                ? (state.resultText ?? "No result")
                : (waitingText ?? "Not started yet")}
            </p>
            {!done && state.phase === "innings_break" && state.breakInfo?.target != null ? (
              <p className="tabular mt-1.5 inline-block rounded-full bg-accent/15 px-3 py-1 text-[13px] font-medium text-accent">
                Target {state.breakInfo.target}
              </p>
            ) : null}
          </div>
        )}
      </header>
      <TestClockStatus />

      <main className="mx-auto max-w-md px-5 py-5">
        {waitingText && live ? (
          <p className="mb-4 rounded-2xl border border-line bg-surface px-4 py-3 text-center text-[13px] text-muted">
            {waitingText}
          </p>
        ) : null}

        {done || !state.canScore ? null : (
          <>
            <Button href={scoreHref} fullWidth size="lg">
              <Pencil className="h-5 w-5" strokeWidth={2.4} />
              Resume scoring
            </Button>
            <p className="mt-2 text-center text-[11px] text-faint">
              You&apos;re watching — nothing here changes the score.
            </p>
          </>
        )}

        <Button
          href={cardHref}
          variant="secondary"
          fullWidth
          className={done ? undefined : "mt-4"}
        >
          <ClipboardList className="h-[18px] w-[18px]" strokeWidth={2.2} />
          Full scorecard
        </Button>

        {state.innings.length > 1 ? (
          <div className="mt-6 rounded-2xl border border-line bg-surface p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-faint">
              Innings
            </p>
            <div className="mt-3 space-y-2">
              {state.innings.map((i) => (
                <div
                  key={i._id}
                  className="tabular flex items-center justify-between gap-3 text-[13px]"
                >
                  <span className="min-w-0 truncate text-muted">
                    {i.battingSide === "A" ? state.sideA.name : state.sideB.name}
                  </span>
                  <span className="shrink-0 font-semibold text-ink">
                    {i.totalRuns}/{i.wickets}
                    <span className="ml-1.5 font-normal text-faint">
                      {i.oversText} ov
                    </span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </main>
      <TestClockOverlays />
    </div>
    </TestClockProvider>
  );
}
