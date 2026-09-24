"use client";

import { usePlayableGrounds } from "@/components/ground/GroundChips";
import { useAuth } from "@/components/providers/AuthProvider";
import { Button } from "@/components/ui/Button";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { defaultPollDay, pollDayOptions, pollTimes } from "@/lib/polls";
import { getLastPollTime, setLastPollTime } from "@/lib/session";
import { cn, errorMessage } from "@/lib/utils";
import { useMutation } from "convex/react";
import { useState } from "react";

const CHIP =
  "flex min-h-11 items-center justify-center rounded-lg border px-3 text-[13px] font-semibold";
const CHIP_ON = "border-accent bg-accent-soft text-accent-deep";
const CHIP_OFF = "border-line text-muted active:bg-bg";

/**
 * Ask the group. Everything arrives filled in — the coming weekend day, the
 * last start time used, the Home ground — so the usual ask is one tap on
 * "Ask the group". Same bottom-sheet shell as the wishlist's AskSheet.
 */
export function PollSheet({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated?: (pollId: Id<"polls">) => void;
}) {
  if (!open) return null;
  return <PollForm onClose={onClose} onCreated={onCreated} />;
}

function PollForm({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated?: (pollId: Id<"polls">) => void;
}) {
  const { token, activeOrgId } = useAuth();
  const create = useMutation(api.polls.create);
  const grounds = usePlayableGrounds();

  // Options are read once per opening, so a sheet left up past midnight
  // does not reshuffle under a thumb.
  const [days] = useState(() => pollDayOptions());
  const [day, setDay] = useState(() => defaultPollDay());
  const [time, setTime] = useState(() => getLastPollTime());
  const [groundId, setGroundId] = useState<Id<"grounds"> | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const chosenGround = groundId ?? grounds.find((g) => g.isHome)?._id ?? null;

  async function ask() {
    if (!token || !activeOrgId || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await create({
        token,
        orgId: activeOrgId,
        date: day,
        time,
        ...pollTimes(day, time),
        ...(chosenGround ? { groundId: chosenGround } : {}),
        note: note.trim() || undefined,
      });
      setLastPollTime(time);
      onCreated?.(res.pollId);
      onClose();
    } catch (e) {
      setError(errorMessage(e, "Could not ask the group"));
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-ink/40 sm:items-center">
      <div className="safe-bottom w-full max-w-sm px-4 sm:px-0">
        <div className="mb-4 max-h-[85vh] overflow-y-auto rounded-2xl bg-surface p-5 shadow-card sm:mb-0">
          <p className="text-[15px] font-semibold text-ink">Who&apos;s in?</p>

          <p className="mt-4 text-[13px] font-medium text-muted">Day</p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {days.map((d) => (
              <button
                key={d.key}
                type="button"
                aria-pressed={day === d.key}
                onClick={() => setDay(d.key)}
                className={cn(CHIP, day === d.key ? CHIP_ON : CHIP_OFF)}
              >
                {d.label}
              </button>
            ))}
          </div>

          <label className="mt-4 flex items-center justify-between gap-3">
            <span className="text-[13px] font-medium text-muted">Start</span>
            <input
              type="time"
              value={time}
              onChange={(e) => e.target.value && setTime(e.target.value)}
              className="min-h-12 rounded-xl border border-line bg-surface px-4 text-[16px] text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent/15"
            />
          </label>

          {grounds.length >= 2 ? (
            <>
              <p className="mt-4 text-[13px] font-medium text-muted">Ground</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {grounds.map((g) => (
                  <button
                    key={g._id}
                    type="button"
                    aria-pressed={chosenGround === g._id}
                    onClick={() => setGroundId(g._id)}
                    className={cn(
                      CHIP,
                      chosenGround === g._id ? CHIP_ON : CHIP_OFF,
                    )}
                  >
                    {g.name}
                  </button>
                ))}
              </div>
            </>
          ) : null}

          <input
            value={note}
            maxLength={120}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Note (optional)"
            className="mt-4 min-h-12 w-full rounded-xl border border-line bg-surface px-4 text-[16px] text-ink outline-none placeholder:text-faint focus:border-accent focus:ring-2 focus:ring-accent/15"
          />

          {error ? <p className="mt-2 text-[13px] text-danger">{error}</p> : null}

          <div className="mt-4 grid grid-cols-2 gap-2">
            <Button variant="secondary" disabled={busy} onClick={onClose}>
              Cancel
            </Button>
            <Button disabled={busy} onClick={() => void ask()}>
              {busy ? "Asking…" : "Ask the group"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
