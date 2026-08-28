"use client";

import { AppHeader } from "@/components/shell/AppHeader";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { useAuth } from "@/components/providers/AuthProvider";
import { api } from "@/convex/_generated/api";
import { useQuery } from "convex/react";
import Link from "next/link";
import { Plus, Trophy } from "lucide-react";
import { cn, TOURNAMENT_STATUS_LABEL as STATUS_LABEL } from "@/lib/utils";

export default function TournamentsPage() {
  const { token, activeOrgId } = useAuth();
  const tournaments = useQuery(
    api.tournaments.list,
    token && activeOrgId ? { token, orgId: activeOrgId } : "skip",
  );

  return (
    <div>
      <AppHeader title="Series" />
      <main className="mx-auto max-w-md px-5 py-5">
        <p className="mb-4 text-[13px] text-muted">
          Fixed two-team series with core squads.
        </p>

        <Button href="/tournaments/new" fullWidth size="lg">
          <Plus className="h-5 w-5" strokeWidth={2.4} />
          New series
        </Button>

        <div className="mt-7 space-y-3">
          {tournaments === undefined ? (
            <div className="space-y-3">
              {[0, 1].map((i) => (
                <div
                  key={i}
                  className="h-24 animate-pulse rounded-2xl bg-ink/[0.04]"
                />
              ))}
            </div>
          ) : tournaments.length === 0 ? (
            <EmptyState
              title="No series yet"
              body="Set up two teams, mark your core players, and play a series."
            />
          ) : (
            tournaments.map((t) => {
              const ranLong = t.played > t.matchCount;
              return (
                <Link
                  key={t._id}
                  href={`/tournaments/${t._id}`}
                  className={cn(
                    "block rounded-2xl border bg-surface p-4 transition active:opacity-70",
                    t.status === "active"
                      ? "border-accent/40 shadow-card"
                      : "border-line",
                  )}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="inline-flex min-w-0 items-center gap-1.5">
                      <Trophy className="h-4 w-4 shrink-0 text-muted" />
                      <span className="truncate text-[15px] font-semibold text-ink">
                        {t.name}
                      </span>
                    </span>
                    <span
                      className={cn(
                        "shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide",
                        t.status === "active"
                          ? "bg-accent-soft text-accent-deep"
                          : t.status === "paused"
                            ? "bg-ink/[0.06] text-muted"
                            : "bg-ink/[0.06] text-ink",
                      )}
                    >
                      {STATUS_LABEL[t.status] ?? t.status}
                    </span>
                  </div>
                  <p className="tabular mt-2 text-[13px] text-muted">
                    {t.sideAName}{" "}
                    <span className="font-semibold text-ink">{t.winsA}</span>
                    <span className="text-muted"> — </span>
                    <span className="font-semibold text-ink">{t.winsB}</span>{" "}
                    {t.sideBName}
                  </p>
                  <p className="mt-1 text-[11px] text-muted">
                    {t.format === "limited" ? "ODI" : "Test"} ·{" "}
                    {ranLong
                      ? `${t.played} played of ${t.matchCount} planned`
                      : t.played === t.matchCount
                        ? `All ${t.matchCount} match${t.matchCount === 1 ? "" : "es"} played`
                        : `${t.played} of ${t.matchCount} match${t.matchCount === 1 ? "" : "es"}`}
                    {t.winnerText ? ` · ${t.winnerText}` : ""}
                  </p>
                  {ranLong && t.status !== "complete" ? (
                    <p className="mt-1.5 text-[11px] font-medium text-accent-deep">
                      Series has run past its planned length.
                    </p>
                  ) : null}
                </Link>
              );
            })
          )}
        </div>
      </main>
    </div>
  );
}
