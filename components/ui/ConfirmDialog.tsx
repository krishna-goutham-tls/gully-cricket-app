"use client";

import { Button } from "./Button";

/**
 * In-app replacement for window.confirm(). iOS silently no-ops confirm()
 * for a PWA opened from the home screen (standalone display mode) — taps on
 * a delete/end button did nothing, with no error, because the dialog that
 * was supposed to gate the action never ran.
 */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Confirm",
  danger,
  busy,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-ink/40 p-4 sm:items-center">
      <div className="w-full max-w-sm rounded-3xl bg-surface p-5 shadow-card">
        <p className="text-[16px] font-semibold text-ink">{title}</p>
        {description ? (
          <p className="mt-1.5 text-[13px] leading-relaxed text-muted">
            {description}
          </p>
        ) : null}
        <div className="mt-5 grid grid-cols-2 gap-2">
          <Button variant="secondary" disabled={busy} onClick={onCancel}>
            Cancel
          </Button>
          <Button
            variant={danger ? "danger" : "primary"}
            disabled={busy}
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
