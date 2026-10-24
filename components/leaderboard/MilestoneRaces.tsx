"use client";

import { api } from "@/convex/_generated/api";
import { shortDate } from "@/lib/dates";
import { cn } from "@/lib/utils";
import type { FunctionReturnType } from "convex/server";
import Link from "next/link";
import { useState } from "react";

type Milestones = NonNullable<FunctionReturnType<typeof api.stats.milestones>>;
type Kind = "runs" | "wickets";

const fmt = (n: number) => n.toLocaleString("en-IN");

/** Rungs shown before "Show all": the newest news is the highest rung. */
const RACES_PREVIEW = 3;

function initials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

/**
 * The open race: the first rung nobody has reached, and the three closest to
 * it. This is the card people check after every match.
 */
function ChaseCard({
  kind,
  chase,
}: {
  kind: Kind;
  chase: NonNullable<Milestones["chase"][Kind]>;
}) {
  return (
    <div className="rounded-2xl bg-ink p-4 text-bg">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-bg/70">
        The race to
      </p>
      <p className="tabular mt-0.5 text-2xl font-semibold tracking-tight">
        {fmt(chase.target)} {kind}
      </p>
      <div className="mt-3 space-y-1">
        {chase.leaders.map((p, i) => (
          <Link
            key={String(p.userId)}
            href={`/players/${p.userId}`}
            className="-mx-2 block min-h-12 rounded-xl px-2 py-1.5 active:bg-white/10"
          >
            <div className="flex items-baseline justify-between gap-2">
              <p className="min-w-0 truncate text-[15px] font-semibold">
                <span className="tabular mr-2 text-bg/70">{i + 1}</span>
                {p.displayName}
              </p>
              <p className="tabular shrink-0 text-[13px] font-semibold text-accent">
                {fmt(chase.target - p.total)} to go
              </p>
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-r-full bg-accent"
                style={{ width: `${Math.min(100, (p.total / chase.target) * 100)}%` }}
              />
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

/** One rung's podium: the three fastest there, fewest innings first. */
function PodiumCard({ race }: { race: Milestones["races"][number] }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
      <div className="flex items-baseline justify-between gap-2 border-b border-line/60 px-4 pb-2 pt-3">
        <p className="tabular text-[15px] font-semibold text-ink">
          Fastest to {fmt(race.target)} {race.kind}
        </p>
        <p className="shrink-0 text-[13px] text-muted">
          {race.finishers} got there
        </p>
      </div>
      {race.podium.map((p, i) => (
        <Link
          key={String(p.userId)}
          href={`/players/${p.userId}`}
          className="flex min-h-12 items-center gap-3 border-b border-line/60 px-4 py-2 last:border-b-0 active:bg-bg"
        >
          <span
            className={cn(
              "tabular flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-[13px] font-bold",
              i === 0 ? "bg-accent text-ink" : "bg-ink/[0.06] text-muted",
            )}
          >
            {i === 0 ? initials(p.displayName) : i + 1}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[15px] font-semibold text-ink">
              {p.displayName}
            </p>
            <p className="tabular text-[13px] text-faint">{shortDate(p.date)}</p>
          </div>
          <p className="tabular shrink-0 text-right">
            <span className="text-2xl font-semibold leading-none text-ink">
              {p.innings}
            </span>
            <span className="ml-1 text-[13px] text-muted">inns</span>
          </p>
        </Link>
      ))}
    </div>
  );
}

function KindSection({ kind, data }: { kind: Kind; data: Milestones }) {
  const [showAll, setShowAll] = useState(false);
  const races = data.races.filter((r) => r.kind === kind).reverse();
  const chase = data.chase[kind];
  if (!chase && races.length === 0) return null;
  const shown = showAll ? races : races.slice(0, RACES_PREVIEW);
  return (
    <section className="space-y-3">
      <h2 className="px-1 text-[13px] font-semibold uppercase tracking-wide text-muted">
        {kind === "runs" ? "Runs" : "Wickets"}
      </h2>
      {chase ? <ChaseCard kind={kind} chase={chase} /> : null}
      {shown.map((r) => (
        <PodiumCard key={r.target} race={r} />
      ))}
      {races.length > RACES_PREVIEW ? (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          className="min-h-11 w-full rounded-xl border border-line bg-surface text-[13px] font-semibold text-muted active:bg-bg"
        >
          {showAll
            ? "Show less"
            : `Show all ${races.length} ${kind} milestones`}
        </button>
      ) : null}
    </section>
  );
}

/** The Milestones tab on Records: all time, every format, regulars only. */
export function MilestoneRaces({ data }: { data: Milestones }) {
  return (
    <div className="space-y-6">
      <KindSection kind="runs" data={data} />
      <KindSection kind="wickets" data={data} />
    </div>
  );
}
