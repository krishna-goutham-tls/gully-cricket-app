"use client";

import { cn } from "@/lib/utils";
import { Delete } from "lucide-react";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "del"] as const;

export function PinPad({
  value,
  onChange,
  maxLength = 4,
  disabled,
}: {
  value: string;
  onChange: (next: string) => void;
  maxLength?: number;
  disabled?: boolean;
}) {
  function press(key: (typeof KEYS)[number]) {
    if (disabled) return;
    if (key === "") return;
    if (key === "del") {
      onChange(value.slice(0, -1));
      return;
    }
    if (value.length >= maxLength) return;
    onChange(value + key);
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-center gap-3">
        {Array.from({ length: maxLength }).map((_, i) => (
          <span
            key={i}
            className={cn(
              "h-3 w-3 rounded-full border transition",
              i < value.length
                ? "border-accent bg-accent"
                : "border-line bg-transparent",
            )}
          />
        ))}
      </div>
      <div className="grid grid-cols-3 gap-2.5">
        {KEYS.map((key, idx) => {
          if (key === "") return <div key={idx} />;
          return (
            <button
              key={idx}
              type="button"
              disabled={disabled}
              onClick={() => press(key)}
              className={cn(
                "flex h-14 items-center justify-center rounded-2xl border border-line bg-surface text-xl font-semibold text-ink transition active:scale-95 active:bg-bg disabled:opacity-40",
                key === "del" && "text-muted",
              )}
            >
              {key === "del" ? <Delete className="h-5 w-5" /> : key}
            </button>
          );
        })}
      </div>
    </div>
  );
}
