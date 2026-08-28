"use client";

import { SeriesCard, type SeriesRow } from "@/components/home/HomeCards";
import { useAuth } from "@/components/providers/AuthProvider";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { api } from "@/convex/_generated/api";
import { TruncText } from "@/components/ui/TruncText";
import { errorMessage } from "@/lib/utils";
import { useMutation, useQuery } from "convex/react";
import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

function CapName({
  label,
  name,
  loading,
}: {
  label: string;
  name: string | null;
  loading: boolean;
}) {
  return (
    <span>
      <span className="font-semibold text-accent-deep">{label}</span>
      {loading ? (
        <span
          aria-hidden
          className="ml-1 inline-block h-3 w-14 animate-pulse rounded-md bg-ink/[0.08] align-middle"
        />
      ) : name ? (
        <span className="text-ink"> {name}</span>
      ) : null}
    </span>
  );
}

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
 * Home's season folder. A live series sits inside it — same card language,
 * nested. Play (Start match) stays above, outside this card.
 */
export function SeasonStrip({ series }: { series?: SeriesRow | null }) {
  const { token, activeOrgId, isAdmin, user } = useAuth();
  const router = useRouter();
  const current = useQuery(
    api.seasons.current,
    token && activeOrgId ? { token, orgId: activeOrgId } : "skip",
  );
  const seasons = useQuery(
    api.seasons.list,
    token && activeOrgId && current === null
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

  const capsLoading = !!current && board === undefined;
  const orange = board?.batting[0]?.displayName ?? null;
  const purple = board?.bowling[0]?.displayName ?? null;

  async function runPending() {
    if (!token || !activeOrgId || !pending) return;
    setBusy(true);
    setError(null);
    try {
      if (pending === "start") {
        await startSeason({ token, orgId: activeOrgId });
        setPending(null);
      } else {
        const seasonId = await endSeason({ token, orgId: activeOrgId });
        setPending(null);
        router.push(`/seasons/${seasonId}/wrap`);
        return;
      }
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
      <div className="mt-3 h-24 animate-pulse rounded-2xl bg-ink/[0.04]" />
    );
  }

  return (
    <>
      <div className="mt-3 rounded-2xl border border-line bg-surface shadow-card">
        {error ? (
          <p className="mx-4 mt-3 rounded-xl border border-danger/20 bg-danger-soft px-4 py-2.5 text-[13px] text-danger">
            {error}
          </p>
        ) : null}

        {current ? (
          <>
            <Link
              href={`/seasons/${current._id}`}
              className="flex min-h-11 items-center gap-2 px-4 py-3 active:bg-bg"
            >
              <span className="min-w-0 flex-1">
                <TruncText className="text-[15px] font-semibold text-ink">
                  {current.name}
                </TruncText>
                {rank != null ? (
                  <span className="mt-0.5 block text-[13px] text-muted">
                    You · {ordinal(rank)} all-round
                  </span>
                ) : null}
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-faint" />
            </Link>
            {series ? (
              <div className="px-3 pb-3">
                <SeriesCard series={series} nested />
              </div>
            ) : null}
            <div className="flex flex-wrap items-center gap-x-1 border-t border-line px-3">
              <Link
                href="/leaderboard?cap=orange"
                className="inline-flex min-h-11 items-center px-1 text-[13px] leading-snug"
              >
                <CapName
                  label="Orange Cap"
                  name={orange}
                  loading={capsLoading}
                />
              </Link>
              <span className="text-muted">·</span>
              <Link
                href="/leaderboard?cap=purple"
                className="inline-flex min-h-11 items-center px-1 text-[13px] leading-snug"
              >
                <CapName
                  label="Purple Cap"
                  name={purple}
                  loading={capsLoading}
                />
              </Link>
            </div>
            {isAdmin ? (
              <button
                type="button"
                onClick={() => setPending("end")}
                className="flex min-h-11 w-full items-center justify-center border-t border-line text-[13px] font-semibold text-muted active:bg-bg"
              >
                End season
              </button>
            ) : null}
          </>
        ) : (
          <div className="px-4 py-3">
            {(() => {
              const last = (seasons ?? []).find((s) => s.status === "complete");
              if (last) {
                return (
                  <Link
                    href={`/seasons/${last._id}`}
                    className="flex min-h-11 items-center gap-2 active:opacity-80"
                  >
                    <span className="min-w-0 flex-1">
                      <TruncText className="text-[15px] font-semibold text-ink">
                        {last.name}
                      </TruncText>
                      <span className="mt-0.5 block text-[13px] text-muted">
                        The trophies
                      </span>
                    </span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-faint" />
                  </Link>
                );
              }
              return (
                <>
                  <p className="text-[15px] font-semibold text-ink">
                    No season yet
                  </p>
                  <p className="mt-0.5 text-[13px] leading-relaxed text-muted">
                    Start one to open a fresh board. All-time stays.
                  </p>
                </>
              );
            })()}
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
      {!current && series ? (
        <div className="mt-3">
          <SeriesCard series={series} />
        </div>
      ) : null}

      <ConfirmDialog
        open={pending !== null}
        title={
          pending === "end"
            ? `End ${current?.name ?? "this season"}?`
            : `Start ${startName}?`
        }
        description={
          pending === "end"
            ? "Caps lock in. Then the season cards."
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
