"use client";

import { Button } from "@/components/ui/Button";
import {
  WISHLIST_CATEGORIES,
  WISHLIST_TEXT_MAX,
  type WishlistCategory,
} from "@/convex/lib/wishlist";
import { cn } from "@/lib/utils";
import { useState } from "react";

/**
 * One category, one box, one Send. The placeholder does the teaching — a
 * form that explains itself in a paragraph above the field is a form nobody
 * finishes between overs.
 *
 * Bottom sheet, same shell as ConfirmDialog: iOS standalone PWAs no-op
 * native dialogs, and everything on this app already sits on the home bar.
 */
export function AskSheet({
  open,
  busy,
  error,
  onSubmit,
  onClose,
}: {
  open: boolean;
  busy?: boolean;
  error?: string | null;
  onSubmit: (category: WishlistCategory, text: string) => void;
  onClose: () => void;
}) {
  const [category, setCategory] = useState<WishlistCategory | null>(null);
  const [text, setText] = useState("");

  if (!open) return null;

  const ready = Boolean(category) && text.trim().length > 0;

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-ink/40 sm:items-center">
      <div className="safe-bottom w-full max-w-sm px-4 sm:px-0">
        <div className="mb-4 rounded-2xl bg-surface p-5 shadow-card sm:mb-0">
          <p className="text-[15px] font-semibold text-ink">Ask for it</p>
          <p className="mt-1.5 text-[13px] leading-relaxed text-muted">
            Your community sees this and votes on it.
          </p>

          <p className="mt-4 text-[13px] font-medium text-muted">
            What is it about?
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {WISHLIST_CATEGORIES.map((c) => (
              <button
                key={c.key}
                type="button"
                onClick={() =>
                  setCategory(category === c.key ? null : c.key)
                }
                className={cn(
                  "min-h-11 rounded-lg border px-3 text-[13px] font-semibold",
                  category === c.key
                    ? "border-accent bg-accent-soft text-accent-deep"
                    : "border-line text-muted active:bg-bg",
                )}
              >
                {c.label}
              </button>
            ))}
          </div>

          <textarea
            value={text}
            maxLength={WISHLIST_TEXT_MAX}
            onChange={(e) => setText(e.target.value)}
            rows={4}
            placeholder="What would you do with it?"
            className="mt-4 w-full resize-none rounded-xl border border-line bg-surface px-4 py-3 text-[16px] leading-relaxed text-ink outline-none transition placeholder:text-faint focus:border-accent focus:ring-2 focus:ring-accent/15"
          />

          {error ? (
            <p className="mt-2 text-[13px] text-danger">{error}</p>
          ) : null}

          <div className="mt-4 grid grid-cols-2 gap-2">
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => {
                setCategory(null);
                setText("");
                onClose();
              }}
            >
              Cancel
            </Button>
            <Button
              disabled={busy || !ready}
              onClick={() => {
                if (!category) return;
                onSubmit(category, text.trim());
                setCategory(null);
                setText("");
              }}
            >
              {busy ? "Sending…" : "Send"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
