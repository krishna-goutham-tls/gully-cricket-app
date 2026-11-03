"use client";

import {
  LiveHero,
  MatchCard,
  ResultCard,
  SeriesCard,
  type MatchRow,
} from "@/components/home/HomeCards";
import { MatchDayCard } from "@/components/home/MatchDayCard";
import { SeasonLine } from "@/components/home/SeasonLine";
import { InviteSheet } from "@/components/player/InviteSheet";
import { useAuth } from "@/components/providers/AuthProvider";
import { AppHeader } from "@/components/shell/AppHeader";
import { Button } from "@/components/ui/Button";
import { WhatsAppIcon } from "@/components/ui/WhatsAppIcon";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { cn, errorMessage } from "@/lib/utils";
import { useMutation, useQuery } from "convex/react";
import { ChevronRight, Plus } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

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

export default function HomePage() {
  const { token, activeOrgId, activeOrg, isAdmin, isObserver, isSandbox, features } =
    useAuth();
  const matches = useQuery(
    api.matches.list,
    token && activeOrgId ? { token, orgId: activeOrgId } : "skip",
  );
  const tournaments = useQuery(
    api.tournaments.list,
    token && activeOrgId && features.series ? { token, orgId: activeOrgId } : "skip",
  );
  const abandonMatch = useMutation(api.matches.abandon);
  const removeMatch = useMutation(api.matches.remove);
  const [inviteOpen, setInviteOpen] = useState(false);
  const canInvite = isAdmin && !isSandbox;
  const inviteUsed = useQuery(
    api.orgs.inviteUsed,
    canInvite && token && activeOrgId ? { token, orgId: activeOrgId } : "skip",
  );
  // A new community arrives here with ?invite=1. Drop it, so a reload or a
  // return to Home does not open the sheet again.
  useEffect(() => {
    if (!canInvite || !activeOrgId) return;
    if (new URLSearchParams(window.location.search).get("invite") !== "1") return;
    window.history.replaceState(null, "", "/home");
    setInviteOpen(true);
  }, [canInvite, activeOrgId]);
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

  // Home reads top-down as urgency: a game being scored right now or the way
  // to start one, the last result, your day, the season, then the last few
  // matches. The full history lives on /matches.
  const { hero, otherLive, scheduled, lastResult, earlier } = useMemo(() => {
    const rows: MatchRow[] = matches ?? [];
    const live = rows.filter((m) => m.status === "live");
    const done = rows.filter(
      (m) => m.status === "completed" || m.status === "abandoned",
    );
    const last = done.find((m) => m.status === "completed") ?? null;
    return {
      hero: live[0] ?? null,
      otherLive: live.slice(1),
      scheduled: rows.filter((m) => m.status === "scheduled"),
      lastResult: last,
      earlier: done.filter((m) => m._id !== last?._id).slice(0, 5),
    };
  }, [matches]);

  const emptyCommunity = matches !== undefined && matches.length === 0;
  const inviteFirst = canInvite && inviteUsed === false && emptyCommunity;
  // Start match waits as secondary while the invite answer loads, so it does
  // not flash black first.
  const startSecondary = !!hero || inviteFirst || (canInvite && inviteUsed === undefined && emptyCommunity);

  const series = features.series
    ? ((tournaments ?? []).find((t) => t.status === "active") ?? null)
    : null;

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
          <p className="mb-3 rounded-2xl border border-danger/20 bg-danger-soft px-4 py-2.5 text-[13px] text-danger">
            {error}
          </p>
        ) : null}

        {hero ? <LiveHero {...cardProps(hero)} /> : null}

        {/* A new community's first job is getting players in, so Invite
            players takes the black button until someone joins or plays. */}
        {inviteFirst ? (
          <Button
            type="button"
            size="lg"
            fullWidth
            className="mb-3"
            onClick={() => setInviteOpen(true)}
          >
            <WhatsAppIcon className="h-5 w-5" />
            Invite players
          </Button>
        ) : null}

        {isObserver ? null : (
          <Button
            href="/matches/new"
            size="lg"
            fullWidth
            variant={startSecondary ? "secondary" : "primary"}
            className={cn(hero && "mt-3")}
          >
            <Plus className="h-5 w-5" strokeWidth={2.4} />
            Start match
          </Button>
        )}

        {lastResult ? <ResultCard match={lastResult} /> : null}

        {lastResult ? <MatchDayCard playedAt={lastResult.createdAt} /> : null}

        {/* A series is its own thing, not a part of the season: it can run
            across two seasons. Its own label, above the season line. */}
        {series ? (
          <section data-testid="home-series">
            <SectionLabel>Series</SectionLabel>
            <SeriesCard series={series} />
          </section>
        ) : null}

        <SeasonLine label={series ? "Season" : undefined} />

        {canInvite && inviteUsed === false && !inviteFirst ? (
          <Button
            type="button"
            variant="secondary"
            size="lg"
            fullWidth
            className="mt-3"
            onClick={() => setInviteOpen(true)}
          >
            <WhatsAppIcon className="h-5 w-5" />
            Invite players
          </Button>
        ) : null}

        {matches === undefined ? (
          <div className="mt-6 space-y-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-20 animate-pulse rounded-2xl bg-ink/[0.04]" />
            ))}
          </div>
        ) : matches.length === 0 ? (
          <div className="mt-6">
            <EmptyState
              title="No matches yet"
              body={isObserver ? undefined : "Your first match shows up here."}
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

            {/* Setup that never got finished is a to-do, not history. */}
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

            {earlier.length > 0 ? (
              <>
                <SectionLabel>Earlier matches</SectionLabel>
                <div className="space-y-2">
                  {earlier.map((m) => (
                    <MatchCard key={m._id} {...cardProps(m)} />
                  ))}
                </div>
              </>
            ) : null}

            {lastResult || earlier.length > 0 ? (
              <Link
                href="/matches"
                className="mt-2 flex min-h-11 items-center justify-center gap-1 rounded-2xl border border-line bg-surface text-[13px] font-semibold text-muted active:bg-bg"
              >
                All matches
                <ChevronRight className="h-4 w-4" />
              </Link>
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
            : "Every ball goes too. This can't be undone."
        }
        confirmLabel={pending?.kind === "end" ? "End match" : "Delete"}
        danger={pending?.kind === "delete"}
        busy={busy}
        onConfirm={runPending}
        onCancel={() => setPending(null)}
      />

      {inviteOpen && token && activeOrgId && activeOrg ? (
        <InviteSheet
          token={token}
          orgId={activeOrgId}
          orgName={activeOrg.orgName}
          onClose={() => setInviteOpen(false)}
        />
      ) : null}
    </div>
  );
}
