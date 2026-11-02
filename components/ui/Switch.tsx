import { cn } from "@/lib/utils";

/**
 * The look of an on/off switch, 44 x 24, gold when on. It is not a button:
 * put it inside the row's button so the whole row takes the tap.
 */
export function SwitchTrack({ checked }: { checked: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        "relative h-6 w-11 shrink-0 rounded-full transition-colors",
        checked ? "bg-accent" : "bg-line",
      )}
    >
      <span
        className={cn(
          "absolute top-0.5 h-5 w-5 rounded-full bg-surface shadow transition-all",
          checked ? "left-[22px]" : "left-0.5",
        )}
      />
    </span>
  );
}

/** The whole row is the switch, so the tap target is the full row. */
export function SwitchRow({
  label,
  line,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  line?: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (on: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="flex min-h-14 w-full items-center gap-3 border-t border-line px-4 py-3 text-left first:border-t-0 active:bg-bg disabled:opacity-60"
    >
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-semibold text-ink">{label}</span>
        {line ? (
          <span className="block text-[13px] leading-snug text-muted">{line}</span>
        ) : null}
      </span>
      <SwitchTrack checked={checked} />
    </button>
  );
}
