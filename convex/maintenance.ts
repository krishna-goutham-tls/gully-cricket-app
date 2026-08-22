import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { Id } from "./_generated/dataModel";
import { assertSeriesSides } from "./lib/tournamentLineup";

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

const WIPE_TABLES = ["balls", "matchLiveState", "innings", "matches"] as const;

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
