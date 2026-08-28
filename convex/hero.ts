import { v } from "convex/values";
import { query, QueryCtx } from "./_generated/server";
import { Doc, Id } from "./_generated/dataModel";
import { requireActiveMembership } from "./lib/session";
import { legalBallToOverText } from "./lib/scoring";
import {
  basePoints,
  battingMilestoneBonus,
  bowlingHaulBonus,
} from "./lib/points";
import { sideLabel } from "./scoring";

type Side = "A" | "B";

/**
 * "Hero" — a social-shareable one-screen story of how one player played on
 * one calendar DAY (a day often holds several matches). Entirely read-model:
 * everything here replays the `balls` log for completed matches at read
 * time, same as `story.ts` and `stats.ts` — no schema change, no backfill.
 *
 * Day boundaries (`dayStart`/`dayEnd`) are computed on the client from
 * `lib/dates.ts`-style local-day math and passed in as plain timestamps, so
 * timezone logic lives in exactly one place (the client), matching how
 * `stats.ts`'s weekly cutoff and `home/page.tsx`'s day grouping work.
 */

/** Economy/overs figures use a hardcoded 6 balls/over, matching stats.ts's
 * `buildBowlingRows` — the leaderboard and this card must never disagree
 * about what an "over" means, even for a match that used a different count. */
const STANDARD_BALLS_PER_OVER = 6;

/* All-round points come from the shared formula in convex/lib/points.ts.
 * The POTM check below must stay identical to `potmPoints` in
 * convex/story.ts and convex/stats.ts's `buildAllRoundRows` — three
 * independent read-models computing the same number. Each folds its own Agg
 * shape, but every value and threshold comes from the shared module so the
 * arithmetic cannot drift. */

/**
 * The list of distinct days (most recent first) that have at least one
 * completed match in this org, with every player involved that day —
 * everything the day/player picker needs in one round trip. Day bucketing
 * itself happens client-side (via `groupByDay`); this just hands over the
 * raw completed-match list with names already resolved.
 */
export const heroDays = query({
  args: {
    token: v.optional(v.string()),
    orgId: v.id("orgs"),
  },
  handler: async (ctx, args) => {
    try {
      await requireActiveMembership(ctx, args.token, args.orgId);
    } catch {
      return null;
    }

    const matches = await ctx.db
      .query("matches")
      .withIndex("by_org_status", (q) =>
        q.eq("orgId", args.orgId).eq("status", "completed"),
      )
      .collect();

    const nameCache = new Map<string, string>();
    const idsToResolve = new Set<string>();
    for (const m of matches) {
      for (const id of [...m.sideAPlayerIds, ...m.sideBPlayerIds]) {
        idsToResolve.add(String(id));
      }
    }
    await Promise.all(
      Array.from(idsToResolve).map(async (key) => {
        const u = await ctx.db.get(key as Id<"users">);
        if (u && "displayName" in u) nameCache.set(key, u.displayName as string);
      }),
    );

    return matches
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((m) => ({
        matchId: m._id,
        createdAt: m.createdAt,
        players: Array.from(
          new Set([...m.sideAPlayerIds, ...m.sideBPlayerIds].map(String)),
        ).map((id) => ({
          id: id as Id<"users">,
          name: nameCache.get(id) ?? "Player",
        })),
      }));
  },
});

/** One completed match's mini-line on the hero card. */
type MiniLine = {
  matchId: Id<"matches">;
  opponent: string;
  battingFigure: string | null;
  bowlingFigure: string | null;
  result: "won" | "lost" | "none";
};

/**
 * Everything one player did on one day, folded from the ball log of every
 * completed match that day, plus an auto-picked headline sentence.
 */
export const heroDay = query({
  args: {
    token: v.optional(v.string()),
    orgId: v.id("orgs"),
    playerId: v.id("users"),
    dayStart: v.number(),
    dayEnd: v.number(),
  },
  handler: async (ctx, args) => {
    try {
      await requireActiveMembership(ctx, args.token, args.orgId);
    } catch {
      return null;
    }

    const player = await ctx.db.get(args.playerId);
    if (!player) return null;
    const playerKey = String(args.playerId);

    const allCompleted = await ctx.db
      .query("matches")
      .withIndex("by_org_status", (q) =>
        q.eq("orgId", args.orgId).eq("status", "completed"),
      )
      .collect();

    const dayMatches = allCompleted
      .filter(
        (m) =>
          m.createdAt >= args.dayStart &&
          m.createdAt < args.dayEnd &&
          [...m.sideAPlayerIds, ...m.sideBPlayerIds].some(
            (id) => String(id) === playerKey,
          ),
      )
      .sort((a, b) => a.createdAt - b.createdAt);

    if (dayMatches.length === 0) return null;

    // ---- Day-wide totals ----
    let runs = 0;
    let ballsFaced = 0;
    let fours = 0;
    let sixes = 0;
    let wickets = 0;
    let runsConceded = 0;
    let ballsBowled = 0;
    let catches = 0;
    let dismissals = 0;
    let inningsBattedCount = 0;
    let potmCount = 0;

    let bestBattingOver: { runs: number } | null = null;
    let bestBowlingOver: { wickets: number; runs: number } | null = null;

    // ---- Extra day-wide folds, only used to build `insights` below ----
    // Dot balls conceded while bowling — "suffocating" pressure.
    let dotsBowled = 0;
    // Lowest runs conceded in any one over bowled, regardless of wickets —
    // the "tightest over" grit line, distinct from bestBowlingOver which
    // ranks by wickets first.
    let bestEconomyOverRuns: number | null = null;
    // Wickets that fell at the other end while this player was at the
    // crease and not out themselves — the "held an end" grit line.
    let teammateWicketsWhileBatting = 0;
    // Every player this player got out (credited wickets only) this day —
    // resolved to names after the loop for the "sent back X and Y" line.
    const dismissedIds = new Set<string>();

    const miniLines: MiniLine[] = [];

    for (const match of dayMatches) {
      const onA = match.sideAPlayerIds.some((id) => String(id) === playerKey);
      const onB = match.sideBPlayerIds.some((id) => String(id) === playerKey);
      // Common players (on both sides) have no single opponent and no
      // win/loss to claim — mirrors stats.ts's playerStats log.
      const side: Side | undefined = onA && !onB ? "A" : onB && !onA ? "B" : undefined;

      const balls = await ctx.db
        .query("balls")
        .withIndex("by_match", (q) => q.eq("matchId", match._id))
        .collect();
      balls.sort((a, b) => a.sequence - b.sequence);

      // Per-match figures for this player.
      let mRuns = 0;
      let mBalls = 0;
      let mOut = false;
      let mWickets = 0;
      let mRunsConceded = 0;
      let mLegalBalls = 0;
      let mCatches = 0;
      let mDots = 0;

      // Innings this player batted in this match — used after the loop to
      // count how many *other* wickets fell while they were out there.
      const battingInningsIds = new Set<string>();

      // Every player's contribution this match, for the POTM check. Runs are
      // bucketed per innings (key `${inningsId}:${playerId}`) because the
      // batting milestone bonus is per innings, not per match.
      const pInnRuns = new Map<string, number>();
      const pWkts = new Map<string, number>();
      const pCatch = new Map<string, number>();
      const bump = (m: Map<string, number>, k: string, by = 1) =>
        m.set(k, (m.get(k) ?? 0) + by);

      // This player's own overs — batting and bowling — keyed by innings+over.
      const battingOverRuns = new Map<string, number>();
      const bowlingOverStats = new Map<string, { runs: number; wickets: number }>();

      for (const b of balls) {
        if (b.isRetire) continue;
        const total = b.runsBat + b.extrasRuns;
        bump(pInnRuns, `${b.inningsId}:${b.strikerId}`, b.runsBat);

        if (String(b.strikerId) === playerKey) {
          mRuns += b.runsBat;
          const faced = b.isLegal || b.extrasType === "noball";
          if (faced) mBalls += 1;
          if (b.runsBat === 4) fours += 1;
          if (b.runsBat === 6) sixes += 1;
          const key = `${b.inningsId}:${b.overNumber}`;
          battingOverRuns.set(key, (battingOverRuns.get(key) ?? 0) + b.runsBat);
          battingInningsIds.add(String(b.inningsId));
        }

        if (b.isWicket && b.playerOutId) {
          const credited = b.wicketType !== "runout";
          if (credited) bump(pWkts, String(b.bowlerId));
          if (String(b.playerOutId) === playerKey) mOut = true;
          if (b.wicketType === "caught" && b.fielderId) {
            bump(pCatch, String(b.fielderId));
            if (String(b.fielderId) === playerKey) mCatches += 1;
          }
          if (credited && String(b.bowlerId) === playerKey) {
            mWickets += 1;
            const key = `${b.inningsId}:${b.overNumber}`;
            const o = bowlingOverStats.get(key) ?? { runs: 0, wickets: 0 };
            o.wickets += 1;
            bowlingOverStats.set(key, o);
            dismissedIds.add(String(b.playerOutId));
          }
        }

        if (String(b.bowlerId) === playerKey) {
          mRunsConceded += total;
          if (b.isLegal) mLegalBalls += 1;
          if (b.isLegal && total === 0) mDots += 1;
          const key = `${b.inningsId}:${b.overNumber}`;
          const o = bowlingOverStats.get(key) ?? { runs: 0, wickets: 0 };
          o.runs += total;
          bowlingOverStats.set(key, o);
        }
      }

      // Second, cheap pass over the same match's balls (already fetched) —
      // count wickets that fell in the innings this player batted, at the
      // *other* end, while they stayed not out. Small org scale makes a
      // second pass over one match's ball log fine.
      if (battingInningsIds.size > 0) {
        for (const b of balls) {
          if (b.isRetire || !b.isWicket || !b.playerOutId) continue;
          if (!battingInningsIds.has(String(b.inningsId))) continue;
          if (String(b.playerOutId) === playerKey) continue;
          teammateWicketsWhileBatting += 1;
        }
      }

      runs += mRuns;
      ballsFaced += mBalls;
      wickets += mWickets;
      runsConceded += mRunsConceded;
      ballsBowled += mLegalBalls;
      catches += mCatches;
      dotsBowled += mDots;
      if (mBalls > 0) inningsBattedCount += 1;
      if (mOut) dismissals += 1;

      for (const o of Array.from(battingOverRuns.values())) {
        if (!bestBattingOver || o > bestBattingOver.runs) {
          bestBattingOver = { runs: o };
        }
      }
      for (const o of Array.from(bowlingOverStats.values())) {
        if (
          !bestBowlingOver ||
          o.wickets > bestBowlingOver.wickets ||
          (o.wickets === bestBowlingOver.wickets && o.runs < bestBowlingOver.runs)
        ) {
          bestBowlingOver = { wickets: o.wickets, runs: o.runs };
        }
        if (bestEconomyOverRuns === null || o.runs < bestEconomyOverRuns) {
          bestEconomyOverRuns = o.runs;
        }
      }

      // Player of the Match, by the shared points formula — only counts if
      // this player actually contributed (nobody is POTM for a scoreless day).
      const pRuns = new Map<string, number>();
      const pBatBonus = new Map<string, number>();
      for (const [key, score] of Array.from(pInnRuns.entries())) {
        const k = key.slice(key.indexOf(":") + 1);
        bump(pRuns, k, score);
        bump(pBatBonus, k, battingMilestoneBonus(score));
      }
      const allKeys = new Set<string>([
        ...Array.from(pRuns.keys()),
        ...Array.from(pWkts.keys()),
        ...Array.from(pCatch.keys()),
      ]);
      let bestPoints = -1;
      let winners: string[] = [];
      for (const k of Array.from(allKeys)) {
        const p =
          basePoints(pRuns.get(k) ?? 0, pWkts.get(k) ?? 0, pCatch.get(k) ?? 0) +
          (pBatBonus.get(k) ?? 0) +
          bowlingHaulBonus(pWkts.get(k) ?? 0);
        if (p > bestPoints) {
          bestPoints = p;
          winners = [k];
        } else if (p === bestPoints) {
          winners.push(k);
        }
      }
      if (bestPoints > 0 && winners.includes(playerKey)) potmCount += 1;

      const otherSide: Side = side === "A" ? "B" : "A";
      const opponent =
        side === undefined
          ? `${await sideLabel(ctx, match, "A")} v ${await sideLabel(ctx, match, "B")}`
          : await sideLabel(ctx, match, otherSide);

      miniLines.push({
        matchId: match._id,
        opponent,
        battingFigure:
          mBalls > 0 || mOut ? `${mRuns}${mOut ? "" : "*"}(${mBalls})` : null,
        bowlingFigure:
          mLegalBalls > 0
            ? `${mWickets}/${mRunsConceded} (${legalBallToOverText(mLegalBalls, STANDARD_BALLS_PER_OVER)})`
            : null,
        result:
          side === undefined || match.winnerSide === undefined
            ? "none"
            : match.winnerSide === side
              ? "won"
              : "lost",
      });
    }

    const strikeRate = ballsFaced > 0 ? (runs / ballsFaced) * 100 : 0;
    const economy = ballsBowled > 0 ? runsConceded / (ballsBowled / STANDARD_BALLS_PER_OVER) : null;

    const headline = buildHeadline({
      matches: dayMatches.length,
      runs,
      ballsFaced,
      sixes,
      wickets,
      economy,
      ballsBowled,
      catches,
      dismissals,
      inningsBattedCount,
      potmCount,
    });

    // Career baseline (before this day) — cheap second pass, this player
    // only, over matches already loaded in `allCompleted`. Powers the
    // "way above his usual" / "doubled his usual haul" comparison lines.
    const careerBaseline = await computeCareerBaseline(
      ctx,
      args.playerId,
      args.dayStart,
      allCompleted,
    );

    // Names of players this player got out today, for the "sent back X and
    // Y" line — resolved once, after the loop.
    const dismissedNames = (
      await Promise.all(
        Array.from(dismissedIds).map(async (id) => {
          const u = await ctx.db.get(id as Id<"users">);
          return u && "displayName" in u ? (u.displayName as string) : null;
        }),
      )
    ).filter((n): n is string => Boolean(n));

    const insights = buildInsights({
      matches: dayMatches.length,
      runs,
      ballsFaced,
      strikeRate,
      fours,
      sixes,
      wickets,
      ballsBowled,
      dotsBowled,
      catches,
      dismissals,
      bestBattingOver: bestBattingOver?.runs ?? null,
      bestBowlingOver,
      bestEconomyOverRuns,
      teammateWicketsWhileBatting,
      dismissedNames,
      careerBaseline,
      headline,
    });

    return {
      playerId: args.playerId,
      displayName: player.displayName,
      isGuest: player.isGuest ?? false,
      dayStart: args.dayStart,
      dayEnd: args.dayEnd,
      headline,
      insights,
      numbers: {
        matches: dayMatches.length,
        runs,
        ballsFaced,
        strikeRate,
        fours,
        sixes,
        wickets,
        runsConceded,
        ballsBowled,
        oversText: legalBallToOverText(ballsBowled, STANDARD_BALLS_PER_OVER),
        economy,
        catches,
        dismissals,
      },
      miniLines,
      moments: {
        bestBattingOver: bestBattingOver?.runs ?? null,
        bestBowlingOver,
        potmCount,
      },
    };
  },
});

/**
 * Picks one headline sentence for the day, best highlight first. Order is
 * deliberate: an all-round day beats a big knock, which beats a wicket
 * haul, and so on down to the fallback nobody wants but everybody gets.
 */
function buildHeadline(d: {
  matches: number;
  runs: number;
  ballsFaced: number;
  sixes: number;
  wickets: number;
  economy: number | null;
  ballsBowled: number;
  catches: number;
  dismissals: number;
  inningsBattedCount: number;
  potmCount: number;
}): string {
  const carriedBat = d.inningsBattedCount > 0 && d.dismissals === 0 && d.runs >= 15;

  if (d.runs >= 30 && d.wickets >= 2) {
    return `${d.runs} runs · ${d.wickets} wicket${d.wickets === 1 ? "" : "s"} — all-round day`;
  }
  if (d.runs >= 50) {
    return `${d.runs} off ${d.ballsFaced} — knock of the day`;
  }
  if (d.wickets >= 4) {
    return `${d.wickets}-wicket haul`;
  }
  if (d.potmCount > 0) {
    return d.potmCount > 1 || d.matches > 1
      ? `Player of the Match, ${d.potmCount} of ${d.matches} today`
      : "Player of the Match";
  }
  if (carriedBat) {
    return "Carried the bat";
  }
  // 2 overs, economy at or under 4 — a genuinely tight day with the ball.
  if (d.ballsBowled >= 12 && d.economy !== null && d.economy <= 4) {
    return "Economy king";
  }
  if (d.sixes >= 3) {
    return `Cleared the ropes ${d.sixes} times`;
  }
  if (d.catches >= 2) {
    return `${d.catches} catches — safest hands out there`;
  }
  if (d.runs >= 15 || d.wickets >= 1) {
    return [
      d.runs > 0 ? `${d.runs} runs` : null,
      d.wickets > 0 ? `${d.wickets} wicket${d.wickets === 1 ? "" : "s"}` : null,
    ]
      .filter(Boolean)
      .join(" · ");
  }
  return "Showed up. That counts.";
}

/** This player's career figures from every completed match that landed
 * before `dayStart` — a cheap, player-scoped second pass over the ball log
 * (org scale is small, so re-reading a prior match's balls once per Hero
 * view is fine). Returns null when the player has no prior history, so the
 * comparison lines simply don't fire on someone's first day rather than
 * printing a baseline of zero. */
async function computeCareerBaseline(
  ctx: QueryCtx,
  playerId: Id<"users">,
  dayStart: number,
  allCompleted: Doc<"matches">[],
) {
  const playerKey = String(playerId);
  const priorMatches = allCompleted.filter(
    (m) =>
      m.createdAt < dayStart &&
      [...m.sideAPlayerIds, ...m.sideBPlayerIds].some(
        (id) => String(id) === playerKey,
      ),
  );
  if (priorMatches.length === 0) return null;

  let careerRuns = 0;
  let careerBallsFaced = 0;
  let careerWickets = 0;

  for (const match of priorMatches) {
    const balls = await ctx.db
      .query("balls")
      .withIndex("by_match", (q) => q.eq("matchId", match._id))
      .collect();
    for (const b of balls) {
      if (b.isRetire) continue;
      if (String(b.strikerId) === playerKey) {
        careerRuns += b.runsBat;
        if (b.isLegal || b.extrasType === "noball") careerBallsFaced += 1;
      }
      if (
        b.isWicket &&
        b.wicketType !== "runout" &&
        String(b.bowlerId) === playerKey
      ) {
        careerWickets += 1;
      }
    }
  }

  return {
    careerMatches: priorMatches.length,
    careerBallsFaced,
    careerSR: careerBallsFaced > 0 ? (careerRuns / careerBallsFaced) * 100 : 0,
    careerWicketsPerMatch: careerWickets / priorMatches.length,
  };
}

/** One candidate line for the poster's insight stack, scored so the
 * strongest 3-5 (best-first) survive the cut. The score never renders. */
type InsightCandidate = { text: string; score: number };

/**
 * Builds the day's flattering, factual talking points — never a stat dump.
 * Every candidate is gated on a real threshold in the data; nothing here is
 * invented. Order is "best first" by score, capped at 5, with the grit
 * fallbacks (including the unconditional last-resort line) keeping a quiet
 * day's poster from ever being empty.
 */
function buildInsights(d: {
  matches: number;
  runs: number;
  ballsFaced: number;
  strikeRate: number;
  fours: number;
  sixes: number;
  wickets: number;
  ballsBowled: number;
  dotsBowled: number;
  catches: number;
  dismissals: number;
  bestBattingOver: number | null;
  bestBowlingOver: { wickets: number; runs: number } | null;
  bestEconomyOverRuns: number | null;
  teammateWicketsWhileBatting: number;
  dismissedNames: string[];
  careerBaseline: {
    careerMatches: number;
    careerBallsFaced: number;
    careerSR: number;
    careerWicketsPerMatch: number;
  } | null;
  headline: string;
}): string[] {
  const candidates: InsightCandidate[] = [];
  const push = (cond: boolean, score: number, text: string) => {
    if (cond) candidates.push({ text, score });
  };

  // ---- Gully character ----
  const boundaryRuns = d.fours * 4 + d.sixes * 6;
  const boundaryPct = d.runs > 0 ? (boundaryRuns / d.runs) * 100 : 0;
  push(
    d.runs >= 15 && boundaryPct >= 45,
    60,
    `${boundaryRuns} of his ${d.runs} came in boundaries — pure timing`,
  );
  push(d.sixes >= 3, 55, `${d.sixes} sixes — cleared the ropes ${d.sixes} times`);
  push(d.sixes === 2, 32, `2 sixes — started clearing the ropes`);

  // ---- Dot pressure when bowling (2+ overs, half or more dots) ----
  const dotPct = d.ballsBowled > 0 ? (d.dotsBowled / d.ballsBowled) * 100 : 0;
  push(
    d.ballsBowled >= 12 && dotPct >= 50,
    50,
    `${d.dotsBowled} dots in ${legalBallToOverText(d.ballsBowled, STANDARD_BALLS_PER_OVER)} overs — suffocating`,
  );

  // ---- Bests within the day ----
  if (d.bestBattingOver !== null) {
    push(d.bestBattingOver >= 15, 90, `Took ${d.bestBattingOver} off a single over`);
    push(
      d.bestBattingOver >= 10 && d.bestBattingOver < 15,
      65,
      `Took ${d.bestBattingOver} off a single over`,
    );
  }
  if (d.bestBowlingOver) {
    push(
      d.bestBowlingOver.wickets >= 3,
      95,
      `${d.bestBowlingOver.wickets} wickets in one over turned the match`,
    );
    push(d.bestBowlingOver.wickets === 2, 68, "2 wickets in one over turned the match");
  }
  push(d.catches >= 2, 45, `Safe hands: ${d.catches} catches`);
  push(d.catches === 1, 25, "Safe hands: 1 catch");

  // ---- Career comparison ----
  const cb = d.careerBaseline;
  if (cb && cb.careerBallsFaced >= 18 && d.ballsFaced >= 6 && cb.careerSR > 0) {
    push(
      d.strikeRate >= cb.careerSR * 1.2,
      55,
      `Struck at ${d.strikeRate.toFixed(0)} — way above his usual ${cb.careerSR.toFixed(0)}`,
    );
  }
  if (cb && cb.careerMatches >= 2 && cb.careerWicketsPerMatch > 0 && d.wickets >= 2) {
    const dayRate = d.wickets / d.matches;
    push(dayRate >= cb.careerWicketsPerMatch * 2, 60, "Doubled his usual wicket haul");
  }

  // ---- Head-to-heads from the day ----
  if (d.dismissedNames.length > 0) {
    const shown = d.dismissedNames.slice(0, 3);
    const extra = d.dismissedNames.length - shown.length;
    // Natural "A, B and C" join, plus an overflow count rather than a 4th
    // name crammed in — this is a poster line, not a scorecard.
    const names =
      shown.length === 1
        ? shown[0]
        : `${shown.slice(0, -1).join(", ")} and ${shown[shown.length - 1]}`;
    const suffix = extra > 0 ? ` and ${extra} more` : "";
    push(true, d.dismissedNames.length >= 2 ? 50 : 30, `Sent back ${names}${suffix}`);
  }

  // ---- Grit fallbacks, so a quiet day is never empty or roasty ----
  push(
    d.ballsFaced >= 10 && d.dismissals === 0 && d.teammateWicketsWhileBatting >= 3,
    28,
    "Held an end while wickets fell",
  );
  push(
    d.bestEconomyOverRuns !== null && d.bestEconomyOverRuns <= 2 && d.ballsBowled >= 6,
    20,
    "Bowled the tightest over of the day",
  );
  // Unconditional last resort — every day clears this bar.
  push(
    true,
    1,
    `Turned up and played ${d.matches} match${d.matches === 1 ? "" : "es"} — the streak lives`,
  );

  return candidates
    .sort((a, b) => b.score - a.score)
    .filter((c) => c.text !== d.headline)
    .slice(0, 5)
    .map((c) => c.text);
}

/**
 * One day's all-round points per player — same 1/20/8 + bonuses as POTM
 * and Leaders. Used to size the Hero picker. Zero-point players stay in
 * the list so a quiet day is still pickable.
 */
export const dayShares = query({
  args: {
    token: v.optional(v.string()),
    orgId: v.id("orgs"),
    dayStart: v.number(),
    dayEnd: v.number(),
  },
  handler: async (ctx, args) => {
    try {
      await requireActiveMembership(ctx, args.token, args.orgId);
    } catch {
      return null;
    }

    const allCompleted = await ctx.db
      .query("matches")
      .withIndex("by_org_status", (q) =>
        q.eq("orgId", args.orgId).eq("status", "completed"),
      )
      .collect();
    const dayMatches = allCompleted.filter(
      (m) => m.createdAt >= args.dayStart && m.createdAt < args.dayEnd,
    );

    const seen = new Set<string>();
    for (const m of dayMatches) {
      for (const id of [...m.sideAPlayerIds, ...m.sideBPlayerIds]) {
        seen.add(String(id));
      }
    }

    const names = new Map<string, string>();
    const points = new Map<string, number>();
    await Promise.all(
      Array.from(seen).map(async (key) => {
        const u = await ctx.db.get(key as Id<"users">);
        if (u && "displayName" in u) names.set(key, u.displayName as string);
        points.set(key, 0);
      }),
    );

    for (const match of dayMatches) {
      const balls = await ctx.db
        .query("balls")
        .withIndex("by_match", (q) => q.eq("matchId", match._id))
        .collect();
      const innRuns = new Map<string, number>();
      const wkts = new Map<string, number>();
      const catches = new Map<string, number>();
      const bump = (m: Map<string, number>, k: string, by = 1) =>
        m.set(k, (m.get(k) ?? 0) + by);

      for (const b of balls) {
        if (b.isRetire) continue;
        bump(innRuns, `${b.inningsId}:${b.strikerId}`, b.runsBat);
        if (b.isWicket && b.playerOutId) {
          if (b.wicketType !== "runout") bump(wkts, String(b.bowlerId));
          if (b.wicketType === "caught" && b.fielderId) {
            bump(catches, String(b.fielderId));
          }
        }
      }

      const pRuns = new Map<string, number>();
      const pBonus = new Map<string, number>();
      for (const [key, score] of Array.from(innRuns.entries())) {
        const pid = key.slice(key.indexOf(":") + 1);
        bump(pRuns, pid, score);
        bump(pBonus, pid, battingMilestoneBonus(score));
      }
      const ids = new Set<string>([
        ...Array.from(pRuns.keys()),
        ...Array.from(wkts.keys()),
        ...Array.from(catches.keys()),
      ]);
      for (const id of Array.from(ids)) {
        const p =
          basePoints(
            pRuns.get(id) ?? 0,
            wkts.get(id) ?? 0,
            catches.get(id) ?? 0,
          ) +
          (pBonus.get(id) ?? 0) +
          bowlingHaulBonus(wkts.get(id) ?? 0);
        points.set(id, (points.get(id) ?? 0) + p);
      }
    }

    return Array.from(seen).map((id) => ({
      id: id as Id<"users">,
      name: names.get(id) ?? "Player",
      points: points.get(id) ?? 0,
    }));
  },
});
