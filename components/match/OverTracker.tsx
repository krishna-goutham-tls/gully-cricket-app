"use client";

import { cn } from "@/lib/utils";

/**
 * The over in progress (with empty slots for balls still to come) and, faded
 * above it, the over before. Shared by the watch page and the public match
 * page. The score pad keeps its own chips.
 */

export type BallChip = {
  _id: string;
  runsBat: number;
  extrasType?: string;
  extrasRuns: number;
  isWicket: boolean;
  isLegal: boolean;
  isRetire?: boolean;
};

// Chip rendering mirrors the score pad (app/(app)/matches/[id]/score/page.tsx);
// the helpers there are local to that file, so this keeps its own copy.
function ballLabel(b: BallChip) {
  if (b.isRetire) return "R";
  if (b.isWicket) return "W";
  if (b.extrasType === "wide")
    return b.extrasRuns > 1 ? `Wd${b.extrasRuns - 1}` : "Wd";
  if (b.extrasType === "noball")
    return b.runsBat > 0 ? `Nb${b.runsBat}` : "Nb";
  if (b.extrasType === "bye") return `B${b.extrasRuns}`;
  if (b.extrasType === "legbye") return `Lb${b.extrasRuns}`;
  if (b.runsBat === 0) return "·";
  return String(b.runsBat);
}

function chipClass(b: BallChip) {
  if (b.isRetire) return "bg-white/15 text-bg/70";
  if (b.isWicket) return "bg-danger text-white";
  if (b.extrasType === "wide" || b.extrasType === "noball")
    return "bg-accent/30 text-accent";
  if (b.extrasType) return "bg-white/15 text-bg/80";
  if (b.runsBat >= 4) return "bg-accent text-ink";
  return "bg-white/10 text-bg";
}

export function OverTracker({
  current,
  prev,
  ballsPerOver,
}: {
  current: BallChip[];
  prev: BallChip[];
  ballsPerOver: number;
}) {
  const legalSoFar = current.filter((b) => b.isLegal).length;
  const placeholders = Math.max(0, ballsPerOver - legalSoFar);
  return (
    <div className="mt-4 flex flex-col items-center gap-1.5">
      {prev.length > 0 ? (
        <div className="flex flex-wrap justify-center gap-1 opacity-40">
          {prev.map((b) => (
            <span
              key={b._id}
              className={cn(
                "tabular flex h-6 min-w-6 items-center justify-center rounded-full px-1.5 text-[11px] font-semibold",
                chipClass(b),
              )}
            >
              {ballLabel(b)}
            </span>
          ))}
        </div>
      ) : null}
      <div className="flex flex-wrap justify-center gap-1.5">
        {current.map((b) => (
          <span
            key={b._id}
            className={cn(
              "tabular flex h-7 min-w-7 items-center justify-center rounded-full px-2 text-[11px] font-semibold",
              chipClass(b),
            )}
          >
            {ballLabel(b)}
          </span>
        ))}
        {Array.from({ length: placeholders }, (_, i) => (
          <span
            key={`slot-${i}`}
            className="flex h-7 w-7 items-center justify-center rounded-full border border-white/20"
          >
            <span className="h-1 w-1 rounded-full bg-white/25" />
          </span>
        ))}
      </div>
    </div>
  );
}
