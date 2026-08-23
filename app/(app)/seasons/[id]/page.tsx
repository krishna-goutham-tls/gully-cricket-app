"use client";

import { MatchCard, SeriesCard, type MatchRow } from "@/components/home/HomeCards";
import { useAuth } from "@/components/providers/AuthProvider";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { groupByDay } from "@/lib/dates";
import { errorMessage } from "@/lib/utils";
import { useMutation, useQuery } from "convex/react";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo, useState } from "react";

type PendingAction =
  | { kind: "end"; matchId: string; label: string }
  | { kind: "delete"; matchId: string; label: string };

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-1 pb-1.5 pt-4 text-[11px] font-semibold uppercase tracking-wide text-faint">
      {children}
    </p>
  );
}

function inSeason(
  createdAt: number,
  startedAt: number,
  endedAt?: number,
) {
  if (createdAt < startedAt) return false;
  if (endedAt != null && createdAt >= endedAt) return false;
  return true;
}

export default function SeasonPage() {
  const { id } = useParams<{ id: string }>();
  const seasonId = id as Id<"seasons">;
  const { token, activeOrgId } = useAuth();
  const season = useQuery(
    api.seasons.get,
    token && activeOrgId ? { token, orgId: activeOrgId, seasonId } : "skip",
  );
  const matches = useQuery(
    api.matches.list,
    token && activeOrgId ? { token, orgId: activeOrgId } : "skip",
  );
  const tournaments = useQuery(
    api.tournaments.list,
    token && activeOrgId ? { token, orgId: activeOrgId } : "skip",
  );
  const board = useQuery(
    api.stats.leaderboard,
    token && activeOrgId && season
      ? {
          token,
          orgId: activeOrgId,
          includeVisitorsAndJuniors: false,
          seasonId: season._id,
        }
      : "skip",
  );

  const abandonMatch = useMutation(api.matches.abandon);
  const removeMatch = useMutation(api.matches.remove);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [busy, setBusy] = useState(false);

  const seasonMatches = useMemo(() => {
    if (!season || !matches) return [];
    return matches.filter((m) =>
      inSeason(m.createdAt, season.startedAt, season.endedAt),
    );
  }, [matches, season]);

  const series = useMemo(() => {
    if (!tournaments) return [];
    const ids = new Set(
      seasonMatches
        .map((m) => m.tournamentId)
        .filter((x): x is NonNullable<typeof x> => !!x)
        .map(String),
    );
    return tournaments.filter(
      (t) =>
        t.status === "active" ||
        ids.has(String(t._id)),
    );
  }, [tournaments, seasonMatches]);

  const { days, doneCount } = useMemo(() => {
    const done = seasonMatches.filter(
      (m) => m.status === "completed" || m.status === "abandoned",
    );
    return {
      days: groupByDay(done, (m) => m.createdAt),
      doneCount: done.length,
    };
  }, [seasonMatches]);

  const orange = board?.batting[0]?.displayName ?? null;
  const purple = board?.bowling[0]?.displayName ?? null;
  const capsLoading = season != null && board === undefined;

  function endMatch(matchId: string, label: string) {
    setMenuFor(null);
    setPending({ kind: "end", matchId, label });
  }
  function deleteMatch(matchId: string, label: string) {
    setMenuFor(null);
    setPending({ kind: "delete", matchId, label });
  }
  async function runPending() {
    if (!token || !pending) return;
    setError(null);
    setBusy(true);
    try {
      if (pending.kind === "end") {
        await abandonMatch({
          token,
          matchId: pending.matchId as Id<"matches">,
        });
      } else {
        await removeMatch({
          token,
          matchId: pending.matchId as Id<"matches">,
        });
      }
      setPending(null);
    } catch (e) {
      setError(
        errorMessage(
          e,
          pending.kind === "end"
            ? "Could not end that match"
            : "Could not delete that match",
        ),
      );
      setPending(null);
    } finally {
      setBusy(false);
    }
  }

  const cardProps = (m: MatchRow) => ({
    match: m,
    menuOpen: menuFor === m._id,
    onToggleMenu: () => setMenuFor(menuFor === m._id ? null : m._id),
    onEnd: endMatch,
    onDelete: deleteMatch,
  });

  return (
    <div className="bg-bg">
      <header className="sticky top-0 z-30 border-b border-line bg-bg/90 px-5 pb-3 pt-[calc(var(--safe-top)+0.75rem)] backdrop-blur-md">
        <div className="mx-auto flex max-w-md items-center gap-1">
          <Link
            href="/home"
            aria-label="Back to home"
            className="-ml-2 flex h-11 w-11 items-center justify-center rounded-lg text-muted active:bg-line/60"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div className="min-w-0">
            <h1 className="text-xl font-semibold leading-tight tracking-tight text-ink">
              {season?.name ?? "Season"}
            </h1>
            <p className="tabular text-[13px] text-muted">
              {matches === undefined || !season
                ? "Loading…"
                : `${doneCount} match${doneCount === 1 ? "" : "es"}`}
            </p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-md px-5 pb-4">
        {error ? (
          <p className="mt-3 rounded-2xl border border-danger/20 bg-danger-soft px-4 py-2.5 text-[13px] text-danger">
            {error}
          </p>
        ) : null}

        <div className="mt-3 flex flex-wrap items-center gap-x-1 border-b border-line pb-1">
          <Link
            href="/leaderboard?cap=orange"
            className="inline-flex min-h-11 items-center px-1 text-[13px] leading-snug"
          >
            <span className="font-semibold text-accent-deep">Orange Cap</span>
            {capsLoading ? (
              <span className="ml-1 inline-block h-3 w-14 animate-pulse rounded-md bg-ink/[0.08]" />
            ) : orange ? (
              <span className="text-ink"> {orange}</span>
            ) : null}
          </Link>
          <span className="text-muted">·</span>
          <Link
            href="/leaderboard?cap=purple"
            className="inline-flex min-h-11 items-center px-1 text-[13px] leading-snug"
          >
            <span className="font-semibold text-accent-deep">Purple Cap</span>
            {capsLoading ? (
              <span className="ml-1 inline-block h-3 w-14 animate-pulse rounded-md bg-ink/[0.08]" />
            ) : purple ? (
              <span className="text-ink"> {purple}</span>
            ) : null}
          </Link>
        </div>

        {series.length > 0 ? (
          <div className="mt-3 space-y-2">
            {series.map((s) => (
              <SeriesCard key={s._id} series={s} />
            ))}
          </div>
        ) : null}

        {matches === undefined || season === undefined ? (
          <div className="mt-4 space-y-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-20 animate-pulse rounded-2xl bg-ink/[0.04]" />
            ))}
          </div>
        ) : season === null ? (
          <div className="mt-6">
            <EmptyState title="Season not found" body="It may have been removed." />
          </div>
        ) : days.length === 0 ? (
          <div className="mt-6">
            <EmptyState
              title="No matches this season yet"
              body="Start a match from Home. It will land in this stretch."
            />
          </div>
        ) : (
          days.map((day) => (
            <div key={day.key}>
              <SectionLabel>{day.label}</SectionLabel>
              <div className="space-y-2">
                {day.items.map((m) => (
                  <MatchCard key={m._id} {...cardProps(m)} />
                ))}
              </div>
            </div>
          ))
        )}
      </main>

      <ConfirmDialog
        open={pending !== null}
        title={
          pending?.kind === "end"
            ? `End ${pending.label} without a result?`
            : `Delete ${pending?.label}?`
        }
        description={
          pending?.kind === "end"
            ? "It stays in your history."
            : "Every ball scored in it goes too. This cannot be undone."
        }
        confirmLabel={pending?.kind === "end" ? "End match" : "Delete"}
        danger={pending?.kind === "delete"}
        busy={busy}
        onConfirm={runPending}
        onCancel={() => setPending(null)}
      />
    </div>
  );
}
