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
