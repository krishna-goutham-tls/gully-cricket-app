"use client";

import { Crown, X } from "lucide-react";
import { TruncText } from "@/components/ui/TruncText";
import { SideChoice, type SideValue } from "@/components/match/SideChoice";

/**
 * One player, one row: the name, a crown on a captain, and `A`, `Both`, `B`.
 * Match setup, series squads and the match Players sheet all use it, so a row
 * reads the same everywhere. Tapping the name makes them captain when
 * `onMakeCaptain` is given; an X on the left takes them out when `onRemove` is.
 */
export function PlayerSideRow({
  name,
  value,
  onChange,
  captain = false,
  onMakeCaptain,
  canLead = true,
  onRemove,
  removeLabel,
  locked,
  disabled,
  error,
  className,
}: {
  name: string;
  value: SideValue;
  onChange: (next: Exclude<SideValue, null>) => void;
  captain?: boolean;
  onMakeCaptain?: () => void;
  /** A player on Both cannot lead one side. */
  canLead?: boolean;
  onRemove?: () => void;
  removeLabel?: string;
  locked?: Array<Exclude<SideValue, null>>;
  disabled?: boolean;
  error?: string | null;
  className?: string;
}) {
  const label = (
    <>
      <TruncText lines={2} className="text-[15px] font-semibold text-ink">
        {name}
      </TruncText>
      {captain ? (
        <Crown aria-hidden className="h-4 w-4 shrink-0 text-accent-deep" />
      ) : null}
    </>
  );
  return (
    <div className={className}>
      <div className="flex items-center gap-2">
        {onRemove ? (
          <button
            type="button"
            aria-label={removeLabel ?? `Take ${name} out`}
            disabled={disabled}
            onClick={onRemove}
            className="-ml-3 flex h-11 w-11 shrink-0 items-center justify-center text-faint active:text-danger disabled:opacity-40"
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}
        {onMakeCaptain ? (
          <button
            type="button"
            disabled={!canLead}
            aria-label={captain ? `${name}, captain` : `Make ${name} captain`}
            onClick={onMakeCaptain}
            className="flex min-h-12 min-w-0 flex-1 items-center gap-1.5 text-left"
          >
            {label}
          </button>
        ) : (
          <span className="flex min-w-0 flex-1 items-center gap-1.5">
            {label}
          </span>
        )}
        <SideChoice
          name={name}
          value={value}
          disabled={disabled}
          locked={locked}
          onChange={onChange}
        />
      </div>
      {error ? <p className="mt-1 text-[13px] text-danger">{error}</p> : null}
    </div>
  );
}
