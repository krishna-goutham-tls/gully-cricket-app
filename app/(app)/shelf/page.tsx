"use client";

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
import { useQuery } from "convex/react";
import { useMemo, useState } from "react";

/**
 * The shelf's own order, honours then roasts. It mirrors `SHELF` in
 * `convex/lib/awards.ts` because the page has to draw the empty slots too —
 * the query returns only awards somebody won, and an unclaimed trophy is
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

export default function ShelfPage() {
  const { token, activeOrgId } = useAuth();
  // null = not chosen yet, which resolves to the live season when one is
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
  // rather than asking for a shelf that is not this community's.
  const selectedSeason = useMemo(() => {
    if (!seasons) return null;
    if (scope === null) return currentSeason;
    if (scope === "all") return null;
    return seasons.find((s) => s._id === scope.seasonId) ?? currentSeason;
  }, [seasons, scope, currentSeason]);

  const data = useQuery(
    api.stats.shelf,
    token && activeOrgId && seasons !== undefined
      ? {
          token,
          orgId: activeOrgId,
          ...(selectedSeason ? { seasonId: selectedSeason._id } : {}),
        }
      : "skip",
  );

  const scopeLabel = selectedSeason ? selectedSeason.name : "All time";

  const byKind = useMemo(() => {
    const map = new Map<string, ShelfCardAward>();
    for (const a of data?.awards ?? []) {
      map.set(a.kind, {
        kind: a.kind,
        userId: String(a.userId),
        displayName: a.displayName,
        display: a.display,
        tiedWith: a.tiedWith.map((t) => ({ displayName: t.displayName })),
      });
    }
    return map;
  }, [data]);

  // The opener is the first honour anybody actually holds — on a shelf where
  // nothing is won yet there is nothing to promote, and the grid carries all
  // nine empty slots instead.
  const heroKind = HONOURS.find((k) => byKind.has(k)) ?? null;
  const gridHonours = HONOURS.filter((k) => k !== heroKind);

  const loading = data === undefined;

  return (
    <div>
      <AppHeader
        title="Shelf"
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
      ) : data === null ? (
        <main className="mx-auto max-w-md px-5 py-4">
          <EmptyState
            title="Shelf unavailable"
            body="Sign in to this community to see its trophies."
          />
        </main>
      ) : (
        <>
          <main className="mx-auto max-w-md px-5 py-4">
            <p className="px-1 pb-2 text-[11px] font-semibold uppercase tracking-wide text-faint">
              Honours
            </p>

            {heroKind ? (
              <TrophyHeroCard
                award={byKind.get(heroKind)!}
                scopeLabel={scopeLabel}
                tone="honor"
              />
            ) : null}

            <div className={heroKind ? "mt-3 grid grid-cols-2 gap-3" : "grid grid-cols-2 gap-3"}>
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
          </main>

          {/* The roast band flips the page to ink. Same cards, dark room —
              the register changes with the ground, and it costs no colour
              the bible does not already own. */}
          <section className="mt-2 bg-ink pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-5">
            <div className="mx-auto max-w-md px-5">
              <h2 className="text-xl font-semibold tracking-tight text-bg">
                Nobody wanted these
              </h2>
              <p className="mt-1 text-[13px] leading-snug text-bg/70">
                Five matches minimum. You have to turn up to earn one.
              </p>

              <div className="mt-4 grid grid-cols-2 gap-3">
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
            </div>
          </section>
        </>
      )}
    </div>
  );
}
