"use client";

import { MatchCard, SeriesCard, type MatchRow } from "@/components/home/HomeCards";
import { useAuth } from "@/components/providers/AuthProvider";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  RECORD_MIN_BALLS,
  RECORD_MIN_INNINGS,
} from "@/components/leaderboard/records";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { groupByDay } from "@/lib/dates";
import {
  type SeasonAwardKind,
  type StampedAwardKind,
} from "@/lib/trophies";
import { errorMessage } from "@/lib/utils";
import { useMutation, useQuery } from "convex/react";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo, useState } from "react";

/** The six caps this page names. Shelf trophies get their own page. */
const AWARD_LABEL: Partial<Record<StampedAwardKind, string>> = {
  pots: "Player of the season",
  orange_cap: "Orange Cap",
  purple_cap: "Purple Cap",
  most_sixes: "Most sixes",
  highest_sr: "Highest strike rate",
  best_economy: "Best economy",
};

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

  const trophies = useMemo(() => {
    if (!board) return [];
    const out: Array<{
      kind: SeasonAwardKind;
      name: string;
      display: string;
    }> = [];
    const pots = board.allRound[0];
    if (pots)
      out.push({
        kind: "pots",
        name: pots.displayName,
        display: String(pots.points),
      });
    const orange = board.batting[0];
    if (orange && orange.runs > 0)
      out.push({
        kind: "orange_cap",
        name: orange.displayName,
        display: String(orange.runs),
      });
    const purple = board.bowling[0];
    if (purple && purple.wickets > 0)
      out.push({
        kind: "purple_cap",
        name: purple.displayName,
        display: String(purple.wickets),
      });
    const sixes = [...board.batting].sort((a, b) => b.sixes - a.sixes)[0];
    if (sixes && sixes.sixes > 0)
      out.push({
        kind: "most_sixes",
        name: sixes.displayName,
        display: String(sixes.sixes),
      });
    const srPool = board.batting.filter(
      (r) => r.balls >= RECORD_MIN_BALLS && r.innings >= RECORD_MIN_INNINGS,
    );
    const sr = [...srPool].sort((a, b) => b.strikeRate - a.strikeRate)[0];
    if (sr)
      out.push({
        kind: "highest_sr",
        name: sr.displayName,
        display: sr.strikeRate.toFixed(1),
      });
    const econPool = board.bowling.filter(
      (r) =>
        r.legalBalls >= RECORD_MIN_BALLS && r.innings >= RECORD_MIN_INNINGS,
    );
    const econ = [...econPool].sort((a, b) => a.economy - b.economy)[0];
    if (econ)
      out.push({
        kind: "best_economy",
        name: econ.displayName,
        display: econ.economy.toFixed(1),
      });
    return out;
  }, [board]);

  const locked = useMemo(() => {
    if (!season || season.status !== "complete") return [];
    // A completed season also stamps the twelve shelf trophies; this list is
    // the caps, so anything without copy here is somebody else's surface.
    return (season.awards ?? [])
      .filter((a) => a.kind in AWARD_LABEL)
      .map((a) => ({
        kind: a.kind,
        name: a.displayName,
        display: a.display,
      }));
  }, [season]);

  const shelf = locked.length > 0 ? locked : trophies;
  const capsLoading = season != null && board === undefined && locked.length === 0;

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

        {season ? (
          <div className="mt-3">
            <Button href={`/seasons/${season._id}/wrap`} fullWidth>
              {season.status === "complete"
                ? "Season cards"
                : "Season cards so far"}
            </Button>
          </div>
        ) : null}

        {capsLoading ? (
          <div className="mt-3 grid grid-cols-2 gap-2">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-24 animate-pulse rounded-2xl bg-ink/[0.04]" />
            ))}
          </div>
        ) : shelf.length > 0 ? (
          <ul className="mt-3 grid grid-cols-2 gap-2">
            {shelf.map((a) => (
              <li
                key={a.kind}
                className="rounded-2xl border border-line bg-surface px-3.5 py-3 shadow-card"
              >
                <p className="text-[11px] font-semibold uppercase tracking-wide text-faint">
                  {AWARD_LABEL[a.kind]}
                </p>
                <p className="mt-1 text-[15px] font-semibold leading-snug text-ink">
                  {a.name}
                </p>
                <p className="tabular mt-1 text-2xl font-semibold text-accent-deep">
                  {a.display}
                </p>
              </li>
            ))}
          </ul>
        ) : null}

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
