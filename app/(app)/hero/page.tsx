"use client";

import { useAuth } from "@/components/providers/AuthProvider";
import {
  CARD_HEIGHT,
  CARD_WIDTH,
  ShareCard,
  type HeroShareData,
  type ShareStat,
} from "@/components/share/ShareCard";
import { ShareButton } from "@/components/share/ShareButton";
import { EmptyState } from "@/components/ui/EmptyState";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { dayLabel, groupByDay } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { useQuery } from "convex/react";
import { ArrowLeft } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";

/**
 * "Hero" — one player's flex for one DAY (a day is often several matches),
 * built to be screenshotted and dropped straight into WhatsApp. Everything
 * here is read-model: `hero.heroDay`/`hero.heroDays` replay the ball log at
 * read time, same as the Match Story — no new writes, no schema change.
 *
 * Day bucketing happens here, client-side, on purpose — `hero.heroDays`
 * hands back the raw completed-match list with names already resolved, and
 * this page groups it into calendar days with `groupByDay` (the same helper
 * `home/page.tsx` uses), so local-timezone logic lives in exactly one place.
 */

function initials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

/** Local-midnight bounds for the calendar day a timestamp falls in — the
 * plain-number `dayStart`/`dayEnd` pair `hero.heroDay` takes as args. */
function dayBounds(ts: number) {
  const d = new Date(ts);
  const start = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0).getTime();
  return { dayStart: start, dayEnd: start + 24 * 60 * 60 * 1000 };
}

/** Scales the fixed 1080×1350 ShareCard down to whatever width its
 * container gives it, instead of guessing a viewport size up front — the
 * same card the exported PNG uses, just shown live on screen. */
function PosterPreview({ data }: { data: HeroShareData }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => setScale(el.clientWidth / CARD_WIDTH);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div
      ref={containerRef}
      className="w-full overflow-hidden rounded-[28px] shadow-lift"
      style={{ aspectRatio: `${CARD_WIDTH} / ${CARD_HEIGHT}` }}
    >
      <div
        style={{
          width: CARD_WIDTH,
          height: CARD_HEIGHT,
          transform: `scale(${scale})`,
          transformOrigin: "top left",
        }}
      >
        <ShareCard data={data} />
      </div>
    </div>
  );
}

function HeroPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const preselectPlayerId = searchParams.get("playerId");
  const { token, activeOrgId } = useAuth();

  const days = useQuery(
    api.hero.heroDays,
    token && activeOrgId ? { token, orgId: activeOrgId } : "skip",
  );

  const dayGroups = useMemo(() => {
    if (!days) return [];
    return groupByDay(days, (m) => m.createdAt).map((g) => {
      const { dayStart, dayEnd } = dayBounds(g.items[0].createdAt);
      const players = new Map<string, string>();
      for (const m of g.items) {
        for (const p of m.players) players.set(String(p.id), p.name);
      }
      return {
        key: g.key,
        label: g.label,
        dayStart,
        dayEnd,
        matchCount: g.items.length,
        players: Array.from(players.entries())
          .map(([id, name]) => ({ id: id as Id<"users">, name }))
          .sort((a, b) => a.name.localeCompare(b.name)),
      };
    });
  }, [days]);

  const [dayKey, setDayKey] = useState<string | null>(null);
  const [playerId, setPlayerId] = useState<string | null>(preselectPlayerId);

  // Default to the latest day once it loads; if a playerId came in via the
  // URL but isn't part of that day, fall back to the picker rather than
  // silently ignoring the query param.
  useEffect(() => {
    if (dayKey !== null || dayGroups.length === 0) return;
    const first = dayGroups[0];
    setDayKey(first.key);
    if (preselectPlayerId && !first.players.some((p) => String(p.id) === preselectPlayerId)) {
      setPlayerId(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dayGroups]);

  const activeDay = dayGroups.find((d) => d.key === dayKey) ?? null;

  const hero = useQuery(
    api.hero.heroDay,
    token && activeOrgId && activeDay && playerId
      ? {
          token,
          orgId: activeOrgId,
          playerId: playerId as Id<"users">,
          dayStart: activeDay.dayStart,
          dayEnd: activeDay.dayEnd,
        }
      : "skip",
  );

  const heroData: HeroShareData | null = useMemo(() => {
    if (!hero) return null;
    const n = hero.numbers;
    const stats: ShareStat[] = [{ label: "Matches", value: String(n.matches) }];
    if (n.ballsFaced > 0) {
      stats.push({ label: "Runs", value: String(n.runs), accent: true });
      stats.push({ label: "SR", value: n.strikeRate.toFixed(1) });
    }
    if (n.fours > 0 || n.sixes > 0) {
      stats.push({ label: "4s / 6s", value: `${n.fours}/${n.sixes}` });
    }
    if (n.ballsBowled > 0) {
      stats.push({
        label: "Wickets",
        value: String(n.wickets),
        accent: n.ballsFaced === 0,
      });
      stats.push({ label: "Economy", value: n.economy !== null ? n.economy.toFixed(1) : "—" });
    }
    if (n.catches > 0) {
      stats.push({ label: "Catches", value: String(n.catches) });
    }
    return {
      kind: "hero",
      displayName: hero.displayName,
      initials: initials(hero.displayName),
      dayLabel: dayLabel(hero.dayStart),
      headline: hero.headline,
      matchCount: n.matches,
      insights: hero.insights,
      stats: stats.slice(0, 6),
      miniLines: hero.miniLines.map((m) => ({
        opponent: m.opponent,
        battingFigure: m.battingFigure,
        bowlingFigure: m.bowlingFigure,
        result: m.result,
      })),
    };
  }, [hero]);

  const slug = hero?.displayName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return (
    <div className="min-h-dvh bg-ink pb-[calc(env(safe-area-inset-bottom)+1.5rem)]">
      <header className="flex items-center justify-between px-5 pb-2 pt-[calc(var(--safe-top)+0.5rem)]">
        <button
          type="button"
          aria-label="Back"
          onClick={() => router.back()}
          className="-ml-2 flex h-11 w-11 items-center justify-center rounded-xl text-bg/70 active:bg-white/10"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <p className="text-[13px] font-semibold uppercase tracking-wide text-bg/70">
          Hero
        </p>
        <span className="w-11" />
      </header>

      <main className="mx-auto max-w-md px-5 pb-8 pt-2">
        {/* Day chips */}
        {dayGroups.length > 0 ? (
          <div className="-mx-5 mb-4 flex gap-2 overflow-x-auto px-5 pb-1">
            {dayGroups.map((d) => (
              <button
                key={d.key}
                type="button"
                onClick={() => {
                  setDayKey(d.key);
                  if (!d.players.some((p) => String(p.id) === playerId)) setPlayerId(null);
                }}
                className={cn(
                  "min-h-11 shrink-0 whitespace-nowrap rounded-full px-4 text-[13px] font-semibold",
                  d.key === dayKey
                    ? "bg-accent text-ink"
                    : "border border-white/10 text-bg/70 active:bg-white/10",
                )}
              >
                {d.label}
              </button>
            ))}
          </div>
        ) : null}

        {days === undefined ? (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-14 animate-pulse rounded-2xl bg-white/5" />
            ))}
          </div>
        ) : dayGroups.length === 0 ? (
          <div className="pt-8">
            <EmptyState
              title="No matches yet"
              body="Finish a match and a Hero card shows up here."
            />
          </div>
        ) : !activeDay ? null : !playerId || !heroData ? (
          <>
            <p className="mb-3 px-1 text-[13px] text-bg/70">
              Who had the day? {activeDay.matchCount} match
              {activeDay.matchCount === 1 ? "" : "es"} on {activeDay.label.toLowerCase()}.
            </p>
            <div className="grid grid-cols-3 gap-2.5">
              {activeDay.players.map((p) => (
                <button
                  key={String(p.id)}
                  type="button"
                  onClick={() => setPlayerId(String(p.id))}
                  className="flex flex-col items-center gap-2 rounded-2xl border border-white/10 px-2 py-3.5 text-center active:bg-white/5"
                >
                  <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent/15 text-[15px] font-semibold text-accent">
                    {initials(p.name)}
                  </span>
                  <span className="line-clamp-2 text-[12px] font-medium leading-tight text-bg/80">
                    {p.name}
                  </span>
                </button>
              ))}
            </div>
            {hero === null ? (
              <p className="mt-4 text-center text-[13px] text-bg/70">
                Nothing to show for that pick — try another player.
              </p>
            ) : null}
          </>
        ) : (
          <>
            <PosterPreview data={heroData} />

            <div className="mt-4 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => setPlayerId(null)}
                className="min-h-11 rounded-2xl border border-white/10 px-4 text-[13px] font-semibold text-bg/70 active:bg-white/10"
              >
                Change player
              </button>
              <ShareButton
                data={heroData}
                filename={`gully-hero-${slug || "player"}.png`}
                tone="dark"
                className="h-11 w-11 rounded-2xl border border-white/10"
              />
            </div>
          </>
        )}
      </main>
    </div>
  );
}

export default function HeroPage() {
  return (
    <Suspense fallback={<div className="min-h-dvh bg-ink" />}>
      <HeroPageInner />
    </Suspense>
  );
}
