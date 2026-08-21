"use client";

import { MatchCard, type MatchRow } from "@/components/home/HomeCards";
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
import { useMemo, useState } from "react";

type PendingAction =
  | { kind: "end"; matchId: string; label: string }
  | { kind: "delete"; matchId: string; label: string };

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-1 pb-1.5 pt-4 text-[11px] font-semibold uppercase tracking-[0.12em] text-faint">
      {children}
    </p>
  );
}

/**
 * The full match history, moved off Home so the hub stays scannable. Same
 * day-grouped reading as before — live and unfinished setups first (they are
 * to-dos, not history), then every completed match by the day it was played.
 */
export default function MatchesPage() {
  const { token, activeOrgId } = useAuth();
  const matches = useQuery(
    api.matches.list,
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

  const { active, days, doneCount } = useMemo(() => {
    const rows: MatchRow[] = matches ?? [];
    const done = rows.filter(
      (m) => m.status === "completed" || m.status === "abandoned",
    );
    return {
      // Live first, then setups — both are things to get back to.
      active: [
        ...rows.filter((m) => m.status === "live"),
        ...rows.filter((m) => m.status === "scheduled"),
      ],
      days: groupByDay(done, (m) => m.createdAt),
      doneCount: done.length,
    };
  }, [matches]);

  const cardProps = (m: MatchRow) => ({
    match: m,
    menuOpen: menuFor === m._id,
    onToggleMenu: () => setMenuFor(menuFor === m._id ? null : m._id),
    onEnd: endMatch,
    onDelete: deleteMatch,
  });

  return (
    <div className="min-h-dvh bg-bg">
      <header className="sticky top-0 z-30 border-b border-line bg-bg/90 px-4 pb-3 pt-[calc(var(--safe-top)+0.75rem)] backdrop-blur-md">
        <div className="mx-auto flex max-w-md items-center gap-1">
          <Link
            href="/home"
            aria-label="Back to home"
            className="-ml-2 flex h-10 w-10 items-center justify-center rounded-xl text-muted active:bg-line/60"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div className="min-w-0">
            <h1 className="text-[19px] font-semibold leading-tight tracking-tight text-ink">
              Matches
            </h1>
            <p className="tabular text-[11px] text-muted">
              {matches === undefined
                ? "Loading…"
                : `${doneCount} played${active.length > 0 ? ` · ${active.length} in play` : ""}`}
            </p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-md px-4 pb-4">
        {error ? (
          <p className="mt-3 rounded-2xl border border-danger/20 bg-danger-soft px-4 py-2.5 text-sm text-danger">
            {error}
          </p>
        ) : null}

        {matches === undefined ? (
          <div className="mt-4 space-y-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-20 animate-pulse rounded-2xl bg-ink/[0.04]" />
            ))}
          </div>
        ) : matches.length === 0 ? (
          <div className="mt-6">
            <EmptyState
              title="No matches yet"
              body="Start your first match from Home — pick two teams and score ball by ball."
            />
          </div>
        ) : (
          <>
            {active.length > 0 ? (
              <>
                <SectionLabel>In play</SectionLabel>
                <div className="space-y-2">
                  {active.map((m) => (
                    <MatchCard key={m._id} {...cardProps(m)} />
                  ))}
                </div>
              </>
            ) : null}

            {days.map((day) => (
              <div key={day.key}>
                <SectionLabel>{day.label}</SectionLabel>
                <div className="space-y-2">
                  {day.items.map((m) => (
                    <MatchCard key={m._id} {...cardProps(m)} />
                  ))}
                </div>
              </div>
            ))}
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
