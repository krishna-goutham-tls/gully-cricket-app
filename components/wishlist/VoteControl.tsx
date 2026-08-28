"use client";

import { cn } from "@/lib/utils";
import { ChevronDown, ChevronUp } from "lucide-react";

/**
 * The Reddit column: up arrow, net score, down arrow.
 *
 * Both arrows are full 44px targets — this is tapped one-handed, in sun,
 * with a thumb that has just finished an over. The score between them is
 * the only number on the card, so it carries the colour.
 *
 * Tapping the arrow you already lit sends 0: a second tap takes the vote
 * back rather than stacking another one.
 */
export function VoteControl({
  score,
  myVote,
  busy,
  onVote,
}: {
  score: number;
  myVote: 1 | -1 | 0;
  busy?: boolean;
  onVote: (next: 1 | -1 | 0) => void;
}) {
  return (
    <div className="flex w-11 shrink-0 flex-col items-center">
      <button
        type="button"
        aria-label="I want this too"
        aria-pressed={myVote === 1}
        disabled={busy}
        onClick={() => onVote(myVote === 1 ? 0 : 1)}
        className={cn(
          "flex h-11 w-11 items-center justify-center rounded-lg transition active:scale-[0.98] disabled:opacity-40",
          myVote === 1
            ? "bg-accent-soft text-accent-deep"
            : "text-faint active:bg-bg",
        )}
      >
        <ChevronUp className="h-5 w-5" strokeWidth={2.4} />
      </button>

      <span
        className={cn(
          "tabular py-0.5 text-[15px] font-semibold",
          score > 0 && "text-accent-deep",
          score < 0 && "text-danger",
          score === 0 && "text-muted",
        )}
      >
        {score > 0 ? `+${score}` : score}
      </span>

      <button
        type="button"
        aria-label="Not for me"
        aria-pressed={myVote === -1}
        disabled={busy}
        onClick={() => onVote(myVote === -1 ? 0 : -1)}
        className={cn(
          "flex h-11 w-11 items-center justify-center rounded-lg transition active:scale-[0.98] disabled:opacity-40",
          myVote === -1
            ? "bg-danger-soft text-danger"
            : "text-faint active:bg-bg",
        )}
      >
        <ChevronDown className="h-5 w-5" strokeWidth={2.4} />
      </button>
    </div>
  );
}
