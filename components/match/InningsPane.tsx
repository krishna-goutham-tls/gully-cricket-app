"use client";

import { api } from "@/convex/_generated/api";
import { cn } from "@/lib/utils";
import type { FunctionReturnType } from "convex/server";
import { ChevronDown } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

/**
 * One innings, one fold.
 *
 * An innings *is* both teams — one bats, one bowls — so the pane puts them
 * side by side instead of stacking two full tables. Every figure collapses to
 * the way people actually read cricket ("51*(30)", "3/22"), which is what buys
 * the fold; the classic five-column tables are one tap away under "Full card",
 * so nothing is lost, it's just not the default.
 */

export type Scorecard = NonNullable<
  FunctionReturnType<typeof api.scoring.scorecard>
>;
export type InningsCard = Scorecard["innings"][number];

function extrasLine(b: {
  byes: number;
  legByes: number;
  wides: number;
  noBalls: number;
}) {
  const parts: string[] = [];
  if (b.byes) parts.push(`b${b.byes}`);
  if (b.legByes) parts.push(`lb${b.legByes}`);
  if (b.wides) parts.push(`w${b.wides}`);
  if (b.noBalls) parts.push(`nb${b.noBalls}`);
  return parts.length > 0 ? ` (${parts.join(" ")})` : "";
}

function ordinal(n: number) {
  const suffix =
    n % 100 >= 11 && n % 100 <= 13
      ? "th"
      : n % 10 === 1
        ? "st"
        : n % 10 === 2
          ? "nd"
          : n % 10 === 3
            ? "rd"
            : "th";
  return `${n}${suffix}`;
}

/**
 * Stands between wickets, derived from fall-of-wickets. The tail segment is
 * the unbroken stand — skipped when the last wicket fell on the total, so a
 * finished innings doesn't render a phantom 0-run partnership.
 */
function partnerships(inn: InningsCard) {
  const segs: Array<{ runs: number; wicket: number; unbroken: boolean }> = [];
  let prev = 0;
  for (const f of inn.fallOfWickets) {
    segs.push({ runs: f.runs - prev, wicket: segs.length + 1, unbroken: false });
    prev = f.runs;
  }
  if (segs.length === 0 || inn.totalRuns > prev) {
    segs.push({
      runs: inn.totalRuns - prev,
      wicket: segs.length + 1,
      unbroken: true,
    });
  }
  return segs;
}

/**
 * The shape of the innings in 6px: one segment per stand, width proportional
 * to its runs, the biggest in gold. Collapses "who rescued it" into a glance.
 */
function PartnershipBar({
  segs,
  best,
}: {
  segs: ReturnType<typeof partnerships>;
  best: ReturnType<typeof partnerships>[number];
}) {
  return (
    <div className="mt-2.5 flex h-1.5 gap-px overflow-hidden rounded-full">
      {segs.map((s, i) => (
        <div
          key={i}
          // A 0-run stand still needs a visible tick, hence the floor.
          style={{ flexGrow: Math.max(s.runs, 0.6) }}
          className={cn(
            "h-full",
            s === best ? "bg-accent" : i % 2 === 0 ? "bg-ink/25" : "bg-ink/15",
          )}
        />
      ))}
    </div>
  );
}

function battingFigure(b: InningsCard["batting"][number]) {
  return `${b.runs}${b.out ? "" : b.retired ? "r" : "*"}`;
}

export function InningsPane({
  inn,
  card,
  label,
  className,
}: {
  inn: InningsCard;
  card: Scorecard;
  /** e.g. "1st innings" (limited) or "2nd innings · Test" context line. */
  label: string;
  className?: string;
}) {
  const [full, setFull] = useState(false);

  const bowlingTeamName =
    inn.battingSide === "A" ? card.sideB.name : card.sideA.name;

  const overs = inn.legalBalls / card.ballsPerOver;
  const runRate = overs > 0 ? inn.totalRuns / overs : 0;

  // Top scorer and lead wicket-taker carry the innings — mark them so the eye
  // lands there first. Ties resolve to the more economical performance.
  const topBat = inn.batting.reduce<InningsCard["batting"][number] | null>(
    (a, b) => (b.runs > 0 && (!a || b.runs > a.runs) ? b : a),
    null,
  );
  const topBowl = inn.bowling.reduce<InningsCard["bowling"][number] | null>(
    (a, b) =>
      b.wickets > 0 &&
      (!a || b.wickets > a.wickets || (b.wickets === a.wickets && b.runs < a.runs))
        ? b
        : a,
    null,
  );

  const chasing = inn.target !== undefined;
  const ballsLeft =
    card.maxOversInnings * card.ballsPerOver - inn.legalBalls;
  const liveChase =
    chasing && inn.status === "in_progress" && card.format === "limited";

  const segs = partnerships(inn);
  const best =
    inn.totalRuns > 0 ? segs.reduce((a, b) => (b.runs > a.runs ? b : a)) : null;

  return (
    <section
      className={cn(
        "overflow-hidden rounded-3xl border border-line bg-surface",
        className,
      )}
    >
      <div className="border-b border-line px-4 pb-2.5 pt-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-faint">
              {label}
            </p>
            <p className="mt-0.5 flex items-baseline gap-2 truncate text-[15px] font-semibold text-ink">
              {inn.battingTeamName}
              {chasing ? (
                <span className="tabular shrink-0 rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-semibold text-accent-deep">
                  {liveChase
                    ? `Need ${Math.max(inn.target! - inn.totalRuns, 0)} off ${Math.max(ballsLeft, 0)}`
                    : `Target ${inn.target}`}
                </span>
              ) : null}
            </p>
          </div>
          <div className="shrink-0 text-right">
            <p className="tabular text-[24px] font-semibold leading-none text-ink">
              {inn.totalRuns}
              <span className="text-faint">/</span>
              {inn.wickets}
            </p>
            <p className="tabular mt-1 text-[11px] text-faint">
              {inn.oversText} ov{runRate > 0 ? ` · RR ${runRate.toFixed(1)}` : ""}
            </p>
          </div>
        </div>

        {best ? <PartnershipBar segs={segs} best={best} /> : null}

        {/* The meta row doubles as the disclosure control — a dedicated footer
            button cost a whole row of fold for one tap target. */}
        <div className="mt-1 flex items-center justify-between gap-2">
          <p className="tabular min-w-0 truncate text-[11px] text-faint">
            {best ? (
              <>
                <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-accent align-middle" />
                Best stand {best.runs} · {ordinal(best.wicket)} wkt
                {best.unbroken ? " (unbroken)" : ""}
              </>
            ) : null}
          </p>
          <button
            type="button"
            onClick={() => setFull((v) => !v)}
            aria-expanded={full}
            className="-my-2 flex min-h-11 shrink-0 items-center gap-0.5 text-[11px] font-semibold text-muted"
          >
            {full ? "Less" : "Full card"}
            <ChevronDown
              className={cn("h-3.5 w-3.5 transition-transform", full && "rotate-180")}
            />
          </button>
        </div>
      </div>

      {/* The two-column fold: who batted on the left, who bowled at them on
          the right — the innings' actual contest, side by side. */}
      <div className="grid grid-cols-2">
        <div className="min-w-0 px-4 py-2.5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-faint">
            Batting
          </p>
          <ul className="mt-1.5 space-y-1">
            {inn.batting.map((b) => {
              const top = topBat?.userId === b.userId;
              return (
                <li
                  key={String(b.userId)}
                  className="flex items-baseline justify-between gap-1.5 text-[13px] leading-tight"
                >
                  <span
                    className={cn(
                      "min-w-0 truncate",
                      top
                        ? "font-semibold text-accent-deep"
                        : b.out
                          ? "text-muted"
                          : "font-medium text-ink",
                    )}
                  >
                    {b.displayName}
                  </span>
                  <span
                    className={cn(
                      "tabular shrink-0 font-semibold",
                      top ? "text-accent-deep" : "text-ink",
                    )}
                  >
                    {battingFigure(b)}
                    <span className="ml-0.5 text-[11px] font-normal text-faint">
                      ({b.balls})
                    </span>
                  </span>
                </li>
              );
            })}
            {inn.batting.length === 0 ? (
              <li className="text-[13px] text-faint">Yet to bat</li>
            ) : null}
          </ul>

          <p className="tabular mt-1.5 text-[11px] text-muted">
            Extras {inn.extras}
            <span className="text-faint">{extrasLine(inn.extrasBreakdown)}</span>
          </p>
          {/* Who's still padded up matters while the innings runs; once it's
              done, "did not bat" is history and lives in the full card. */}
          {inn.status === "in_progress" && inn.didNotBat.length > 0 ? (
            <p className="mt-1 text-[11px] leading-snug text-faint">
              Yet to bat: {inn.didNotBat.map((p) => p.displayName).join(", ")}
            </p>
          ) : null}
        </div>

        <div className="min-w-0 border-l border-line px-4 py-2.5">
          <p className="truncate text-[11px] font-semibold uppercase tracking-wide text-faint">
            Bowling · {bowlingTeamName}
          </p>
          {/* Deliberately the same shape as a batting row — name, figure,
              workload in brackets. Symmetry keeps both columns one line tall,
              which is what lets the whole innings sit in a fold; maidens and
              economy live in the full card. */}
          <ul className="mt-1.5 space-y-1">
            {inn.bowling.map((b) => {
              const top = topBowl?.userId === b.userId;
              return (
                <li
                  key={String(b.userId)}
                  className="flex items-baseline justify-between gap-1.5 text-[13px] leading-tight"
                >
                  <span
                    className={cn(
                      "min-w-0 truncate",
                      top
                        ? "font-semibold text-accent-deep"
                        : "font-medium text-ink",
                    )}
                  >
                    {b.displayName}
                  </span>
                  <span
                    className={cn(
                      "tabular shrink-0 font-semibold",
                      top ? "text-accent-deep" : "text-ink",
                    )}
                  >
                    {b.wickets}
                    <span className="text-faint">/</span>
                    {b.runs}
                    <span className="ml-0.5 text-[11px] font-normal text-faint">
                      ({b.overs})
                    </span>
                  </span>
                </li>
              );
            })}
            {inn.bowling.length === 0 ? (
              <li className="text-[13px] text-faint">No bowling yet</li>
            ) : null}
          </ul>
        </div>
      </div>

      {full ? <FullTables inn={inn} /> : null}
    </section>
  );
}

/**
 * The classic five-column card. Only rendered on demand, so it can afford
 * roomy rows, dismissal text and 44px-safe profile links.
 */
function FullTables({ inn }: { inn: InningsCard }) {
  return (
    <div className="border-t border-line px-4 py-3">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[17rem] table-fixed text-[13px]">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-muted">
              <th className="pb-2 font-medium">Batting</th>
              <th className="w-10 pb-2 text-right font-medium">R</th>
              <th className="w-9 pb-2 text-right font-medium">B</th>
              <th className="w-12 pb-2 text-right font-medium">4s/6s</th>
              <th className="w-11 pb-2 text-right font-medium">SR</th>
            </tr>
          </thead>
          <tbody className="tabular">
            {inn.batting.map((b) => (
              <tr key={String(b.userId)} className="border-t border-line/60">
                <td className="py-2 pr-2">
                  {/* Both lines sit inside the link so the tap target
                      clears 44px in a dense table. */}
                  <Link href={`/players/${b.userId}`} className="-my-2 block py-2">
                    <span className="block truncate font-medium text-ink">
                      {b.displayName}
                    </span>
                    <span className="block truncate text-xs text-muted">
                      {b.out
                        ? b.dismissal
                        : b.retired
                          ? "retired not out"
                          : "not out"}
                    </span>
                  </Link>
                </td>
                <td className="py-2 text-right align-top font-semibold text-ink">
                  {b.runs}
                </td>
                <td className="py-2 text-right align-top text-muted">{b.balls}</td>
                <td className="py-2 text-right align-top text-muted">
                  {b.fours}/{b.sixes}
                </td>
                <td className="py-2 text-right align-top text-muted">
                  {b.sr.toFixed(0)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {inn.fallOfWickets.length > 0 ? (
        <p className="mt-2.5 text-xs leading-relaxed text-muted">
          <span className="font-medium text-ink">FOW </span>
          {inn.fallOfWickets
            .map(
              (f) => `${f.wicketNo}-${f.runs} (${f.playerOutName}, ${f.oversText})`,
            )
            .join(" · ")}
        </p>
      ) : null}

      {inn.bowling.length > 0 ? (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[17rem] table-fixed text-[13px]">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-muted">
                <th className="pb-2 font-medium">Bowling</th>
                <th className="w-10 pb-2 text-right font-medium">O</th>
                <th className="w-7 pb-2 text-right font-medium">M</th>
                <th className="w-9 pb-2 text-right font-medium">R</th>
                <th className="w-7 pb-2 text-right font-medium">W</th>
                <th className="w-11 pb-2 text-right font-medium">Econ</th>
              </tr>
            </thead>
            <tbody className="tabular">
              {inn.bowling.map((b) => (
                <tr key={String(b.userId)} className="border-t border-line/60">
                  <td className="py-3 pr-2">
                    <Link
                      href={`/players/${b.userId}`}
                      className="-my-3 block truncate py-3 font-medium text-ink"
                    >
                      {b.displayName}
                    </Link>
                  </td>
                  <td className="py-3 text-right text-muted">{b.overs}</td>
                  <td className="py-3 text-right text-muted">{b.maidens}</td>
                  <td className="py-3 text-right text-muted">{b.runs}</td>
                  <td className="py-3 text-right font-semibold text-ink">
                    {b.wickets}
                  </td>
                  <td className="py-3 text-right text-muted">
                    {b.econ.toFixed(1)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
