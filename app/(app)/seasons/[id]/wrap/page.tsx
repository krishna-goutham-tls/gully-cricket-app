"use client";

import { useAuth } from "@/components/providers/AuthProvider";
import { PosterPreview } from "@/components/share/PosterPreview";
import { ShareButton } from "@/components/share/ShareButton";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";
import { buildRecords } from "@/components/leaderboard/records";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { buildSeasonCards } from "@/lib/seasonWrap";
import { cn } from "@/lib/utils";
import { useQuery } from "convex/react";
import { ArrowLeft } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";

export default function SeasonWrapPage() {
  const { id } = useParams<{ id: string }>();
  const seasonId = id as Id<"seasons">;
  const router = useRouter();
  const { token, activeOrgId } = useAuth();
  const railRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);

  const season = useQuery(
    api.seasons.get,
    token && activeOrgId ? { token, orgId: activeOrgId, seasonId } : "skip",
  );
  const board = useQuery(
    api.stats.leaderboard,
    token && activeOrgId && season
      ? {
          token,
          orgId: activeOrgId,
          includeVisitorsAndJuniors: false,
          seasonId: season._id,
        }
      : "skip",
  );

  const cards = useMemo(() => {
    if (!season || season.status !== "complete" || !board) return [];
    const records = buildRecords(board, { season: true });
    const sixes = board.batting.reduce((n, r) => n + r.sixes, 0);
    const wickets = board.bowling.reduce((n, r) => n + r.wickets, 0);
    return buildSeasonCards({
      seasonName: season.name,
      startedAt: season.startedAt,
      endedAt: season.endedAt ?? season.startedAt,
      matchCount: board.matchCount,
      awards: (season.awards ?? []).map((a) => ({
        kind: a.kind,
        displayName: a.displayName,
        display: a.display,
      })),
      records,
      sixes,
      wickets,
    });
  }, [season, board]);

  const card = cards[active] ?? null;

  function goTo(i: number) {
    const el = railRef.current;
    if (!el) return;
    el.scrollTo({ left: i * el.clientWidth, behavior: "smooth" });
    setActive(i);
  }

  if (season === undefined || (season && season.status === "complete" && board === undefined)) {
    return <div className="min-h-dvh bg-ink" />;
  }

  if (season === null) {
    return (
      <div className="min-h-dvh bg-bg px-5 pt-[calc(var(--safe-top)+1rem)]">
        <EmptyState title="Season not found" />
      </div>
    );
  }

  if (season.status !== "complete") {
    return (
      <div className="min-h-dvh bg-bg px-5 pt-[calc(var(--safe-top)+1rem)]">
        <EmptyState
          title="This season is still open"
          body="The wrap shows up after you end it."
          action={
            <Button href={`/seasons/${season._id}`}>Open the season</Button>
          }
        />
      </div>
    );
  }

  const slug = season.name.toLowerCase().replace(/[^a-z0-9]+/g, "-");

  return (
    <div className="flex min-h-dvh flex-col bg-ink pb-[calc(env(safe-area-inset-bottom)+1.5rem)]">
      <header className="flex items-center justify-between px-5 pb-2 pt-[calc(var(--safe-top)+0.5rem)]">
        <button
          type="button"
          aria-label="Back"
          onClick={() => router.push(`/seasons/${season._id}`)}
          className="-ml-2 flex h-11 w-11 items-center justify-center rounded-lg text-bg/70 active:bg-white/10"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <p className="text-[13px] font-semibold uppercase tracking-wide text-bg/70">
          {season.name}
        </p>
        <span className="w-11" />
      </header>

      {cards.length === 0 ? (
        <div className="px-5 pt-8">
          <EmptyState
            title="Nothing to wrap yet"
            body="Play a match in this season, then end it again."
          />
        </div>
      ) : (
        <>
          <div
            ref={railRef}
            onScroll={(e) => {
              const el = e.currentTarget;
              const i = Math.round(el.scrollLeft / el.clientWidth);
              if (i !== active) setActive(i);
            }}
            className="no-scrollbar flex flex-1 snap-x snap-mandatory overflow-x-auto"
          >
            {cards.map((c, i) => (
              <div
                key={`${c.kicker}-${c.headline}-${i}`}
                className="w-full shrink-0 snap-center px-5"
              >
                <PosterPreview data={c} />
              </div>
            ))}
          </div>

          <div className="mx-auto mt-4 flex max-w-md items-center justify-center gap-1.5 px-5">
            {cards.map((c, i) => (
              <button
                key={`dot-${c.kicker}-${i}`}
                type="button"
                aria-label={`Card ${i + 1}`}
                onClick={() => goTo(i)}
                className={cn(
                  "h-1.5 rounded-full transition-all",
                  i === active ? "w-4 bg-accent" : "w-1.5 bg-white/20",
                )}
              />
            ))}
          </div>

          <div className="mx-auto mt-4 w-full max-w-md px-5">
            {card ? (
              <ShareButton
                data={card}
                filename={`gully-${slug}-${active + 1}.png`}
                tone="dark"
                label="Share"
                className="w-full"
              />
            ) : null}
            <p className="mt-2 text-center text-[13px] text-bg/70">
              {active + 1} of {cards.length}
              {card ? ` · ${card.kicker}` : ""}
            </p>
          </div>
        </>
      )}
    </div>
  );
}
