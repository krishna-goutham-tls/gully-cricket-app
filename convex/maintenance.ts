import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { Id } from "./_generated/dataModel";
import { assertSeriesSides } from "./lib/tournamentLineup";
import { buildRuleSnapshot } from "./lib/rules";
import { legalBallToOverText } from "./lib/scoring";
import { restampMatch } from "./lib/matchStats";

const side = v.union(v.literal("A"), v.literal("B"));

function reseat(ids: Id<"users">[], captainId: Id<"users">) {
  if (!ids.some((id) => String(id) === String(captainId)))
    throw new Error("Captain is not on that side");
  return [captainId, ...ids.filter((id) => String(id) !== String(captainId))];
}

/**
 * Ops: reseat a side's captain (index 0) and/or rename it, on a match. Purely
 * reorders the player-id list and swaps the stored name — the ball log is
 * untouched, so no player's stats change and nothing is interchanged. Used to
 * correct a team that was captained/named by whoever happened to be picked
 * first (e.g. "Team Aditya" that should read "Team Naman").
 */
export const reseatMatchCaptain = internalMutation({
  args: {
    matchId: v.id("matches"),
    side,
    captainId: v.id("users"),
    teamName: v.optional(v.string()),
  },
  handler: async (ctx, { matchId, side, captainId, teamName }) => {
    const m = await ctx.db.get(matchId);
    if (!m) throw new Error("Match not found");
    if (side === "A") {
      const ids = reseat(m.sideAPlayerIds, captainId);
      await ctx.db.patch(matchId, {
        sideAPlayerIds: ids,
        ...(teamName !== undefined ? { sideAName: teamName } : {}),
      });
    } else {
      const ids = reseat(m.sideBPlayerIds, captainId);
      await ctx.db.patch(matchId, {
        sideBPlayerIds: ids,
        ...(teamName !== undefined ? { sideBName: teamName } : {}),
      });
    }
    // The captain and name feed the team-wins board.
    await restampMatch(ctx, matchId);
    return { ok: true };
  },
});

/**
 * Ops: remove a batter who was never actually there from a completed match.
 *
 * Gully reality: a no-show gets marked present, then "made out" to close each
 * innings, so he collects phantom ducks and hands free wickets/catches to
 * whoever was bowling/fielding. This expunges him cleanly — deletes only his
 * own deliveries (which must be 0 runs, 0 extras, or it refuses), drops the
 * wicket + catch that rode on each, corrects each innings' wicket count, balls
 * and out-list, clears him from the crease refs, and takes him off both squads.
 *
 * Refuses if he bowled or fielded a dismissal (real involvement → needs a
 * human). Totals are never recomputed because only 0-run, no-extra balls are
 * removed, so the match result cannot shift.
 */
export const expungeAbsentBatter = internalMutation({
  args: { matchId: v.id("matches"), playerId: v.id("users") },
  handler: async (ctx, { matchId, playerId }) => {
    const pid = String(playerId);
    const match = await ctx.db.get(matchId);
    if (!match) throw new Error("Match not found");

    const allBalls = await ctx.db
      .query("balls")
      .withIndex("by_match", (q) => q.eq("matchId", matchId))
      .collect();
    for (const b of allBalls) {
      if (String(b.bowlerId) === pid)
        throw new Error("Player bowled in this match — needs manual review");
      if (b.fielderId && String(b.fielderId) === pid)
        throw new Error("Player fielded a dismissal — needs manual review");
    }

    const innings = await ctx.db
      .query("innings")
      .withIndex("by_match", (q) => q.eq("matchId", matchId))
      .collect();

    let deleted = 0;
    for (const inn of innings) {
      const his = allBalls.filter(
        (b) => String(b.inningsId) === String(inn._id) && String(b.strikerId) === pid,
      );
      let legalRemoved = 0;
      let wktRemoved = 0;
      for (const b of his) {
        if (b.runsBat !== 0 || (b.extrasRuns ?? 0) !== 0)
          throw new Error("Player scored runs — not a phantom, aborting");
        if (b.isLegal) legalRemoved += 1;
        if (b.isWicket && String(b.playerOutId) === pid) wktRemoved += 1;
        await ctx.db.delete(b._id);
        deleted += 1;
      }
      await ctx.db.patch(inn._id, {
        wickets: inn.wickets - wktRemoved,
        legalBalls: inn.legalBalls - legalRemoved,
        outPlayerIds: inn.outPlayerIds.filter((id) => String(id) !== pid),
        ...(String(inn.currentStrikerId) === pid
          ? { currentStrikerId: undefined }
          : {}),
        ...(String(inn.currentNonStrikerId) === pid
          ? { currentNonStrikerId: undefined }
          : {}),
      });
    }

    await ctx.db.patch(matchId, {
      sideAPlayerIds: match.sideAPlayerIds.filter((id) => String(id) !== pid),
      sideBPlayerIds: match.sideBPlayerIds.filter((id) => String(id) !== pid),
    });

    await restampMatch(ctx, matchId);
    return { deletedBalls: deleted, innings: innings.length };
  },
});

/** Same as reseatMatchCaptain, but for a tournament's fixed squad. */
export const reseatTournamentCaptain = internalMutation({
  args: {
    tournamentId: v.id("tournaments"),
    side,
    captainId: v.id("users"),
    teamName: v.optional(v.string()),
  },
  handler: async (ctx, { tournamentId, side, captainId, teamName }) => {
    const t = await ctx.db.get(tournamentId);
    if (!t) throw new Error("Tournament not found");
    if (side === "A") {
      const ids = reseat(t.sideASquadIds, captainId);
      await ctx.db.patch(tournamentId, {
        sideASquadIds: ids,
        ...(teamName !== undefined ? { sideAName: teamName } : {}),
      });
    } else {
      const ids = reseat(t.sideBSquadIds, captainId);
      await ctx.db.patch(tournamentId, {
        sideBSquadIds: ids,
        ...(teamName !== undefined ? { sideBName: teamName } : {}),
      });
    }
    return { ok: true };
  },
});

/**
 * One-off ops: retroactively link a friendly match to a tournament series so it
 * counts toward standings. Used when a match had to be created outside the
 * tournament flow (e.g. a common player who wasn't in both fixed squads).
 * Guards: match + tournament must share an org, formats must match, the
 * match must be completed, and each XI must still include at least one
 * player from that series team. Walk-ons are allowed. Side A of the match
 * must already map to tournament team A (standings count winnerSide with
 * no remapping).
 */
export const linkMatchToTournament = internalMutation({
  args: {
    matchId: v.id("matches"),
    tournamentId: v.id("tournaments"),
  },
  handler: async (ctx, { matchId, tournamentId }) => {
    const match = await ctx.db.get(matchId);
    if (!match) throw new Error("Match not found");
    const t = await ctx.db.get(tournamentId);
    if (!t) throw new Error("Tournament not found");
    if (match.orgId !== t.orgId) throw new Error("Org mismatch");
    if (match.ruleSnapshot?.format !== t.format)
      throw new Error(
        `Format mismatch: match=${match.ruleSnapshot?.format} tournament=${t.format}`,
      );
    if (match.status !== "completed")
      throw new Error(`Match not completed (status=${match.status})`);
    if (match.tournamentId && String(match.tournamentId) !== String(t._id)) {
      throw new Error("Match already belongs to another tournament");
    }
    assertSeriesSides({
      sideAName: t.sideAName,
      sideBName: t.sideBName,
      sideASquadIds: t.sideASquadIds,
      sideBSquadIds: t.sideBSquadIds,
      sideAPlayerIds: match.sideAPlayerIds,
      sideBPlayerIds: match.sideBPlayerIds,
    });
    await ctx.db.patch(matchId, { tournamentId });
    return {
      linked: matchId,
      tournament: t.name,
      winnerSide: match.winnerSide,
    };
  },
});

/**
 * Ops: a completed Test that was really an ODI. Refuses unless every innings
 * past the first two has 0 balls (the dummy 3rd/4th used to close a Test).
 * Result text is left alone — it already reads as a runs win.
 */
export const retagCompletedAsLimited = internalMutation({
  args: {
    matchId: v.id("matches"),
    overs: v.number(),
    oversPerPlayer: v.number(),
  },
  handler: async (ctx, { matchId, overs, oversPerPlayer }) => {
    const match = await ctx.db.get(matchId);
    if (!match) throw new Error("Match not found");
    if (match.status !== "completed")
      throw new Error(`Match not completed (status=${match.status})`);
    if (match.ruleSnapshot.format !== "test")
      throw new Error(`Match format is ${match.ruleSnapshot.format}, not test`);

    const innings = await ctx.db
      .query("innings")
      .withIndex("by_match", (q) => q.eq("matchId", matchId))
      .collect();
    innings.sort((a, b) => a.inningsNo - b.inningsNo);

    const extras = innings.filter((i) => i.inningsNo > 2);
    for (const inn of extras) {
      const balls = await ctx.db
        .query("balls")
        .withIndex("by_innings", (q) => q.eq("inningsId", inn._id))
        .collect();
      if (balls.length > 0 || inn.legalBalls !== 0 || inn.totalRuns !== 0) {
        throw new Error(
          `Innings ${inn.inningsNo} has real play — not a dummy close`,
        );
      }
    }

    const snapshot = buildRuleSnapshot({
      format: "limited",
      overs,
      oversPerPlayer,
      battingMode: match.ruleSnapshot.battingModeDefault,
      lastBatsmanAlone: match.ruleSnapshot.lastBatsmanAlone,
    });
    await ctx.db.patch(matchId, { ruleSnapshot: snapshot });

    for (const inn of extras) await ctx.db.delete(inn._id);

    const lastReal = innings.find((i) => i.inningsNo === 2);
    const live = await ctx.db
      .query("matchLiveState")
      .withIndex("by_match", (q) => q.eq("matchId", matchId))
      .unique();
    if (live && lastReal) {
      await ctx.db.patch(live._id, {
        currentInningsId: lastReal._id,
        inningsNo: lastReal.inningsNo,
        battingSide: lastReal.battingSide,
        totalRuns: lastReal.totalRuns,
        wickets: lastReal.wickets,
        legalBalls: lastReal.legalBalls,
        oversText: legalBallToOverText(
          lastReal.legalBalls,
          snapshot.ballsPerOver,
        ),
        resultText: match.resultText,
      });
    }

    // Format decides which Leaders board the match sits on.
    await restampMatch(ctx, matchId);

    return {
      matchId,
      format: snapshot.format,
      deletedInnings: extras.map((i) => i.inningsNo),
      overs,
      oversPerPlayer,
    };
  },
});

/**
 * Ops: a Test that ran out of time before the fix that makes time-up a draw
 * was scored as a win on aggregate. The ball log cannot tell a time-up from a
 * real finish, so a human names the match and this rewrites only the result.
 */
export const markTestDrawn = internalMutation({
  args: { matchId: v.id("matches") },
  handler: async (ctx, { matchId }) => {
    const match = await ctx.db.get(matchId);
    if (!match) throw new Error("Match not found");
    if (match.status !== "completed")
      throw new Error(`Match not completed (status=${match.status})`);
    if (match.ruleSnapshot.format !== "test")
      throw new Error("Only a Test can end in a draw");
    const previous = match.resultText;
    await ctx.db.patch(matchId, {
      winnerSide: undefined,
      resultText: "Match drawn",
    });
    const live = await ctx.db
      .query("matchLiveState")
      .withIndex("by_match", (q) => q.eq("matchId", matchId))
      .unique();
    if (live) await ctx.db.patch(live._id, { resultText: "Match drawn" });
    await restampMatch(ctx, matchId);
    return { matchId, previous, resultText: "Match drawn" };
  },
});

/**
 * Ops: two overs were given to the wrong bowlers. Swaps bowlerId on every
 * delivery in those overs. Each over must already be a single bowler.
 * Scores do not change, so no recompute — only the stat stamps are refolded.
 */
export const swapOverBowlers = internalMutation({
  args: {
    matchId: v.id("matches"),
    inningsNo: v.number(),
    overA: v.number(),
    overB: v.number(),
  },
  handler: async (ctx, { matchId, inningsNo, overA, overB }) => {
    if (overA === overB) throw new Error("Pick two different overs");
    const inn = await ctx.db
      .query("innings")
      .withIndex("by_match_no", (q) =>
        q.eq("matchId", matchId).eq("inningsNo", inningsNo),
      )
      .unique();
    if (!inn) throw new Error("Innings not found");

    const balls = await ctx.db
      .query("balls")
      .withIndex("by_innings", (q) => q.eq("inningsId", inn._id))
      .collect();

    const inOver = (n: number) =>
      balls.filter((b) => b.overNumber === n && !b.isRetire);
    const aBalls = inOver(overA);
    const bBalls = inOver(overB);
    if (aBalls.length === 0 || bBalls.length === 0)
      throw new Error("One of those overs has no deliveries");

    const idsA = new Set(aBalls.map((b) => String(b.bowlerId)));
    const idsB = new Set(bBalls.map((b) => String(b.bowlerId)));
    if (idsA.size !== 1 || idsB.size !== 1)
      throw new Error("Each over must have exactly one bowler");
    const idA = aBalls[0].bowlerId;
    const idB = bBalls[0].bowlerId;
    if (String(idA) === String(idB))
      throw new Error("Those overs already have the same bowler");

    for (const b of aBalls) await ctx.db.patch(b._id, { bowlerId: idB });
    for (const b of bBalls) await ctx.db.patch(b._id, { bowlerId: idA });
    await restampMatch(ctx, matchId);

    const nameOf = async (id: Id<"users">) => {
      const u = await ctx.db.get(id);
      return u && "displayName" in u ? u.displayName : "?";
    };
    return {
      inningsNo,
      swapped: [
        { over: overA, from: await nameOf(idA), to: await nameOf(idB) },
        { over: overB, from: await nameOf(idB), to: await nameOf(idA) },
      ],
      ballsPatched: aBalls.length + bBalls.length,
    };
  },
});

/** Ops: rename a player. Tags are untouched — Junior is an admin's call. */
export const renamePlayer = internalMutation({
  args: {
    userId: v.id("users"),
    displayName: v.string(),
  },
  handler: async (ctx, { userId, displayName }) => {
    const user = await ctx.db.get(userId);
    if (!user) throw new Error("User not found");
    const name = displayName.trim();
    if (name.length < 2 || name.length > 40)
      throw new Error("Name must be 2-40 characters");
    const previous = user.displayName;
    await ctx.db.patch(userId, { displayName: name, updatedAt: Date.now() });

    return { previous, displayName: name };
  },
});

const WIPE_TABLES = [
  "balls",
  "matchLiveState",
  "innings",
  "matches",
  "matchStats",
  "playerMatchStats",
  "playerMatchups",
] as const;

/**
 * Deletes all match data. Users, orgs, orgMembers, and sessions are untouched.
 * Batched at 500 rows per table per run — rerun until every count is 0.
 */
export const wipeMatchData = internalMutation({
  args: {},
  handler: async (ctx) => {
    const counts: Record<string, number> = {};
    for (const table of WIPE_TABLES) {
      const rows = await ctx.db.query(table).take(500);
      for (const row of rows) {
        await ctx.db.delete(row._id);
      }
      counts[table] = rows.length;
    }
    return counts;
  },
});
