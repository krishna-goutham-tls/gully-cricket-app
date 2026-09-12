"use client";

import { cn } from "@/lib/utils";
import { useEffect, useState } from "react";

/** Small integer box. Digits only while typing. Clamp on blur, not per key. */
export function NumberField({
  value,
  min,
  max,
  onChange,
  "aria-label": ariaLabel,
  className,
}: {
  value: number;
  min: number;
  max: number;
  onChange: (n: number) => void;
  "aria-label"?: string;
  className?: string;
}) {
  const [raw, setRaw] = useState(String(value));
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) setRaw(String(value));
  }, [value, focused]);

  function clamp(n: number) {
    return Math.min(max, Math.max(min, n));
  }

  function commit(text: string) {
    const n = parseInt(text, 10);
    const next = Number.isInteger(n) ? clamp(n) : min;
    onChange(next);
    setRaw(String(next));
  }

  return (
    <input
      type="text"
      inputMode="numeric"
      pattern="[0-9]*"
      enterKeyHint="done"
      autoComplete="off"
      aria-label={ariaLabel}
      value={focused ? raw : String(value)}
      onFocus={(e) => {
        setFocused(true);
        setRaw(String(value));
        e.target.select();
      }}
      onChange={(e) => {
        const digits = e.target.value.replace(/\D/g, "");
        setRaw(digits);
        if (digits === "") return;
        const n = parseInt(digits, 10);
        if (Number.isInteger(n)) onChange(n);
      }}
      onBlur={() => {
        setFocused(false);
        commit(raw);
      }}
      className={cn(
        "tabular h-11 w-20 rounded-xl border border-line bg-bg px-3 text-center text-[16px] font-semibold text-ink outline-none focus:border-ink",
        className,
      )}
    />
  );
}
