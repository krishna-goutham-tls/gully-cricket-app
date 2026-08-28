"use client";

import { VoteControl } from "./VoteControl";
import { cn } from "@/lib/utils";
import {
  WISHLIST_STATES,
  wishlistCategoryLabel,
  wishlistStateLabel,
  type WishlistCategory,
  type WishlistState,
} from "@/convex/lib/wishlist";
import { useState } from "react";

/** Only Building, Shipped and Not doing wear a badge — see the note below. */
const BADGE: Partial<Record<WishlistState, string>> = {
  building: "bg-accent-soft text-accent-deep",
  planned: "bg-bg text-muted",
  shipped: "bg-accent-soft text-accent-deep",
  not_doing: "bg-bg text-faint",
};

export function RequestCard({
  text,
  category,
  authorName,
  isMine,
  state,
  score,
  myVote,
  canMove,
  busy,
  onVote,
  onMove,
}: {
  text: string;
  category: WishlistCategory;
  authorName: string;
  isMine: boolean;
  state: WishlistState;
  score: number;
  myVote: 1 | -1 | 0;
  /** Platform admin only. A community admin does not build the app. */
  canMove: boolean;
  busy?: boolean;
  onVote: (next: 1 | -1 | 0) => void;
  onMove: (next: WishlistState) => void;
}) {
  const [moveOpen, setMoveOpen] = useState(false);

  return (
    <article className="flex gap-2 rounded-2xl border border-line bg-surface p-3 shadow-card">
      <VoteControl score={score} myVote={myVote} busy={busy} onVote={onVote} />

      <div className="min-w-0 flex-1 pt-1.5">
        <p className="text-[15px] font-semibold leading-snug text-ink">{text}</p>

        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1.5">
          {/* `open` wears nothing. A board where every card is labelled is a
              board nobody reads — the badge should mean something happened. */}
          {state !== "open" ? (
            <span
              className={cn(
                "inline-flex rounded-lg px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide",
                BADGE[state],
              )}
            >
              {wishlistStateLabel(state)}
            </span>
          ) : null}
          <p className="text-[13px] text-muted">
            {wishlistCategoryLabel(category)} ·{" "}
            <span className={cn(isMine && "text-accent-deep")}>
              {isMine ? "You" : authorName}
            </span>
          </p>
        </div>

        {canMove ? (
          <div className="-mb-1 mt-0.5">
            <button
              type="button"
              onClick={() => setMoveOpen((v) => !v)}
              aria-expanded={moveOpen}
              className="flex min-h-11 items-center text-[13px] font-semibold text-muted active:text-ink"
            >
              {moveOpen ? "Close" : "Move"}
            </button>
            {moveOpen ? (
              <div className="flex flex-wrap gap-2 pb-1">
                {WISHLIST_STATES.map((s) => (
                  <button
                    key={s.key}
                    type="button"
                    disabled={busy || s.key === state}
                    onClick={() => {
                      onMove(s.key);
                      setMoveOpen(false);
                    }}
                    className={cn(
                      "min-h-11 rounded-lg border px-3 text-[13px] font-semibold disabled:opacity-40",
                      s.key === state
                        ? "border-accent bg-accent-soft text-accent-deep"
                        : "border-line text-muted active:bg-bg",
                    )}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </article>
  );
}
