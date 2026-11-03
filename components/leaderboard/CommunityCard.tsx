"use client";

import { api } from "@/convex/_generated/api";
import { cn } from "@/lib/utils";
import type { FunctionReturnType } from "convex/server";
import Link from "next/link";

type Card = NonNullable<FunctionReturnType<typeof api.stats.communityCard>>;

const fmt = (n: number) => n.toLocaleString("en-IN");

/**
 * Top of Records, on every tab: the community all time, whatever the season
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
