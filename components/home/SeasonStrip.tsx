"use client";

import { useAuth } from "@/components/providers/AuthProvider";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { api } from "@/convex/_generated/api";
import { errorMessage } from "@/lib/utils";
import { useMutation, useQuery } from "convex/react";
import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

function ordinal(n: number) {
  const v = n % 100;
  const suffix =
    v >= 11 && v <= 13
      ? "th"
      : v % 10 === 1
        ? "st"
        : v % 10 === 2
          ? "nd"
          : v % 10 === 3
            ? "rd"
            : "th";
  return `${n}${suffix}`;
}

/**
 * Home's season strip — play stays above this. One card: the live season,
 * or a quiet empty state. Admin start/end live here; winners are never picked.
 */
export function SeasonStrip() {
  const { token, activeOrgId, isAdmin, user } = useAuth();
  const current = useQuery(
    api.seasons.current,
    token && activeOrgId ? { token, orgId: activeOrgId } : "skip",
  );
  const seasons = useQuery(
    api.seasons.list,
    token && activeOrgId && isAdmin && current === null
      ? { token, orgId: activeOrgId }
      : "skip",
  );
  const board = useQuery(
    api.stats.leaderboard,
    token && activeOrgId && current
      ? {
          token,
          orgId: activeOrgId,
          includeVisitorsAndJuniors: false,
          seasonId: current._id,
        }
      : "skip",
  );
  const startSeason = useMutation(api.seasons.start);
  const endSeason = useMutation(api.seasons.end);

  const [pending, setPending] = useState<"start" | "end" | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startName =
    seasons === undefined
      ? "a season"
      : `Season-${String((seasons ?? []).length + 1).padStart(2, "0")}`;

  const rank = useMemo(() => {
    if (!board || !user) return null;
    const i = board.allRound.findIndex(
      (r) => String(r.userId) === String(user._id),
    );
    return i >= 0 ? i + 1 : null;
  }, [board, user]);

  const orange = board?.batting[0]?.displayName ?? null;
  const purple = board?.bowling[0]?.displayName ?? null;

  async function runPending() {
    if (!token || !activeOrgId || !pending) return;
    setBusy(true);
    setError(null);
    try {
      if (pending === "start") {
        await startSeason({ token, orgId: activeOrgId });
      } else {
        await endSeason({ token, orgId: activeOrgId });
      }
      setPending(null);
    } catch (e) {
      setError(
        errorMessage(
          e,
          pending === "start"
            ? "Could not start the season"
            : "Could not end the season",
        ),
      );
      setPending(null);
    } finally {
      setBusy(false);
    }
  }

  if (current === undefined) {
    return (
      <div className="mt-3 h-24 animate-pulse rounded-3xl bg-ink/[0.04]" />
    );
  }

  return (
    <>
      <div className="mt-3 rounded-3xl border border-line bg-surface shadow-card">
        {error ? (
          <p className="mx-4 mt-3 rounded-2xl border border-danger/20 bg-danger-soft px-4 py-2.5 text-sm text-danger">
            {error}
          </p>
        ) : null}

        {current ? (
          <>
            <Link
              href="/leaderboard"
              className="flex min-h-11 items-start gap-2 px-4 py-3 active:bg-bg"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] font-semibold text-ink">
                  {current.name}
                </span>
                {rank != null ? (
                  <span className="mt-0.5 block text-[13px] text-muted">
                    You · {ordinal(rank)} all-round
                  </span>
                ) : null}
                {orange || purple ? (
                  <span className="mt-1.5 block space-y-0.5 text-[13px]">
                    {orange ? (
                      <span className="block truncate">
                        <span className="font-semibold text-accent-deep">
                          Orange Cap
                        </span>
                        <span className="text-ink"> {orange}</span>
                      </span>
                    ) : null}
                    {purple ? (
                      <span className="block truncate">
                        <span className="font-semibold text-accent-deep">
                          Purple Cap
                        </span>
                        <span className="text-ink"> {purple}</span>
                      </span>
                    ) : null}
                  </span>
                ) : null}
              </span>
              <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-faint" />
            </Link>
            {isAdmin ? (
              <div className="px-4 pb-4">
                <Button
                  variant="secondary"
                  fullWidth
                  onClick={() => setPending("end")}
                >
                  End season
                </Button>
              </div>
            ) : null}
          </>
        ) : (
          <div className="px-4 py-3">
            <p className="text-[15px] font-semibold text-ink">No season yet</p>
            <p className="mt-0.5 text-[13px] leading-relaxed text-muted">
              Start one to open a fresh board. All-time stays.
            </p>
            {isAdmin ? (
              <div className="mt-3">
                <Button fullWidth onClick={() => setPending("start")}>
                  Start season
                </Button>
              </div>
            ) : null}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={pending !== null}
        title={
          pending === "end"
            ? `End ${current?.name ?? "this season"}?`
            : `Start ${startName}?`
        }
        description={
          pending === "end"
            ? "Caps lock in. All-time stays."
            : "A fresh board. All-time stays."
        }
        confirmLabel={pending === "end" ? "End season" : "Start season"}
        busy={busy}
        onConfirm={runPending}
        onCancel={() => setPending(null)}
      />
    </>
  );
}
