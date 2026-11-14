"use client";

import { Crown } from "lucide-react";
import { TruncText } from "@/components/ui/TruncText";
import { cn } from "@/lib/utils";

export type StandingsRow = {
  userId: string;
  displayName: string;
  points: number;
  runs: number;
  balls: number;
  boundaries: number;
  wickets: number;
  batted: boolean;
  out: boolean;
  rank: number;
  winner: boolean;
};

function plural(n: number, one: string, many: string) {
  return `${n} ${n === 1 ? one : many}`;
}

/** "34* (20) · 3 boundaries · 2 wickets", or "Did not bat · 1 wicket". */
function line(r: StandingsRow) {
  const parts = [
    r.batted ? `${r.runs}${r.out ? "" : "*"} (${r.balls})` : "Did not bat",
  ];
  if (r.boundaries > 0) parts.push(plural(r.boundaries, "boundary", "boundaries"));
  if (r.wickets > 0) parts.push(plural(r.wickets, "wicket", "wickets"));
  return parts.join(" · ");
}

/**
 * An individuals match, ranked: most points first, then runs, fewer balls and
 * boundaries (convex/lib/individuals.ts). The winner wears the crown once the
 * match is over.
 */
export function StandingsTable({
  rows,
  title = "Standings",
  className,
}: {
  rows: StandingsRow[];
  title?: string;
  className?: string;
}) {
  if (rows.length === 0) return null;
  return (
    <section
      className={cn("rounded-2xl border border-line bg-surface", className)}
    >
      <div className="flex items-center justify-between px-4 pt-3">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-faint">
          {title}
        </p>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-faint">
          Pts
        </p>
      </div>
      <ol className="divide-y divide-line px-4 pb-1">
        {rows.map((r) => (
          <li key={r.userId} className="flex min-h-12 items-center gap-3 py-2">
            <span className="tabular w-5 shrink-0 text-[13px] font-semibold text-faint">
              {r.rank}
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5">
                <TruncText
                  lines={2}
                  className="text-[15px] font-semibold text-ink"
                >
                  {r.displayName}
                </TruncText>
                {r.winner ? (
                  <Crown
                    aria-label="Winner"
                    className="h-4 w-4 shrink-0 text-accent-deep"
                  />
                ) : null}
              </span>
              <span className="tabular block text-[13px] text-muted">
                {line(r)}
              </span>
            </span>
            <span className="tabular shrink-0 text-[15px] font-semibold text-ink">
              {r.points}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
