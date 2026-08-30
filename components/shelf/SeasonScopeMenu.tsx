"use client";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { cn } from "@/lib/utils";
import type { FunctionReturnType } from "convex/server";
import { Check, ChevronDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";

export type Season = NonNullable<
  FunctionReturnType<typeof api.seasons.list>
>[number];

/**
 * What the reader picked. A season id means that season, live or finished.
 * A page holds `Scope | null`, where `null` is "not picked yet" and resolves
 * to the live season if one is running, else All time.
 */
export type Scope = "all" | { seasonId: Id<"seasons"> };

const SCOPE_ROW =
  "flex min-h-11 w-full items-center justify-between gap-2 px-4 text-left text-[15px] text-ink active:bg-bg";

/**
 * Seasons newest first, All time last under a hairline. Deliberately the same
 * control as the one in the Leaders header — a reader who has learned to
 * change season once has learned it everywhere. It is a copy rather than a
 * shared import only because Leaders shipped in a parallel pass; if a third
 * screen needs it, lift both into `components/ui/`.
 */
export function SeasonScopeMenu({
  seasons,
  selected,
  onSelect,
}: {
  seasons: Season[];
  /** null = All time. */
  selected: Season | null;
  onSelect: (next: Scope) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="-mx-1 flex h-11 items-center gap-1 rounded-lg px-1 text-[13px] font-semibold text-muted active:bg-bg"
      >
        <span className="whitespace-nowrap">
          {selected ? selected.name : "All time"}
        </span>
        <ChevronDown className="h-4 w-4 shrink-0" />
      </button>
      {open ? (
        <div
          role="listbox"
          className="absolute left-0 z-20 mt-1 max-h-72 w-52 overflow-y-auto overscroll-contain rounded-xl border border-line bg-surface shadow-lift"
        >
          {seasons.map((s) => {
            const on = selected?._id === s._id;
            return (
              <button
                key={s._id}
                type="button"
                role="option"
                aria-selected={on}
                onClick={() => {
                  onSelect({ seasonId: s._id });
                  setOpen(false);
                }}
                className={cn(SCOPE_ROW, on && "font-semibold text-accent-deep")}
              >
                <span className="truncate" title={s.name}>
                  {s.name}
                </span>
                {on ? <Check className="h-4 w-4 shrink-0" /> : null}
              </button>
            );
          })}
          <button
            type="button"
            role="option"
            aria-selected={selected === null}
            onClick={() => {
              onSelect("all");
              setOpen(false);
            }}
            className={cn(
              SCOPE_ROW,
              seasons.length > 0 && "border-t border-line",
              selected === null && "font-semibold text-accent-deep",
            )}
          >
            All time
            {selected === null ? <Check className="h-4 w-4 shrink-0" /> : null}
          </button>
        </div>
      ) : null}
    </div>
  );
}
