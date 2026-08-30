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

const TABS = ["trophies", "records"] as const;
type Tab = (typeof TABS)[number];
const TAB_LABEL: Record<Tab, string> = {
  trophies: "Trophies",
  records: "Records",
};

function initials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

/** The paper heading over an honours band, and its ink twin over the roasts. */
function ToneHeading({
  children,
  onInk,
}: {
  children: string;
  onInk?: boolean;
}) {
  const Icon = onInk ? Flame : Trophy;
  return (
    <div className="flex items-center gap-1.5 px-1">
      <Icon
        className={cn("h-4 w-4", onInk ? "text-bg/70" : "text-accent-deep")}
        aria-hidden
      />
      <h2
        className={cn(
          "text-xl font-semibold tracking-tight",
          onInk ? "text-bg" : "text-ink",
        )}
      >
        {children}
      </h2>
    </div>
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
 * Two tabs over one scope. Trophies open, because the photograph is why anyone
 * comes here — and with the rows moved off that fold, the twelve exhibits get
 * the page to themselves instead of sharing it. Inside each tab the split is
 * still tone, honour on paper and roast on ink; the "Trophies"/"Records"
 * sub-labels that used to separate the two mediums mid-scroll are gone, since
 * the tab you are standing on already says which one you are reading.
 */
export default function RecordsPage() {
  const { token, activeOrgId } = useAuth();
  const [tab, setTab] = useState<Tab>("trophies");
  // null = not picked yet. Unlike Leaders, that resolves to the most recent
  // season rather than All time: trophies are season-bound, and a community
  // between seasons landing on All time would open a page with no trophies on
  // it at all.
  const [scope, setScope] = useState<Scope | null>(null);

  const seasons = useQuery(
    api.seasons.list,
    token && activeOrgId ? { token, orgId: activeOrgId } : "skip",
  );
  // `seasons` is newest first, so [0] is the season that just ended when none
  // is running.
  const landingSeason = useMemo(
    () => seasons?.find((s) => s.status === "active") ?? seasons?.[0] ?? null,
    [seasons],
  );
  // A stale id (season deleted, org switched) falls back to the landing season
  // rather than asking for a board that is not this community's.
  const selectedSeason = useMemo(() => {
    if (!seasons) return null;
    if (scope === null) return landingSeason;
    if (scope === "all") return null;
    return seasons.find((s) => s._id === scope.seasonId) ?? landingSeason;
  }, [seasons, scope, landingSeason]);

  const seasonArg = selectedSeason ? { seasonId: selectedSeason._id } : {};
  const ready = Boolean(token && activeOrgId) && seasons !== undefined;

  // Trophies are season-bound. They roll — a trophy moves to whoever claims it
  // next season — so an all-time shelf would just freeze the same names, and
  // there is nothing to ask the server for. The records rows still run all time.
  const shelf = useQuery(
    api.stats.shelf,
    ready && selectedSeason
      ? {
          token: token!,
          orgId: activeOrgId!,
          seasonId: selectedSeason._id,
        }
      : "skip",
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

  // `shelf` stays undefined forever on All time because the query is skipped —
  // only wait on it when a season is actually asking for one.
  const loading =
    board === undefined || (selectedSeason !== null && shelf === undefined);

  const tabs = (
    <div className="flex rounded-xl border border-line bg-surface p-1">
      {TABS.map((t) => (
        <button
          key={t}
          type="button"
          onClick={() => setTab(t)}
          aria-current={tab === t}
          className={cn(
            "min-h-11 flex-1 rounded-lg text-[13px] font-semibold transition",
            tab === t ? "bg-ink text-bg" : "text-muted active:bg-line/60",
          )}
        >
          {TAB_LABEL[t]}
        </button>
      ))}
    </div>
  );

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
        below={tabs}
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
      ) : tab === "trophies" ? (
        selectedSeason ? (
          <>
            <main className="mx-auto max-w-md px-5 py-4">
              <ToneHeading>Honours</ToneHeading>
              {heroKind ? (
                <div className="mt-3">
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
            </main>

            {/* The roast band flips the page to ink. Same cards, dark room —
                the register changes with the ground, and it costs no colour
                the bible does not already own. */}
            <section className="mt-2 bg-ink pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-5">
              <div className="mx-auto max-w-md px-5">
                <ToneHeading onInk>The Roast</ToneHeading>
                <div className="mt-3 grid grid-cols-2 gap-3">
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
        ) : (
          // Only two ways to stand here: the reader chose All time, where a
          // rolling trophy has no meaning, or the community has never run a
          // season. Neither gets an explainer, just the fact.
          <main className="mx-auto max-w-md px-5 py-4">
            <EmptyState
              title={
                seasons && seasons.length > 0
                  ? "Trophies belong to a season"
                  : "No seasons yet"
              }
              body={
                seasons && seasons.length > 0
                  ? "Pick a season to see who holds what."
                  : "Trophies start when a season does."
              }
            />
          </main>
        )
      ) : (
        <>
          <main className="mx-auto max-w-md px-5 py-4">
            <ToneHeading>Honours</ToneHeading>
            <div className="mt-3">
              {records.honour.length > 0 ? (
                <RecordRows items={records.honour} />
              ) : (
                <EmptyState
                  title="No records yet"
                  body="Records build up as matches finish."
                />
              )}
            </div>
          </main>

          {records.roast.length > 0 ? (
            <section className="mt-2 bg-ink pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-5">
              <div className="mx-auto max-w-md px-5">
                <ToneHeading onInk>The Roast</ToneHeading>
                <div className="mt-3">
                  <RecordRows items={records.roast} onInk />
                </div>
              </div>
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}
