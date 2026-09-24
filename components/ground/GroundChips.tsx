"use client";

import { useAuth } from "@/components/providers/AuthProvider";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { cn } from "@/lib/utils";
import { useQuery } from "convex/react";
import { useMemo } from "react";

export type Ground = {
  _id: Id<"grounds">;
  name: string;
  isHome: boolean;
};

/**
 * The community's grounds a match can be played at, Home first. Empty while
 * loading and for a community that has never added one — both read as "one
 * place", which is how every screen treats them.
 */
export function usePlayableGrounds(): Ground[] {
  const { token, activeOrgId } = useAuth();
  const all = useQuery(
    api.grounds.list,
    token && activeOrgId ? { token, orgId: activeOrgId } : "skip",
  );
  return useMemo(() => (all ?? []).filter((g) => !g.archived), [all]);
}

/**
 * "All grounds / Sonesta / Turf". Only a community with two or more grounds
 * gets it — with one, every board is already that ground's board.
 */
export function GroundChips({
  grounds,
  value,
  onChange,
  className,
}: {
  grounds: Ground[];
  /** null = all grounds. */
  value: Id<"grounds"> | null;
  onChange: (next: Id<"grounds"> | null) => void;
  className?: string;
}) {
  if (grounds.length < 2) return null;
  const options: Array<{ id: Id<"grounds"> | null; label: string }> = [
    { id: null, label: "All grounds" },
    ...grounds.map((g) => ({ id: g._id, label: g.name })),
  ];
  return (
    <div
      className={cn("no-scrollbar -mx-5 overflow-x-auto px-5", className)}
      role="group"
      aria-label="Ground"
    >
      <div className="flex gap-2">
        {options.map((o) => {
          const on = value === o.id;
          return (
            <button
              key={o.id ?? "all"}
              type="button"
              aria-pressed={on}
              onClick={() => onChange(o.id)}
              className={cn(
                "min-h-11 shrink-0 whitespace-nowrap rounded-lg border px-3 text-[13px] font-semibold",
                on
                  ? "border-accent bg-accent-soft text-accent-deep"
                  : "border-line text-muted active:bg-bg",
              )}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
