import { v } from "convex/values";
import { mutation, query, MutationCtx, QueryCtx } from "./_generated/server";
import { Id } from "./_generated/dataModel";
import {
  requireActiveMembership,
  requireOrgAdmin,
} from "./lib/session";
import { buildRuleSnapshot } from "./lib/rules";
import { deleteMatchCascade } from "./lib/matches";
import { captainTeamLabel } from "./lib/teams";
import { battingMode, matchFormat, side } from "./schema";

type Side = "A" | "B";

const MAX_TOURNAMENTS = 40;

function cleanName(raw: string, fallback: string) {
  const n = raw.trim();
  return n.length > 0 ? n.slice(0, 40) : fallback;
}

/** Every id must be an active member of the org. */
async function assertActiveMembers(
  ctx: MutationCtx,
  orgId: Id<"orgs">,
  ids: Id<"users">[],
) {
  for (const pid of ids) {
    const m = await ctx.db
      .query("orgMembers")
      .withIndex("by_org_user", (q) => q.eq("orgId", orgId).eq("userId", pid))
      .unique();
    if (!m || m.status !== "active") {
      throw new Error("All players must be in this org");
    }
  }
}

async function playerRows(
  ctx: QueryCtx | MutationCtx,
  ids: Id<"users">[],
  coreIds: Id<"users">[],
) {
  const core = new Set(coreIds.map(String));
  const rows = await Promise.all(
    ids.map(async (pid) => {
      const u = await ctx.db.get(pid);
      return u
        ? {
            userId: u._id,
            displayName: u.displayName,
            isGuest: u.isGuest ?? false,
            isCore: core.has(String(u._id)),
          }
        : null;
    }),
  );
  return rows.filter((r): r is NonNullable<typeof r> => r !== null);
}

export const create = mutation({
  args: {
    token: v.string(),
    orgId: v.id("orgs"),
    name: v.string(),
    format: matchFormat,
    oversPerInnings: v.number(),
    oversPerPlayer: v.optional(v.number()),
    battingMode: v.optional(battingMode),
    sideAName: v.string(),
    sideBName: v.string(),
    sideASquadIds: v.array(v.id("users")),
    sideACoreIds: v.array(v.id("users")),
    sideBSquadIds: v.array(v.id("users")),
    sideBCoreIds: v.array(v.id("users")),
    matchCount: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { user } = await requireActiveMembership(ctx, args.token, args.orgId);

    const name = args.name.trim();
    if (name.length < 2) throw new Error("Tournament name is too short");
    if (args.sideASquadIds.length < 2 || args.sideBSquadIds.length < 2) {
      throw new Error("Each team needs at least 2 players");
    }

    // Validate format config by building the snapshot (throws on bad input).
    buildRuleSnapshot({
      format: args.format,
      overs: args.oversPerInnings,
      oversPerPlayer: args.oversPerPlayer,
      battingMode: args.battingMode,
    });

    const matchCount = args.matchCount ?? 5;
    if (!Number.isInteger(matchCount) || matchCount < 1 || matchCount > 50) {
      throw new Error("Match count must be between 1 and 50");
    }

    const dedup = (ids: Id<"users">[]) =>
      new Set(ids.map(String)).size === ids.length;
    if (!dedup(args.sideASquadIds) || !dedup(args.sideBSquadIds)) {
      throw new Error("Duplicate player in a squad");
    }

    // Core must be a subset of that side's squad.
    const inSquad = (squad: Id<"users">[], core: Id<"users">[]) => {
      const s = new Set(squad.map(String));
      return core.every((c) => s.has(String(c)));
    };
    if (
      !inSquad(args.sideASquadIds, args.sideACoreIds) ||
      !inSquad(args.sideBSquadIds, args.sideBCoreIds)
    ) {
      throw new Error("Core players must be part of their squad");
    }

    await assertActiveMembers(
      ctx,
      args.orgId,
      Array.from(new Set([...args.sideASquadIds, ...args.sideBSquadIds])),
    );

    const tournamentId = await ctx.db.insert("tournaments", {
      orgId: args.orgId,
      name,
      format: args.format,
      oversPerInnings: args.oversPerInnings,
      oversPerPlayer:
        args.format === "limited" ? args.oversPerPlayer ?? 2 : undefined,
      battingMode: args.battingMode ?? "double",
      sideAName: cleanName(args.sideAName, "Team A"),
      sideBName: cleanName(args.sideBName, "Team B"),
      sideASquadIds: args.sideASquadIds,
      sideACoreIds: args.sideACoreIds,
      sideBSquadIds: args.sideBSquadIds,
      sideBCoreIds: args.sideBCoreIds,
      matchCount,
      status: "active",
      createdBy: user._id,
      createdAt: Date.now(),
    });

    return { tournamentId };
  },
});

export const list = query({
  args: {
    token: v.optional(v.string()),
    orgId: v.id("orgs"),
  },
  handler: async (ctx, args) => {
    try {
      await requireActiveMembership(ctx, args.token, args.orgId);
    } catch {
      return [];
    }

    const tournaments = await ctx.db
      .query("tournaments")
      .withIndex("by_org", (q) => q.eq("orgId", args.orgId))
      .order("desc")
      .take(MAX_TOURNAMENTS);

    return Promise.all(
      tournaments.map(async (t) => {
        const matches = await ctx.db
          .query("matches")
          .withIndex("by_tournament", (q) => q.eq("tournamentId", t._id))
          .collect();
        const completed = matches.filter((m) => m.status === "completed");
        const winsA = completed.filter((m) => m.winnerSide === "A").length;
        const winsB = completed.filter((m) => m.winnerSide === "B").length;
        return {
          _id: t._id,
          name: t.name,
          format: t.format,
          status: t.status,
          matchCount: t.matchCount,
          sideAName: t.sideAName,
          sideBName: t.sideBName,
          played: completed.length,
          winsA,
          winsB,
          winnerSide: t.winnerSide,
          winnerText: t.winnerText,
          createdAt: t.createdAt,
        };
      }),
    );
  },
});

export const get = query({
  args: {
    token: v.optional(v.string()),
    tournamentId: v.id("tournaments"),
  },
  handler: async (ctx, args) => {
    const t = await ctx.db.get(args.tournamentId);
    if (!t) return null;
    try {
      await requireActiveMembership(ctx, args.token, t.orgId);
    } catch {
      return null;
    }

    const sideA = await playerRows(ctx, t.sideASquadIds, t.sideACoreIds);
    const sideB = await playerRows(ctx, t.sideBSquadIds, t.sideBCoreIds);

    const matches = (
      await ctx.db
        .query("matches")
        .withIndex("by_tournament", (q) => q.eq("tournamentId", t._id))
        .collect()
    ).sort((a, b) => a.createdAt - b.createdAt);

    const matchRows = await Promise.all(
      matches.map(async (m) => {
        const live =
          m.status === "live"
            ? await ctx.db
                .query("matchLiveState")
                .withIndex("by_match", (q) => q.eq("matchId", m._id))
                .unique()
            : null;
        return {
          _id: m._id,
          status: m.status,
          resultText: m.resultText,
          winnerSide: m.winnerSide,
          createdAt: m.createdAt,
          live: live
            ? {
                battingSide: live.battingSide,
                totalRuns: live.totalRuns,
                wickets: live.wickets,
                oversText: live.oversText,
              }
            : null,
        };
      }),
    );

    const completed = matches.filter((m) => m.status === "completed");
    const winsA = completed.filter((m) => m.winnerSide === "A").length;
    const winsB = completed.filter((m) => m.winnerSide === "B").length;
    const leaderSide: Side | null =
      winsA === winsB ? null : winsA > winsB ? "A" : "B";

    // Last lineup that actually took the field, for a "same as last match"
    // prefill. Intersected with the fixed squads because mid-match squad edits
    // (matches.setPlayerSides) can add someone outside the tournament squad,
    // and startMatch would then reject the prefill.
    const lastPlayed = [...matches]
      .reverse()
      .find((m) => m.status === "live" || m.status === "completed");
    const squadOnly = (ids: Id<"users">[], squad: Id<"users">[]) => {
      const s = new Set(squad.map(String));
      return ids.filter((id) => s.has(String(id)));
    };

    return {
      _id: t._id,
      orgId: t.orgId,
      name: t.name,
      format: t.format,
      oversPerInnings: t.oversPerInnings,
      oversPerPlayer: t.oversPerPlayer,
      battingMode: t.battingMode,
      sideAName: captainTeamLabel(t.sideAName, sideA[0]?.displayName),
      sideBName: captainTeamLabel(t.sideBName, sideB[0]?.displayName),
      sideA,
      sideB,
      matchCount: t.matchCount,
      status: t.status,
      winnerSide: t.winnerSide,
      winnerText: t.winnerText,
      standings: {
        /** Completed matches only — live/scheduled ones don't count yet. */
        played: completed.length,
        matchCount: t.matchCount,
        remaining: Math.max(0, t.matchCount - completed.length),
        /** Series has already reached its planned length. Warn, never block. */
        overrun: completed.length >= t.matchCount,
        winsA,
        winsB,
        leaderSide,
      },
      /** Who took the field last, for a "same as last match" prefill. */
      lastLineup: lastPlayed
        ? {
            matchId: lastPlayed._id,
            createdAt: lastPlayed.createdAt,
            sideAPlayerIds: squadOnly(
              lastPlayed.sideAPlayerIds,
              t.sideASquadIds,
            ),
            sideBPlayerIds: squadOnly(
              lastPlayed.sideBPlayerIds,
              t.sideBSquadIds,
            ),
          }
        : null,
      matches: matchRows,
      createdAt: t.createdAt,
    };
  },
});

/**
 * Start a match inside a tournament. Format/overs/batting-mode and the two
 * team names are locked from the tournament; the caller passes only the
 * players present today (a subset of each fixed squad; common allowed). Side A
 * always maps to tournament team A so match winners feed standings directly.
 * The soft "core missing" gate is a UI warning — the backend never blocks.
 */
export const startMatch = mutation({
  args: {
    token: v.string(),
    tournamentId: v.id("tournaments"),
    sideAPlayerIds: v.array(v.id("users")),
    sideBPlayerIds: v.array(v.id("users")),
  },
  handler: async (ctx, args) => {
    const t = await ctx.db.get(args.tournamentId);
    if (!t) throw new Error("Tournament not found");
    const { user } = await requireActiveMembership(ctx, args.token, t.orgId);
    if (t.status === "complete") {
      throw new Error("This tournament is over");
    }
    if (t.status === "paused") {
      throw new Error("Resume the tournament before starting a match");
    }
    if (args.sideAPlayerIds.length < 2 || args.sideBPlayerIds.length < 2) {
      throw new Error("Each team needs at least 2 players");
    }

    const dedupA = new Set(args.sideAPlayerIds.map(String));
    const dedupB = new Set(args.sideBPlayerIds.map(String));
    if (
      dedupA.size !== args.sideAPlayerIds.length ||
      dedupB.size !== args.sideBPlayerIds.length
    ) {
      throw new Error("Duplicate player in a team");
    }

    // Players must belong to the series roster (either squad), but a player
    // from one squad may be lent to the other side to balance numbers when
    // someone is absent — so we check membership against the union, not each
    // side's own squad. Side A still maps to tournament team A for standings;
    // a borrowed player never changes which side wins.
    const roster = new Set(
      [...t.sideASquadIds, ...t.sideBSquadIds].map(String),
    );
    const outsider = [...args.sideAPlayerIds, ...args.sideBPlayerIds].find(
      (id) => !roster.has(String(id)),
    );
    if (outsider) {
      throw new Error(
        `Only players from ${t.sideAName} or ${t.sideBName} can play in this series`,
      );
    }

    await assertActiveMembers(
      ctx,
      t.orgId,
      Array.from(new Set([...args.sideAPlayerIds, ...args.sideBPlayerIds])),
    );

    const ruleSnapshot = buildRuleSnapshot({
      format: t.format,
      overs: t.oversPerInnings,
      oversPerPlayer: t.oversPerPlayer,
      battingMode: t.battingMode,
    });

    const matchId = await ctx.db.insert("matches", {
      orgId: t.orgId,
      tournamentId: t._id,
      status: "scheduled",
      sideAName: t.sideAName,
      sideBName: t.sideBName,
      sideAPlayerIds: args.sideAPlayerIds,
      sideBPlayerIds: args.sideBPlayerIds,
      ruleSnapshot,
      createdBy: user._id,
      createdAt: Date.now(),
    });

    return { matchId };
  },
});

/** Pause/resume is admin-only: a pause is a deliberate call, not a toggle. */
export const setStatus = mutation({
  args: {
    token: v.string(),
    tournamentId: v.id("tournaments"),
    status: v.union(v.literal("active"), v.literal("paused")),
  },
  handler: async (ctx, args) => {
    const t = await ctx.db.get(args.tournamentId);
    if (!t) throw new Error("Tournament not found");
    await requireOrgAdmin(ctx, args.token, t.orgId);
    if (t.status === "complete") {
      throw new Error("This tournament is over");
    }
    await ctx.db.patch(t._id, { status: args.status });
    return { ok: true };
  },
});

/** Admin declares the series winner (or ends it in a draw). Marks complete. */
export const setWinner = mutation({
  args: {
    token: v.string(),
    tournamentId: v.id("tournaments"),
    winnerSide: v.optional(side),
  },
  handler: async (ctx, args) => {
    const t = await ctx.db.get(args.tournamentId);
    if (!t) throw new Error("Tournament not found");
    await requireOrgAdmin(ctx, args.token, t.orgId);

    const winnerText = args.winnerSide
      ? `${args.winnerSide === "A" ? t.sideAName : t.sideBName} win the series`
      : "Series drawn";

    await ctx.db.patch(t._id, {
      status: "complete",
      winnerSide: args.winnerSide,
      winnerText,
    });
    return { ok: true };
  },
});

/**
 * Rename either side of the series. The auto-name ("Team {first player}") is
 * only ever a guess at create time, so a squad can end up mislabelled after the
 * captain was picked first by chance — this fixes it. Only the tournament's own
 * stored names change; matches already played keep the name they were started
 * with (that's a copy on the match doc), and future matches pick up the new
 * name from `startMatch`. Admin-only, like the other tournament-level edits.
 */
export const renameTeams = mutation({
  args: {
    token: v.string(),
    tournamentId: v.id("tournaments"),
    sideAName: v.optional(v.string()),
    sideBName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const t = await ctx.db.get(args.tournamentId);
    if (!t) throw new Error("Tournament not found");
    await requireOrgAdmin(ctx, args.token, t.orgId);

    const patch: { sideAName?: string; sideBName?: string } = {};
    if (args.sideAName !== undefined) {
      const n = args.sideAName.trim();
      if (n.length < 2) throw new Error("Team name is too short");
      patch.sideAName = n.slice(0, 40);
    }
    if (args.sideBName !== undefined) {
      const n = args.sideBName.trim();
      if (n.length < 2) throw new Error("Team name is too short");
      patch.sideBName = n.slice(0, 40);
    }
    if (patch.sideAName === undefined && patch.sideBName === undefined) {
      return { ok: true };
    }
    await ctx.db.patch(t._id, patch);
    return { ok: true };
  },
});

/**
 * Delete a tournament without destroying anything anyone scored.
 *
 * A series is a wrapper around matches, not their owner, so deleting it
 * *unlinks* rather than cascades: every match that was played keeps its ball
 * log, its scorecard and its place in the leaderboards (`stats.ts` never looks
 * at `tournamentId`), it simply stops counting toward a series and shows as a
 * friendly from here on. The only matches actually removed are the empty
 * shells `startMatch` creates and nobody ever opened — a scheduled match with
 * no innings has no data to lose, and leaving those behind would litter the
 * match list with untouched fixtures.
 *
 * A live match blocks the delete outright: unlinking mid-over would silently
 * pull the game out of the series under the scorer's feet. Finish or abandon
 * it first. Admin-only, like every other irreversible tournament call.
 */
export const remove = mutation({
  args: {
    token: v.string(),
    tournamentId: v.id("tournaments"),
  },
  handler: async (ctx, args) => {
    const t = await ctx.db.get(args.tournamentId);
    if (!t) throw new Error("Tournament not found");
    await requireOrgAdmin(ctx, args.token, t.orgId);

    const matches = await ctx.db
      .query("matches")
      .withIndex("by_tournament", (q) => q.eq("tournamentId", t._id))
      .collect();

    if (matches.some((m) => m.status === "live")) {
      throw new Error(
        "A match is being scored right now — finish or abandon it first",
      );
    }

    let removed = 0;
    let kept = 0;
    for (const m of matches) {
      // Belt-and-braces: only ever drop a match we can prove was never
      // scored. Everything else is unlinked, never deleted.
      const innings = await ctx.db
        .query("innings")
        .withIndex("by_match", (q) => q.eq("matchId", m._id))
        .collect();
      if (m.status === "scheduled" && innings.length === 0) {
        await deleteMatchCascade(ctx, m._id);
        removed += 1;
      } else {
        await ctx.db.patch(m._id, { tournamentId: undefined });
        kept += 1;
      }
    }

    await ctx.db.delete(t._id);
    return { matchesKept: kept, matchesRemoved: removed };
  },
});

/**
 * Undo setWinner. Declaring a winner otherwise locks the series for good —
 * startMatch and setStatus both refuse once complete — so a mistaken tap needs
 * a way back. Admin-only, same as declaring.
 *
 * Reopens to "paused" rather than "active": setWinner doesn't record what the
 * status was before completion (a series can be declared while paused), and
 * a reopened series isn't being played right now by definition — an admin
 * who wants matches to resume immediately can hit Resume, an explicit step.
 */
export const reopen = mutation({
  args: {
    token: v.string(),
    tournamentId: v.id("tournaments"),
  },
  handler: async (ctx, args) => {
    const t = await ctx.db.get(args.tournamentId);
    if (!t) throw new Error("Tournament not found");
    await requireOrgAdmin(ctx, args.token, t.orgId);
    if (t.status !== "complete") {
      throw new Error("This tournament is already open");
    }

    await ctx.db.patch(t._id, {
      status: "paused",
      winnerSide: undefined,
      winnerText: undefined,
    });
    return { ok: true };
  },
});
