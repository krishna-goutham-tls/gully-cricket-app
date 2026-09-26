"use client";

import {
  buildRecords,
  type FeatRecord,
  type RecordGroup,
} from "@/components/leaderboard/records";
import {
  GroundChips,
  usePlayableGrounds,
} from "@/components/ground/GroundChips";
import { useAuth } from "@/components/providers/AuthProvider";
import {
  SeasonScopeMenu,
  type Scope,
} from "@/components/shelf/SeasonScopeMenu";
import { AppHeader } from "@/components/shell/AppHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { cn } from "@/lib/utils";
import { useQuery } from "convex/react";
import Link from "next/link";
import { useMemo, useState } from "react";

const TABS = ["honour", "roast"] as const;
type Tab = (typeof TABS)[number];
const TAB_LABEL: Record<Tab, string> = {
  honour: "Honours",
  roast: "The Roast",
};

function initials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

/** One discipline: a small label, then its rows in one card. */
function RecordSection({
  group,
  onInk,
}: {
  group: RecordGroup;
  onInk?: boolean;
}) {
  return (
    <section>
      <h2
        className={cn(
          "px-1 text-[13px] font-semibold uppercase tracking-wide",
          onInk ? "text-bg/70" : "text-muted",
        )}
      >
        {group.title}
      </h2>
      <div className="mt-2">
        <RecordRows items={group.items} onInk={onInk} />
      </div>
    </section>
  );
}

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
      {items.map((it) => {
        const row = cn(
          "flex min-h-12 items-center gap-3 border-b px-3.5 py-3 last:border-b-0",
          onInk ? "border-white/10" : "border-line/60",
        );
        const who = it.detail ? `${it.holder} · ${it.detail}` : it.holder;
        const body = (
          <>
            <span
              className={cn(
                "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-[13px] font-bold",
                onInk
                  ? "bg-white/10 text-bg"
                  : "bg-accent-soft text-accent-deep",
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
                title={who}
              >
                {who}
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
          </>
        );
        // A team holds a record too, but has no profile to open.
        return it.holderId ? (
          <Link
            key={it.label}
            href={`/players/${it.holderId}`}
            className={cn(row, onInk ? "active:bg-white/10" : "active:bg-bg")}
          >
            {body}
          </Link>
        ) : (
          <div key={it.label} className={row}>
            {body}
          </div>
        );
      })}
    </div>
  );
}

/**
 * Two tabs over one scope: Honours on paper, The Roast on ink. Each tab is
 * the record book for that tone, split by discipline. Scope works like
 * Leaders — the live season when one is running, else All time.
 */
export default function RecordsPage() {
  const { token, activeOrgId } = useAuth();
  const [tab, setTab] = useState<Tab>("honour");
  const [scope, setScope] = useState<Scope | null>(null);

  const seasons = useQuery(
    api.seasons.list,
    token && activeOrgId ? { token, orgId: activeOrgId } : "skip",
  );
  const liveSeason = useMemo(
    () => seasons?.find((s) => s.status === "active") ?? null,
    [seasons],
  );
  // A stale id (season deleted, org switched) falls back to the default
  // rather than asking for a board that is not this community's.
  const selectedSeason = useMemo(() => {
    if (!seasons) return null;
    if (scope === null) return liveSeason;
    if (scope === "all") return null;
    return seasons.find((s) => s._id === scope.seasonId) ?? liveSeason;
  }, [seasons, scope, liveSeason]);

  const ready = Boolean(token && activeOrgId) && seasons !== undefined;
  const grounds = usePlayableGrounds();
  const [groundPick, setGroundPick] = useState<Id<"grounds"> | null>(null);
  const ground =
    grounds.length >= 2
      ? (grounds.find((g) => g._id === groundPick) ?? null)
      : null;
  const board = useQuery(
    api.stats.leaderboard,
    ready
      ? {
          token: token!,
          orgId: activeOrgId!,
          ...(selectedSeason ? { seasonId: selectedSeason._id } : {}),
          ...(ground ? { groundId: ground._id } : {}),
        }
      : "skip",
  );

  const groups = useMemo(
    () =>
      board ? buildRecords(board, { season: Boolean(selectedSeason) }) : [],
    [board, selectedSeason],
  );
  const shown = groups.filter((g) => g.tone === tab);
  const onInk = tab === "roast";

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
      {/* The Roast is an ink room. A fixed backdrop fills the screen without
          stretching the page, so a short tab never scrolls. It is a positioned
          layer, not a negative z-index: body paints its own paper background,
          which would cover anything below it. The content wrapper below is
          positioned too, so it paints above the backdrop. */}
      {onInk ? (
        <div aria-hidden className="pointer-events-none fixed inset-0 bg-ink" />
      ) : null}
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
        solid={onInk}
      />

      <div className="relative">
        {board === undefined ? (
          <main className="mx-auto max-w-md space-y-3 px-5 py-4">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className={cn(
                  "h-40 animate-pulse rounded-2xl",
                  onInk ? "bg-white/10" : "bg-line",
                )}
              />
            ))}
          </main>
        ) : board === null ? (
          <main className="mx-auto max-w-md px-5 py-4">
            <EmptyState
              title="Records unavailable"
              body="Sign in to this community to see its records."
            />
          </main>
        ) : (
          <main className="mx-auto max-w-md space-y-6 px-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-4">
            {grounds.length >= 2 ? (
              <GroundChips
                grounds={grounds}
                value={ground?._id ?? null}
                onChange={setGroundPick}
              />
            ) : null}
            {shown.length > 0 ? (
              shown.map((g) => (
                <RecordSection key={g.title} group={g} onInk={onInk} />
              ))
            ) : (
              <EmptyState
                title={onInk ? "Nobody to roast yet" : "No records yet"}
                body="Records build up as matches finish."
              />
            )}
          </main>
        )}
      </div>
    </div>
  );
}
