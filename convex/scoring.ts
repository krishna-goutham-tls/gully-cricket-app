import { v } from "convex/values";
import { mutation, query, MutationCtx, QueryCtx } from "./_generated/server";
import { Id, Doc } from "./_generated/dataModel";
import { getUserBySessionToken } from "./lib/session";
import {
  recomputeFromBalls,
  validateBallEvent,
  isExtraIllegal,
  legalBallToOverText,
  runRate,
  type BallEvent,
  type ExtrasType,
  type WicketType,
} from "./lib/scoring";
import { captainTeamLabel } from "./lib/teams";

type Side = "A" | "B";

const sideValidator = v.union(v.literal("A"), v.literal("B"));

const extrasValidator = v.optional(
  v.union(
    v.literal("wide"),
    v.literal("noball"),
    v.literal("bye"),
    v.literal("legbye"),
  ),
);

const wicketValidator = v.optional(
  v.union(
    v.literal("bowled"),
    v.literal("caught"),
    v.literal("lbw"),
    v.literal("runout"),
    v.literal("stumped"),
    v.literal("hitwicket"),
    v.literal("other"),
  ),
);

function otherSide(side: Side): Side {
  return side === "A" ? "B" : "A";
}

/** Single-batter match: one batter at the crease, batsmen come one by one. */
function isSolo(match: Doc<"matches">): boolean {
  return match.ruleSnapshot.battingModeDefault === "single";
}

export function sidePlayers(match: Doc<"matches">, side: Side): Id<"users">[] {
  return side === "A" ? match.sideAPlayerIds : match.sideBPlayerIds;
}

/** Players on both sides — gully "common players", who get tighter quotas. */
function commonPlayerIdSet(match: Doc<"matches">): Set<string> {
  const a = new Set(match.sideAPlayerIds.map(String));
  return new Set(
    match.sideBPlayerIds.map(String).filter((id) => a.has(id)),
  );
}

/** Legal-ball batting cap, or undefined when uncapped (test / legacy matches). */
function battingCapBalls(
  match: Doc<"matches">,
  playerId: Id<"users"> | string | undefined,
): number | undefined {
  if (!playerId) return undefined;
  const rules = match.ruleSnapshot;
  if (rules.maxBallsPerBatsman === undefined) return undefined;
  if (
    rules.commonMaxBallsPerBatsman !== undefined &&
    commonPlayerIdSet(match).has(String(playerId))
  ) {
    return rules.commonMaxBallsPerBatsman;
  }
  return rules.maxBallsPerBatsman;
}

/**
 * Legal-ball bowling cap. Always a number — legacy matches store
 * maxOversPerBowler = whole innings, which is effectively uncapped.
 */
function bowlingCapBalls(
  match: Doc<"matches">,
  playerId: Id<"users"> | string,
): number {
  const rules = match.ruleSnapshot;
  const overs =
    rules.commonMaxOversPerBowler !== undefined &&
    commonPlayerIdSet(match).has(String(playerId))
      ? rules.commonMaxOversPerBowler
      : rules.maxOversPerBowler;
  return overs * rules.ballsPerOver;
}

/**
 * Batting-quota state for the innings.
 *
 * Every batter owns a quota of balls. A batter who is **out** before using his
 * quota forfeits the remainder into a shared **pot**; a batter who **retires**
 * forfeits nothing — he still owns those balls and may come back for them.
 *
 * The whole rule is one line: a batter may face a ball if he still has his own
 * quota left, OR the pot is not empty. Order is the team's call — the in-form
 * batter can run straight on into the pot, or everyone can take their own quota
 * first and the pot be spent at the end. Because the pot only ever holds balls
 * from players who can never bat again, spending it can never eat a quota that
 * somebody else is still owed.
 *
 * Deterministic: balls faced only grow, so replay/undo re-derive this exactly.
 */
function battingQuota(
  match: Doc<"matches">,
  innings: Doc<"innings">,
  balls: Array<{ isLegal: boolean; strikerId: Id<"users"> }>,
) {
  const facedBy: Record<string, number> = {};
  for (const b of balls) {
    if (!b.isLegal) continue;
    const key = String(b.strikerId);
    facedBy[key] = (facedBy[key] ?? 0) + 1;
  }
  const out = new Set(innings.outPlayerIds.map(String));
  const retired = new Set((innings.retiredNotOutIds ?? []).map(String));
  const crease = new Set(
    [innings.currentStrikerId, innings.currentNonStrikerId]
      .filter(Boolean)
      .map(String),
  );

  // Pot = balls forfeited by dismissed batters, less whatever has been spent
  // from it already. A batter can overshoot only by spending the pot, so his
  // excess is exactly what he took out of it — including if he was then out.
  let forfeited = 0;
  let spent = 0;
  for (const pid of sidePlayers(match, innings.battingSide).map(String)) {
    const cap = battingCapBalls(match, pid);
    if (cap === undefined) continue;
    const faced = facedBy[pid] ?? 0;
    if (faced > cap) spent += faced - cap;
    else if (out.has(pid)) forfeited += cap - faced;
  }
  const pot = Math.max(0, forfeited - spent);

  // Who could come in. `owed` still has his own quota (never batted, or retired
  // early and owed the rest); `spentOwn` has used his and needs the pot.
  const notOutAvailable: string[] = [];
  const owed: string[] = [];
  const spentOwn: string[] = [];
  for (const pid of sidePlayers(match, innings.battingSide).map(String)) {
    if (out.has(pid) || crease.has(pid)) continue;
    notOutAvailable.push(pid);
    const cap = battingCapBalls(match, pid);
    if (cap === undefined || (facedBy[pid] ?? 0) < cap) owed.push(pid);
    else spentOwn.push(pid);
  }

  /** May this player legally face a ball right now? */
  const canFace = (pid: Id<"users"> | string | undefined) => {
    if (!pid) return false;
    const cap = battingCapBalls(match, pid);
    if (cap === undefined) return true;
    return (facedBy[String(pid)] ?? 0) < cap || pot > 0;
  };

  return {
    facedBy,
    retired,
    pot,
    owed,
    spentOwn,
    notOutAvailable,
    /** Eligible to be sent in: own quota left, or the pot can cover them. */
    eligible: pot > 0 ? [...owed, ...spentOwn] : owed,
    canFace,
  };
}

/**
 * Captain-resolved display label for a side: the stored name, unless it's the
 * default "Team A"/"Team B", in which case the captain (first player) is shown.
 */
export async function sideLabel(
  ctx: QueryCtx | MutationCtx,
  match: Doc<"matches">,
  side: Side,
): Promise<string> {
  const first = sidePlayers(match, side)[0];
  const u = first ? await ctx.db.get(first) : null;
  const captain =
    u && "displayName" in u ? (u.displayName as string) : undefined;
  return captainTeamLabel(sideName(match, side), captain);
}

function sideName(match: Doc<"matches">, side: Side): string {
  return side === "A" ? match.sideAName : match.sideBName;
}

export async function loadMatchAccess(
  ctx: QueryCtx | MutationCtx,
  token: string | undefined,
  matchId: Id<"matches">,
) {
  const user = await getUserBySessionToken(ctx, token);
  if (!user) return null;
  const match = await ctx.db.get(matchId);
  if (!match) return null;

  const membership = await ctx.db
    .query("orgMembers")
    .withIndex("by_org_user", (q) =>
      q.eq("orgId", match.orgId).eq("userId", user._id),
    )
    .unique();
  if (!membership || membership.status !== "active") return null;

  // Gully cricket: umpires rotate — any active org member can score.
  return { user, match, membership, canScore: true };
}

async function requireCanScore(
  ctx: MutationCtx,
  token: string,
  matchId: Id<"matches">,
) {
  const access = await loadMatchAccess(ctx, token, matchId);
  if (!access) throw new Error("Match not found or not authorized");
  return access;
}

async function getBallsOrdered(
  ctx: QueryCtx | MutationCtx,
  inningsId: Id<"innings">,
) {
  const balls = await ctx.db
    .query("balls")
    .withIndex("by_innings", (q) => q.eq("inningsId", inningsId))
    .collect();
  return balls.sort((a, b) => a.sequence - b.sequence);
}

async function nameOfUser(
  ctx: QueryCtx | MutationCtx,
  id?: Id<"users">,
): Promise<string | undefined> {
  if (!id) return undefined;
  const u = await ctx.db.get(id);
  return u && "displayName" in u ? (u.displayName as string) : undefined;
}

async function buildDismissal(
  ctx: QueryCtx | MutationCtx,
  row: {
    wicketType?: WicketType;
    outBowlerId?: Id<"users">;
    outFielderId?: Id<"users">;
  },
): Promise<string> {
  const bowler = await nameOfUser(ctx, row.outBowlerId);
  const fielder = await nameOfUser(ctx, row.outFielderId);
  switch (row.wicketType) {
    case "bowled":
      return bowler ? `b ${bowler}` : "bowled";
    case "lbw":
      return bowler ? `lbw b ${bowler}` : "lbw";
    case "caught":
      return `c ${fielder ?? "?"} b ${bowler ?? "?"}`;
    case "stumped":
      return `st ${fielder ?? "?"} b ${bowler ?? "?"}`;
    case "hitwicket":
      return bowler ? `hit wkt b ${bowler}` : "hit wicket";
    case "runout":
      return fielder ? `run out (${fielder})` : "run out";
    default:
      return "out";
  }
}

type LiveStatePatch = {
  currentInningsId?: Id<"innings">;
  inningsNo: number;
  battingSide?: Side;
  strikerId?: Id<"users">;
  nonStrikerId?: Id<"users">;
  bowlerId?: Id<"users">;
  needBowler: boolean;
  needBatsman: boolean;
  totalRuns: number;
  wickets: number;
  legalBalls: number;
  oversText: string;
  ballsThisOver: number;
  lastBallId?: Id<"balls">;
  target?: number;
  resultText?: string;
};

async function upsertLiveState(
  ctx: MutationCtx,
  matchId: Id<"matches">,
  patch: LiveStatePatch,
) {
  const existing = await ctx.db
    .query("matchLiveState")
    .withIndex("by_match", (q) => q.eq("matchId", matchId))
    .unique();
  const data = {
    matchId,
    currentInningsId: patch.currentInningsId,
    inningsNo: patch.inningsNo,
    battingSide: patch.battingSide,
    strikerId: patch.strikerId,
    nonStrikerId: patch.nonStrikerId,
    bowlerId: patch.bowlerId,
    needBowler: patch.needBowler,
    needBatsman: patch.needBatsman,
    totalRuns: patch.totalRuns,
    wickets: patch.wickets,
    legalBalls: patch.legalBalls,
    oversText: patch.oversText,
    ballsThisOver: patch.ballsThisOver,
    lastBallId: patch.lastBallId,
    target: patch.target,
    resultText: patch.resultText,
    updatedAt: Date.now(),
  };
  if (existing) {
    await ctx.db.patch(existing._id, data);
    return existing._id;
  }
  return ctx.db.insert("matchLiveState", data);
}

async function recomputeAndPersist(
  ctx: MutationCtx,
  match: Doc<"matches">,
  innings: Doc<"innings">,
) {
  const balls = await getBallsOrdered(ctx, innings._id);
  const squadSize = sidePlayers(match, innings.battingSide).length;
  const rules = match.ruleSnapshot;

  const result = recomputeFromBalls({
    balls: balls.map((b) => ({
      _id: b._id,
      isLegal: b.isLegal,
      runsBat: b.runsBat,
      extrasType: b.extrasType,
      extrasRuns: b.extrasRuns,
      isWicket: b.isWicket,
      playerOutId: b.playerOutId,
      isRetire: b.isRetire,
      strikerId: b.strikerId,
      nonStrikerId: b.nonStrikerId,
      bowlerId: b.bowlerId,
    })),
    openerStrikerId: innings.openerStrikerId,
    openerNonStrikerId: innings.openerNonStrikerId,
    openingBowlerId: innings.openingBowlerId,
    ballsPerOver: rules.ballsPerOver,
    maxOversInnings: rules.maxOversInnings,
    squadSize,
    target: innings.target,
    lastBatsmanAlone: rules.lastBatsmanAlone,
  });

  // Human picks after over-end / wicket override pure recompute flags
  let strikerId = result.strikerId;
  let nonStrikerId = result.nonStrikerId;
  let bowlerId = result.bowlerId;
  let needBowler = result.needBowler;
  let needBatsman = result.needBatsman;
  const outSet = new Set(result.outPlayerIds.map(String));
  // A crease end is vacant if its occupant is out, or just retired (trailing
  // retire event). Outs are permanent; retirees may return, so only the
  // pending retiree counts as a vacancy — a returned retiree is a valid pick.
  const vacantSet = new Set(outSet);
  if (result.pendingRetireeId) vacantSet.add(String(result.pendingRetireeId));

  if (needBowler && innings.currentBowlerId) {
    const lastBowler =
      balls.length > 0 ? balls[balls.length - 1].bowlerId : undefined;
    // Accept stored bowler only if it's a fresh pick (not the one who just finished)
    if (
      !lastBowler ||
      String(innings.currentBowlerId) !== String(lastBowler) ||
      balls.length === 0
    ) {
      bowlerId = innings.currentBowlerId;
      needBowler = false;
    }
  }

  if (needBatsman) {
    // Apply stored current* if they filled the vacant end
    const storedS = innings.currentStrikerId;
    const storedN = innings.currentNonStrikerId;
    if (vacantSet.has(String(strikerId)) && storedS && !vacantSet.has(String(storedS))) {
      strikerId = storedS;
    }
    if (vacantSet.has(String(nonStrikerId)) && storedN && !vacantSet.has(String(storedN))) {
      nonStrikerId = storedN;
    }
    // Also: if striker was out, setNextBatsman may have written the new player
    // into currentStrikerId while recompute still has the out player
    if (
      storedS &&
      !vacantSet.has(String(storedS)) &&
      vacantSet.has(String(result.strikerId))
    ) {
      strikerId = storedS;
    }
    if (
      storedN &&
      !vacantSet.has(String(storedN)) &&
      vacantSet.has(String(result.nonStrikerId))
    ) {
      nonStrikerId = storedN;
    }
    needBatsman =
      vacantSet.has(String(strikerId)) || vacantSet.has(String(nonStrikerId));
  } else if (!result.inningsComplete) {
    // Between balls: keep human-set pair if recompute matches continuity
    if (innings.currentStrikerId && innings.currentNonStrikerId) {
      // Prefer recompute-derived ends (handles strike rotation)
      // only override when recompute left an out player in place
    }
  }

  // Nobody bowls and bats at the same time. Common players are in both squads,
  // so a bowler can be sent in to bat mid-over — the over then needs someone
  // else to finish it. Derived from the crease rather than flagged on the doc,
  // so it still holds after an undo rebuilds state from the ball log.
  // Runs after the needBatsman block above, which is what settles the crease.
  if (!result.inningsComplete) {
    const atCrease = new Set(
      [strikerId, nonStrikerId].filter(Boolean).map(String),
    );
    // Mid-over the engine always mirrors the last ball's bowler, so a stored
    // bowler that differs is a deliberate mid-over change by the scorer.
    if (
      !needBowler &&
      innings.currentBowlerId &&
      String(innings.currentBowlerId) !== String(bowlerId) &&
      !atCrease.has(String(innings.currentBowlerId))
    ) {
      bowlerId = innings.currentBowlerId;
    }
    if (bowlerId && atCrease.has(String(bowlerId))) {
      bowlerId = undefined;
      needBowler = true;
    }
  }

  if (result.inningsComplete) {
    needBowler = false;
    needBatsman = false;
  }

  await ctx.db.patch(innings._id, {
    totalRuns: result.totalRuns,
    wickets: result.wickets,
    legalBalls: result.legalBalls,
    extras: result.extras,
    currentStrikerId: strikerId,
    currentNonStrikerId: nonStrikerId,
    currentBowlerId: bowlerId,
    needBowler,
    needBatsman,
    outPlayerIds: result.outPlayerIds,
    retiredNotOutIds: result.retiredNotOutIds,
  });

  await upsertLiveState(ctx, match._id, {
    currentInningsId: innings._id,
    inningsNo: innings.inningsNo,
    battingSide: innings.battingSide,
    strikerId,
    nonStrikerId,
    bowlerId,
    needBowler,
    needBatsman,
    totalRuns: result.totalRuns,
    wickets: result.wickets,
    legalBalls: result.legalBalls,
    oversText: result.oversText,
    ballsThisOver: result.ballsThisOver,
    lastBallId: result.lastBallId,
    target: innings.target,
  });

  return {
    ...result,
    strikerId,
    nonStrikerId,
    bowlerId,
    needBowler,
    needBatsman,
  };
}

function totalInningsOf(match: Doc<"matches">): number {
  return (match.ruleSnapshot.inningsPerSide ?? 1) * 2;
}

function aggregateRuns(innings: Doc<"innings">[], side: Side): number {
  return innings
    .filter((i) => i.battingSide === side)
    .reduce((sum, i) => sum + i.totalRuns, 0);
}

function leadText(
  nameA: string,
  nameB: string,
  aggA: number,
  aggB: number,
): string {
  if (aggA === aggB) return "Scores level";
  return aggA > aggB
    ? `${nameA} lead by ${aggA - aggB}`
    : `${nameB} lead by ${aggB - aggA}`;
}

async function completeInningsAndMaybeMatch(
  ctx: MutationCtx,
  match: Doc<"matches">,
  innings: Doc<"innings">,
  reason: string,
) {
  await ctx.db.patch(innings._id, {
    status: "complete",
    completedAt: Date.now(),
    needBowler: false,
    needBatsman: false,
  });

  const totalInnings = totalInningsOf(match);
  const all = (
    await ctx.db
      .query("innings")
      .withIndex("by_match", (q) => q.eq("matchId", match._id))
      .collect()
  ).sort((a, b) => a.inningsNo - b.inningsNo);
  const aggBat = aggregateRuns(all, innings.battingSide);
  const aggOpp = aggregateRuns(all, otherSide(innings.battingSide));
  const aggA = aggregateRuns(all, "A");
  const aggB = aggregateRuns(all, "B");

  // Captain-resolved labels for result / lead text
  const nameA = await sideLabel(ctx, match, "A");
  const nameB = await sideLabel(ctx, match, "B");
  const nm = (side: Side) => (side === "A" ? nameA : nameB);

  const isFinal = innings.inningsNo >= totalInnings;
  // Test early finish: the side batting 3rd has now batted twice (normal
  // order or follow-on). If they still trail the once-batted side, the match
  // is over — won by an innings.
  const inningsVictory =
    !isFinal &&
    totalInnings === 4 &&
    innings.inningsNo === 3 &&
    aggBat < aggOpp;

  if (!isFinal && !inningsVictory) {
    // Innings break
    const nextNo = innings.inningsNo + 1;
    // The final innings is a chase; earlier test breaks just carry the lead
    let target: number | undefined;
    let nextBattingSide: Side;
    if (totalInnings === 2) {
      nextBattingSide = otherSide(innings.battingSide);
      target = innings.totalRuns + 1;
    } else if (nextNo === 2) {
      nextBattingSide = otherSide(innings.battingSide);
    } else if (nextNo === 3) {
      // Scorer chooses at the break: normal order or enforce the follow-on
      nextBattingSide = all[0].battingSide;
    } else {
      const counts = { A: 0, B: 0 };
      for (const i of all) counts[i.battingSide] += 1;
      nextBattingSide = counts.A < counts.B ? "A" : "B";
      target =
        aggregateRuns(all, otherSide(nextBattingSide)) -
        aggregateRuns(all, nextBattingSide) +
        1;
    }
    const resultText =
      totalInnings === 2
        ? `Innings break · target ${target}`
        : target !== undefined
          ? `Innings break · target ${target}`
          : `Innings break · ${leadText(nameA, nameB, aggA, aggB)}`;

    await upsertLiveState(ctx, match._id, {
      currentInningsId: undefined,
      inningsNo: innings.inningsNo,
      battingSide: nextBattingSide,
      strikerId: undefined,
      nonStrikerId: undefined,
      bowlerId: undefined,
      needBowler: false,
      needBatsman: false,
      totalRuns: innings.totalRuns,
      wickets: innings.wickets,
      legalBalls: innings.legalBalls,
      oversText: legalBallToOverText(
        innings.legalBalls,
        match.ruleSnapshot.ballsPerOver,
      ),
      ballsThisOver: innings.legalBalls % match.ruleSnapshot.ballsPerOver,
      lastBallId: undefined,
      target,
      resultText,
    });

    return { phase: "innings_break" as const, target, reason };
  }

  // Match over — decide the winner
  let winnerSide: Side | undefined;
  let resultText: string;

  if (inningsVictory) {
    winnerSide = otherSide(innings.battingSide);
    const margin = aggOpp - aggBat;
    resultText = `${nm(winnerSide)} won by an innings and ${margin} run${margin === 1 ? "" : "s"}`;
  } else if (aggBat > aggOpp) {
    winnerSide = innings.battingSide;
    const squadSize = sidePlayers(match, innings.battingSide).length;
    const maxWickets =
      isSolo(match) || match.ruleSnapshot.lastBatsmanAlone
        ? squadSize
        : squadSize - 1;
    const remaining = Math.max(0, maxWickets - innings.wickets);
    resultText = `${nm(winnerSide)} won by ${remaining} wicket${remaining === 1 ? "" : "s"}`;
  } else if (aggBat < aggOpp) {
    winnerSide = otherSide(innings.battingSide);
    const margin = aggOpp - aggBat;
    resultText = `${nm(winnerSide)} won by ${margin} run${margin === 1 ? "" : "s"}`;
  } else {
    resultText = "Match tied";
  }

  await ctx.db.patch(match._id, {
    status: "completed",
    winnerSide,
    resultText,
  });

  await upsertLiveState(ctx, match._id, {
    currentInningsId: innings._id,
    inningsNo: innings.inningsNo,
    battingSide: innings.battingSide,
    strikerId: innings.currentStrikerId,
    nonStrikerId: innings.currentNonStrikerId,
    bowlerId: innings.currentBowlerId,
    needBowler: false,
    needBatsman: false,
    totalRuns: innings.totalRuns,
    wickets: innings.wickets,
    legalBalls: innings.legalBalls,
    oversText: legalBallToOverText(
      innings.legalBalls,
      match.ruleSnapshot.ballsPerOver,
    ),
    ballsThisOver: innings.legalBalls % match.ruleSnapshot.ballsPerOver,
    lastBallId: undefined,
    target: innings.target,
    resultText,
  });

  return { phase: "completed" as const, resultText, winnerSide, reason };
}

// ─── Mutations ───────────────────────────────────────────────

export const setBattingFirst = mutation({
  args: {
    token: v.string(),
    matchId: v.id("matches"),
    side: sideValidator,
  },
  handler: async (ctx, args) => {
    const { match } = await requireCanScore(ctx, args.token, args.matchId);
    if (match.status !== "scheduled") {
      throw new Error("Batting side can only be set before the match starts");
    }
    await ctx.db.patch(match._id, { battingFirst: args.side });
    return { ok: true };
  },
});

/**
 * Starts an innings once openers + bowler are picked.
 * Infers which innings comes next from the completed list. Limited: 1 then 2
 * (sides swap, target set). Test: up to 4 — innings 3's batting side is the
 * scorer's call (normal order, or follow-on via the battingSide arg), and only
 * the final innings gets a target (aggregate difference + 1).
 */
export const startInnings = mutation({
  args: {
    token: v.string(),
    matchId: v.id("matches"),
    strikerId: v.id("users"),
    nonStrikerId: v.optional(v.id("users")),
    openingBowlerId: v.id("users"),
    /** Only honoured for a test's 3rd innings, where either side may bat. */
    battingSide: v.optional(sideValidator),
  },
  handler: async (ctx, args) => {
    const { match } = await requireCanScore(ctx, args.token, args.matchId);
    // Single-batter match: the striker opens alone, no non-striker ever.
    const nonStrikerId = isSolo(match) ? undefined : args.nonStrikerId;
    if (!isSolo(match) && !nonStrikerId) {
      throw new Error("Pick both openers");
    }
    if (nonStrikerId && args.strikerId === nonStrikerId) {
      throw new Error("Openers must be two different players");
    }
    if (match.status === "completed" || match.status === "abandoned") {
      throw new Error("Match is over");
    }

    const all = (
      await ctx.db
        .query("innings")
        .withIndex("by_match", (q) => q.eq("matchId", match._id))
        .collect()
    ).sort((a, b) => a.inningsNo - b.inningsNo);
    const totalInnings = totalInningsOf(match);

    let inningsNo: number;
    let battingSide: Side;
    let target: number | undefined;

    if (all.length === 0) {
      if (match.status !== "scheduled") throw new Error("Match already live");
      if (!match.battingFirst) throw new Error("Pick who bats first");
      inningsNo = 1;
      battingSide = match.battingFirst;
    } else {
      const last = all[all.length - 1];
      if (last.status !== "complete") {
        throw new Error("Previous innings still in progress");
      }
      if (all.length >= totalInnings) {
        throw new Error("All innings are done");
      }
      inningsNo = last.inningsNo + 1;
      if (inningsNo === 2) {
        battingSide = otherSide(all[0].battingSide);
      } else if (inningsNo === 3) {
        // Normal order by default; follow-on when the scorer picks the side
        // that batted second to go again.
        battingSide = args.battingSide ?? all[0].battingSide;
      } else {
        const counts = { A: 0, B: 0 };
        for (const i of all) counts[i.battingSide] += 1;
        battingSide = counts.A < counts.B ? "A" : "B";
      }
      if (inningsNo === totalInnings) {
        target =
          aggregateRuns(all, otherSide(battingSide)) -
          aggregateRuns(all, battingSide) +
          1;
      }
    }

    const batting = sidePlayers(match, battingSide).map(String);
    const bowling = sidePlayers(match, otherSide(battingSide)).map(String);
    if (
      !batting.includes(String(args.strikerId)) ||
      (nonStrikerId && !batting.includes(String(nonStrikerId)))
    ) {
      throw new Error("Openers must be in the batting team");
    }
    if (!bowling.includes(String(args.openingBowlerId))) {
      throw new Error("Opening bowler must be in the bowling team");
    }
    if (
      String(args.openingBowlerId) === String(args.strikerId) ||
      (nonStrikerId && String(args.openingBowlerId) === String(nonStrikerId))
    ) {
      throw new Error("Bowler cannot be one of the openers");
    }

    if (inningsNo === 1) {
      await ctx.db.patch(match._id, { status: "live" });
    }

    const inningsId = await ctx.db.insert("innings", {
      matchId: match._id,
      inningsNo,
      battingSide,
      totalRuns: 0,
      wickets: 0,
      legalBalls: 0,
      extras: 0,
      target,
      status: "in_progress",
      openerStrikerId: args.strikerId,
      openerNonStrikerId: nonStrikerId,
      openingBowlerId: args.openingBowlerId,
      currentStrikerId: args.strikerId,
      currentNonStrikerId: nonStrikerId,
      currentBowlerId: args.openingBowlerId,
      needBowler: false,
      needBatsman: false,
      outPlayerIds: [],
    });

    await upsertLiveState(ctx, match._id, {
      currentInningsId: inningsId,
      inningsNo,
      battingSide,
      strikerId: args.strikerId,
      nonStrikerId,
      bowlerId: args.openingBowlerId,
      needBowler: false,
      needBatsman: false,
      totalRuns: 0,
      wickets: 0,
      legalBalls: 0,
      oversText: "0.0",
      ballsThisOver: 0,
      lastBallId: undefined,
      target,
    });

    return { inningsId, inningsNo, target };
  },
});

export const recordBall = mutation({
  args: {
    token: v.string(),
    matchId: v.id("matches"),
    runsBat: v.number(),
    extrasType: extrasValidator,
    extrasRuns: v.optional(v.number()),
    isWicket: v.optional(v.boolean()),
    wicketType: wicketValidator,
    playerOutId: v.optional(v.id("users")),
    fielderId: v.optional(v.id("users")),
    droppedById: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    const { user, match } = await requireCanScore(ctx, args.token, args.matchId);
    if (match.status !== "live") throw new Error("Match is not live");

    const live = await ctx.db
      .query("matchLiveState")
      .withIndex("by_match", (q) => q.eq("matchId", match._id))
      .unique();
    if (!live?.currentInningsId) {
      throw new Error("No active innings");
    }

    const innings = await ctx.db.get(live.currentInningsId);
    if (!innings || innings.status !== "in_progress") {
      throw new Error("Innings not in progress");
    }
    if (innings.needBowler) throw new Error("Pick a bowler first");
    if (innings.needBatsman) throw new Error("Pick the next batsman first");
    if (
      !innings.currentStrikerId ||
      (!isSolo(match) && !innings.currentNonStrikerId)
    ) {
      throw new Error("Batsmen not set");
    }
    if (!innings.currentBowlerId) throw new Error("Bowler not set");

    const extrasType = args.extrasType as ExtrasType | undefined;
    let extrasRuns = args.extrasRuns ?? 0;
    if (extrasType === "wide" || extrasType === "noball") {
      extrasRuns = Math.max(1, extrasRuns || 1);
    } else if (extrasType === "bye" || extrasType === "legbye") {
      extrasRuns = args.extrasRuns ?? 0;
      if (extrasRuns < 1) throw new Error("Bye/leg-bye needs runs");
    }

    const event: BallEvent = {
      isLegal: !isExtraIllegal(extrasType),
      runsBat: extrasType === "bye" || extrasType === "legbye" ? 0 : args.runsBat,
      extrasType,
      extrasRuns,
      isWicket: args.isWicket ?? false,
      wicketType: args.wicketType as WicketType | undefined,
      playerOutId: args.playerOutId,
    };
    validateBallEvent(event);

    if (
      event.isWicket &&
      event.playerOutId &&
      event.playerOutId !== innings.currentStrikerId &&
      event.playerOutId !== innings.currentNonStrikerId
    ) {
      throw new Error("Player out must be striker or non-striker");
    }

    let fielderId = args.fielderId;
    if (fielderId) {
      // Gully cricket: when a side is short, batting-side players often field
      // or keep wickets for the bowling side. So any player in the match can
      // be credited as fielder — the only players who physically cannot be
      // fielding are the two batters at the crease and the batter given out
      // on this ball.
      const inMatch = new Set([
        ...sidePlayers(match, "A").map(String),
        ...sidePlayers(match, "B").map(String),
      ]);
      const unavailable = new Set(
        [
          innings.currentStrikerId,
          innings.currentNonStrikerId,
          event.playerOutId,
        ]
          .filter(Boolean)
          .map(String),
      );
      if (
        !inMatch.has(String(fielderId)) ||
        unavailable.has(String(fielderId))
      ) {
        throw new Error("Fielder must be a player in the match who is not batting");
      }
    }
    if (
      event.isWicket &&
      (event.wicketType === "caught" || event.wicketType === "stumped") &&
      !fielderId
    ) {
      throw new Error("Pick the fielder for this dismissal");
    }
    if (!event.isWicket) fielderId = undefined;

    let droppedById = args.droppedById;
    if (droppedById) {
      // Same "anyone in the match can field" rule as fielderId, minus the
      // two batters at the crease — they can't be fielding their own
      // delivery. Purely descriptive: never touches score/wickets.
      const inMatch = new Set([
        ...sidePlayers(match, "A").map(String),
        ...sidePlayers(match, "B").map(String),
      ]);
      const unavailable = new Set(
        [innings.currentStrikerId, innings.currentNonStrikerId]
          .filter(Boolean)
          .map(String),
      );
      if (
        !inMatch.has(String(droppedById)) ||
        unavailable.has(String(droppedById))
      ) {
        throw new Error(
          "Fielder who dropped it must be a player in the match who is not batting",
        );
      }
    }

    const balls = await getBallsOrdered(ctx, innings._id);

    // Batting quota: the striker may face this ball if he still has his own
    // quota, or the pot (balls forfeited by batters out early) can cover it.
    // Only when both are dry — and somebody else can actually come in — must
    // he hand over. Last man standing keeps batting rather than deadlocking.
    const quota = battingQuota(match, innings, balls);
    if (!quota.canFace(innings.currentStrikerId) && quota.eligible.length > 0) {
      const striker = await ctx.db.get(innings.currentStrikerId);
      throw new Error(
        `${striker?.displayName ?? "Striker"} has finished their batting overs — retire them first`,
      );
    }

    const sequence = balls.length + 1;
    const overNumber = Math.floor(innings.legalBalls / match.ruleSnapshot.ballsPerOver);
    const ballInOver =
      (innings.legalBalls % match.ruleSnapshot.ballsPerOver) + (event.isLegal ? 1 : 0);

    const ballId = await ctx.db.insert("balls", {
      matchId: match._id,
      inningsId: innings._id,
      sequence,
      overNumber,
      ballInOver: event.isLegal
        ? ballInOver
        : (innings.legalBalls % match.ruleSnapshot.ballsPerOver) + 1,
      isLegal: event.isLegal,
      strikerId: innings.currentStrikerId,
      nonStrikerId: innings.currentNonStrikerId,
      bowlerId: innings.currentBowlerId,
      runsBat: event.runsBat,
      extrasType: event.extrasType,
      extrasRuns: event.extrasRuns,
      isWicket: event.isWicket,
      wicketType: event.wicketType,
      playerOutId: event.playerOutId,
      fielderId,
      droppedById,
      createdBy: user._id,
      createdAt: Date.now(),
    });

    // After a new ball, clear stored current* so recompute derives pure next state
    // (setBowler / setNextBatsman will re-set them when needed).
    await ctx.db.patch(innings._id, {
      currentStrikerId: undefined,
      currentNonStrikerId: undefined,
      currentBowlerId: undefined,
      needBowler: false,
      needBatsman: false,
    });
    const wiped = await ctx.db.get(innings._id);
    if (!wiped) throw new Error("Innings missing");

    const result = await recomputeAndPersist(ctx, match, wiped);

    if (result.inningsComplete) {
      const fresh = await ctx.db.get(innings._id);
      if (fresh) {
        await completeInningsAndMaybeMatch(
          ctx,
          match,
          fresh,
          result.completeReason ?? "complete",
        );
      }
    }

    return { ballId, ...result };
  },
});

/**
 * Retire a batter not-out (quota reached, or the team rotates early).
 * Recorded as a marker row in the ball log so undo/replay stay deterministic.
 * Not a dismissal: no wicket, no bowler credit, and the batter may return
 * later if the team runs out of fresh batters.
 */
export const retireBatsman = mutation({
  args: {
    token: v.string(),
    matchId: v.id("matches"),
    batsmanId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const { user, match } = await requireCanScore(ctx, args.token, args.matchId);
    if (match.status !== "live") throw new Error("Match is not live");

    const live = await ctx.db
      .query("matchLiveState")
      .withIndex("by_match", (q) => q.eq("matchId", match._id))
      .unique();
    if (!live?.currentInningsId) throw new Error("No active innings");
    const innings = await ctx.db.get(live.currentInningsId);
    if (!innings || innings.status !== "in_progress") {
      throw new Error("Innings not in progress");
    }
    if (innings.needBowler) throw new Error("Pick a bowler first");
    if (innings.needBatsman) throw new Error("Pick the next batsman first");
    if (
      String(args.batsmanId) !== String(innings.currentStrikerId) &&
      String(args.batsmanId) !== String(innings.currentNonStrikerId)
    ) {
      throw new Error("Only a batter at the crease can retire");
    }
    if (!innings.currentStrikerId || !innings.currentBowlerId) {
      throw new Error("Batsmen or bowler not set");
    }

    const balls = await getBallsOrdered(ctx, innings._id);
    await ctx.db.insert("balls", {
      matchId: match._id,
      inningsId: innings._id,
      sequence: balls.length + 1,
      overNumber: Math.floor(
        innings.legalBalls / match.ruleSnapshot.ballsPerOver,
      ),
      ballInOver: innings.legalBalls % match.ruleSnapshot.ballsPerOver,
      isLegal: false,
      isRetire: true,
      strikerId: innings.currentStrikerId,
      nonStrikerId: innings.currentNonStrikerId,
      bowlerId: innings.currentBowlerId,
      runsBat: 0,
      extrasRuns: 0,
      isWicket: false,
      playerOutId: args.batsmanId,
      createdBy: user._id,
      createdAt: Date.now(),
    });

    // Mirror recordBall: wipe stored picks so recompute derives pure state
    await ctx.db.patch(innings._id, {
      currentStrikerId: undefined,
      currentNonStrikerId: undefined,
      currentBowlerId: undefined,
      needBowler: false,
      needBatsman: false,
    });
    const wiped = await ctx.db.get(innings._id);
    if (!wiped) throw new Error("Innings missing");
    const result = await recomputeAndPersist(ctx, match, wiped);

    return { ...result };
  },
});

/**
 * Retroactive tag: a fielder dropped a catch on the most recently recorded
 * ball. Never touches score/recompute — a drop is a note on the log, not a
 * ball outcome. Pass `clear: true` to remove the tag from the last ball.
 */
export const tagDrop = mutation({
  args: {
    token: v.string(),
    matchId: v.id("matches"),
    droppedById: v.optional(v.id("users")),
    clear: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { match } = await requireCanScore(ctx, args.token, args.matchId);
    if (match.status !== "live") throw new Error("Match is not live");

    const live = await ctx.db
      .query("matchLiveState")
      .withIndex("by_match", (q) => q.eq("matchId", match._id))
      .unique();
    if (!live?.currentInningsId) throw new Error("No active innings");

    const balls = await getBallsOrdered(ctx, live.currentInningsId);
    const lastBall = balls[balls.length - 1];
    if (!lastBall) {
      throw new Error("Score the ball first, then tag the drop");
    }

    if (args.clear) {
      await ctx.db.patch(lastBall._id, { droppedById: undefined });
      return { ok: true };
    }
    if (!args.droppedById) throw new Error("Pick who dropped the catch");

    // Same rule `recordBall` applies to an inline drop: anyone in the match
    // may be fielding, except the two who were batting. Taken from the ball's
    // OWN striker/non-striker rather than the current crease — by the time a
    // drop is tagged the strike may have rotated, or a wicket may have put a
    // different pair out there, and the question is who was batting when the
    // catch went down.
    const inMatch = new Set([
      ...sidePlayers(match, "A").map(String),
      ...sidePlayers(match, "B").map(String),
    ]);
    const wereBatting = new Set(
      [lastBall.strikerId, lastBall.nonStrikerId].filter(Boolean).map(String),
    );
    if (
      !inMatch.has(String(args.droppedById)) ||
      wereBatting.has(String(args.droppedById))
    ) {
      throw new Error(
        "Fielder who dropped it must be a player in the match who wasn't batting",
      );
    }

    await ctx.db.patch(lastBall._id, { droppedById: args.droppedById });
    return { ok: true };
  },
});

export const setBowler = mutation({
  args: {
    token: v.string(),
    matchId: v.id("matches"),
    bowlerId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const { match } = await requireCanScore(ctx, args.token, args.matchId);
    if (match.status !== "live") throw new Error("Match is not live");

    const live = await ctx.db
      .query("matchLiveState")
      .withIndex("by_match", (q) => q.eq("matchId", match._id))
      .unique();
    if (!live?.currentInningsId) throw new Error("No active innings");
    const innings = await ctx.db.get(live.currentInningsId);
    if (!innings || innings.status !== "in_progress") {
      throw new Error("Innings not in progress");
    }
    if (!innings.needBowler) throw new Error("Bowler already set");

    const bowling = sidePlayers(match, otherSide(innings.battingSide));
    if (!bowling.map(String).includes(String(args.bowlerId))) {
      throw new Error("Bowler must be in the bowling team");
    }
    // A common player currently batting cannot bowl
    if (
      String(args.bowlerId) === String(innings.currentStrikerId) ||
      String(args.bowlerId) === String(innings.currentNonStrikerId)
    ) {
      throw new Error("This player is currently batting");
    }

    // Block same bowler back-to-back
    const balls = await getBallsOrdered(ctx, innings._id);
    const lastBowler =
      balls.length > 0 ? balls[balls.length - 1].bowlerId : undefined;
    if (lastBowler && String(lastBowler) === String(args.bowlerId)) {
      throw new Error("Same bowler cannot bowl consecutive overs");
    }

    // Bowling quota — enforced only while another eligible bowler exists
    // (never block the scorer: with everyone bowled out, caps relax).
    const bowledBy: Record<string, number> = {};
    for (const b of balls) {
      if (!b.isLegal) continue;
      const key = String(b.bowlerId);
      bowledBy[key] = (bowledBy[key] ?? 0) + 1;
    }
    const cap = bowlingCapBalls(match, args.bowlerId);
    if ((bowledBy[String(args.bowlerId)] ?? 0) >= cap) {
      const crease = new Set(
        [innings.currentStrikerId, innings.currentNonStrikerId]
          .filter(Boolean)
          .map(String),
      );
      const underCapExists = bowling.some((pid) => {
        const id = String(pid);
        if (lastBowler && id === String(lastBowler)) return false;
        if (crease.has(id)) return false;
        return (bowledBy[id] ?? 0) < bowlingCapBalls(match, pid);
      });
      if (underCapExists) {
        const bowler = await ctx.db.get(args.bowlerId);
        throw new Error(
          `${bowler?.displayName ?? "Bowler"} has bowled their overs`,
        );
      }
    }

    await ctx.db.patch(innings._id, {
      currentBowlerId: args.bowlerId,
      needBowler: false,
    });

    const fresh = await ctx.db.get(innings._id);
    if (fresh) await recomputeAndPersist(ctx, match, fresh);

    return { ok: true };
  },
});

export const setLastBatsmanAlone = mutation({
  args: {
    token: v.string(),
    matchId: v.id("matches"),
    value: v.boolean(),
  },
  handler: async (ctx, args) => {
    const { match } = await requireCanScore(ctx, args.token, args.matchId);
    await ctx.db.patch(match._id, {
      ruleSnapshot: { ...match.ruleSnapshot, lastBatsmanAlone: args.value },
    });
    return { ok: true };
  },
});

export const setNextBatsman = mutation({
  args: {
    token: v.string(),
    matchId: v.id("matches"),
    batsmanId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const { match } = await requireCanScore(ctx, args.token, args.matchId);
    if (match.status !== "live") throw new Error("Match is not live");

    const live = await ctx.db
      .query("matchLiveState")
      .withIndex("by_match", (q) => q.eq("matchId", match._id))
      .unique();
    if (!live?.currentInningsId) throw new Error("No active innings");
    const innings = await ctx.db.get(live.currentInningsId);
    if (!innings || innings.status !== "in_progress") {
      throw new Error("Innings not in progress");
    }
    if (!innings.needBatsman) throw new Error("No batsman needed");

    const batting = sidePlayers(match, innings.battingSide);
    if (!batting.map(String).includes(String(args.batsmanId))) {
      throw new Error("Batsman must be in the batting team");
    }
    if (innings.outPlayerIds.includes(args.batsmanId)) {
      throw new Error("Player already out");
    }

    // Vacancy = out occupant, or the trailing retiree (retired players may
    // return later, so only the pending retire marks its end vacant).
    const balls = await getBallsOrdered(ctx, innings._id);
    const last = balls.length > 0 ? balls[balls.length - 1] : undefined;
    const pendingRetireeId =
      last?.isRetire && last.playerOutId ? last.playerOutId : undefined;
    if (
      pendingRetireeId &&
      String(args.batsmanId) === String(pendingRetireeId)
    ) {
      throw new Error("They just retired — undo the retirement instead");
    }
    // Same rule the pad and recordBall use: own quota left, or the pot covers
    // it. Enforced here too so a stale picker can never send in a batter who
    // would be bounced straight back out.
    const quota = battingQuota(match, innings, balls);
    if (!quota.canFace(args.batsmanId) && quota.eligible.length > 0) {
      const u = await ctx.db.get(args.batsmanId);
      throw new Error(
        `${u && "displayName" in u ? (u.displayName as string) : "That batter"} has used their quota and there are no spare balls left`,
      );
    }

    const vacantSet = new Set(innings.outPlayerIds.map(String));
    if (pendingRetireeId) vacantSet.add(String(pendingRetireeId));

    let nextStriker = innings.currentStrikerId;
    let nextNon = innings.currentNonStrikerId;

    if (nextStriker && vacantSet.has(String(nextStriker))) {
      nextStriker = args.batsmanId;
    } else if (nextNon && vacantSet.has(String(nextNon))) {
      nextNon = args.batsmanId;
    } else {
      nextStriker = args.batsmanId;
    }

    // Not already the other end
    if (
      String(args.batsmanId) === String(nextStriker) &&
      String(args.batsmanId) === String(nextNon)
    ) {
      throw new Error("Invalid batsman pick");
    }
    if (
      (String(args.batsmanId) === String(innings.currentStrikerId) &&
        !vacantSet.has(String(innings.currentStrikerId))) ||
      (String(args.batsmanId) === String(innings.currentNonStrikerId) &&
        !vacantSet.has(String(innings.currentNonStrikerId)))
    ) {
      throw new Error("Player already batting");
    }

    await ctx.db.patch(innings._id, {
      currentStrikerId: nextStriker,
      currentNonStrikerId: nextNon,
      needBatsman: false,
    });

    const fresh = await ctx.db.get(innings._id);
    if (fresh) await recomputeAndPersist(ctx, match, fresh);

    return { ok: true };
  },
});

export const undoLastBall = mutation({
  args: {
    token: v.string(),
    matchId: v.id("matches"),
  },
  handler: async (ctx, args) => {
    const { match } = await requireCanScore(ctx, args.token, args.matchId);
    if (match.status !== "live") throw new Error("Match is not live");

    const live = await ctx.db
      .query("matchLiveState")
      .withIndex("by_match", (q) => q.eq("matchId", match._id))
      .unique();
    if (!live?.currentInningsId) throw new Error("No active innings");
    const innings = await ctx.db.get(live.currentInningsId);
    if (!innings || innings.status !== "in_progress") {
      throw new Error("Cannot undo — innings not in progress");
    }

    const balls = await getBallsOrdered(ctx, innings._id);
    if (balls.length === 0) throw new Error("No balls to undo");

    const last = balls[balls.length - 1];
    await ctx.db.delete(last._id);

    // Wipe human picks so pure recompute rebuilds from remaining log
    await ctx.db.patch(innings._id, {
      currentStrikerId: undefined,
      currentNonStrikerId: undefined,
      currentBowlerId: undefined,
      needBowler: false,
      needBatsman: false,
      outPlayerIds: [],
      retiredNotOutIds: [],
    });

    const fresh = await ctx.db.get(innings._id);
    if (fresh) await recomputeAndPersist(ctx, match, fresh);

    return { ok: true };
  },
});

export const endInnings = mutation({
  args: {
    token: v.string(),
    matchId: v.id("matches"),
  },
  handler: async (ctx, args) => {
    const { match } = await requireCanScore(ctx, args.token, args.matchId);
    if (match.status !== "live") throw new Error("Match is not live");

    const live = await ctx.db
      .query("matchLiveState")
      .withIndex("by_match", (q) => q.eq("matchId", match._id))
      .unique();
    if (!live?.currentInningsId) throw new Error("No active innings");
    const innings = await ctx.db.get(live.currentInningsId);
    if (!innings || innings.status !== "in_progress") {
      throw new Error("Innings not in progress");
    }

    // Ensure totals current
    await recomputeAndPersist(ctx, match, innings);
    const fresh = await ctx.db.get(innings._id);
    if (!fresh) throw new Error("Innings missing");

    return completeInningsAndMaybeMatch(ctx, match, fresh, "manual");
  },
});

// ─── Queries ─────────────────────────────────────────────────

export const liveState = query({
  args: {
    token: v.optional(v.string()),
    matchId: v.id("matches"),
  },
  handler: async (ctx, args) => {
    const access = await loadMatchAccess(ctx, args.token, args.matchId);
    if (!access) return null;
    const { match, canScore, user } = access;

    const live = await ctx.db
      .query("matchLiveState")
      .withIndex("by_match", (q) => q.eq("matchId", match._id))
      .unique();

    async function nameOf(userId: Id<"users"> | undefined) {
      if (!userId) return null;
      const u = await ctx.db.get(userId);
      return u ? { userId: u._id, displayName: u.displayName } : null;
    }

    async function sideInfo(s: Side) {
      const players = await Promise.all(
        sidePlayers(match, s).map(async (pid) => {
          const u = await ctx.db.get(pid);
          return u ? { userId: u._id, displayName: u.displayName } : null;
        }),
      );
      const roster = players.filter(
        (p): p is { userId: Id<"users">; displayName: string } => p !== null,
      );
      return {
        side: s,
        // First player of the side is its captain (how the draft seeds teams).
        name: captainTeamLabel(sideName(match, s), roster[0]?.displayName),
        players: roster,
      };
    }

    const inningsList = await ctx.db
      .query("innings")
      .withIndex("by_match", (q) => q.eq("matchId", match._id))
      .collect();

    const rules = match.ruleSnapshot;

    type BallChip = {
      _id: Id<"balls">;
      runsBat: number;
      extrasType?: ExtrasType;
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
    let lastBalls: BallChip[] = [];
    let currentOverBalls: BallChip[] = [];
    let prevOverBalls: BallChip[] = [];
    let inningsBalls: Doc<"balls">[] = [];
    let battingFigures: {
      striker: { runs: number; balls: number } | null;
      nonStriker: { runs: number; balls: number } | null;
      bowler: { runs: number; balls: number; wickets: number } | null;
    } = { striker: null, nonStriker: null, bowler: null };

    const currentInn = live?.currentInningsId
      ? await ctx.db.get(live.currentInningsId)
      : null;

    let lastBallDrop: { byId: Id<"users">; byName: string } | null = null;

    if (live?.currentInningsId) {
      inningsBalls = await getBallsOrdered(ctx, live.currentInningsId);
      const balls = inningsBalls;
      lastBalls = balls.slice(-6).map(toChip);

      const lastBall = balls[balls.length - 1];
      if (lastBall?.droppedById) {
        const dropper = await ctx.db.get(lastBall.droppedById);
        if (dropper) {
          lastBallDrop = { byId: dropper._id, byName: dropper.displayName };
        }
      }

      // Split the log at over boundaries so the UI can show the over in
      // progress (placeholder slots) plus the completed previous over.
      let legalCount = 0;
      let curStart = 0;
      let prevStart = 0;
      balls.forEach((b, i) => {
        if (b.isLegal) {
          legalCount += 1;
          if (legalCount % rules.ballsPerOver === 0) {
            prevStart = curStart;
            curStart = i + 1;
          }
        }
      });
      currentOverBalls = balls.slice(curStart).map(toChip);
      prevOverBalls = balls.slice(prevStart, curStart).map(toChip);

      if (live.strikerId || live.nonStrikerId || live.bowlerId) {
        let sR = 0,
          sB = 0,
          nR = 0,
          nB = 0,
          bR = 0,
          bB = 0,
          bW = 0;
        for (const b of balls) {
          if (b.isRetire) continue;
          if (live.strikerId && b.strikerId === live.strikerId) {
            sR += b.runsBat;
            if (b.isLegal || b.extrasType === "noball") sB += 1;
          }
          if (live.nonStrikerId && b.strikerId === live.nonStrikerId) {
            nR += b.runsBat;
            if (b.isLegal || b.extrasType === "noball") nB += 1;
          }
          if (live.bowlerId && b.bowlerId === live.bowlerId) {
            bR += b.runsBat + b.extrasRuns;
            if (b.isLegal) bB += 1;
            if (b.isWicket && b.wicketType !== "runout") bW += 1;
          }
        }
        battingFigures = {
          striker: live.strikerId ? { runs: sR, balls: sB } : null,
          nonStriker: live.nonStrikerId ? { runs: nR, balls: nB } : null,
          bowler: live.bowlerId ? { runs: bR, balls: bB, wickets: bW } : null,
        };
      }
    }
    const rr =
      live && live.legalBalls > 0
        ? runRate(live.totalRuns, live.legalBalls, rules.ballsPerOver)
        : 0;
    let reqRr: number | null = null;
    if (live?.target !== undefined) {
      const remaining = live.target - live.totalRuns;
      const maxBalls = rules.maxOversInnings * rules.ballsPerOver;
      const left = maxBalls - live.legalBalls;
      reqRr = left > 0 ? remaining / (left / rules.ballsPerOver) : null;
    }

    // Available next batsmen / bowlers for pickers, quota-aware.
    const availableBatsmen: Array<{
      userId: Id<"users">;
      displayName: string;
      retired: boolean;
      atCap: boolean;
      /** False = shown but not tappable (own quota done, pot empty). */
      selectable: boolean;
      runs: number;
      balls: number;
    }> = [];
    const availableBowlers: Array<{
      userId: Id<"users">;
      displayName: string;
      oversText: string;
    }> = [];
    let strikerQuota: { faced: number; cap: number } | null = null;
    let nonStrikerQuota: { faced: number; cap: number } | null = null;
    let needRetire = false;
    /** Spare balls forfeited by batters dismissed inside their quota. */
    let potBalls = 0;

    if (live?.battingSide && currentInn) {
      const quota = battingQuota(match, currentInn, inningsBalls);

      const lastLogged =
        inningsBalls.length > 0
          ? inningsBalls[inningsBalls.length - 1]
          : undefined;
      // setNextBatsman rejects the batter who retired on the trailing ball
      // ("undo the retirement instead"), so never offer them.
      const pendingRetireeId =
        lastLogged?.isRetire && lastLogged.playerOutId
          ? String(lastLogged.playerOutId)
          : undefined;
      // Everyone not out is listed, but only those who can legally face a ball
      // are tappable — offering a pick the next state would bounce is what
      // used to trap the scorer in a retire/pick loop.
      const owed = quota.owed.filter((id) => id !== pendingRetireeId);
      const spentOwn = quota.spentOwn.filter((id) => id !== pendingRetireeId);
      // Own-quota batters first so the default reading order favours them;
      // those living off the pot last.
      const candidateIds = [...owed, ...spentOwn];
      const batTally: Record<string, { runs: number; balls: number }> = {};
      for (const b of inningsBalls) {
        if (b.isRetire) continue;
        const key = String(b.strikerId);
        const t = batTally[key] ?? { runs: 0, balls: 0 };
        t.runs += b.runsBat;
        if (b.isLegal || b.extrasType === "noball") t.balls += 1;
        batTally[key] = t;
      }
      for (const id of candidateIds) {
        const u = await ctx.db.get(id as Id<"users">);
        if (!u || !("displayName" in u)) continue;
        const cap = battingCapBalls(match, id);
        const tally = batTally[id] ?? { runs: 0, balls: 0 };
        availableBatsmen.push({
          userId: u._id as Id<"users">,
          displayName: u.displayName as string,
          retired: quota.retired.has(id),
          atCap: cap !== undefined && (quota.facedBy[id] ?? 0) >= cap,
          selectable: quota.canFace(id),
          runs: tally.runs,
          balls: tally.balls,
        });
      }

      if (live.strikerId) {
        const cap = battingCapBalls(match, live.strikerId);
        if (cap !== undefined) {
          strikerQuota = {
            faced: quota.facedBy[String(live.strikerId)] ?? 0,
            cap,
          };
        }
      }
      if (live.nonStrikerId) {
        const cap = battingCapBalls(match, live.nonStrikerId);
        if (cap !== undefined) {
          nonStrikerQuota = {
            faced: quota.facedBy[String(live.nonStrikerId)] ?? 0,
            cap,
          };
        }
      }
      // Hand over only when the striker has used his own quota AND the pot is
      // empty AND somebody can actually replace him. While the pot has balls
      // in it the team chooses whether he runs on — the app must not force it.
      needRetire =
        match.status === "live" &&
        currentInn.status === "in_progress" &&
        !quota.canFace(live.strikerId) &&
        quota.eligible.length > 0 &&
        !live.needBatsman &&
        !live.needBowler;
      potBalls = quota.pot;

      const bowlingIds = sidePlayers(match, otherSide(live.battingSide));
      let blocked: Id<"users"> | undefined = live.bowlerId;
      if (inningsBalls.length) {
        blocked = inningsBalls[inningsBalls.length - 1].bowlerId;
      }
      const bowledBy: Record<string, number> = {};
      for (const b of inningsBalls) {
        if (!b.isLegal) continue;
        const key = String(b.bowlerId);
        bowledBy[key] = (bowledBy[key] ?? 0) + 1;
      }
      const baseEligible = bowlingIds.filter((pid) => {
        const id = String(pid);
        if (blocked && id === String(blocked) && live.needBowler) return false;
        // A common player currently batting cannot bowl
        if (id === String(live.strikerId) || id === String(live.nonStrikerId)) {
          return false;
        }
        return true;
      });
      const underCap = baseEligible.filter(
        (pid) => (bowledBy[String(pid)] ?? 0) < bowlingCapBalls(match, pid),
      );
      const bowlerPool = underCap.length > 0 ? underCap : baseEligible;
      for (const pid of bowlerPool) {
        const u = await ctx.db.get(pid);
        if (u) {
          availableBowlers.push({
            userId: u._id,
            displayName: u.displayName,
            oversText: legalBallToOverText(
              bowledBy[String(pid)] ?? 0,
              rules.ballsPerOver,
            ),
          });
        }
      }
    }

    // Between innings: what comes next, who bats by default, whether the
    // scorer can choose (test innings 3 — normal order vs follow-on).
    const totalInnings = totalInningsOf(match);
    const doneInnings = inningsList
      .filter((i) => i.status === "complete")
      .sort((a, b) => a.inningsNo - b.inningsNo);
    let breakInfo: {
      nextInningsNo: number;
      totalInnings: number;
      defaultBattingSide: Side;
      canChooseSide: boolean;
      followOnSide?: Side;
      leadText: string;
      target?: number;
    } | null = null;
    if (
      match.status === "live" &&
      !live?.currentInningsId &&
      doneInnings.length > 0 &&
      doneInnings.length < totalInnings
    ) {
      const nextNo = doneInnings[doneInnings.length - 1].inningsNo + 1;
      const aggA = aggregateRuns(doneInnings, "A");
      const aggB = aggregateRuns(doneInnings, "B");
      let defaultBattingSide: Side;
      if (nextNo === 2) {
        defaultBattingSide = otherSide(doneInnings[0].battingSide);
      } else if (nextNo === 3) {
        defaultBattingSide = doneInnings[0].battingSide;
      } else {
        const counts = { A: 0, B: 0 };
        for (const i of doneInnings) counts[i.battingSide] += 1;
        defaultBattingSide = counts.A < counts.B ? "A" : "B";
      }
      const canChooseSide = totalInnings === 4 && nextNo === 3;
      breakInfo = {
        nextInningsNo: nextNo,
        totalInnings,
        defaultBattingSide,
        canChooseSide,
        followOnSide: canChooseSide
          ? otherSide(doneInnings[0].battingSide)
          : undefined,
        leadText: leadText(
          await sideLabel(ctx, match, "A"),
          await sideLabel(ctx, match, "B"),
          aggA,
          aggB,
        ),
        target:
          nextNo === totalInnings
            ? aggregateRuns(doneInnings, otherSide(defaultBattingSide)) -
              aggregateRuns(doneInnings, defaultBattingSide) +
              1
            : undefined,
      };
    }

    return {
      matchId: match._id,
      status: match.status,
      canScore,
      ruleSnapshot: rules,
      sideA: await sideInfo("A"),
      sideB: await sideInfo("B"),
      battingFirst: match.battingFirst,
      breakInfo,
      resultText: match.resultText ?? live?.resultText,
      winnerSide: match.winnerSide,
      lastBallDrop,
      innings: inningsList
        .sort((a, b) => a.inningsNo - b.inningsNo)
        .map((i) => ({
          _id: i._id,
          inningsNo: i.inningsNo,
          battingSide: i.battingSide,
          totalRuns: i.totalRuns,
          wickets: i.wickets,
          legalBalls: i.legalBalls,
          extras: i.extras,
          target: i.target,
          status: i.status,
          oversText: legalBallToOverText(i.legalBalls, rules.ballsPerOver),
        })),
      live: live
        ? {
            inningsNo: live.inningsNo,
            currentInningsId: live.currentInningsId,
            battingSide: live.battingSide,
            totalRuns: live.totalRuns,
            wickets: live.wickets,
            legalBalls: live.legalBalls,
            oversText: live.oversText,
            ballsThisOver: live.ballsThisOver,
            needBowler: live.needBowler,
            needBatsman: live.needBatsman,
            target: live.target,
            resultText: live.resultText,
            striker: await nameOf(live.strikerId),
            nonStriker: await nameOf(live.nonStrikerId),
            bowler: await nameOf(live.bowlerId),
            figures: battingFigures,
            lastBalls,
            currentOverBalls,
            prevOverBalls,
            strikerQuota,
            nonStrikerQuota,
            needRetire,
            potBalls,
            runRate: rr,
            requiredRunRate: reqRr,
          }
        : null,
      availableBatsmen,
      availableBowlers,
      phase: (() => {
        if (match.status === "completed") return "completed" as const;
        if (match.status === "abandoned") return "completed" as const;
        if (match.status === "scheduled") {
          return match.battingFirst === undefined
            ? ("need_batting_side" as const)
            : ("need_openers" as const);
        }
        if (!live?.currentInningsId) {
          if (doneInnings.length > 0) return "innings_break" as const;
          return "need_openers" as const;
        }
        if (live.needBatsman) return "need_batsman" as const;
        if (live.needBowler) return "need_bowler" as const;
        return "scoring" as const;
      })(),
    };
  },
});

export const scorecard = query({
  args: {
    token: v.optional(v.string()),
    matchId: v.id("matches"),
  },
  handler: async (ctx, args) => {
    const access = await loadMatchAccess(ctx, args.token, args.matchId);
    if (!access) return null;
    const { match } = access;
    const rules = match.ruleSnapshot;

    // Between innings, match.resultText is unset (the match isn't over) but
    // matchLiveState carries the lead/target text for that break — mirror
    // liveState's fallback so a live scorecard shows it too.
    const live = await ctx.db
      .query("matchLiveState")
      .withIndex("by_match", (q) => q.eq("matchId", match._id))
      .unique();

    // Captain-based labels (first player of each side); default "Team A/B" only
    const captainName = async (side: Side) => {
      const first = sidePlayers(match, side)[0];
      const u = first ? await ctx.db.get(first) : null;
      return u && "displayName" in u ? (u.displayName as string) : undefined;
    };
    const labelA = captainTeamLabel(match.sideAName, await captainName("A"));
    const labelB = captainTeamLabel(match.sideBName, await captainName("B"));
    const teamLabel = (side: Side) => (side === "A" ? labelA : labelB);

    const inningsList = (
      await ctx.db
        .query("innings")
        .withIndex("by_match", (q) => q.eq("matchId", match._id))
        .collect()
    ).sort((a, b) => a.inningsNo - b.inningsNo);

    const cards = await Promise.all(
      inningsList.map(async (inn) => {
        const balls = await getBallsOrdered(ctx, inn._id);
        const batMap = new Map<
          string,
          {
            userId: Id<"users">;
            runs: number;
            balls: number;
            fours: number;
            sixes: number;
            out: boolean;
            wicketType?: WicketType;
            outBowlerId?: Id<"users">;
            outFielderId?: Id<"users">;
          }
        >();
        const bowlMap = new Map<
          string,
          {
            userId: Id<"users">;
            balls: number;
            runs: number;
            wickets: number;
            maidens: number;
            runsThisOver: number;
            ballsThisOver: number;
          }
        >();

        // Seed batters who faced, opened, got out, retired, or are at the
        // crease right now (setNextBatsman writes currentStriker/NonStriker
        // before they've faced a legal ball — without this they'd show as
        // "did not bat" while visibly batting).
        for (const id of [
          inn.openerStrikerId,
          ...(inn.openerNonStrikerId ? [inn.openerNonStrikerId] : []),
          ...inn.outPlayerIds,
          ...(inn.retiredNotOutIds ?? []),
          ...(inn.currentStrikerId ? [inn.currentStrikerId] : []),
          ...(inn.currentNonStrikerId ? [inn.currentNonStrikerId] : []),
        ]) {
          if (!batMap.has(String(id))) {
            batMap.set(String(id), {
              userId: id,
              runs: 0,
              balls: 0,
              fours: 0,
              sixes: 0,
              out: inn.outPlayerIds.includes(id),
            });
          }
        }

        // Replayed alongside the batting/bowling fold: running score and legal
        // balls at each wicket, plus extras split by type.
        let runningRuns = 0;
        let runningLegal = 0;
        const fowRaw: Array<{
          wicketNo: number;
          runs: number;
          oversText: string;
          playerOutId: Id<"users">;
        }> = [];
        const extrasBreakdown = { byes: 0, legByes: 0, wides: 0, noBalls: 0 };

        for (const b of balls) {
          // Retirement markers are not deliveries
          if (b.isRetire) continue;
          runningRuns += b.runsBat + b.extrasRuns;
          if (b.isLegal) runningLegal += 1;
          if (b.extrasType === "bye") extrasBreakdown.byes += b.extrasRuns;
          else if (b.extrasType === "legbye") {
            extrasBreakdown.legByes += b.extrasRuns;
          } else if (b.extrasType === "wide") {
            extrasBreakdown.wides += b.extrasRuns;
          } else if (b.extrasType === "noball") {
            extrasBreakdown.noBalls += b.extrasRuns;
          }
          if (b.isWicket && b.playerOutId) {
            fowRaw.push({
              wicketNo: fowRaw.length + 1,
              runs: runningRuns,
              oversText: legalBallToOverText(runningLegal, rules.ballsPerOver),
              playerOutId: b.playerOutId,
            });
          }
          if (!batMap.has(String(b.strikerId))) {
            batMap.set(String(b.strikerId), {
              userId: b.strikerId,
              runs: 0,
              balls: 0,
              fours: 0,
              sixes: 0,
              out: false,
            });
          }
          const bat = batMap.get(String(b.strikerId))!;
          bat.runs += b.runsBat;
          if (b.isLegal || b.extrasType === "noball") bat.balls += 1;
          if (b.runsBat === 4) bat.fours += 1;
          if (b.runsBat === 6) bat.sixes += 1;
          if (b.isWicket && b.playerOutId) {
            const creditBowler =
              b.wicketType && b.wicketType !== "runout"
                ? b.bowlerId
                : undefined;
            const out = batMap.get(String(b.playerOutId));
            if (out) {
              out.out = true;
              out.wicketType = b.wicketType;
              out.outBowlerId = creditBowler;
              out.outFielderId = b.fielderId;
            } else {
              batMap.set(String(b.playerOutId), {
                userId: b.playerOutId,
                runs: 0,
                balls: 0,
                fours: 0,
                sixes: 0,
                out: true,
                wicketType: b.wicketType,
                outBowlerId: creditBowler,
                outFielderId: b.fielderId,
              });
            }
          }

          if (!bowlMap.has(String(b.bowlerId))) {
            bowlMap.set(String(b.bowlerId), {
              userId: b.bowlerId,
              balls: 0,
              runs: 0,
              wickets: 0,
              maidens: 0,
              runsThisOver: 0,
              ballsThisOver: 0,
            });
          }
          const bowl = bowlMap.get(String(b.bowlerId))!;
          bowl.runs += b.runsBat + b.extrasRuns;
          if (b.isLegal) {
            bowl.balls += 1;
            bowl.ballsThisOver += 1;
            bowl.runsThisOver += b.runsBat + b.extrasRuns;
            if (bowl.ballsThisOver === rules.ballsPerOver) {
              if (bowl.runsThisOver === 0) bowl.maidens += 1;
              bowl.ballsThisOver = 0;
              bowl.runsThisOver = 0;
            }
          } else {
            bowl.runsThisOver += b.extrasRuns + b.runsBat;
          }
          if (b.isWicket && b.wicketType !== "runout") {
            bowl.wickets += 1;
          }
        }

        const retiredSet = new Set(
          (inn.retiredNotOutIds ?? []).map(String),
        );
        const batting = await Promise.all(
          Array.from(batMap.values()).map(async (row) => {
            const u = await ctx.db.get(row.userId as Id<"users">);
            const displayName =
              u && "displayName" in u ? (u.displayName as string) : "Player";
            const dismissal = row.out
              ? await buildDismissal(ctx, row)
              : undefined;
            return {
              ...row,
              displayName,
              dismissal,
              retired: !row.out && retiredSet.has(String(row.userId)),
              sr: row.balls > 0 ? (row.runs / row.balls) * 100 : 0,
            };
          }),
        );

        const bowling = await Promise.all(
          Array.from(bowlMap.values()).map(async (row) => {
            const u = await ctx.db.get(row.userId as Id<"users">);
            const displayName =
              u && "displayName" in u ? (u.displayName as string) : "Player";
            const overs = legalBallToOverText(row.balls, rules.ballsPerOver);
            const econ =
              row.balls > 0 ? row.runs / (row.balls / rules.ballsPerOver) : 0;
            return {
              userId: row.userId,
              displayName,
              overs,
              maidens: row.maidens,
              runs: row.runs,
              wickets: row.wickets,
              econ,
            };
          }),
        );

        const fallOfWickets = await Promise.all(
          fowRaw.map(async (row) => ({
            wicketNo: row.wicketNo,
            runs: row.runs,
            oversText: row.oversText,
            playerOutName:
              (await nameOfUser(ctx, row.playerOutId)) ?? "Player",
          })),
        );

        // Squad members with no row in batMap never came in at all — without
        // this they'd vanish from the card entirely.
        const didNotBat = (
          await Promise.all(
            sidePlayers(match, inn.battingSide)
              .filter((pid) => !batMap.has(String(pid)))
              .map(async (pid) => {
                const u = await ctx.db.get(pid);
                return u && "displayName" in u
                  ? { userId: pid, displayName: u.displayName as string }
                  : null;
              }),
          )
        ).filter(
          (p): p is { userId: Id<"users">; displayName: string } => p !== null,
        );

        return {
          inningsNo: inn.inningsNo,
          battingSide: inn.battingSide,
          battingTeamName: teamLabel(inn.battingSide),
          totalRuns: inn.totalRuns,
          wickets: inn.wickets,
          extras: inn.extras,
          extrasBreakdown,
          legalBalls: inn.legalBalls,
          oversText: legalBallToOverText(inn.legalBalls, rules.ballsPerOver),
          target: inn.target,
          status: inn.status,
          batting,
          bowling,
          fallOfWickets,
          didNotBat,
        };
      }),
    );

    return {
      matchId: match._id,
      status: match.status,
      resultText: match.resultText ?? live?.resultText,
      winnerSide: match.winnerSide,
      // The card lays itself out by format — a Test gets one pane per innings,
      // a limited match puts the whole game on one screen — and needs
      // ballsPerOver/maxOversInnings to turn legalBalls into rates and a
      // "need N off M" chase line. Cheaper than a second query for rules.
      format: rules.format,
      inningsPerSide: rules.inningsPerSide,
      ballsPerOver: rules.ballsPerOver,
      maxOversInnings: rules.maxOversInnings,
      sideA: { side: "A" as const, name: labelA },
      sideB: { side: "B" as const, name: labelB },
      innings: cards,
    };
  },
});
