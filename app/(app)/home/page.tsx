"use client";

import {
  LiveHero,
  MatchCard,
  type MatchRow,
} from "@/components/home/HomeCards";
import { FeedDoor } from "@/components/home/FeedDoor";
import { SeasonStrip } from "@/components/home/SeasonStrip";
import { useAuth } from "@/components/providers/AuthProvider";
import { AppHeader } from "@/components/shell/AppHeader";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { groupByDay } from "@/lib/dates";
import { TruncText } from "@/components/ui/TruncText";
import { cn, errorMessage } from "@/lib/utils";
import { useMutation, useQuery } from "convex/react";
import { ChevronRight, History, Medal, Plus, Sparkles } from "lucide-react";
import Link from "next/link";
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

/**
 * One compact doorway in the explore row. Same anatomy as every list row in
 * the app — soft icon chip, title, one quiet meta line — kept deliberately
 * short so two of them share a line without turning into fat tiles.
 */
function ExploreCard({
  href,
  icon,
  title,
  meta,
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  meta: string;
}) {
  return (
    <Link
      href={href}
      className="flex min-h-12 min-w-0 flex-1 items-center gap-2.5 rounded-xl border border-line bg-surface px-3 py-2.5 active:bg-bg"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent-deep">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <TruncText className="text-[15px] font-semibold text-ink">{title}</TruncText>
        <TruncText className="tabular text-[11px] text-muted">{meta}</TruncText>
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-faint" />
    </Link>
  );
}

export default function HomePage() {
  const { token, activeOrgId } = useAuth();
  const matches = useQuery(
    api.matches.list,
    token && activeOrgId ? { token, orgId: activeOrgId } : "skip",
  );
  const tournaments = useQuery(
    api.tournaments.list,
    token && activeOrgId ? { token, orgId: activeOrgId } : "skip",
  );
  const abandonMatch = useMutation(api.matches.abandon);
  const removeMatch = useMutation(api.matches.remove);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [busy, setBusy] = useState(false);

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

  // Home reads top-down as urgency: a game being scored right now, the series
  // it belongs to, the way to start the next one, then the doorways, then only
  // the latest day's play — the full history lives on /matches.
  const { hero, otherLive, scheduled, latestDay, doneCount } = useMemo(() => {
    const rows: MatchRow[] = matches ?? [];
    const live = rows.filter((m) => m.status === "live");
    const done = rows.filter(
      (m) => m.status === "completed" || m.status === "abandoned",
    );
    const days = groupByDay(done, (m) => m.createdAt);
    return {
      hero: live[0] ?? null,
      otherLive: live.slice(1),
      scheduled: rows.filter((m) => m.status === "scheduled"),
      latestDay: days[0] ?? null,
      doneCount: done.length,
    };
  }, [matches]);

  const series = (tournaments ?? []).find((t) => t.status === "active") ?? null;

  const cardProps = (m: MatchRow) => ({
    match: m,
    menuOpen: menuFor === m._id,
    onToggleMenu: () => setMenuFor(menuFor === m._id ? null : m._id),
    onEnd: endMatch,
    onDelete: deleteMatch,
  });

  return (
    <div>
      <AppHeader />
      <main className="mx-auto max-w-md px-5 py-4">
        {error ? (
          <p className="mb-3 rounded-2xl border border-danger/20 bg-danger-soft px-4 py-2.5 text-sm text-danger">
            {error}
          </p>
        ) : null}

        {hero ? <LiveHero {...cardProps(hero)} /> : null}

        <Button
          href="/matches/new"
          size="lg"
          fullWidth
          variant={hero ? "secondary" : "primary"}
          className={cn(hero && "mt-3")}
        >
          <Plus className="h-5 w-5" strokeWidth={2.4} />
          Start match
        </Button>

        <SeasonStrip series={series} />

        {/* The doorways: full history and the record book. Two thin cards on
            one line — visible without scrolling, never competing with the
            live game or the CTA above. */}
        <div className="mt-3 flex gap-2">
          <ExploreCard
            href="/matches"
            icon={<History className="h-4 w-4" strokeWidth={2.2} />}
            title="Matches"
            meta={
              matches === undefined
                ? "…"
                : `${doneCount} played`
            }
          />
          <ExploreCard
            href="/records"
            icon={<Medal className="h-4 w-4" strokeWidth={2.2} />}
            title="Records"
            meta="Best feats"
          />
        </div>

        {/* Only once there's a completed match to relive — nothing to show
            off from a day of setups that never got played. */}
        {doneCount > 0 ? (
          <div className="mt-2">
            <ExploreCard
              href="/hero"
              icon={<Sparkles className="h-4 w-4" strokeWidth={2.2} />}
              title="Relive match day"
              meta="Build a shareable player card"
            />
          </div>
        ) : null}

        <div className="mt-2">
          <FeedDoor />
        </div>

        {matches === undefined ? (
          <div className="mt-6 space-y-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-20 animate-pulse rounded-3xl bg-ink/[0.04]" />
            ))}
          </div>
        ) : matches.length === 0 ? (
          <div className="mt-6">
            <EmptyState
              title="No matches yet"
              body="Start your first match — pick two teams from your players and score ball by ball."
            />
          </div>
        ) : (
          <>
            {otherLive.length > 0 ? (
              <>
                <SectionLabel>Also live</SectionLabel>
                <div className="space-y-2">
                  {otherLive.map((m) => (
                    <MatchCard key={m._id} {...cardProps(m)} />
                  ))}
                </div>
              </>
            ) : null}

            {/* Setup that never got finished is a to-do, not history — it
                would be lost at the bottom of a date group. */}
            {scheduled.length > 0 ? (
              <>
                <SectionLabel>Not started</SectionLabel>
                <div className="space-y-2">
                  {scheduled.map((m) => (
                    <MatchCard key={m._id} {...cardProps(m)} />
                  ))}
                </div>
              </>
            ) : null}

            {latestDay ? (
              <>
                <SectionLabel>{latestDay.label}</SectionLabel>
                <div className="space-y-2">
                  {latestDay.items.map((m) => (
                    <MatchCard key={m._id} {...cardProps(m)} />
                  ))}
                </div>
                {doneCount > latestDay.items.length ? (
                  <Link
                    href="/matches"
                    className="mt-2 flex min-h-11 items-center justify-center gap-1 rounded-2xl border border-line bg-surface text-[13px] font-semibold text-muted active:bg-bg"
                  >
                    All {doneCount} matches
                    <ChevronRight className="h-4 w-4" />
                  </Link>
                ) : null}
              </>
            ) : null}
          </>
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
