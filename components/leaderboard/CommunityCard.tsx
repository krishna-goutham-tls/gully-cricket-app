"use client";

import { api } from "@/convex/_generated/api";
import { cn } from "@/lib/utils";
import type { FunctionReturnType } from "convex/server";
import Link from "next/link";

type Card = NonNullable<FunctionReturnType<typeof api.stats.communityCard>>;

const fmt = (n: number) => n.toLocaleString("en-IN");

/**
 * Records, Community tab: the community all time, whatever the season
 * picker says. Same counting as the landing counter, for one community.
 */
export function CommunityCard({ card, onInk }: { card: Card; onInk?: boolean }) {
  const cells: Array<[string, number]> = [
    ["Matches", card.matches],
    ["Runs", card.runs],
    ["Wickets", card.wickets],
    ["Sixes", card.sixes],
    ["Fours", card.fours],
    ["Catches", card.catches],
  ];
  const label = cn(
    "text-[11px] font-semibold uppercase tracking-wide",
    onInk ? "text-bg/70" : "text-faint",
  );
  const value = cn("tabular text-2xl font-semibold", onInk ? "text-bg" : "text-ink");
  return (
    <section
      data-testid="community-card"
      className={cn(
        "rounded-2xl border p-4",
        onInk ? "border-white/10 bg-white/[0.06]" : "border-line bg-surface shadow-card",
      )}
    >
      <h2 className={cn("text-[15px] font-semibold", onInk ? "text-bg" : "text-ink")}>
        {card.name} in numbers
      </h2>
      <div className="mt-3 grid grid-cols-3 gap-x-3 gap-y-3">
        {cells.map(([k, n]) => (
          <div key={k} className="min-w-0">
            <p className={value}>{fmt(n)}</p>
            <p className={label}>{k}</p>
          </div>
        ))}
        <div className="min-w-0">
          <p className={value}>{fmt(card.players)}</p>
          <p className={label}>Players</p>
        </div>
        {card.top ? (
          <Link
            href={`/players/${card.top.userId}`}
            className={cn(
              "col-span-2 -m-1 min-w-0 rounded-xl p-1",
              onInk ? "active:bg-white/10" : "active:bg-bg",
            )}
          >
            <p
              title={card.top.displayName}
              className={cn(
                "truncate text-[15px] font-semibold leading-8",
                onInk ? "text-bg" : "text-ink",
              )}
            >
              {card.top.displayName}
            </p>
            <p className={label}>Player of the community</p>
          </Link>
        ) : null}
      </div>
    </section>
  );
}

type Leader = Card["leaders"]["batting"][number];

/** The top 3 all time in one discipline, under the numbers card. */
function TopThree({ title, unit, rows }: { title: string; unit: string; rows: Leader[] }) {
  if (rows.length === 0) return null;
  return (
    <section className="rounded-2xl border border-line bg-surface p-4 shadow-card">
      <div className="flex items-baseline justify-between">
        <h3 className="text-[15px] font-semibold text-ink">{title}</h3>
        <span className="text-[11px] font-semibold uppercase tracking-wide text-faint">{unit}</span>
      </div>
      <ol className="mt-2">
        {rows.map((r, i) => (
          <li key={r.userId}>
            <Link
              href={`/players/${r.userId}`}
              className="-mx-2 flex min-h-11 items-center gap-3 rounded-xl px-2 active:bg-bg"
            >
              <span
                className={cn(
                  "tabular flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[13px] font-semibold",
                  i === 0 ? "bg-accent-soft text-accent-deep" : "bg-bg text-muted",
                )}
              >
                {i + 1}
              </span>
              <span className="min-w-0 flex-1 truncate text-[15px] font-medium text-ink">
                {r.displayName}
              </span>
              <span className="tabular shrink-0 text-[17px] font-semibold text-ink">
                {fmt(r.value)}
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}

export function CommunityLeaders({ leaders }: { leaders: Card["leaders"] }) {
  return (
    <div className="space-y-3" data-testid="community-leaders">
      <TopThree title="Batting" unit="Runs" rows={leaders.batting} />
      <TopThree title="Bowling" unit="Wickets" rows={leaders.bowling} />
      <TopThree title="Fielding" unit="Catches" rows={leaders.fielding} />
    </div>
  );
}
