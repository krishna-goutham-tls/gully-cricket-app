"use client";

import { Minus, Plus } from "lucide-react";

/** One setting inside a "Change" panel: the label left, the control right. */
export function SettingRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <p className="text-[15px] font-semibold text-ink">{label}</p>
      {children}
    </div>
  );
}

export function Choice<T extends string>({
  options,
  value,
  onChange,
}: {
  options: Array<{ value: T; label: string }>;
  value: T;
  onChange: (next: T) => void;
}) {
  return (
    <div className="flex rounded-xl border border-line p-1">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          aria-pressed={value === opt.value}
          onClick={() => onChange(opt.value)}
          className={
            value === opt.value
              ? "min-h-11 rounded-lg bg-ink px-4 text-[13px] font-semibold text-bg"
              : "min-h-11 rounded-lg px-4 text-[13px] font-semibold text-muted"
          }
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

/** Minus, the number, plus. The caller clamps the value. */
export function Stepper({
  value,
  decLabel,
  incLabel,
  onDec,
  onInc,
}: {
  value: number;
  decLabel: string;
  incLabel: string;
  onDec: () => void;
  onInc: () => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        aria-label={decLabel}
        onClick={onDec}
        className="flex h-11 w-11 items-center justify-center rounded-xl border border-line text-muted active:bg-bg"
      >
        <Minus className="h-4 w-4" />
      </button>
      <span className="tabular w-8 text-center text-[15px] font-semibold text-ink">
        {value}
      </span>
      <button
        type="button"
        aria-label={incLabel}
        onClick={onInc}
        className="flex h-11 w-11 items-center justify-center rounded-xl border border-line text-muted active:bg-bg"
      >
        <Plus className="h-4 w-4" />
      </button>
    </div>
  );
}
