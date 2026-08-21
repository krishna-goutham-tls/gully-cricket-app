"use client";

import { Id } from "@/convex/_generated/dataModel";
import { cn } from "@/lib/utils";
import { ArrowDown, ArrowUp } from "lucide-react";
import Link from "next/link";
import { Fragment } from "react";

/**
 * The leaderboard's job is magnitude comparison, so every row carries a bar:
 * you read the gap between first and fifth without doing arithmetic on the
 * numbers. Emphasis form — the leader's bar is gold, everyone else's is the
 * de-emphasis grey — and the colour lives in the bar, never in the text, so a
 * long list doesn't turn into a wall of highlighted names.
 *
 * Batting and bowling used to be two near-identical blocks of table markup.
 * They are the same shape of data, so they are now one component fed a
 * normalised row.
 */

export type RankRow = {
  userId: Id<"users">;
  displayName: string;
  /** The ranked measure — runs, wickets, an average. Drives the bar. */
  value: number;
  /** What's printed. Defaults to `value`; set it for rates ("37.1", "6.20"). */
  display?: string;
  meta: string;
  qualified: boolean;
  /** Where this row sat a week ago; null if it wasn't ranked then. */
  prevRank?: number | null;
  /** Visitor / Junior chips when the Everyone board is on. Regulars have none. */
  tags?: string[];
};

/**
 * How far a name climbed or slid this week — the hook that pulls people back
 * to the board. Silent when nothing moved (delta 0), a quiet gold "NEW" the
 * first week someone qualifies, ▲/▼ with the number of places otherwise.
 */
function Movement({ delta, isNew }: { delta: number; isNew: boolean }) {
  if (isNew) {
    return (
      <span className="shrink-0 rounded-full bg-accent-soft px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-accent-deep">
        New
      </span>
    );
  }
  if (delta === 0) return null;
  const up = delta > 0;
  return (
    <span
      className={cn(
        "tabular flex shrink-0 items-center gap-0.5 text-[11px] font-semibold",
        up ? "text-accent-deep" : "text-danger",
      )}
    >
      {up ? (
        <ArrowUp className="h-3 w-3" strokeWidth={2.5} />
      ) : (
        <ArrowDown className="h-3 w-3" strokeWidth={2.5} />
      )}
      {Math.abs(delta)}
    </span>
  );
}

export function RankedList({
  rows,
  cutLabel,
  youId,
  showMovement = false,
  lowerIsBetter = false,
}: {
  rows: RankRow[];
  /** Shown once, above the first row that missed the qualification bar. */
  cutLabel: string;
  youId?: Id<"users"> | string | null;
  /** Draw weekly climb/drop arrows — off until the board has a week of history. */
  showMovement?: boolean;
  /**
   * True for economy and the bowling/batting averages, where the *smallest*
   * number is the best. Without it the bar reads exactly backwards: scaling
   * `value / max` hands the most expensive bowler a full gold bar and leaves
   * the leader with a stub.
   */
  lowerIsBetter?: boolean;
}) {
  // Scale against the whole field, not the leader: a three-ball hat-trick is
  // unqualified but can still out-value the top ranked bowler, and a bar past
  // 100% would render as a broken track.
  //
  // Only ranked rows set the scale. Below-the-cut rows are the thin samples
  // that produce the freak numbers (a one-over economy of 0.0), so letting
  // them define either end would squash the bars everyone came to compare.
  const scale = rows.filter((r) => r.qualified);
  const values = (scale.length > 0 ? scale : rows).map((r) => r.value);
  const max = values.reduce((m, v) => Math.max(m, v), 0);
  const min = values.reduce((m, v) => Math.min(m, v), Infinity);
  /**
   * Bar length as a share of the track. Higher-is-better fills toward the
   * field's best; lower-is-better measures the distance travelled *down* from
   * the field's worst, so in both cases a full bar means "leads this board".
   */
  const barPct = (value: number) => {
    if (!lowerIsBetter) return max > 0 ? Math.round((value / max) * 100) : 0;
    // A field with one qualifier (or a dead tie) has no spread to scale
    // against — everyone in it is jointly best, so everyone gets a full bar.
    if (!Number.isFinite(min) || max === min) return 100;
    const pct = Math.round(((max - value) / (max - min)) * 100);
    return Math.max(0, Math.min(100, pct));
  };

  return (
    <div className="overflow-hidden rounded-3xl border border-line bg-surface">
      {rows.map((row, i) => {
        const first = i === 0 && row.qualified;
        const you = youId != null && String(row.userId) === String(youId);
        const pct = barPct(row.value);
        // Qualified rows sort ahead of the cut, so i is the rank shown (i+1).
        // Movement only reads against a rank the list actually numbers.
        const moved =
          showMovement && row.qualified
            ? {
                isNew: row.prevRank == null,
                delta: row.prevRank == null ? 0 : row.prevRank - (i + 1),
              }
            : null;
        return (
          <Fragment key={String(row.userId)}>
            {!row.qualified && (i === 0 || rows[i - 1].qualified) ? (
              <p className="border-y border-line bg-bg px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-faint">
                {cutLabel}
              </p>
            ) : null}
            <Link
              href={`/players/${row.userId}`}
              className="block min-h-12 border-b border-line/60 px-4 py-2 last:border-b-0 active:bg-bg"
            >
              <div className="flex items-baseline gap-2 leading-tight">
                <span
                  className={cn(
                    "tabular w-5 shrink-0 text-[13px]",
                    first ? "font-semibold text-ink" : "text-faint",
                  )}
                >
                  {row.qualified ? i + 1 : "–"}
                </span>
                <span className="min-w-0 flex-1 truncate text-[15px] font-semibold text-ink">
                  {row.displayName}
                </span>
                {row.tags && row.tags.length > 0
                  ? row.tags.map((tag) => (
                      <span
                        key={tag}
                        className="shrink-0 rounded-full border border-line bg-bg px-1.5 py-0.5 text-[10px] font-medium text-muted"
                      >
                        {tag}
                      </span>
                    ))
                  : null}
                {you ? (
                  <span className="shrink-0 rounded-full bg-ink/[0.07] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted">
                    You
                  </span>
                ) : null}
                {moved ? (
                  <Movement delta={moved.delta} isNew={moved.isNew} />
                ) : null}
                <span className="tabular shrink-0 text-[15px] font-semibold text-ink">
                  {row.display ?? row.value}
                </span>
              </div>
              <div className="mt-1 flex items-center gap-2 pl-7 leading-tight">
                <span className="h-1.5 w-20 shrink-0 overflow-hidden rounded-full bg-line">
                  <span
                    className={cn(
                      "block h-full rounded-r-full",
                      first ? "bg-accent" : "bg-ink/20",
                    )}
                    style={{ width: `${pct}%` }}
                  />
                </span>
                <span className="tabular min-w-0 truncate text-[11px] text-faint">
                  {row.meta}
                </span>
              </div>
            </Link>
          </Fragment>
        );
      })}
    </div>
  );
}

