import { MutationCtx } from "../_generated/server";
import { Doc, Id } from "../_generated/dataModel";
import { CATCH_POINTS, WICKET_POINTS } from "./points";
import type { Side } from "./contribution";

/**
 * Stat stamps: one completed match's ball log, folded per player, written to
 * `matchStats` / `playerMatchStats` / `playerMatchups`.
 *
 * `foldMatch` is the only copy of the per-match attribution rules the boards
 * read. It is the loop body of the old whole-org replay in convex/stats.ts
 * (`legacyAggregateOrg`), run over one match: bat runs/balls to the striker
 * (legal + noball), wickets to the bowler except run-outs, dismissals via
 * playerOutId, catches to the fielder on a caught dismissal, drops to
 * droppedById. convex/stats.ts sums the rows back into the exact aggregates
 * the replay used to build.
 *
 * Stamps are a cache of the ball log, never a source of truth. Anything that
 * changes a completed match calls `restampMatch`, which throws the match's
 * rows away and folds it again from `balls`. Change a rule in `foldMatch`
 * and every existing stamp is stale: rerun `stats:backfillStamps`, then
 * `stats:compareStats` should come back empty.
 *
 * Names and board tags are deliberately not stamped — they are read live, so
 * renaming or tagging a player never needs a restamp.
 */

type Format = "limited" | "test";

export function matchFormatOf(match: Doc<"matches">): Format {
  return match.ruleSnapshot.format === "test" ? "test" : "limited";
}

type Counts = Array<{ type: string; count: number }>;

export type StampH2H = {
  userId: Id<"users">;
  outs: number;
  runs: number;
  balls: number;
  fours: number;
  sixes: number;
  dots: number;
  types: Counts;
  seq: number;
};

export type PlayerStamp = Omit<
  Doc<"playerMatchStats">,
  "_id" | "_creationTime"
>;
export type MatchupStamp = Omit<Doc<"playerMatchups">, "_id" | "_creationTime">;
export type MatchStamp = Omit<Doc<"matchStats">, "_id" | "_creationTime">;

type BatWork = {
  runs: number;
  balls: number;
  fours: number;
  sixes: number;
  dots: number;
  singles: number;
  dismissals: number;
  ducks: number;
  goldenDucks: number;
  facedDucks: number;
  innings: Map<
    string,
    { inningsId: Id<"innings">; runs: number; balls: number; outs: number }
  >;
};

type BowlWork = {
  legalBalls: number;
  runs: number;
  wickets: number;
  dots: number;
  widesNoballs: number;
  sixesConceded: number;
  innings: Map<
    string,
    {
      inningsId: Id<"innings">;
      wickets: number;
      runs: number;
      legalBalls: number;
    }
  >;
};

type H2HWork = Omit<StampH2H, "types"> & { types: Map<string, number> };

type Player = {
  userId: Id<"users">;
  named: boolean;
  contributed: boolean;
  order: PlayerStamp["order"];
  bat?: BatWork;
  bowl?: BowlWork;
  catches: number;
  drops: number;
  reached: Map<string, number>;
  dismissalTypes: Map<string, number>;
  wicketTypes: Map<string, number>;
  byBowler: Map<string, H2HWork>;
  byFielder: Map<string, H2HWork>;
  byBatter: Map<string, H2HWork>;
};

const bump = (m: Map<string, number>, k: string) =>
  m.set(k, (m.get(k) ?? 0) + 1);

const countsOf = (m: Map<string, number>): Counts =>
  Array.from(m.entries()).map(([type, count]) => ({ type, count }));

/**
 * Folds one match. `balls` may arrive in any order; they are replayed by
 * sequence. Returns rows ready to insert — the match row, a player row for
 * everyone the replay touched, and a match-ups row for everyone with a
 * head-to-head or a dismissal to their name.
 */
export function foldMatch(
  match: Doc<"matches">,
  inningsRows: Doc<"innings">[],
  ballsIn: Doc<"balls">[],
): { match: MatchStamp; players: PlayerStamp[]; matchups: MatchupStamp[] } {
  const date = match.createdAt;
  const matchOrder = match._creationTime;
  const format = matchFormatOf(match);
  const base = { orgId: match.orgId, matchId: match._id, date, matchOrder, format };

  const players = new Map<string, Player>();
  // First-entry position per tally. The boards sort some rows with no final
  // tie-break, so this is what keeps their order identical to the old replay.
  let tick = 0;
  const get = (userId: Id<"users">): Player => {
    const key = String(userId);
    let p = players.get(key);
    if (!p) {
      p = {
        userId,
        named: false,
        contributed: false,
        order: {},
        catches: 0,
        drops: 0,
        reached: new Map(),
        dismissalTypes: new Map(),
        wicketTypes: new Map(),
        byBowler: new Map(),
        byFielder: new Map(),
        byBatter: new Map(),
      };
      players.set(key, p);
    }
    return p;
  };
  const markAt = (userId: Id<"users">, counter: string, at: number) => {
    const row = get(userId).reached;
    const seen = row.get(counter);
    if (seen === undefined || at > seen) row.set(counter, at);
  };
  const getBat = (userId: Id<"users">): BatWork => {
    const p = get(userId);
    if (!p.bat) {
      p.order.bat = tick++;
      p.bat = {
        runs: 0,
        balls: 0,
        fours: 0,
        sixes: 0,
        dots: 0,
        singles: 0,
        dismissals: 0,
        ducks: 0,
        goldenDucks: 0,
        facedDucks: 0,
        innings: new Map(),
      };
    }
    return p.bat;
  };
  const getBowl = (userId: Id<"users">): BowlWork => {
    const p = get(userId);
    if (!p.bowl) {
      p.order.bowl = tick++;
      p.bowl = {
        legalBalls: 0,
        runs: 0,
        wickets: 0,
        dots: 0,
        widesNoballs: 0,
        sixesConceded: 0,
        innings: new Map(),
      };
    }
    return p.bowl;
  };
  const batInnings = (bat: BatWork, inningsId: Id<"innings">) => {
    const key = String(inningsId);
    let row = bat.innings.get(key);
    if (!row) {
      row = { inningsId, runs: 0, balls: 0, outs: 0 };
      bat.innings.set(key, row);
    }
    return row;
  };
  /** Null for the player themselves — "your nemesis is you" is not a thing. */
  const h2h = (
    owner: Player,
    m: Map<string, H2HWork>,
    userId: Id<"users">,
  ): H2HWork | null => {
    if (String(userId) === String(owner.userId)) return null;
    const key = String(userId);
    let e = m.get(key);
    if (!e) {
      e = {
        userId,
        outs: 0,
        runs: 0,
        balls: 0,
        fours: 0,
        sixes: 0,
        dots: 0,
        types: new Map(),
        seq: 0,
      };
      m.set(key, e);
    }
    return e;
  };
  // Within one match every meeting shares the match date, so "most recent"
  // reduces to the highest ball sequence.
  const touch = (e: H2HWork, seq: number) => {
    if (seq > e.seq) e.seq = seq;
  };

  // Squad membership first — turnout must not depend on touching the ball.
  const namedIds = Array.from(
    new Set([...match.sideAPlayerIds, ...match.sideBPlayerIds].map(String)),
  );
  namedIds.forEach((id, i) => {
    const p = get(id as Id<"users">);
    p.named = true;
    p.order.turnout = i;
  });

  const battingSideOf = new Map<string, Side>();
  for (const inn of inningsRows) battingSideOf.set(String(inn._id), inn.battingSide);

  const ptsA = new Map<string, number>();
  const ptsB = new Map<string, number>();
  const addPts = (side: Side, userId: Id<"users">, n: number) => {
    if (n === 0) return;
    const m = side === "A" ? ptsA : ptsB;
    const k = String(userId);
    m.set(k, (m.get(k) ?? 0) + n);
  };
  const sumPts = (m: Map<string, number>) => {
    let s = 0;
    for (const v of Array.from(m.values())) s += v;
    return s;
  };

  const balls = [...ballsIn].sort((a, b) => a.sequence - b.sequence);

  for (const b of balls) {
    // Drop tags ride every row (rare on a retirement marker, but the tag is
    // just a patched field, not a delivery) — count before the retire skip.
    if (b.droppedById) {
      const p = get(b.droppedById);
      if (p.order.drop === undefined) p.order.drop = tick++;
      p.drops += 1;
      markAt(b.droppedById, "field.drops", b.createdAt);
    }
    // Retirement markers are not deliveries
    if (b.isRetire) continue;
    const innKey = String(b.inningsId);
    const batSide = battingSideOf.get(innKey);
    const bowlSide: Side | undefined =
      batSide === "A" ? "B" : batSide === "B" ? "A" : undefined;
    if (batSide) addPts(batSide, b.strikerId, b.runsBat);

    const striker = get(b.strikerId);
    const bat = getBat(b.strikerId);
    const inn = batInnings(bat, b.inningsId);
    bat.runs += b.runsBat;
    striker.contributed = true;
    if (b.runsBat > 0) markAt(b.strikerId, "bat.runs", b.createdAt);
    const faced = b.isLegal || b.extrasType === "noball";
    if (faced) {
      bat.balls += 1;
      markAt(b.strikerId, "bat.balls", b.createdAt);
    }
    // A dot is a legal ball the bat got nothing off. Byes and leg-byes still
    // count as dots for the batter — the runs weren't theirs.
    if (b.isLegal && b.runsBat === 0) {
      bat.dots += 1;
      markAt(b.strikerId, "bat.dots", b.createdAt);
    }
    if (b.runsBat === 1) {
      bat.singles += 1;
      markAt(b.strikerId, "bat.singles", b.createdAt);
    }
    if (b.runsBat === 4) {
      bat.fours += 1;
      markAt(b.strikerId, "bat.fours", b.createdAt);
    }
    if (b.runsBat === 6) {
      bat.sixes += 1;
      markAt(b.strikerId, "bat.sixes", b.createdAt);
    }
    inn.runs += b.runsBat;
    if (faced) inn.balls += 1;

    // Every ball faced, by bowler — not just the ones that got them out.
    {
      const e = h2h(striker, striker.byBowler, b.bowlerId);
      if (e) {
        e.runs += b.runsBat;
        if (faced) e.balls += 1;
        if (b.isLegal && b.runsBat === 0) e.dots += 1;
        if (b.runsBat === 4) e.fours += 1;
        if (b.runsBat === 6) e.sixes += 1;
        touch(e, b.sequence);
      }
    }

    if (b.isWicket && b.playerOutId) {
      const outP = get(b.playerOutId);
      const outBat = getBat(b.playerOutId);
      const outInn = batInnings(outBat, b.inningsId);
      outBat.dismissals += 1;
      // A duck is out for 0 off the bat; golden if it was the first ball
      // faced (a no-ball dismissal can't happen, so faced-balls == 1 is safe).
      if (outInn.runs === 0) {
        outBat.ducks += 1;
        if (outInn.balls === 1) outBat.goldenDucks += 1;
        if (outInn.balls >= 1) {
          outBat.facedDucks += 1;
          markAt(b.playerOutId, "bat.ducks", b.createdAt);
        }
      }
      outInn.outs += 1;
      // Catches, mirroring story.ts's Player-of-the-Match credit: a caught
      // dismissal only, credited to the fielder on the ball.
      if (b.wicketType === "caught" && b.fielderId) {
        const f = get(b.fielderId);
        if (f.order.catch === undefined) f.order.catch = tick++;
        f.catches += 1;
        f.contributed = true;
        markAt(b.fielderId, "field.catches", b.createdAt);
        if (bowlSide) addPts(bowlSide, b.fielderId, CATCH_POINTS);
      }
      if (b.wicketType) bump(outP.dismissalTypes, b.wicketType);
      // A run-out is nobody's bowling, so it never counts towards the
      // bowler who happened to be at the top of their mark.
      if (b.wicketType && b.wicketType !== "runout") {
        const e = h2h(outP, outP.byBowler, b.bowlerId);
        if (e) {
          e.outs += 1;
          bump(e.types, b.wicketType);
          touch(e, b.sequence);
        }
      }
      if (b.fielderId) {
        const e = h2h(outP, outP.byFielder, b.fielderId);
        if (e) {
          e.outs += 1;
          if (b.wicketType) bump(e.types, b.wicketType);
          touch(e, b.sequence);
        }
      }
    }

    const bowler = get(b.bowlerId);
    const bowl = getBowl(b.bowlerId);
    bowler.contributed = true;
    bowl.runs += b.runsBat + b.extrasRuns;
    if (b.runsBat + b.extrasRuns > 0)
      markAt(b.bowlerId, "bowl.runs", b.createdAt);
    if (b.isLegal) {
      bowl.legalBalls += 1;
      markAt(b.bowlerId, "bowl.legalBalls", b.createdAt);
    }
    if (b.isLegal && b.runsBat + b.extrasRuns === 0) {
      bowl.dots += 1;
      markAt(b.bowlerId, "bowl.dots", b.createdAt);
    }
    if (b.extrasType === "wide" || b.extrasType === "noball")
      bowl.widesNoballs += 1;
    if (b.runsBat === 6) bowl.sixesConceded += 1;
    const per = bowl.innings.get(innKey) ?? {
      inningsId: b.inningsId,
      wickets: 0,
      runs: 0,
      legalBalls: 0,
    };
    per.runs += b.runsBat + b.extrasRuns;
    if (b.isLegal) per.legalBalls += 1;
    const credited = b.isWicket && b.wicketType !== "runout";
    if (credited) {
      bowl.wickets += 1;
      markAt(b.bowlerId, "bowl.wickets", b.createdAt);
      per.wickets += 1;
      if (b.wicketType) bump(bowler.wicketTypes, b.wicketType);
      if (bowlSide) addPts(bowlSide, b.bowlerId, WICKET_POINTS);
    }
    bowl.innings.set(innKey, per);

    // What each batter has done to this bowler. Runs off the bat only —
    // a wide is the bowler's own doing, not the batter's work.
    const e = h2h(bowler, bowler.byBatter, b.strikerId);
    if (e) {
      e.runs += b.runsBat;
      if (faced) e.balls += 1;
      if (b.isLegal && b.runsBat === 0) e.dots += 1;
      if (b.runsBat === 4) e.fours += 1;
      if (b.runsBat === 6) e.sixes += 1;
      if (
        credited &&
        b.playerOutId &&
        String(b.playerOutId) === String(b.strikerId)
      ) {
        e.outs += 1;
      }
      touch(e, b.sequence);
    }
  }

  const teamA = sumPts(ptsA);
  const teamB = sumPts(ptsB);
  const sizeA = match.sideAPlayerIds.length;
  const sizeB = match.sideBPlayerIds.length;

  const playerRows: PlayerStamp[] = [];
  const matchupRows: MatchupStamp[] = [];
  const h2hRows = (m: Map<string, H2HWork>): StampH2H[] =>
    Array.from(m.values()).map((e) => ({ ...e, types: countsOf(e.types) }));

  for (const p of Array.from(players.values())) {
    const k = String(p.userId);
    const onA = match.sideAPlayerIds.some((x) => String(x) === k);
    const onB = match.sideBPlayerIds.some((x) => String(x) === k);
    playerRows.push({
      ...base,
      userId: p.userId,
      winnerSide: match.winnerSide,
      named: p.named,
      contributed: p.contributed,
      order: p.order,
      bat: p.bat
        ? { ...p.bat, innings: Array.from(p.bat.innings.values()) }
        : undefined,
      bowl: p.bowl
        ? { ...p.bowl, innings: Array.from(p.bowl.innings.values()) }
        : undefined,
      catches: p.catches,
      drops: p.drops,
      work: p.named
        ? {
            onA,
            onB,
            pointsA: ptsA.get(k) ?? 0,
            pointsB: ptsB.get(k) ?? 0,
            teamA,
            teamB,
            sizeA,
            sizeB,
          }
        : undefined,
      reached: Array.from(p.reached.entries()).map(([key, at]) => ({
        k: key,
        at,
      })),
    });
    if (
      p.dismissalTypes.size > 0 ||
      p.wicketTypes.size > 0 ||
      p.byBowler.size > 0 ||
      p.byFielder.size > 0 ||
      p.byBatter.size > 0
    ) {
      matchupRows.push({
        ...base,
        userId: p.userId,
        dismissalTypes: countsOf(p.dismissalTypes),
        wicketTypes: countsOf(p.wicketTypes),
        byBowler: h2hRows(p.byBowler),
        byFielder: h2hRows(p.byFielder),
        byBatter: h2hRows(p.byBatter),
      });
    }
  }

  return {
    match: {
      ...base,
      winnerSide: match.winnerSide,
      sideAName: match.sideAName,
      sideBName: match.sideBName,
      sideACaptainId: match.sideAPlayerIds[0],
      sideBCaptainId: match.sideBPlayerIds[0],
    },
    players: playerRows,
    matchups: matchupRows,
  };
}

/** Removes every stamp for one match. Safe to call on a match with none. */
export async function clearMatchStamps(
  ctx: MutationCtx,
  matchId: Id<"matches">,
) {
  const tables = ["matchStats", "playerMatchStats", "playerMatchups"] as const;
  for (const table of tables) {
    const rows = await ctx.db
      .query(table)
      .withIndex("by_match", (q) => q.eq("matchId", matchId))
      .collect();
    for (const r of rows) await ctx.db.delete(r._id);
  }
}

/**
 * Brings one match's stamps in line with its ball log: clears them, and if
 * the match is (still) completed, folds it again. Idempotent — every caller
 * that changes a completed match, or takes one out of `completed`, ends here.
 */
export async function restampMatch(
  ctx: MutationCtx,
  matchId: Id<"matches">,
): Promise<boolean> {
  await clearMatchStamps(ctx, matchId);
  const match = await ctx.db.get(matchId);
  if (!match || match.status !== "completed") return false;
  const innings = await ctx.db
    .query("innings")
    .withIndex("by_match", (q) => q.eq("matchId", matchId))
    .collect();
  const balls = await ctx.db
    .query("balls")
    .withIndex("by_match", (q) => q.eq("matchId", matchId))
    .collect();
  const folded = foldMatch(match, innings, balls);
  await ctx.db.insert("matchStats", folded.match);
  for (const row of folded.players) await ctx.db.insert("playerMatchStats", row);
  for (const row of folded.matchups) await ctx.db.insert("playerMatchups", row);
  return true;
}
