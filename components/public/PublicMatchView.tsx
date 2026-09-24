"use client";

import { OverTracker } from "@/components/match/OverTracker";
import { useAuth } from "@/components/providers/AuthProvider";
import { PublicFooter, PublicMark } from "@/components/public/PublicChrome";
import { EmptyState } from "@/components/ui/EmptyState";
import { api } from "@/convex/_generated/api";
import { matchBoardLabel, matchBoardLine } from "@/lib/matchBoard";
import { cn } from "@/lib/utils";
import { useQuery } from "convex/react";

/**
 * The watch page for people with no login: same scoreboard, fed by
 * publicView.match, which carries names and the score and nothing else.
 * Live over the same WebSocket as the app. Imports no mutation.
 */
export function PublicMatchView({ matchId }: { matchId: string }) {
  const { token } = useAuth();
  const state = useQuery(api.publicView.match, { matchId });

  if (state === undefined) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-bg">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-line border-t-accent" />
      </div>
    );
  }
  if (state === null) {
    return (
      <div className="min-h-dvh bg-bg px-5 pb-[calc(2rem+env(safe-area-inset-bottom))] pt-[calc(var(--safe-top)+1rem)]">
        <PublicMark tone="light" />
        <div className="mt-6">
          <EmptyState
            title="Match not found"
            body="The link may be cut short, or the match was deleted."
          />
        </div>
      </div>
    );
  }

  const done = state.phase === "completed";
  const live = state.live;
  const isTest = state.inningsPerSide === 2;
  const battingName =
    live?.battingSide === "A" ? state.sideA.name : state.sideB.name;
  const board = live
    ? matchBoardLine({
        inningsPerSide: state.inningsPerSide,
        innings: state.innings,
        live,
      })
    : null;

  const waitingText = (() => {
    switch (state.phase) {
      case "not_started":
        return "Not started yet";
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
    <div className="min-h-dvh bg-bg">
      <header className="bg-ink px-4 pb-6 pt-[calc(var(--safe-top)+1rem)] text-bg">
        <div className="flex items-center justify-between gap-2">
          <PublicMark tone="dark" />
          {state.groundName ? (
            <span
              className="min-w-0 flex-1 truncate text-center text-[13px] text-bg/70"
              title={state.groundName}
            >
              At {state.groundName}
            </span>
          ) : null}
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
        </div>

        <p className="mt-3 text-center text-[13px] font-medium text-bg/70">
          {live
            ? `Innings ${live.inningsNo}${isTest ? " of 4" : ""} · ${battingName}`
            : `${state.sideA.name} vs ${state.sideB.name}`}
        </p>

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
                  {live.ballsLeft !== undefined
                    ? ` off ${live.ballsLeft}`
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
                state.solo ? "grid-cols-2" : "grid-cols-3",
              )}
            >
              <div className="rounded-2xl bg-accent/20 px-2 py-2 ring-1 ring-accent/60">
                <p className="font-semibold uppercase tracking-wide text-accent">
                  {state.solo ? "Batting" : "On strike"}
                </p>
                <p
                  className="mt-0.5 line-clamp-2 text-[15px] font-semibold text-bg [overflow-wrap:anywhere]"
                  title={live.striker ?? undefined}
                >
                  {live.striker ?? "—"}
                  {state.solo ? null : <span className="text-accent">*</span>}
                </p>
                {live.figures.striker ? (
                  <p className="tabular mt-0.5 text-[13px] text-bg/70">
                    {live.figures.striker.runs}({live.figures.striker.balls})
                  </p>
                ) : null}
              </div>
              {state.solo ? null : (
                <div className="rounded-2xl bg-white/[0.05] px-2 py-2">
                  <p className="font-semibold uppercase tracking-wide text-bg/70">
                    Non-striker
                  </p>
                  <p
                    className="mt-0.5 line-clamp-2 text-[15px] font-semibold text-bg/70 [overflow-wrap:anywhere]"
                    title={live.nonStriker ?? undefined}
                  >
                    {live.nonStriker ?? "—"}
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
                  title={live.bowler ?? undefined}
                >
                  {live.bowler ?? "—"}
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
              ballsPerOver={state.ballsPerOver}
            />
          </>
        ) : (
          <div className="mt-6 text-center">
            <p className="text-xl font-semibold text-bg">
              {done
                ? (state.resultText ??
                  (state.status === "abandoned"
                    ? "Ended without a result"
                    : "No result"))
                : waitingText}
            </p>
            {!done && state.breakInfo?.target != null ? (
              <p className="tabular mt-1.5 inline-block rounded-full bg-accent/15 px-3 py-1 text-[13px] font-medium text-accent">
                Target {state.breakInfo.target}
              </p>
            ) : null}
          </div>
        )}
      </header>

      <main className="mx-auto max-w-md px-5 pb-[calc(2rem+env(safe-area-inset-bottom))] pt-5">
        {waitingText && live ? (
          <p className="mb-4 rounded-2xl border border-line bg-surface px-4 py-3 text-center text-[13px] text-muted">
            {waitingText}
          </p>
        ) : null}

        {state.innings.length > (live ? 1 : 0) ? (
          <div className="mb-5 rounded-2xl border border-line bg-surface p-4 shadow-card">
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

        <PublicFooter
          signedIn={!!token}
          appHref={`/matches/${matchId}/watch`}
          appLabel="Open in Gully Cricket"
        />
      </main>
    </div>
  );
}
