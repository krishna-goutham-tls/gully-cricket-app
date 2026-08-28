"use client";

import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import { Check, Plus } from "lucide-react";
import { useMemo, useState } from "react";

export type PoolPlayer = {
  userId: string;
  displayName: string;
  isGuest: boolean;
};

/**
 * Search + tap picker over the org player pool, with inline guest add.
 * The same pool feeds both sides; a player may be selected on both.
 */
export function PlayerMultiSelect({
  players,
  selectedIds,
  otherSideIds,
  onToggle,
  onAddGuest,
  addingGuest,
}: {
  players: PoolPlayer[];
  selectedIds: string[];
  otherSideIds: string[];
  onToggle: (userId: string) => void;
  onAddGuest: (name: string, phone: string) => Promise<void>;
  addingGuest: boolean;
}) {
  const [search, setSearch] = useState("");
  const [guestOpen, setGuestOpen] = useState(false);
  const [guestName, setGuestName] = useState("");
  const [guestPhone, setGuestPhone] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return players;
    return players.filter((p) => p.displayName.toLowerCase().includes(q));
  }, [players, search]);

  const selectedSet = new Set(selectedIds);
  const otherSet = new Set(otherSideIds);

  async function submitGuest() {
    const name = guestName.trim();
    if (name.length < 2) return;
    await onAddGuest(name, guestPhone.trim());
    setGuestName("");
    setGuestPhone("");
    setGuestOpen(false);
    setSearch("");
  }

  function onGuestKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter") return;
    e.preventDefault();
    if (addingGuest || guestName.trim().length < 2) return;
    void submitGuest();
  }

  return (
    <div>
      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
        }}
        placeholder="Search players"
        autoCapitalize="none"
        autoCorrect="off"
        enterKeyHint="search"
        className="min-h-12 w-full rounded-2xl border border-line bg-bg px-3.5 text-[16px] text-ink outline-none placeholder:text-faint focus:border-accent"
      />

      {/* Guest add sits above the list: the list is unbounded, so anything
          below it drifts off-screen once the pool grows. */}
      {guestOpen ? (
        <div className="mt-2.5 space-y-2 rounded-xl border border-line bg-bg p-3">
          <input
            value={guestName}
            onChange={(e) => setGuestName(e.target.value)}
            onKeyDown={onGuestKeyDown}
            placeholder="Guest name"
            autoFocus
            autoCapitalize="words"
            autoCorrect="off"
            enterKeyHint="done"
            className="min-h-12 w-full rounded-2xl border border-line bg-surface px-3.5 text-[16px] text-ink outline-none placeholder:text-faint focus:border-accent"
          />
          <input
            value={guestPhone}
            onChange={(e) => setGuestPhone(e.target.value)}
            onKeyDown={onGuestKeyDown}
            placeholder="Phone (optional — lets them claim stats later)"
            inputMode="tel"
            enterKeyHint="done"
            className="min-h-12 w-full rounded-2xl border border-line bg-surface px-3.5 text-[16px] text-ink outline-none placeholder:text-faint focus:border-accent"
          />
          <div className="flex gap-2">
            <Button
              type="button"
              variant="ghost"
              className="flex-1"
              onClick={() => setGuestOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              className="flex-1"
              disabled={addingGuest || guestName.trim().length < 2}
              onClick={() => void submitGuest()}
            >
              {addingGuest ? "Adding…" : "Add & select"}
            </Button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => {
            setGuestName(search.trim());
            setGuestOpen(true);
          }}
          className="mt-1 flex min-h-11 items-center gap-1.5 px-1 text-[13px] font-semibold text-accent-deep"
        >
          <Plus className="h-4 w-4" />
          Add guest player
        </button>
      )}

      {/* No inner scroller: a list that scrolls inside a scrolling page is
          fiddly one-handed, so the pool flows with the page instead. */}
      <div className="mt-1 space-y-1">
        {filtered.map((p) => {
          const selected = selectedSet.has(p.userId);
          return (
            <button
              key={p.userId}
              type="button"
              onClick={() => onToggle(p.userId)}
              className={cn(
                "flex min-h-11 w-full items-center justify-between rounded-xl px-3.5 py-2.5 text-left text-[15px] transition",
                selected
                  ? "bg-accent-soft font-medium text-accent-deep"
                  : "text-ink active:bg-bg",
              )}
            >
              <span className="flex min-w-0 items-center gap-2">
                <span className="truncate">{p.displayName}</span>
                {p.isGuest ? (
                  <span className="shrink-0 rounded-full border border-line bg-bg px-2 py-0.5 text-[11px] font-medium text-muted">
                    guest
                  </span>
                ) : null}
                {otherSet.has(p.userId) ? (
                  <span className="shrink-0 text-[11px] font-medium text-faint">
                    {selected ? "both teams" : "other team"}
                  </span>
                ) : null}
              </span>
              {selected ? <Check className="h-4 w-4 shrink-0" /> : null}
            </button>
          );
        })}
        {filtered.length === 0 ? (
          <p className="px-3.5 py-2.5 text-[13px] text-faint">No players found</p>
        ) : null}
      </div>
    </div>
  );
}
