"use client";

import {
  InningsPane,
  type InningsCard,
  type Scorecard,
} from "@/components/match/InningsPane";
import { MatchStory } from "@/components/match/MatchStory";
import { useAuth } from "@/components/providers/AuthProvider";
import type { MatchShareData } from "@/components/share/ShareCard";
import { ShareButton } from "@/components/share/ShareButton";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { cn } from "@/lib/utils";
import { useQuery } from "convex/react";
import { ArrowLeft, Pencil, Trophy } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

/**
 * Scorecard layout is driven by format:
 *  - limited: the whole match on one screen, both innings stacked.
 *  - test: one innings per screen in a swipeable rail, so each innings — both
 *    teams, batting against bowling — is a single fold with no scroll.
 * The innings pane itself is shared, so the two modes can't drift apart.
 */

function ordinal(n: number) {
  const suffix =
    n % 100 >= 11 && n % 100 <= 13
      ? "th"
      : n % 10 === 1
        ? "st"
        : n % 10 === 2
          ? "nd"
          : n % 10 === 3
            ? "rd"
            : "th";
  return `${n}${suffix}`;
}

/** "1st innings" — per side in a Test, chronological in a limited match. */
function inningsLabel(card: Scorecard, inn: InningsCard) {
  if (card.format !== "test") return `${ordinal(inn.inningsNo)} innings`;
  const idx = card.innings
    .filter((i) => i.battingSide === inn.battingSide)
    .findIndex((i) => i.inningsNo === inn.inningsNo);
  return `${ordinal(idx + 1)} innings`;
}

/** "142/7" — or "220/9 & 140/3" once a side has batted twice. */
function sideScore(card: Scorecard, side: "A" | "B") {
  const mine = card.innings.filter((i) => i.battingSide === side);
  if (mine.length === 0) return null;
  return mine.map((i) => `${i.totalRuns}/${i.wickets}`).join(" & ");
}

/**
 * Tabs are quarter-width on a phone, so "Team Rohit 1st" truncates to noise.
 * Side names are usually "Team {captain}" — drop the prefix and keep the name
 * that actually distinguishes them.
 */
function shortSide(name: string) {
  return name.replace(/^team\s+/i, "").trim() || name;
}

function sideOvers(card: Scorecard, side: "A" | "B") {
  const mine = card.innings.filter((i) => i.battingSide === side);
  if (mine.length !== 1) return null;
  return mine[0].oversText;
}

/** "142/7 (16.4)" for the share card — same figures as the header, folded
 * into one string since the card renders a single score per team. */
function shareScore(card: Scorecard, side: "A" | "B") {
  const score = sideScore(card, side);
  if (score === null) return "—";
  const overs = sideOvers(card, side);
  return overs ? `${score} (${overs})` : score;
}

export default function MatchDetailPage() {
  const params = useParams();
  const matchId = params.id as Id<"matches">;
  const { token } = useAuth();
  const card = useQuery(
    api.scoring.scorecard,
    token ? { token, matchId } : "skip",
  );
  // The story only exists for completed matches; the query returns null for
  // anything else, so gating on card.status just avoids a wasted round trip.
  const story = useQuery(
    api.story.matchStory,
    token && card?.status === "completed" ? { token, matchId } : "skip",
  );
  const [view, setView] = useState<"story" | "scorecard">("story");

  if (card === undefined) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-bg">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-line border-t-accent" />
      </div>
    );
  }
  if (card === null) {
    return (
      <div className="px-5 py-8">
        <EmptyState title="Match not found" />
      </div>
    );
  }

  const inPlay = card.status === "live" || card.status === "scheduled";
  const abandoned = card.status === "abandoned";
  const isTest = card.format === "test";
  const completed = card.status === "completed";

  // Chronological: whoever batted first leads the header, so the two rows read
  // as the match unfolded rather than as an arbitrary A-then-B list.
  const order: Array<"A" | "B"> =
    card.innings[0]?.battingSide === "B" ? ["B", "A"] : ["A", "B"];

  const potmBadge = story?.badges.find((b) => b.key === "potm");
  const shareData: MatchShareData = {
    kind: "match",
    teamA: { name: card.sideA.name, score: shareScore(card, "A") },
    teamB: { name: card.sideB.name, score: shareScore(card, "B") },
    winner: card.winnerSide ?? null,
    resultText: card.resultText ?? null,
    format: card.format ?? "limited",
    potm: potmBadge
      ? { name: potmBadge.playerName, line: potmBadge.stat }
      : null,
  };

  return (
    <div className="min-h-dvh bg-bg pb-2">
      <header className="bg-ink px-4 pb-4 pt-[calc(var(--safe-top)+0.5rem)] text-bg">
        <div className="mx-auto max-w-md">
          <div className="flex items-center justify-between gap-2">
            <Link
              href="/home"
              aria-label="Back"
              className="-ml-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-bg/70 active:bg-white/10"
            >
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <div className="flex shrink-0 items-center gap-1.5">
              {card.status === "live" ? (
                <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-accent/20 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-accent">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />
                  Live
                </span>
              ) : (
                <span className="shrink-0 rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-bg/70">
                  {abandoned
                    ? "Abandoned"
                    : card.status === "scheduled"
                      ? "Not started"
                      : isTest
                        ? "Test"
                        : "Result"}
                </span>
              )}
              {completed ? (
                <ShareButton
                  data={shareData}
                  filename={`gully-match-${matchId}.png`}
                  tone="dark"
                />
              ) : null}
            </div>
          </div>

          {/* The whole match in two rows: each side's total(s), winner lit. */}
          <div className="mt-2 space-y-1">
            {order.map((side) => {
              const name = side === "A" ? card.sideA.name : card.sideB.name;
              const score = sideScore(card, side);
              const overs = sideOvers(card, side);
              const won = card.winnerSide === side;
              const lost =
                card.winnerSide !== undefined && card.winnerSide !== side;
              return (
                <div
                  key={side}
                  className="flex items-baseline justify-between gap-3"
                >
                  <span
                    className={cn(
                      "flex min-w-0 items-center gap-1.5 text-[15px] font-semibold",
                      lost ? "text-bg/70" : "text-bg",
                    )}
                  >
                    {won ? (
                      <Trophy className="h-3.5 w-3.5 shrink-0 text-accent" />
                    ) : null}
                    <span className="min-w-0" title={name}>
                      <span className="line-clamp-2 [overflow-wrap:anywhere]">
                        {name}
                      </span>
                    </span>
                  </span>
                  <span
                    className={cn(
                      "tabular shrink-0 text-2xl font-semibold",
                      score === null || lost ? "text-bg/70" : "text-bg",
                    )}
                  >
                    {score ?? "—"}
                    {overs ? (
                      <span className="ml-1 text-[11px] font-normal text-bg/70">
                        ({overs})
                      </span>
                    ) : null}
                  </span>
                </div>
              );
            })}
          </div>

          {card.resultText ? (
            <p
              className={cn(
                "mt-2.5 border-t border-white/10 pt-2.5 text-[13px] font-medium leading-snug",
                card.winnerSide ? "text-accent" : "text-bg/70",
              )}
            >
              {card.resultText}
            </p>
          ) : abandoned ? (
            <p className="mt-2.5 border-t border-white/10 pt-2.5 text-[13px] font-medium text-bg/70">
              Ended without a result
            </p>
          ) : null}
        </div>
      </header>

      <main className="py-3">
        {inPlay ? (
          <div className="mx-auto mb-3 max-w-md px-4">
            <Button href={`/matches/${matchId}/score`} fullWidth>
              <Pencil className="h-[18px] w-[18px]" strokeWidth={2.4} />
              {card.status === "live" ? "Continue scoring" : "Start match"}
            </Button>
          </div>
        ) : null}

        {/* Completed matches open on the story — the "what happened" page —
            with the full scorecard one tap away. */}
        {story ? (
          <div className="mx-auto mb-3 max-w-md px-4">
            <div className="flex gap-1.5 rounded-2xl border border-line bg-surface p-1">
              {(["story", "scorecard"] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setView(tab)}
                  aria-current={view === tab}
                  className={cn(
                    "flex min-h-11 flex-1 items-center justify-center rounded-xl px-2 text-[13px] font-semibold capitalize transition",
                    view === tab
                      ? "bg-ink text-bg"
                      : "text-muted active:bg-line/60",
                  )}
                >
                  {tab}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {story && view === "story" ? (
          <div className="mx-auto max-w-md px-4">
            <MatchStory story={story} />
          </div>
        ) : card.innings.length === 0 ? (
          <div className="px-4">
            <EmptyState title="No play yet" />
          </div>
        ) : isTest && card.innings.length > 1 ? (
          <InningsRail card={card} />
        ) : (
          <div className="mx-auto max-w-md space-y-3 px-4">
            {card.innings.map((inn) => (
              <InningsPane
                key={inn.inningsNo}
                inn={inn}
                card={card}
                label={inningsLabel(card, inn)}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

/**
 * Test innings as a snap rail: tabs drive it, and a thumb swipe does the same
 * thing natively. One innings fills the viewport, so nothing scrolls
 * vertically to read a complete innings.
 */
function InningsRail({ card }: { card: Scorecard }) {
  const railRef = useRef<HTMLDivElement>(null);
  // Open on the live innings — that's what anyone picking up the phone wants —
  // and on the most recent one for a finished match.
  const liveIdx = card.innings.findIndex((i) => i.status === "in_progress");
  const startAt = liveIdx >= 0 ? liveIdx : card.innings.length - 1;
  const [active, setActive] = useState(startAt);

  useEffect(() => {
    const el = railRef.current;
    if (!el) return;
    el.scrollLeft = startAt * el.clientWidth;
    setActive(startAt);
    // Only re-anchor when the innings count changes (a new innings began);
    // re-running on every render would fight the user's own swipe.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [card.innings.length]);

  const goTo = (i: number) => {
    const el = railRef.current;
    if (!el) return;
    el.scrollTo({ left: i * el.clientWidth, behavior: "smooth" });
    setActive(i);
  };

  return (
    <div>
      <div className="mx-auto max-w-md px-4">
        <div className="flex gap-1.5 rounded-2xl border border-line bg-surface p-1">
          {card.innings.map((inn, i) => {
            const sameSide = card.innings.filter(
              (x) => x.battingSide === inn.battingSide,
            );
            const nth =
              sameSide.findIndex((x) => x.inningsNo === inn.inningsNo) + 1;
            return (
              <button
                key={inn.inningsNo}
                type="button"
                onClick={() => goTo(i)}
                aria-current={active === i}
                className={cn(
                  "flex min-h-11 min-w-0 flex-1 flex-col items-center justify-center rounded-xl px-1 text-center transition",
                  active === i ? "bg-ink text-bg" : "text-muted active:bg-line/60",
                )}
              >
                <span className="block truncate text-[11px] font-semibold uppercase tracking-wide opacity-70">
                  {shortSide(inn.battingTeamName)} {nth === 2 ? "2nd" : "1st"}
                </span>
                <span className="tabular block truncate text-[13px] font-semibold">
                  {inn.totalRuns}/{inn.wickets}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div
        ref={railRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          const i = Math.round(el.scrollLeft / el.clientWidth);
          if (i !== active) setActive(i);
        }}
        className="no-scrollbar mt-3 flex snap-x snap-mandatory overflow-x-auto"
      >
        {card.innings.map((inn) => (
          <div
            key={inn.inningsNo}
            className="w-full shrink-0 snap-center px-4"
          >
            <div className="mx-auto max-w-md">
              <InningsPane
                inn={inn}
                card={card}
                label={inningsLabel(card, inn)}
              />
            </div>
          </div>
        ))}
      </div>

      <div className="mt-3 flex justify-center gap-1.5">
        {card.innings.map((inn, i) => (
          <span
            key={inn.inningsNo}
            className={cn(
              "h-1.5 rounded-full transition-all",
              active === i ? "w-4 bg-ink" : "w-1.5 bg-line",
            )}
          />
        ))}
      </div>
    </div>
  );
}
