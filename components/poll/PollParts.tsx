"use client";

import { useAuth } from "@/components/providers/AuthProvider";
import { api } from "@/convex/_generated/api";
import { cn, errorMessage } from "@/lib/utils";
import { useMutation } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useState } from "react";

export type PollRow = NonNullable<FunctionReturnType<typeof api.polls.get>>;
type Answer = "in" | "maybe" | "out";

const ANSWERS: Array<{ id: Answer; label: string }> = [
  { id: "in", label: "In" },
  { id: "maybe", label: "Maybe" },
  { id: "out", label: "Out" },
];

/**
 * In / Maybe / Out, each carrying its count — one tap answers, another tap
 * changes it. The count lives on the button so the card needs no second row
 * of numbers.
 */
export function AnswerBar({
  poll,
  readOnly,
}: {
  poll: PollRow;
  /** Watching, or the poll is shut: counts only. */
  readOnly?: boolean;
}) {
  const { token } = useAuth();
  const respond = useMutation(api.polls.respond);
  const [pending, setPending] = useState<Answer | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Optimistic: the tap lights up at once, the server catches up.
  const mine = pending ?? poll.myAnswer;

  async function pick(answer: Answer) {
    if (!token || readOnly || answer === poll.myAnswer) return;
    setError(null);
    setPending(answer);
    try {
      await respond({ token, pollId: poll._id, answer });
    } catch (e) {
      setError(errorMessage(e, "Could not save that"));
    } finally {
      setPending(null);
    }
  }

  return (
    <div>
      <div className="grid grid-cols-3 gap-2">
        {ANSWERS.map((a) => {
          const on = mine === a.id;
          const count =
            poll.counts[a.id] +
            (pending === a.id && poll.myAnswer !== a.id ? 1 : 0) -
            (pending && pending !== a.id && poll.myAnswer === a.id ? 1 : 0);
          return (
            <button
              key={a.id}
              type="button"
              aria-pressed={on}
              disabled={readOnly}
              onClick={() => void pick(a.id)}
              className={cn(
                "flex min-h-12 items-center justify-center gap-1.5 rounded-xl border text-[15px] font-semibold transition active:scale-[0.98] disabled:cursor-default disabled:active:scale-100",
                on
                  ? "border-ink bg-ink text-bg"
                  : "border-line bg-surface text-ink active:bg-bg",
              )}
            >
              {a.label}
              <span
                className={cn(
                  "tabular text-[13px]",
                  on ? "text-bg/70" : "text-muted",
                )}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>
      {error ? <p className="mt-2 text-[13px] text-danger">{error}</p> : null}
    </div>
  );
}

/** Who said what, in the order they answered. Empty groups are left out. */
export function PollNames({
  poll,
  clamp,
}: {
  /** Names only, so the public poll page can pass its stripped copy. */
  poll: { groups: Record<Answer, Array<{ displayName: string }>> };
  /** Home keeps each group to two lines; the poll page shows everyone. */
  clamp?: boolean;
}) {
  const rows = ANSWERS.map((a) => ({
    ...a,
    names: poll.groups[a.id].map((p) => p.displayName),
  })).filter((r) => r.names.length > 0);
  if (rows.length === 0) {
    return <p className="text-[13px] text-muted">Nobody has answered yet.</p>;
  }
  return (
    <div className="space-y-1">
      {rows.map((r) => (
        <p
          key={r.id}
          className={cn(
            "text-[13px] leading-snug text-muted",
            clamp && "line-clamp-2",
          )}
        >
          <span className="font-semibold text-ink">{r.label}:</span>{" "}
          {r.names.join(", ")}
        </p>
      ))}
    </div>
  );
}
