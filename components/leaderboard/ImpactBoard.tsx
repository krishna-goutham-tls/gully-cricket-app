"use client";

import type { LeaderboardShareRow } from "@/components/share/ShareCard";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { TruncText } from "@/components/ui/TruncText";
import { api } from "@/convex/_generated/api";
import { PLAYER_TAG_COPY } from "@/lib/playerLabel";
import { cn } from "@/lib/utils";
import type { FunctionReturnType } from "convex/server";
import { Info } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

/**
 * The Impact tab on Leaders: value per match against the average player
 * (`convex/lib/impact.ts`). A table, not bars — the reader compares where each
 * player's value comes from (bat, bowl, field), and the board is the thing
 * people screenshot for the group.
 */
export type ImpactBoard = NonNullable<
  FunctionReturnType<typeof api.stats.impact>
>;
type Row = ImpactBoard["rows"][number];

/**
 * A part (Bat, Bowl, Field) shows only as a strength: "+6.1". Average or
 * below is a dash, so no player reads a minus number next to their name.
 */
function strength(n: number): string | null {
  const r = Math.round(n * 10) / 10;
  return r > 0 ? `+${r.toFixed(1)}` : null;
}

/**
 * Impact on a scale where 100 is this community's average player, like a
 * strike rate. Each point is one run per match above or below. The ranking
 * is the same; only the reading changes.
 */
export function impactScore100(total: number): number {
  return Math.round(100 + total);
}

const NUM = "tabular w-10 shrink-0 text-right text-[13px]";
/** The column the board ranks by sits on a gold wash, top to bottom. */
const IMPACT_COL =
  "tabular w-16 shrink-0 self-stretch bg-accent-soft pr-3 text-right";

function HowItWorks({
  board,
  onClose,
}: {
  board: ImpactBoard;
  onClose: () => void;
}) {
  const lines: [string, string][] = [
    [
      "Bat",
      "Runs above an average batter off the same balls. Getting out more often than average costs a wicket each time.",
    ],
    [
      "Bowl",
      "Runs saved against average economy. Taking wickets more often than average earns a wicket each time.",
    ],
    ["Field", "Half a wicket per catch. The same off per drop."],
    [
      "Impact",
      "100 is the average player. Each point is one run per match above or below it.",
    ],
  ];
  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-ink/40 sm:items-center"
      onClick={onClose}
    >
      <div className="safe-bottom w-full max-w-sm px-4 sm:px-0">
        <div
          role="dialog"
          aria-modal="true"
          aria-label="How Impact works"
          className="mb-4 max-h-[calc(100dvh-2rem)] overflow-y-auto overscroll-contain rounded-2xl bg-surface p-5 shadow-card sm:mb-0"
          onClick={(e) => e.stopPropagation()}
        >
          <p className="text-[15px] font-semibold text-ink">How Impact works</p>
          <p className="mt-1.5 text-[13px] leading-relaxed text-muted">
            Runs per match, against the average player in this community. Only
            strengths show a number. Average or below shows a dash.
          </p>
          <dl className="mt-4 space-y-2.5">
            {lines.map(([k, v]) => (
              <div key={k} className="flex gap-3">
                <dt className="w-12 shrink-0 text-[13px] font-semibold text-ink">
                  {k}
                </dt>
                <dd className="text-[13px] leading-relaxed text-muted">{v}</dd>
              </div>
            ))}
          </dl>
          <div className="mt-4 space-y-1 border-t border-line pt-3 text-[13px] leading-relaxed text-muted">
            <p>
              Average player:{" "}
              <span className="tabular font-semibold text-ink">
                SR {board.strikeRate.toFixed(0)}
              </span>
              {" · "}
              <span className="tabular font-semibold text-ink">
                econ {board.economy.toFixed(1)}
              </span>
            </p>
            <p>
              A wicket here is worth{" "}
              <span className="tabular font-semibold text-ink">
                {Math.round(board.wicketValue)} runs
              </span>
              , the average innings in this community.
            </p>
            <p>
              Play {board.minMatches} of {board.matchCount} matches to rank.
            </p>
            <p>Nothing against juniors counts.</p>
          </div>
          <Button className="mt-5 w-full" onClick={onClose}>
            Got it
          </Button>
        </div>
      </div>
    </div>
  );
}

function ImpactTable({ rows, youId }: { rows: Row[]; youId?: string }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-surface">
      <div className="flex items-stretch border-b border-line text-[11px] font-semibold uppercase tracking-wide text-faint">
        <span className="w-9 shrink-0 py-2 pl-4">#</span>
        <span className="min-w-0 flex-1 py-2 pl-1">Player</span>
        <span className={cn(NUM, "py-2 text-[11px]")}>Bat</span>
        <span className={cn(NUM, "py-2 text-[11px]")}>Bowl</span>
        <span className={cn(NUM, "py-2 text-[11px]")}>Field</span>
        <span
          className={cn(IMPACT_COL, "ml-1 py-2 text-[11px] text-accent-deep")}
        >
          Impact
        </span>
      </div>
      {rows.map((r, i) => {
        const first = i === 0;
        const you = youId != null && String(r.userId) === youId;
        const part = (n: number) => {
          const v = strength(n);
          return (
            <span className={cn(NUM, v ? "text-ink" : "text-faint")}>
              {v ?? "–"}
            </span>
          );
        };
        return (
          <Link
            key={String(r.userId)}
            href={`/players/${r.userId}`}
            aria-current={you ? "true" : undefined}
            className={cn(
              "flex min-h-12 items-center border-b border-line/60 last:border-b-0 active:bg-bg",
              // Your row: a tint, not a chip, so a name keeps its full width.
              you && "bg-bg",
            )}
          >
            <span
              className={cn(
                "tabular w-9 shrink-0 pl-4 text-[13px]",
                first ? "font-semibold text-ink" : "text-faint",
              )}
            >
              {i + 1}
            </span>
            <span className="flex min-w-0 flex-1 items-center gap-1.5 py-2 pl-1 pr-1">
              <TruncText
                lines={2}
                className="text-[15px] font-semibold leading-tight text-ink"
              >
                {r.displayName}
              </TruncText>
            </span>
            {part(r.bat)}
            {part(r.bowl)}
            {part(r.field)}
            <span
              className={cn(
                IMPACT_COL,
                "ml-1 flex items-center justify-end text-[15px] font-semibold text-ink",
              )}
            >
              {impactScore100(r.total)}
            </span>
          </Link>
        );
      })}
    </div>
  );
}

/** Top five for the share card. */
export function impactShareRows(board: ImpactBoard): LeaderboardShareRow[] {
  return board.rows
    .filter((r) => r.qualified)
    .slice(0, 5)
    .map((r, i) => ({
      rank: i + 1,
      name: r.displayName,
      value: String(impactScore100(r.total)),
    }));
}

export function ImpactBoardView({
  board,
  youId,
}: {
  board: ImpactBoard;
  youId?: string;
}) {
  const [infoOpen, setInfoOpen] = useState(false);
  const ranked = board.rows.filter((r) => r.qualified);
  const waiting = board.rows.filter((r) => !r.qualified);
  const tagText = (r: Row) =>
    board.includeVisitorsAndJuniors && r.playerTags.length > 0
      ? ` · ${r.playerTags.map((t) => PLAYER_TAG_COPY[t]).join(", ")}`
      : "";

  return (
    <>
      <button
        type="button"
        onClick={() => setInfoOpen(true)}
        className="-mx-1 flex min-h-11 w-[calc(100%+0.5rem)] items-center justify-between gap-2 rounded-lg px-1 text-left text-[13px] font-semibold text-muted active:bg-line/50"
      >
        <span>100 is the average player</span>
        <Info
          className="h-5 w-5 shrink-0 text-ink"
          aria-label="How Impact works"
        />
      </button>
      <div className="mt-1">
        {ranked.length > 0 ? (
          <ImpactTable rows={ranked} youId={youId} />
        ) : (
          <EmptyState
            title="Nobody has enough matches yet"
            body={`Play ${board.minMatches} matches to rank.`}
          />
        )}
      </div>

      {waiting.length > 0 ? (
        <section className="mt-6">
          <h2 className="px-1 text-[11px] font-semibold uppercase tracking-wide text-faint">
            Not enough matches yet · play {board.minMatches}
          </h2>
          <div className="mt-2 overflow-hidden rounded-2xl border border-line bg-surface">
            {waiting.map((r) => (
              <Link
                key={String(r.userId)}
                href={`/players/${r.userId}`}
                className="flex min-h-12 items-center justify-between gap-3 border-b border-line/60 px-4 last:border-b-0 active:bg-bg"
              >
                <TruncText className="text-[15px] font-semibold text-ink">
                  {r.displayName + tagText(r)}
                </TruncText>
                <span className="tabular shrink-0 text-[13px] text-muted">
                  {r.matches} of {board.minMatches}
                </span>
              </Link>
            ))}
          </div>
        </section>
      ) : null}
      {infoOpen ? (
        <HowItWorks board={board} onClose={() => setInfoOpen(false)} />
      ) : null}
    </>
  );
}
