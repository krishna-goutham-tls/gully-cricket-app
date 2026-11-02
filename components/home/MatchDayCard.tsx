"use client";

import { useAuth } from "@/components/providers/AuthProvider";
import { ShareButton } from "@/components/share/ShareButton";
import { api } from "@/convex/_generated/api";
import { dayBounds, weekdayDate } from "@/lib/dates";
import { heroFilename, heroShareData } from "@/lib/heroShare";
import { useQuery } from "convex/react";
import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";

const DAY = 24 * 60 * 60 * 1000;

const count = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/**
 * "Your match day": your numbers from the latest match day in one line, and
 * the Hero poster one tap away. Someone who did not play sees the Player of
 * the Match instead. Shows on that day and the 2 days after.
 */
export function MatchDayCard({ playedAt }: { playedAt: number }) {
  const { token, activeOrgId } = useAuth();
  const { dayStart, dayEnd } = dayBounds(playedAt);
  const fresh = Date.now() < dayStart + 3 * DAY;
  const day = useQuery(
    api.hero.matchDay,
    token && activeOrgId && fresh ? { token, orgId: activeOrgId, dayStart, dayEnd } : "skip",
  );
  const poster = useMemo(() => (day ? heroShareData(day) : null), [day]);

  if (!fresh || !day || !poster) return null;

  const n = day.numbers;
  const figures = [
    n.ballsFaced > 0 || n.runs > 0 ? count(n.runs, "run") : null,
    n.ballsBowled > 0 ? count(n.wickets, "wicket") : null,
    n.catches > 0 ? count(n.catches, "catch", "catches") : null,
  ].filter(Boolean);
  const line = [
    day.displayName,
    ...(figures.length > 0 ? figures : [count(n.matches, "match", "matches")]),
    weekdayDate(day.dayStart),
  ].join(" · ");

  return (
    <div className="mt-3 rounded-2xl border border-line bg-surface shadow-card">
      <Link
        href={`/hero?playerId=${day.playerId}`}
        className="flex min-h-12 items-center gap-2 px-4 pb-2 pt-3 active:bg-bg"
      >
        <span className="min-w-0 flex-1">
          <span className="block text-[11px] font-semibold uppercase tracking-wide text-faint">
            {day.isYou ? "Your match day" : "Player of the Match"}
          </span>
          <span className="tabular mt-0.5 block text-[15px] font-semibold text-ink [overflow-wrap:anywhere]">
            {line}
          </span>
        </span>
        <ChevronRight className="h-4 w-4 shrink-0 text-faint" />
      </Link>
      <div className="px-4 pb-4 pt-1">
        <ShareButton
          data={poster}
          filename={heroFilename(day.displayName)}
          tone="light"
          label="Share on WhatsApp"
          className="w-full border border-line"
        />
      </div>
    </div>
  );
}
