"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { SideChoice, type SideValue } from "@/components/match/SideChoice";
import { cn } from "@/lib/utils";

type Side = "A" | "B";

export type SquadSheetRow = {
  userId: string;
  displayName: string;
  sides: Side[];
};

const toValue = (sides: Side[]): SideValue =>
  sides.length === 2 ? "both" : (sides[0] ?? null);

const toSides = (value: Exclude<SideValue, null>): Side[] =>
  value === "both" ? ["A", "B"] : [value];

/**
 * Add or move a player during a match. Late arrivals are the common case, so
 * search and Not playing come first, and players already in sit one tap away.
 * Every tap saves straight away. Done stays in view at the bottom.
 */
export function SquadSheet({
  rows,
  nameA,
  nameB,
  captainA,
  captainB,
  busyId,
  error,
  guestBusy,
  onAssign,
  onAddGuest,
  onDone,
}: {
  rows: SquadSheetRow[];
  nameA: string;
  nameB: string;
  captainA?: string;
  captainB?: string;
  busyId: string | null;
  error: { userId: string | null; message: string } | null;
  guestBusy: boolean;
  onAssign: (userId: string, sides: Side[]) => Promise<boolean>;
  onAddGuest: (name: string) => Promise<void>;
  onDone: () => void;
}) {
  const [query, setQuery] = useState("");
  const [inOpen, setInOpen] = useState(false);
  // A placed player leaves Not playing at once, so the tick sits on the sheet.
  const [saved, setSaved] = useState<string | null>(null);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (savedTimer.current) clearTimeout(savedTimer.current);
    },
    [],
  );

  const q = query.trim().toLowerCase();
  const matching = rows.filter((r) => r.displayName.toLowerCase().includes(q));
  const notPlaying = matching.filter((r) => r.sides.length === 0);
  const inMatch = matching.filter((r) => r.sides.length > 0);
  const exactName = rows.some((r) => r.displayName.toLowerCase() === q);
  const canAdd = q.length >= 2 && !exactName;
  const showIn = inOpen || q.length > 0;

  async function assign(userId: string, sides: Side[]) {
    const ok = await onAssign(userId, sides);
    if (!ok) return;
    const name = rows.find((r) => r.userId === userId)?.displayName ?? "Player";
    const where =
      sides.length === 2
        ? "Both"
        : sides[0] === "A"
          ? "A"
          : sides[0] === "B"
            ? "B"
            : "Out";
    setSaved(`${name} · ${where}`);
    if (savedTimer.current) clearTimeout(savedTimer.current);
    savedTimer.current = setTimeout(() => setSaved(null), 2000);
  }

  const playerRow = (row: SquadSheetRow) => {
    const leads = {
      A: captainA === row.userId,
      B: captainB === row.userId,
    };
    // The server keeps a captain on their side, so those moves are not offered.
    const locked: Array<Exclude<SideValue, null>> = [
      ...(leads.A ? (["B"] as const) : []),
      ...(leads.B ? (["A"] as const) : []),
    ];
    const canRemove = row.sides.length > 0 && !leads.A && !leads.B;
    const rowError = error?.userId === row.userId ? error.message : null;
    return (
      <div key={row.userId} className="py-1.5">
        <div className="flex items-center gap-2">
          <p className="min-w-0 flex-1 truncate text-[15px] font-semibold text-ink">
            {row.displayName}
          </p>
          {canRemove ? (
            <button
              type="button"
              aria-label={`Take ${row.displayName} out of the match`}
              disabled={busyId !== null}
              onClick={() => void assign(row.userId, [])}
              className="flex h-11 w-9 shrink-0 items-center justify-center text-faint active:text-danger disabled:opacity-40"
            >
              <X className="h-4 w-4" />
            </button>
          ) : null}
          <SideChoice
            name={row.displayName}
            value={toValue(row.sides)}
            disabled={busyId !== null}
            locked={locked}
            onChange={(next) => void assign(row.userId, toSides(next))}
          />
        </div>
        {rowError ? (
          <p className="mt-1 text-[13px] text-danger">{rowError}</p>
        ) : null}
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-ink/30">
      <div className="flex max-h-[85dvh] w-full flex-col rounded-t-3xl bg-surface shadow-2xl">
        <div className="shrink-0 space-y-2 px-5 pt-5">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[15px] font-semibold text-ink">Players</p>
            <p
              role="status"
              className="flex min-w-0 items-center gap-1 text-[13px] font-semibold text-accent-deep"
            >
              {saved ? (
                <>
                  <Check aria-hidden className="h-4 w-4 shrink-0" />
                  <span className="truncate">{saved}</span>
                </>
              ) : null}
            </p>
          </div>
          <p className="flex gap-3 text-[13px] text-muted">
            <span className="min-w-0 flex-1 truncate">
              <span className="font-semibold text-accent-deep">A</span> {nameA}
            </span>
            <span className="min-w-0 flex-1 truncate">
              <span className="font-semibold text-accent-deep">B</span> {nameB}
            </span>
          </p>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search or add a name"
            aria-label="Search or add a name"
            autoCapitalize="words"
            enterKeyHint="done"
            className="min-h-12 w-full rounded-2xl border border-line bg-bg px-3 text-[16px] outline-none focus:border-accent"
          />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-3 pt-2">
          {canAdd ? (
            <Button
              fullWidth
              variant="secondary"
              disabled={guestBusy}
              onClick={() => void onAddGuest(query.trim())}
            >
              {guestBusy ? "Adding…" : `Add “${query.trim()}”`}
            </Button>
          ) : null}
          {error?.userId === null ? (
            <p className="mt-2 text-[13px] text-danger">{error.message}</p>
          ) : null}

          {notPlaying.length > 0 ? (
            <section className="mt-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-faint">
                Not playing
              </p>
              <div className="divide-y divide-line">
                {notPlaying.map(playerRow)}
              </div>
            </section>
          ) : null}

          {inMatch.length > 0 ? (
            <section className="mt-3">
              <button
                type="button"
                aria-expanded={showIn}
                onClick={() => setInOpen((v) => !v)}
                className="flex min-h-11 w-full items-center justify-between text-[11px] font-semibold uppercase tracking-wide text-faint"
              >
                <span>In this match · {inMatch.length}</span>
                <ChevronDown
                  aria-hidden
                  className={cn(
                    "h-4 w-4 transition-transform",
                    showIn && "rotate-180",
                  )}
                />
              </button>
              {showIn ? (
                <div className="divide-y divide-line">
                  {inMatch.map(playerRow)}
                </div>
              ) : null}
            </section>
          ) : null}
        </div>

        <div className="safe-bottom shrink-0 border-t border-line px-5 pt-3">
          <div className="pb-3">
            <Button fullWidth size="lg" onClick={onDone}>
              Done
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
