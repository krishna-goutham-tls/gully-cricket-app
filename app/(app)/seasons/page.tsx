"use client";

import { useAuth } from "@/components/providers/AuthProvider";
import { EmptyState } from "@/components/ui/EmptyState";
import { TruncText } from "@/components/ui/TruncText";
import { api } from "@/convex/_generated/api";
import { cn } from "@/lib/utils";
import { useQuery } from "convex/react";
import { ArrowLeft, ChevronRight } from "lucide-react";
import Link from "next/link";

export default function SeasonsPage() {
  const { token, activeOrgId } = useAuth();
  const seasons = useQuery(
    api.seasons.list,
    token && activeOrgId ? { token, orgId: activeOrgId } : "skip",
  );

  return (
    <div className="bg-bg">
      <header className="sticky top-0 z-30 border-b border-line bg-bg/90 px-5 pb-3 pt-[calc(var(--safe-top)+1rem)] backdrop-blur-md">
        <div className="mx-auto flex max-w-md items-center gap-1">
          <Link
            href="/home"
            aria-label="Back to home"
            className="-ml-2 flex h-11 w-11 items-center justify-center rounded-lg text-muted active:bg-line/60"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <h1 className="text-xl font-semibold tracking-tight text-ink">
            Seasons
          </h1>
        </div>
      </header>

      <main className="mx-auto max-w-md space-y-2 px-5 py-4">
        {seasons === undefined ? (
          <div className="space-y-2">
            {[0, 1].map((i) => (
              <div
                key={i}
                className="h-20 animate-pulse rounded-2xl bg-ink/[0.04]"
              />
            ))}
          </div>
        ) : seasons === null ? (
          // Null is "we could not read this community", not "no seasons" —
          // telling a signed-out reader to start one would be a lie.
          <EmptyState
            title="Seasons unavailable"
            body="Sign in to this community to see its seasons."
          />
        ) : seasons.length === 0 ? (
          <EmptyState
            title="No seasons yet"
            body="Start one from Home. All-time stays."
          />
        ) : (
          seasons.map((s) => (
            <div
              key={s._id}
              className="overflow-hidden rounded-2xl border border-line bg-surface shadow-card"
            >
              <Link
                href={`/seasons/${s._id}`}
                className="flex min-h-12 items-center gap-3 px-4 py-3 active:bg-bg"
              >
                <span className="min-w-0 flex-1">
                  <TruncText className="text-[15px] font-semibold text-ink">
                    {s.name}
                  </TruncText>
                  <span
                    className={cn(
                      "mt-0.5 block text-[13px]",
                      s.status === "active" ? "text-accent-deep" : "text-muted",
                    )}
                  >
                    {s.status === "active" ? "In play" : "Closed"}
                  </span>
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-faint" />
              </Link>
              <Link
                href={`/seasons/${s._id}/wrap`}
                className="flex min-h-11 items-center justify-between border-t border-line px-4 text-[13px] font-semibold text-ink active:bg-bg"
              >
                {s.status === "active" ? "Season cards so far" : "Season cards"}
                <ChevronRight className="h-4 w-4 text-faint" />
              </Link>
            </div>
          ))
        )}
      </main>
    </div>
  );
}
