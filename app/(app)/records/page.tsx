"use client";

import { useAuth } from "@/components/providers/AuthProvider";
import { buildRecords } from "@/components/leaderboard/records";
import { EmptyState } from "@/components/ui/EmptyState";
import { api } from "@/convex/_generated/api";
import { cn } from "@/lib/utils";
import { useQuery } from "convex/react";
import { ArrowLeft, Flame, Trophy } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

function initials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

export default function RecordsPage() {
  const { token, activeOrgId } = useAuth();
  const [scope, setScope] = useState<"season" | "all" | null>(null);
  const current = useQuery(
    api.seasons.current,
    token && activeOrgId ? { token, orgId: activeOrgId } : "skip",
  );
  const usingSeason = Boolean(current) && (scope ?? "season") === "season";
  const data = useQuery(
    api.stats.leaderboard,
    token && activeOrgId && current !== undefined
      ? {
          token,
          orgId: activeOrgId,
          ...(usingSeason && current ? { seasonId: current._id } : {}),
        }
      : "skip",
  );
  const groups = data ? buildRecords(data, { season: usingSeason }) : [];

  return (
    <div className="bg-bg pb-6">
      <header className="sticky top-0 z-30 border-b border-line bg-bg/90 px-5 pb-3 pt-[calc(var(--safe-top)+0.75rem)] backdrop-blur-md">
        <div className="mx-auto flex max-w-md items-center gap-1">
          <Link
            href="/home"
            aria-label="Back to home"
            className="-ml-2 flex h-11 w-11 items-center justify-center rounded-lg text-muted active:bg-line/60"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-semibold leading-tight tracking-tight text-ink">
              Records
            </h1>
            <p className="text-[13px] text-muted">
              {usingSeason
                ? `${current?.name ?? "This season"} feats`
                : "All-time feats"}
            </p>
          </div>
        </div>
        {current ? (
          <div
            className="mx-auto mt-1 flex max-w-md justify-end px-1"
            role="group"
            aria-label="Season or all time"
          >
            <button
              type="button"
              aria-pressed={usingSeason}
              onClick={() => setScope("season")}
              className={cn(
                "min-h-11 px-1.5 text-[13px] font-semibold",
                usingSeason ? "text-ink" : "text-muted",
              )}
            >
              This season
            </button>
            <button
              type="button"
              aria-pressed={!usingSeason}
              onClick={() => setScope("all")}
              className={cn(
                "min-h-11 px-1.5 text-[13px] font-semibold",
                !usingSeason ? "text-ink" : "text-muted",
              )}
            >
              All time
            </button>
          </div>
        ) : null}
      </header>

      <main className="mx-auto max-w-md space-y-6 px-5 py-4">
        {data === undefined ? (
          <div className="space-y-2">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="h-16 animate-pulse rounded-3xl bg-line" />
            ))}
          </div>
        ) : groups.length === 0 ? (
          <EmptyState
            title={
              usingSeason ? "No feats this season yet" : "No records yet"
            }
            body={
              usingSeason
                ? "Play a match. The board starts empty."
                : "Feats show up here as soon as the first match is completed."
            }
          />
        ) : (
          groups.map((g) => {
            // The Roast wears a different coat from Honours — a warm "hot seat"
            // wash and charcoal chips, so glory and ribbing never blur together.
            const roast = g.tone === "roast";
            return (
              <section key={g.title}>
                <div className="mb-2 flex items-center gap-1.5 px-1">
                  {roast ? (
                    <Flame className="h-4 w-4 text-danger" />
                  ) : (
                    <Trophy className="h-4 w-4 text-accent-deep" />
                  )}
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-faint">
                    {g.title}
                  </p>
                </div>
                <div
                  className={cn(
                    "overflow-hidden rounded-2xl border",
                    roast
                      ? "border-danger/20 bg-danger-soft/40"
                      : "border-line bg-surface",
                  )}
                >
                  {g.items.map((it) => (
                    <Link
                      key={it.label}
                      href={`/players/${it.holderId}`}
                      className={cn(
                        "flex min-h-12 items-center gap-3 border-b px-3.5 py-3 last:border-b-0",
                        roast
                          ? "border-danger/10 active:bg-danger-soft"
                          : "border-line/60 active:bg-bg",
                      )}
                    >
                      {/* Honours chip is gold (energy = glory); the Roast chip
                          is charcoal — the same face, a colder verdict. */}
                      <span
                        className={cn(
                          "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-[12px] font-bold",
                          roast
                            ? "bg-ink text-bg"
                            : "bg-accent-soft text-accent-deep",
                        )}
                      >
                        {initials(it.holder)}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-[15px] font-semibold leading-tight text-ink">
                          {it.label}
                        </p>
                        <p className="truncate text-[13px] leading-tight text-muted">
                          {it.holder}
                        </p>
                      </div>
                      <p className="tabular shrink-0 text-2xl font-semibold leading-none text-ink">
                        {it.value}
                      </p>
                    </Link>
                  ))}
                </div>
              </section>
            );
          })
        )}
      </main>
    </div>
  );
}
