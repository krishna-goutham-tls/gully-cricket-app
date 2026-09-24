import { v } from "convex/values";
import { query, QueryCtx } from "./_generated/server";
import { Doc, Id } from "./_generated/dataModel";
import { legalBallToOverText, runRate } from "./lib/scoring";
import { groundsOf } from "./lib/grounds";
import {
  aggregateRuns,
  leadText,
  sideLabel,
  totalInningsOf,
} from "./scoring";
import { pollView } from "./polls";

/**
 * What a link shared on WhatsApp shows to anyone who opens it — no session.
 *
 * These take no token on purpose. The id in the URL is the only key, so each
 * query returns what its page prints and nothing else: team names, the score,
 * the batters and bowler at the crease, the names on a poll. Never phone
 * numbers, PINs, user ids, or a community's member list. A sandbox match or
 * poll is practice and returns null, same as one that does not exist.
 *
 * Ids arrive as plain strings: a mangled link reads as "not found" instead of
 * throwing an argument error at a stranger.
 */

type Side = "A" | "B";

async function isSandboxOrg(ctx: QueryCtx, orgId: Id<"orgs">) {
  const org = await ctx.db.get(orgId);
  return !org || (org.isSandbox ?? false);
}

/** The ground's name, if the community has named one. Never area or maps. */
async function groundNameOf(
  ctx: QueryCtx,
  orgId: Id<"orgs">,
  groundId: Id<"grounds"> | undefined,
): Promise<string | undefined> {
  const all = await groundsOf(ctx, orgId);
  const ground = groundId
    ? all.find((g) => String(g._id) === String(groundId))
    : all.find((g) => g.isHome && !g.archived);
  return ground?.name;
}

async function nameOf(ctx: QueryCtx, id: Id<"users"> | undefined) {
  if (!id) return null;
  const u = await ctx.db.get(id);
  return u ? u.displayName : null;
}

export const match = query({
  args: { matchId: v.string() },
  handler: async (ctx, args) => {
    const matchId = ctx.db.normalizeId("matches", args.matchId);
    if (!matchId) return null;
    const match = await ctx.db.get(matchId);
    if (!match || (await isSandboxOrg(ctx, match.orgId))) return null;

    const rules = match.ruleSnapshot;
    const live = await ctx.db
      .query("matchLiveState")
      .withIndex("by_match", (q) => q.eq("matchId", match._id))
      .unique();
    const inningsList = (
      await ctx.db
        .query("innings")
        .withIndex("by_match", (q) => q.eq("matchId", match._id))
        .collect()
    ).sort((a, b) => a.inningsNo - b.inningsNo);

    const nameA = await sideLabel(ctx, match, "A");
    const nameB = await sideLabel(ctx, match, "B");

    const done = match.status === "completed" || match.status === "abandoned";
    const doneInnings = inningsList.filter((i) => i.status === "complete");
    const totalInnings = totalInningsOf(match);

    // Same reading as liveState's phase, minus the scorer-only prompts.
    const phase = (() => {
      if (done) return "completed" as const;
      if (match.status === "scheduled") return "not_started" as const;
      if (!live?.currentInningsId) {
        return doneInnings.length > 0
          ? ("innings_break" as const)
          : ("not_started" as const);
      }
      if (live.needBatsman) return "need_batsman" as const;
      if (live.needBowler) return "need_bowler" as const;
      return "scoring" as const;
    })();

    let breakInfo: { leadText: string; target?: number } | null = null;
    if (phase === "innings_break" && doneInnings.length < totalInnings) {
      const nextNo = doneInnings[doneInnings.length - 1].inningsNo + 1;
      // Next up is the side that has batted less; level (innings 3 of a
      // Test) goes to the side that opened, as liveState defaults it.
      const counts = { A: 0, B: 0 };
      for (const i of doneInnings) counts[i.battingSide] += 1;
      const nextSide: Side =
        counts.A === counts.B
          ? doneInnings[0].battingSide
          : counts.A < counts.B
            ? "A"
            : "B";
      const other: Side = nextSide === "A" ? "B" : "A";
      breakInfo = {
        leadText: leadText(
          nameA,
          nameB,
          aggregateRuns(doneInnings, "A"),
          aggregateRuns(doneInnings, "B"),
        ),
        target:
          nextNo === totalInnings
            ? aggregateRuns(doneInnings, other) -
              aggregateRuns(doneInnings, nextSide) +
              1
            : undefined,
      };
    }

    type BallChip = {
      _id: Id<"balls">;
      runsBat: number;
      extrasType?: Doc<"balls">["extrasType"];
      extrasRuns: number;
      isWicket: boolean;
      isLegal: boolean;
      isRetire: boolean;
    };
    const toChip = (b: Doc<"balls">): BallChip => ({
      _id: b._id,
      runsBat: b.runsBat,
      extrasType: b.extrasType,
      extrasRuns: b.extrasRuns,
      isWicket: b.isWicket,
      isLegal: b.isLegal,
      isRetire: b.isRetire ?? false,
    });

    let board = null;
    if (!done && live?.currentInningsId && live.battingSide) {
      const balls = (
        await ctx.db
          .query("balls")
          .withIndex("by_innings", (q) =>
            q.eq("inningsId", live.currentInningsId!),
          )
          .collect()
      ).sort((a, b) => a.sequence - b.sequence);

      // Over in progress plus the one before it, split at legal-ball counts.
      let legal = 0;
      let curStart = 0;
      let prevStart = 0;
      balls.forEach((b, i) => {
        if (!b.isLegal) return;
        legal += 1;
        if (legal % rules.ballsPerOver === 0) {
          prevStart = curStart;
          curStart = i + 1;
        }
      });

      const tally = (id: Id<"users"> | undefined) => {
        if (!id) return null;
        let runs = 0;
        let faced = 0;
        for (const b of balls) {
          if (b.isRetire || b.strikerId !== id) continue;
          runs += b.runsBat;
          if (b.isLegal || b.extrasType === "noball") faced += 1;
        }
        return { runs, balls: faced };
      };
      let bowler: { runs: number; wickets: number } | null = null;
      if (live.bowlerId) {
        bowler = { runs: 0, wickets: 0 };
        for (const b of balls) {
          if (b.isRetire || b.bowlerId !== live.bowlerId) continue;
          bowler.runs += b.runsBat + b.extrasRuns;
          if (b.isWicket && b.wicketType !== "runout") bowler.wickets += 1;
        }
      }

      const maxBalls = rules.maxOversInnings * rules.ballsPerOver;
      const limited = (rules.inningsPerSide ?? 1) !== 2;
      board = {
        inningsNo: live.inningsNo,
        currentInningsId: live.currentInningsId,
        battingSide: live.battingSide,
        totalRuns: live.totalRuns,
        wickets: live.wickets,
        oversText: live.oversText,
        target: live.target,
        runRate:
          live.legalBalls > 0
            ? runRate(live.totalRuns, live.legalBalls, rules.ballsPerOver)
            : 0,
        // A chase in a limited game: "need 23 off 16".
        ballsLeft:
          limited && live.target !== undefined
            ? Math.max(0, maxBalls - live.legalBalls)
            : undefined,
        striker: await nameOf(ctx, live.strikerId),
        nonStriker: await nameOf(ctx, live.nonStrikerId),
        bowler: await nameOf(ctx, live.bowlerId),
        figures: {
          striker: tally(live.strikerId),
          nonStriker: tally(live.nonStrikerId),
          bowler,
        },
        currentOverBalls: balls.slice(curStart).map(toChip),
        prevOverBalls: balls.slice(prevStart, curStart).map(toChip),
      };
    }

    return {
      status: match.status,
      phase,
      sideA: { name: nameA },
      sideB: { name: nameB },
      winnerSide: match.winnerSide,
      resultText: match.resultText ?? live?.resultText,
      groundName: await groundNameOf(ctx, match.orgId, match.groundId),
      ballsPerOver: rules.ballsPerOver,
      inningsPerSide: rules.inningsPerSide ?? 1,
      solo: rules.battingModeDefault === "single",
      innings: inningsList.map((i) => ({
        _id: i._id,
        inningsNo: i.inningsNo,
        battingSide: i.battingSide,
        totalRuns: i.totalRuns,
        wickets: i.wickets,
        oversText: legalBallToOverText(i.legalBalls, rules.ballsPerOver),
      })),
      breakInfo,
      live: board,
    };
  },
});

export const poll = query({
  args: { pollId: v.string() },
  handler: async (ctx, args) => {
    const pollId = ctx.db.normalizeId("polls", args.pollId);
    if (!pollId) return null;
    const poll = await ctx.db.get(pollId);
    if (!poll || (await isSandboxOrg(ctx, poll.orgId))) return null;

    const view = await pollView(ctx, poll, null, Date.now());
    const names = (rows: Array<{ displayName: string }>) =>
      rows.map((r) => ({ displayName: r.displayName }));
    return {
      _id: view._id,
      date: view.date,
      time: view.time,
      startsAt: view.startsAt,
      note: view.note,
      status: view.status,
      // Strangers get the name even when the community has one ground —
      // "Home" means nothing outside the group.
      groundName: await groundNameOf(ctx, poll.orgId, view.groundId),
      createdByName: view.createdByName,
      matchId: view.matchId,
      counts: view.counts,
      groups: {
        in: names(view.groups.in),
        maybe: names(view.groups.maybe),
        out: names(view.groups.out),
      },
    };
  },
});
