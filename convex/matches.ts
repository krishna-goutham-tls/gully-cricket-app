import { v } from "convex/values";
import { mutation, query, MutationCtx } from "./_generated/server";
import { Doc, Id } from "./_generated/dataModel";
import { requireActiveMembership } from "./lib/session";
import { captainTeamLabel } from "./lib/teams";
import { buildRuleSnapshot } from "./lib/rules";
import { battingMode, matchFormat, side } from "./schema";

type Side = "A" | "B";

const MAX_LIST = 40;

export const create = mutation({
  args: {
    token: v.string(),
    orgId: v.id("orgs"),
    sideAName: v.optional(v.string()),
    sideBName: v.optional(v.string()),
    sideAPlayerIds: v.array(v.id("users")),
    sideBPlayerIds: v.array(v.id("users")),
    overs: v.number(),
    battingMode: v.optional(battingMode),
    format: v.optional(matchFormat),
    /** ODI only: overs each player may bat & bowl. Even (common = half). */
    oversPerPlayer: v.optional(v.number()),
    /** Default true (gully). False = innings ends when one batter remains. */
    lastBatsmanAlone: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { user } = await requireActiveMembership(ctx, args.token, args.orgId);

    if (args.sideAPlayerIds.length < 2 || args.sideBPlayerIds.length < 2) {
      throw new Error("Each team needs at least 2 players");
    }
    // One knob drives all four caps: common players get half (they bat & bowl
    // on both sides, so half per side keeps their match total equal to a
    // regular player's). Even keeps the common bowler a whole number of overs.
    const ruleSnapshot = buildRuleSnapshot({
      format: args.format,
      overs: args.overs,
      oversPerPlayer: args.oversPerPlayer,
      battingMode: args.battingMode,
      lastBatsmanAlone: args.lastBatsmanAlone,
    });
    const dedupA = new Set(args.sideAPlayerIds.map(String));
    const dedupB = new Set(args.sideBPlayerIds.map(String));
    if (
      dedupA.size !== args.sideAPlayerIds.length ||
      dedupB.size !== args.sideBPlayerIds.length
    ) {
      throw new Error("Duplicate player in a team");
    }

    // Every picked player must be an active member of this org
    const uniqueIds = Array.from(
      new Set([...args.sideAPlayerIds, ...args.sideBPlayerIds]),
    );
    for (const pid of uniqueIds) {
      const membership = await ctx.db
        .query("orgMembers")
        .withIndex("by_org_user", (q) =>
          q.eq("orgId", args.orgId).eq("userId", pid),
        )
        .unique();
      if (!membership || membership.status !== "active") {
        throw new Error("All players must be in this org");
      }
    }

    const cleanName = (raw: string | undefined, fallback: string) => {
      const name = (raw ?? "").trim();
      return name.length > 0 ? name.slice(0, 30) : fallback;
    };

    const matchId = await ctx.db.insert("matches", {
      orgId: args.orgId,
      status: "scheduled",
      sideAName: cleanName(args.sideAName, "Team A"),
      sideBName: cleanName(args.sideBName, "Team B"),
      sideAPlayerIds: args.sideAPlayerIds,
      sideBPlayerIds: args.sideBPlayerIds,
      ruleSnapshot,
      createdBy: user._id,
      createdAt: Date.now(),
    });

    return { matchId };
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

    const matches = await ctx.db
      .query("matches")
      .withIndex("by_org", (q) => q.eq("orgId", args.orgId))
      .order("desc")
      .take(MAX_LIST);

    // First player of each side is its captain; resolve default "Team A/B"
    // labels to the captain's name for a readable scoreboard.
    const captainName = async (id: typeof matches[number]["sideAPlayerIds"][number] | undefined) => {
      const u = id ? await ctx.db.get(id) : null;
      return u && "displayName" in u ? (u.displayName as string) : undefined;
    };

    return Promise.all(
      matches.map(async (m) => {
        const live =
          m.status === "live"
            ? await ctx.db
                .query("matchLiveState")
                .withIndex("by_match", (q) => q.eq("matchId", m._id))
                .unique()
            : null;

        // Finished matches carry their scorelines: innings totals are already
        // persisted on the innings docs, so this is one indexed read — no
        // ball replay. A Test's two innings join as "98 & 104/6"; an innings
        // that never got a ball (opened then abandoned) is skipped so a card
        // never shows a phantom "0/0".
        let scoreA: string | null = null;
        let scoreB: string | null = null;
        if (m.status === "completed" || m.status === "abandoned") {
          const innings = await ctx.db
            .query("innings")
            .withIndex("by_match", (q) => q.eq("matchId", m._id))
            .collect();
          innings.sort((a, b) => a.inningsNo - b.inningsNo);
          const lineFor = (side: "A" | "B") => {
            const parts = innings
              .filter(
                (i) =>
                  i.battingSide === side &&
                  (i.legalBalls > 0 || i.totalRuns > 0 || i.wickets > 0),
              )
              .map((i) => `${i.totalRuns}/${i.wickets}`);
            return parts.length > 0 ? parts.join(" & ") : null;
          };
          scoreA = lineFor("A");
          scoreB = lineFor("B");
        }

        return {
          scoreA,
          scoreB,
          _id: m._id,
          status: m.status,
          sideAName: captainTeamLabel(
            m.sideAName,
            await captainName(m.sideAPlayerIds[0]),
          ),
          sideBName: captainTeamLabel(
            m.sideBName,
            await captainName(m.sideBPlayerIds[0]),
          ),
          sideACount: m.sideAPlayerIds.length,
          sideBCount: m.sideBPlayerIds.length,
          // Overs alone can't describe a match: a Test carries whatever overs
          // cap was typed at create (often 100), which says nothing about the
          // game. Callers need the format to label it honestly.
          format: m.ruleSnapshot.format,
          overs: m.ruleSnapshot.maxOversInnings,
          resultText: m.resultText,
          winnerSide: m.winnerSide,
          tournamentId: m.tournamentId,
          tournamentName: m.tournamentId
            ? (await ctx.db.get(m.tournamentId))?.name
            : undefined,
          createdAt: m.createdAt,
          live: live
            ? {
                inningsNo: live.inningsNo,
                battingSide: live.battingSide,
                totalRuns: live.totalRuns,
                wickets: live.wickets,
                oversText: live.oversText,
                target: live.target,
                // Between innings, currentInningsId is cleared while
                // totalRuns/wickets/oversText/target still describe the
                // innings that just ended, and battingSide already points
                // at whoever bats next — so consumers must not attribute
                // that score line to battingSide while inBreak is true.
                inBreak: live.currentInningsId === undefined,
              }
            : null,
        };
      }),
    );
  },
});

export const get = query({
  args: {
    token: v.optional(v.string()),
    matchId: v.id("matches"),
  },
  handler: async (ctx, args) => {
    const match = await ctx.db.get(args.matchId);
    if (!match) return null;
    try {
      await requireActiveMembership(ctx, args.token, match.orgId);
    } catch {
      return null;
    }

    const playerRows = async (ids: typeof match.sideAPlayerIds) =>
      (
        await Promise.all(
          ids.map(async (pid) => {
            const u = await ctx.db.get(pid);
            return u
              ? {
                  userId: u._id,
                  displayName: u.displayName,
                  isGuest: u.isGuest ?? false,
                }
              : null;
          }),
        )
      ).filter((p): p is NonNullable<typeof p> => p !== null);

    const sideAPlayers = await playerRows(match.sideAPlayerIds);
    const sideBPlayers = await playerRows(match.sideBPlayerIds);

    return {
      _id: match._id,
      orgId: match.orgId,
      status: match.status,
      // First player of each side is the captain; resolve default "Team A/B".
      sideAName: captainTeamLabel(match.sideAName, sideAPlayers[0]?.displayName),
      sideBName: captainTeamLabel(match.sideBName, sideBPlayers[0]?.displayName),
      sideAPlayers,
      sideBPlayers,
      battingFirst: match.battingFirst,
      overs: match.ruleSnapshot.maxOversInnings,
      format: match.ruleSnapshot.format ?? "limited",
      oversPerPlayer: match.ruleSnapshot.maxBallsPerBatsman
        ? match.ruleSnapshot.maxBallsPerBatsman / 6
        : 2,
      battingMode: match.ruleSnapshot.battingModeDefault,
      resultText: match.resultText,
      winnerSide: match.winnerSide,
      tournamentId: match.tournamentId,
      tournamentName: match.tournamentId
        ? (await ctx.db.get(match.tournamentId))?.name
        : undefined,
      createdAt: match.createdAt,
    };
  },
});

/**
 * Which sides has this player actually turned out for? Anything already in the
 * ball log has to stay attributable to a side, so a player can't be pulled off
 * a side they have batted, bowled or fielded for.
 */
async function sidesPlayedFor(
  ctx: MutationCtx,
  match: Doc<"matches">,
  userId: Id<"users">,
): Promise<Set<Side>> {
  const id = String(userId);
  const played = new Set<Side>();

  const inningsList = await ctx.db
    .query("innings")
    .withIndex("by_match", (q) => q.eq("matchId", match._id))
    .collect();

  const battingSideOfInnings = new Map<string, Side>();
  for (const inn of inningsList) {
    const bat = inn.battingSide as Side;
    const bowl: Side = bat === "A" ? "B" : "A";
    battingSideOfInnings.set(String(inn._id), bat);

    for (const pid of [
      inn.openerStrikerId,
      inn.openerNonStrikerId,
      inn.currentStrikerId,
      inn.currentNonStrikerId,
      ...inn.outPlayerIds,
      ...(inn.retiredNotOutIds ?? []),
    ]) {
      if (pid && String(pid) === id) played.add(bat);
    }
    for (const pid of [inn.openingBowlerId, inn.currentBowlerId]) {
      if (pid && String(pid) === id) played.add(bowl);
    }
  }

  const balls = await ctx.db
    .query("balls")
    .withIndex("by_match", (q) => q.eq("matchId", match._id))
    .collect();
  for (const b of balls) {
    const bat = battingSideOfInnings.get(String(b.inningsId));
    if (!bat) continue;
    const bowl: Side = bat === "A" ? "B" : "A";
    if (String(b.strikerId) === id) played.add(bat);
    if (b.nonStrikerId && String(b.nonStrikerId) === id) played.add(bat);
    if (b.playerOutId && String(b.playerOutId) === id) played.add(bat);
    if (String(b.bowlerId) === id) played.add(bowl);
    if (b.fielderId && String(b.fielderId) === id) played.add(bowl);
  }

  return played;
}

/**
 * Mid-match squad edit: put a player on one side, on both sides (a gully
 * "common" player), or move them between those states while the match runs.
 *
 * Late arrivals are the norm — someone turns up at over 4 and the teams
 * reshuffle around them, usually by releasing a common player to a single
 * side. Squad membership is read live everywhere it matters (quota caps, the
 * all-out threshold, the bowler/batsman pickers), so an edit applies from the
 * very next ball with no replay and the ball log is never rewritten.
 *
 * Additions append, never insert: the first player of a side is its captain
 * and drives the team's display name.
 */
export const setPlayerSides = mutation({
  args: {
    token: v.string(),
    matchId: v.id("matches"),
    userId: v.id("users"),
    /** Sides the player should be on afterwards: ["A"], ["B"], or both. */
    sides: v.array(side),
  },
  handler: async (ctx, args) => {
    const match = await ctx.db.get(args.matchId);
    if (!match) throw new Error("Match not found");
    await requireActiveMembership(ctx, args.token, match.orgId);
    if (match.status === "completed" || match.status === "abandoned") {
      throw new Error("This match is already over");
    }

    const wanted = new Set<Side>(args.sides as Side[]);
    if (wanted.size !== args.sides.length) {
      throw new Error("Duplicate side");
    }
    if (wanted.size === 0) {
      throw new Error("Pick at least one team");
    }

    const player = await ctx.db.get(args.userId);
    if (!player) throw new Error("Player not found");
    const membership = await ctx.db
      .query("orgMembers")
      .withIndex("by_org_user", (q) =>
        q.eq("orgId", match.orgId).eq("userId", args.userId),
      )
      .unique();
    if (!membership || membership.status !== "active") {
      throw new Error("That player is not in this org");
    }

    const id = String(args.userId);
    const played = await sidesPlayedFor(ctx, match, args.userId);

    // Error messages name the team the way the scoreboard does.
    const captainNameOf = async (s: Side) => {
      const first = (s === "A" ? match.sideAPlayerIds : match.sideBPlayerIds)[0];
      const u = first ? await ctx.db.get(first) : null;
      return u ? u.displayName : undefined;
    };
    const labels: Record<Side, string> = {
      A: captainTeamLabel(match.sideAName, await captainNameOf("A")),
      B: captainTeamLabel(match.sideBName, await captainNameOf("B")),
    };
    const nameOfSide = (s: Side) => labels[s];

    const next: Record<Side, Id<"users">[]> = {
      A: [...match.sideAPlayerIds],
      B: [...match.sideBPlayerIds],
    };

    for (const s of ["A", "B"] as Side[]) {
      const list = next[s];
      const index = list.findIndex((pid) => String(pid) === id);
      const isOn = index >= 0;
      const shouldBeOn = wanted.has(s);

      if (shouldBeOn && !isOn) {
        // Append: index 0 is the captain and must not shift.
        list.push(args.userId);
      } else if (!shouldBeOn && isOn) {
        if (played.has(s)) {
          throw new Error(
            `${player.displayName} has already played for ${nameOfSide(s)} — they can't be taken off that side now.`,
          );
        }
        if (index === 0) {
          throw new Error(
            `${player.displayName} is ${nameOfSide(s)}'s captain and can't be taken off that side.`,
          );
        }
        list.splice(index, 1);
      }
    }

    if (next.A.length < 2 || next.B.length < 2) {
      throw new Error("Each team needs at least 2 players");
    }

    await ctx.db.patch(match._id, {
      sideAPlayerIds: next.A,
      sideBPlayerIds: next.B,
    });

    return {
      ok: true,
      sides: (["A", "B"] as Side[]).filter((s) =>
        next[s].some((pid) => String(pid) === id),
      ),
    };
  },
});

/** Delete a match and everything scored in it. Irreversible. */
export const remove = mutation({
  args: {
    token: v.string(),
    matchId: v.id("matches"),
  },
  handler: async (ctx, args) => {
    const match = await ctx.db.get(args.matchId);
    if (!match) throw new Error("Match not found");
    await requireActiveMembership(ctx, args.token, match.orgId);

    const balls = await ctx.db
      .query("balls")
      .withIndex("by_match", (q) => q.eq("matchId", match._id))
      .collect();
    for (const b of balls) await ctx.db.delete(b._id);

    const innings = await ctx.db
      .query("innings")
      .withIndex("by_match", (q) => q.eq("matchId", match._id))
      .collect();
    for (const i of innings) await ctx.db.delete(i._id);

    const live = await ctx.db
      .query("matchLiveState")
      .withIndex("by_match", (q) => q.eq("matchId", match._id))
      .unique();
    if (live) await ctx.db.delete(live._id);

    await ctx.db.delete(match._id);
    return { ok: true };
  },
});

export const abandon = mutation({
  args: {
    token: v.string(),
    matchId: v.id("matches"),
  },
  handler: async (ctx, args) => {
    const match = await ctx.db.get(args.matchId);
    if (!match) throw new Error("Match not found");
    await requireActiveMembership(ctx, args.token, match.orgId);
    if (match.status === "completed") {
      throw new Error("Match already completed");
    }
    await ctx.db.patch(match._id, { status: "abandoned" });
    return { ok: true };
  },
});
