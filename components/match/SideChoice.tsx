"use client";

import { cn } from "@/lib/utils";

export type SideValue = "A" | "both" | "B" | null;

const OPTIONS: Array<{ value: Exclude<SideValue, null>; label: string }> = [
  { value: "A", label: "A" },
  { value: "both", label: "Both" },
  { value: "B", label: "B" },
];

/**
 * Where a player goes, in one tap: team A, both teams, or team B. Used wherever
 * a player is placed, so the same row means the same thing everywhere.
 */
export function SideChoice({
  name,
  value,
  disabled,
  locked = [],
  onChange,
}: {
  name: string;
  value: SideValue;
  disabled?: boolean;
  /** Options this player cannot take, such as a captain leaving their side. */
  locked?: Array<Exclude<SideValue, null>>;
  onChange: (next: Exclude<SideValue, null>) => void;
}) {
  return (
    <div
      role="group"
      aria-label={`Team for ${name}`}
      className="flex shrink-0 rounded-xl border border-line p-0.5"
    >
      {OPTIONS.map((opt) => {
        const on = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            aria-pressed={on}
            disabled={disabled || (!on && locked.includes(opt.value))}
            onClick={() => {
              if (!on) onChange(opt.value);
            }}
            className={cn(
              "min-h-11 rounded-[10px] text-[13px] font-semibold transition disabled:opacity-40",
              opt.value === "both" ? "w-14" : "w-11",
              on ? "bg-ink text-bg disabled:opacity-100" : "text-muted active:bg-bg",
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
