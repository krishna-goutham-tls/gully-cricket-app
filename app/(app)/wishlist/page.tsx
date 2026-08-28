"use client";

import { useAuth } from "@/components/providers/AuthProvider";
import { AskSheet } from "@/components/wishlist/AskSheet";
import { RequestCard } from "@/components/wishlist/RequestCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { api } from "@/convex/_generated/api";
import {
  WISHLIST_CATEGORIES,
  wishlistStateLabel,
  type WishlistCategory,
  type WishlistState,
} from "@/convex/lib/wishlist";
import { cn, errorMessage } from "@/lib/utils";
import { useMutation, useQuery } from "convex/react";
import { ArrowLeft, Plus } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

export default function WishlistPage() {
  const { token, activeOrgId } = useAuth();
  const board = useQuery(
    api.wishlist.board,
    token && activeOrgId ? { token, orgId: activeOrgId } : "skip",
  );
  const amPlatformAdmin =
    useQuery(api.access.amPlatformAdmin, token ? { token } : "skip") ?? false;

  const submit = useMutation(api.wishlist.submit);
  const vote = useMutation(api.wishlist.vote);
  const setState = useMutation(api.wishlist.setState);

  const [filter, setFilter] = useState<WishlistCategory | null>(null);
  const [askOpen, setAskOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [askError, setAskError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [closedOpen, setClosedOpen] = useState(false);

  async function onSubmit(category: WishlistCategory, text: string) {
    if (!token || !activeOrgId) return;
    setBusy(true);
    setAskError(null);
    try {
      await submit({ token, orgId: activeOrgId, category, text });
      setAskOpen(false);
    } catch (e) {
      setAskError(errorMessage(e, "Could not send that"));
    } finally {
      setBusy(false);
    }
  }

  async function onVote(requestId: string, next: 1 | -1 | 0) {
    if (!token) return;
    setError(null);
    try {
      await vote({
        token,
        requestId: requestId as never,
        value: next,
      });
    } catch (e) {
      setError(errorMessage(e, "Could not record that vote"));
    }
  }

  async function onMove(requestId: string, next: WishlistState) {
    if (!token) return;
    setError(null);
    try {
      await setState({ token, requestId: requestId as never, state: next });
    } catch (e) {
      setError(errorMessage(e, "Could not move that"));
    }
  }

  const keep = <T extends { category: WishlistCategory }>(cards: T[]) =>
    filter ? cards.filter((c) => c.category === filter) : cards;

  const live = (board?.live ?? [])
    .map((s) => ({ ...s, cards: keep(s.cards) }))
    .filter((s) => s.cards.length > 0);
  const closed = (board?.closed ?? [])
    .map((s) => ({ ...s, cards: keep(s.cards) }))
    .filter((s) => s.cards.length > 0);
  const nothingYet = board !== undefined && board !== null &&
    board.live.length === 0 && board.closed.length === 0;

  return (
    <div className="bg-bg pb-6">
      <header className="sticky top-0 z-30 border-b border-line bg-bg/90 px-5 pb-3 pt-[calc(var(--safe-top)+0.75rem)] backdrop-blur-md">
        <div className="mx-auto flex max-w-md items-center gap-1">
          <Link
            href="/profile"
            aria-label="Back to profile"
            className="-ml-2 flex h-11 w-11 items-center justify-center rounded-lg text-muted active:bg-line/60"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-semibold leading-tight tracking-tight text-ink">
              Wishlist
            </h1>
            <p className="text-[13px] text-muted">
              What your community wants next
            </p>
          </div>
        </div>

        {/* Category filter. Scrolls sideways so six buckets never wrap the
            header into two rows on a small phone. */}
        <div className="-mx-5 mt-2 overflow-x-auto px-5">
          <div className="mx-auto flex max-w-md gap-2 pb-1">
            <FilterChip
              label="All"
              active={filter === null}
              onClick={() => setFilter(null)}
            />
            {WISHLIST_CATEGORIES.map((c) => (
              <FilterChip
                key={c.key}
                label={c.label}
                active={filter === c.key}
                onClick={() => setFilter(filter === c.key ? null : c.key)}
              />
            ))}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-md space-y-5 px-5 py-5">
        {error ? <p className="text-[13px] text-danger">{error}</p> : null}

        {nothingYet ? (
          <EmptyState
            title="Nothing on the board"
            body="Ask for the thing you keep wishing this app did. Your community votes on it."
          />
        ) : null}

        {live.map((section) => (
          <section key={section.state} className="space-y-2">
            <h2 className="text-[11px] font-semibold uppercase tracking-wide text-faint">
              {wishlistStateLabel(section.state)}
            </h2>
            {section.cards.map((c) => (
              <RequestCard
                key={c._id}
                text={c.text}
                category={c.category}
                authorName={c.authorName}
                isMine={c.isMine}
                state={c.state}
                score={c.score}
                myVote={c.myVote as 1 | -1 | 0}
                canMove={amPlatformAdmin}
                onVote={(next) => void onVote(c._id, next)}
                onMove={(next) => void onMove(c._id, next)}
              />
            ))}
          </section>
        ))}

        {closed.length > 0 ? (
          <section className="space-y-2">
            <button
              type="button"
              onClick={() => setClosedOpen((v) => !v)}
              aria-expanded={closedOpen}
              className="flex min-h-11 w-full items-center justify-between text-[13px] font-semibold text-muted active:text-ink"
            >
              <span>Settled</span>
              <span className="text-faint">
                {closedOpen ? "Hide" : `${closed.reduce((n, s) => n + s.cards.length, 0)}`}
              </span>
            </button>
            {closedOpen
              ? closed.map((section) =>
                  section.cards.map((c) => (
                    <RequestCard
                      key={c._id}
                      text={c.text}
                      category={c.category}
                      authorName={c.authorName}
                      isMine={c.isMine}
                      state={c.state}
                      score={c.score}
                      myVote={c.myVote as 1 | -1 | 0}
                      canMove={amPlatformAdmin}
                      onVote={(next) => void onVote(c._id, next)}
                      onMove={(next) => void onMove(c._id, next)}
                    />
                  )),
                )
              : null}
          </section>
        ) : null}
      </main>

      {/* One primary per screen, and it is the ask. */}
      <div className="safe-bottom fixed inset-x-0 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-20 px-5">
        <div className="mx-auto max-w-md">
          <button
            type="button"
            onClick={() => {
              setAskError(null);
              setAskOpen(true);
            }}
            className="flex min-h-14 w-full items-center justify-center gap-2 rounded-xl bg-ink text-[15px] font-semibold text-bg shadow-card transition active:scale-[0.98] active:bg-ink/90"
          >
            <Plus className="h-5 w-5" strokeWidth={2.4} />
            Ask for a feature
          </button>
        </div>
      </div>

      <AskSheet
        open={askOpen}
        busy={busy}
        error={askError}
        onSubmit={(category, text) => void onSubmit(category, text)}
        onClose={() => setAskOpen(false)}
      />
    </div>
  );
}

function FilterChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "min-h-11 shrink-0 rounded-lg border px-3 text-[13px] font-semibold",
        active
          ? "border-accent bg-accent-soft text-accent-deep"
          : "border-line text-muted active:bg-bg",
      )}
    >
      {label}
    </button>
  );
}
