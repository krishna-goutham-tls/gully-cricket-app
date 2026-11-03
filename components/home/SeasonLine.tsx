"use client";

import { useAuth } from "@/components/providers/AuthProvider";
import { api } from "@/convex/_generated/api";
import { cn } from "@/lib/utils";
import { useQuery } from "convex/react";
import { ChevronRight } from "lucide-react";
import Link from "next/link";

function Cap({
  label,
  name,
  value,
  loading,
}: {
  label: string;
  name: string | null;
  value: number | null;
  loading: boolean;
}) {
  return (
    <span className="whitespace-nowrap">
      <span className="font-semibold text-accent-deep">{label}</span>
      {loading ? (
        <span
          aria-hidden
          className="ml-1 inline-block h-3 w-14 animate-pulse rounded-md bg-ink/[0.08] align-middle"
        />
      ) : name ? (
        <span className="text-ink">
          {" "}
          {name}
          {value !== null ? <span className="tabular text-muted"> {value}</span> : null}
        </span>
      ) : null}
    </span>
  );
}

/**
 * Home's season line, only while a season runs: its name and both caps on
 * one line. Starting and ending a season live in Settings. `label` heads it
 * when another block (the running series) sits right above it.
 */
export function SeasonLine({ label }: { label?: string }) {
  const { token, activeOrgId, activeOrg } = useAuth();
  // Login already loaded this.
  const featured =
    activeOrg && "featuredSeason" in activeOrg ? activeOrg.featuredSeason : undefined;
  const current = featured?.status === "active" ? featured : null;
  const board = useQuery(
    api.stats.leaderboard,
    token && activeOrgId && current
      ? {
          token,
          orgId: activeOrgId,
          includeVisitorsAndJuniors: false,
          seasonId: current.id,
        }
      : "skip",
  );

  if (!current) return null;

  const loading = board === undefined;
  const orange = board?.batting[0] ?? null;
  const purple = board?.bowling[0] ?? null;

  const line = (
    <Link
      href={`/seasons/${current.id}`}
      data-testid="home-season-line"
      className={cn(
        "flex min-h-12 items-center gap-2 rounded-2xl border border-line bg-surface px-4 py-2.5 active:bg-bg",
        !label && "mt-3",
      )}
    >
      <span className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-1.5 text-[13px] leading-snug">
        <span className="whitespace-nowrap text-[15px] font-semibold text-ink">{current.name}</span>
        <span className="text-muted">·</span>
        <Cap
          label="Orange Cap"
          name={orange?.displayName ?? null}
          value={orange ? orange.runs : null}
          loading={loading}
        />
        <span className="text-muted">·</span>
        <Cap
          label="Purple Cap"
          name={purple?.displayName ?? null}
          value={purple ? purple.wickets : null}
          loading={loading}
        />
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-faint" />
    </Link>
  );

  if (!label) return line;
  return (
    <section>
      <p className="px-1 pb-1.5 pt-4 text-[11px] font-semibold uppercase tracking-wide text-faint">
        {label}
      </p>
      {line}
    </section>
  );
}
