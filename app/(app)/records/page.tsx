"use client";

import {
  TROPHY_OWNED_RECORDS,
  buildRecords,
  type FeatRecord,
} from "@/components/leaderboard/records";
import { useAuth } from "@/components/providers/AuthProvider";
import {
  SeasonScopeMenu,
  type Scope,
} from "@/components/shelf/SeasonScopeMenu";
import {
  TrophyEmptySlot,
  TrophyGridCard,
  TrophyHeroCard,
  type ShelfCardAward,
} from "@/components/shelf/TrophyCard";
import { AppHeader } from "@/components/shell/AppHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { api } from "@/convex/_generated/api";
import { cn } from "@/lib/utils";
import { useQuery } from "convex/react";
import { Flame, Trophy } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

/**
 * Honours then roasts, in the shelf's own order. It mirrors `SHELF` in
 * `convex/lib/awards.ts` because this page has to draw the empty slots too —
 * the query returns only awards somebody holds, and an unclaimed trophy is
 * exactly the thing a player with none needs to see.
 */
const HONOURS = [
  "run_machine",
  "six_machine",
  "boundary_king",
  "the_anchor",
  "nudger",
  "wicket_taker",
  "workhorse",
  "the_miser",
  "safe_hands",
] as const;

const ROASTS = ["dot_magnet", "duck_collector", "butterfingers"] as const;

function initials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

/** 11px caps, on paper or on the roast band's ink. */
function SubLabel({ children, onInk }: { children: string; onInk?: boolean }) {
  return (
    <p
      className={cn(
        "px-1 text-[11px] font-semibold uppercase tracking-wide",
        onInk ? "text-bg/70" : "text-faint",
      )}
    >
      {children}
    </p>
  );
}

/**
 * The long tail: a feat with no photograph behind it. Rows, never images —
 * the difference in weight between this and a trophy card is the whole way a
 * reader learns that one is a thing you send and the other a number you hold.
 */
function RecordRows({
  items,
  onInk,
}: {
  items: FeatRecord[];
  onInk?: boolean;
}) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-2xl border",
        onInk
          ? "border-white/10 bg-white/[0.06]"
          : "border-line bg-surface shadow-card",
      )}
    >
      {items.map((it) => (
        <Link
          key={it.label}
          href={`/players/${it.holderId}`}
          className={cn(
            "flex min-h-12 items-center gap-3 border-b px-3.5 py-3 last:border-b-0",
            onInk
              ? "border-white/10 active:bg-white/10"
              : "border-line/60 active:bg-bg",
          )}
        >
          <span
            className={cn(
              "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-[13px] font-bold",
              onInk ? "bg-white/10 text-bg" : "bg-accent-soft text-accent-deep",
            )}
          >
            {initials(it.holder)}
          </span>
          <div className="min-w-0 flex-1">
            <p
              className={cn(
                "text-[15px] font-semibold leading-tight",
                onInk ? "text-bg" : "text-ink",
              )}
            >
              {it.label}
            </p>
            <p
              className={cn(
                "truncate text-[13px] leading-tight",
                onInk ? "text-bg/70" : "text-muted",
              )}
              title={it.holder}
            >
              {it.holder}
            </p>
          </div>
          <p
            className={cn(
              "tabular shrink-0 text-2xl font-semibold leading-none",
              onInk ? "text-bg" : "text-ink",
            )}
          >
            {it.value}
          </p>
        </Link>
      ))}
    </div>
  );
}

/**
 * One page for everything the community argues about. Trophies first because
 * they are photographs somebody can paste into the group; records under them
 * because they are the same idea without a picture. The split that matters is
 * honour versus roast, not trophy versus record — so tone is the top level and
 * the two mediums sit inside it under one scope.
 */
export default function RecordsPage() {
  const { token, activeOrgId } = useAuth();
  // null = not picked yet, which resolves to the live season when one is
  // running and All time otherwise — the same default Leaders uses.
  const [scope, setScope] = useState<Scope | null>(null);

  const seasons = useQuery(
    api.seasons.list,
    token && activeOrgId ? { token, orgId: activeOrgId } : "skip",
  );
  const currentSeason = useMemo(
    () => seasons?.find((s) => s.status === "active") ?? null,
    [seasons],
  );
  // A stale id (season deleted, org switched) falls back to the live season
  // rather than asking for a board that is not this community's.
  const selectedSeason = useMemo(() => {
    if (!seasons) return null;
    if (scope === null) return currentSeason;
    if (scope === "all") return null;
    return seasons.find((s) => s._id === scope.seasonId) ?? currentSeason;
  }, [seasons, scope, currentSeason]);

  const seasonArg = selectedSeason ? { seasonId: selectedSeason._id } : {};
  const ready = Boolean(token && activeOrgId) && seasons !== undefined;

  const shelf = useQuery(
    api.stats.shelf,
    ready ? { token: token!, orgId: activeOrgId!, ...seasonArg } : "skip",
  );
  const board = useQuery(
    api.stats.leaderboard,
    ready ? { token: token!, orgId: activeOrgId!, ...seasonArg } : "skip",
  );

  const scopeLabel = selectedSeason ? selectedSeason.name : "All time";

  const byKind = useMemo(() => {
    const map = new Map<string, ShelfCardAward>();
    for (const a of shelf?.awards ?? []) {
      map.set(a.kind, {
        kind: a.kind,
        userId: String(a.userId),
        displayName: a.displayName,
        display: a.display,
        tiedWith: a.tiedWith.map((t) => ({ displayName: t.displayName })),
      });
    }
    return map;
  }, [shelf]);

  // Every record a trophy already says is dropped here, not in `buildRecords`
  // — the season wrap reads the same builder and still wants the full book.
  const records = useMemo(() => {
    const groups = board
      ? buildRecords(board, { season: Boolean(selectedSeason) })
      : [];
    const pick = (tone: "honour" | "roast") =>
      (groups.find((g) => g.tone === tone)?.items ?? []).filter(
        (it) => !TROPHY_OWNED_RECORDS.has(it.label),
      );
    return { honour: pick("honour"), roast: pick("roast") };
  }, [board, selectedSeason]);

  // The opener is the first honour anybody actually holds — with nothing won
  // there is nothing to promote, and the grid carries all nine empty slots.
  const heroKind = HONOURS.find((k) => byKind.has(k)) ?? null;
  const gridHonours = HONOURS.filter((k) => k !== heroKind);

  const loading = shelf === undefined || board === undefined;

  return (
    <div>
      <AppHeader
        title="Records"
        subtitle={
          seasons && seasons.length > 0 ? (
            <SeasonScopeMenu
              seasons={seasons}
              selected={selectedSeason}
              onSelect={setScope}
            />
          ) : undefined
        }
      />

      {loading ? (
        <main className="mx-auto max-w-md space-y-3 px-5 py-4">
          <div className="h-64 animate-pulse rounded-2xl bg-line" />
          <div className="grid grid-cols-2 gap-3">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-44 animate-pulse rounded-2xl bg-line" />
            ))}
          </div>
        </main>
      ) : shelf === null || board === null ? (
        <main className="mx-auto max-w-md px-5 py-4">
          <EmptyState
            title="Records unavailable"
            body="Sign in to this community to see its trophies."
          />
        </main>
      ) : (
        <>
          <main className="mx-auto max-w-md px-5 py-4">
            <div className="flex items-center gap-1.5 px-1">
              <Trophy className="h-4 w-4 text-accent-deep" aria-hidden />
              <h2 className="text-xl font-semibold tracking-tight text-ink">
                Honours
              </h2>
            </div>

            <div className="mt-3">
              <SubLabel>Trophies</SubLabel>
            </div>
            {heroKind ? (
              <div className="mt-2">
                <TrophyHeroCard
                  award={byKind.get(heroKind)!}
                  scopeLabel={scopeLabel}
                  tone="honor"
                />
              </div>
            ) : null}
            <div className="mt-3 grid grid-cols-2 gap-3">
              {gridHonours.map((kind) => {
                const won = byKind.get(kind);
                return won ? (
                  <TrophyGridCard
                    key={kind}
                    award={won}
                    scopeLabel={scopeLabel}
                    tone="honor"
                  />
                ) : (
                  <TrophyEmptySlot key={kind} kind={kind} tone="honor" />
                );
              })}
            </div>

            {records.honour.length > 0 ? (
              <>
                <div className="mt-6">
                  <SubLabel>Records</SubLabel>
                </div>
                <div className="mt-2">
                  <RecordRows items={records.honour} />
                </div>
              </>
            ) : null}
          </main>

          {/* The roast band flips the page to ink. Same cards, same rows, dark
              room — the register changes with the ground, and it costs no
              colour the bible does not already own. */}
          <section className="mt-2 bg-ink pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-5">
            <div className="mx-auto max-w-md px-5">
              <div className="flex items-center gap-1.5 px-1">
                <Flame className="h-4 w-4 text-bg/70" aria-hidden />
                <h2 className="text-xl font-semibold tracking-tight text-bg">
                  The Roast
                </h2>
              </div>

              <div className="mt-3">
                <SubLabel onInk>Trophies</SubLabel>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-3">
                {ROASTS.map((kind) => {
                  const won = byKind.get(kind);
                  return won ? (
                    <TrophyGridCard
                      key={kind}
                      award={won}
                      scopeLabel={scopeLabel}
                      tone="roast"
                    />
                  ) : (
                    <TrophyEmptySlot key={kind} kind={kind} tone="roast" />
                  );
                })}
              </div>

              {records.roast.length > 0 ? (
                <>
                  <div className="mt-6">
                    <SubLabel onInk>Records</SubLabel>
                  </div>
                  <div className="mt-2">
                    <RecordRows items={records.roast} onInk />
                  </div>
                </>
              ) : null}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
