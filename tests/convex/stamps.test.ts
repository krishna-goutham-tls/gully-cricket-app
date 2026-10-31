import { afterEach, describe, expect, test, vi } from "vitest";
import { internal } from "../../convex/_generated/api";
import type { Doc, Id } from "../../convex/_generated/dataModel";
import { foldMatch } from "../../convex/lib/matchStats";
import { computeTrophies } from "../../lib/trophies";
import type { Profile } from "../../components/player/ProfileParts";
import {
  api,
  community,
  newTest,
  person,
  playMatch,
  type Ball,
  type Person,
  type T,
} from "./fixtures";

/** Side A: two seniors. Side B: a senior and a junior. */
async function setup(t: T) {
  const a1 = await person(t, "Senior One");
  const a2 = await person(t, "Senior Two");
  const b1 = await person(t, "Senior Three");
  const j = await person(t, "Young One");
  const orgId = await community(t, a1, [a2, b1, j], {
    [String(j.userId)]: ["junior"],
  });
  return { a1, a2, b1, j, orgId };
}

const balls = (...runs: number[]): Ball[] => runs.map((runsBat) => ({ runsBat }));

async function stampsOf(t: T, matchId: Id<"matches">) {
  return t.run(async (ctx) => ({
    players: await ctx.db
      .query("playerMatchStats")
      .withIndex("by_match", (q) => q.eq("matchId", matchId))
      .collect(),
    matchups: await ctx.db
      .query("playerMatchups")
      .withIndex("by_match", (q) => q.eq("matchId", matchId))
      .collect(),
    match: await ctx.db
      .query("matchStats")
      .withIndex("by_match", (q) => q.eq("matchId", matchId))
      .first(),
  }));
}

async function stampOf(t: T, matchId: Id<"matches">, p: Person) {
  const { players } = await stampsOf(t, matchId);
  return players.find((r) => String(r.userId) === String(p.userId))!;
}

const profile = async (t: T, viewer: Person, orgId: Id<"orgs">, p: Person) =>
  (await t.query(api.stats.playerStats, {
    token: viewer.token,
    orgId,
    userId: p.userId,
  }))!;

const row = <R extends { userId: Id<"users"> }>(rows: R[], p: Person) =>
  rows.find((r) => String(r.userId) === String(p.userId));

/** A six-ball second innings that cannot chase anything big. */
const quietChase = (s: { b1: Person; j: Person; a2: Person }) => ({
  striker: s.b1,
  other: s.j,
  bowler: s.a2,
  balls: balls(0, 0, 0, 0, 0, 0),
});

/**
 * Folds balls written by hand on a real match, for orders a one-over fixture
 * cannot reach, such as two bowlers to one batter.
 */
async function foldBalls(
  t: T,
  matchId: Id<"matches">,
  juniors: Person[],
  script: Array<{
    striker: Person;
    bowler: Person;
    runsBat?: number;
    at: number;
  }>,
) {
  return t.run(async (ctx) => {
    const match = (await ctx.db.get(matchId))!;
    const innings = await ctx.db
      .query("innings")
      .withIndex("by_match", (q) => q.eq("matchId", matchId))
      .collect();
    const rows = script.map(
      (b, i) =>
        ({
          inningsId: innings[0]._id,
          sequence: i + 1,
          overNumber: 0,
          strikerId: b.striker.userId,
          bowlerId: b.bowler.userId,
          runsBat: b.runsBat ?? 0,
          extrasRuns: 0,
          isLegal: true,
          isWicket: false,
          createdAt: b.at,
        }) as unknown as Doc<"balls">,
    );
    return foldMatch(
      match,
      innings,
      rows,
      new Set(juniors.map((p) => String(p.userId))),
    );
  });
}

describe("batting off juniors", () => {
  test("D1: real runs on the innings row stop a duck and feed Slowest", async () => {
    const t = newTest();
    const { a1, a2, b1, j, orgId } = await setup(t);
    const matchId = await playMatch(
      t,
      a1,
      orgId,
      [a1, a2],
      [b1, j],
      {
        striker: a1,
        other: a2,
        bowler: j,
        balls: [...balls(2, 2, 0, 0, 0), { out: a1.userId }],
      },
      quietChase({ b1, j, a2 }),
    );
    const stamp = await stampOf(t, matchId, a1);
    const inn = stamp.bat!.innings[0];
    expect(inn).toMatchObject({ runs: 0, balls: 0, outs: 1, realRuns: 4, realBalls: 6 });

    const board = await t.query(api.stats.leaderboard, { token: a1.token, orgId });
    const line = row(board!.batting, a1)!;
    expect(line.duckStreak).toBe(0);
    expect(line.slowest).toEqual({ runs: 4, balls: 6 });
    // Caps and records stay on counted runs.
    expect(line.runs).toBe(0);
  });

  test("D1: a stamp from before the fields reads runs and balls", async () => {
    const t = newTest();
    const { a1, a2, b1, j, orgId } = await setup(t);
    const matchId = await playMatch(
      t,
      a1,
      orgId,
      [a1, a2],
      [b1, j],
      { striker: a1, other: a2, bowler: b1, balls: [...balls(0, 0, 0, 0, 0), { out: a1.userId }] },
      quietChase({ b1, j, a2 }),
    );
    await t.run(async (ctx) => {
      const r = (await ctx.db
        .query("playerMatchStats")
        .withIndex("by_match", (q) => q.eq("matchId", matchId))
        .collect()).find((x) => String(x.userId) === String(a1.userId))!;
      await ctx.db.patch(r._id, {
        bat: {
          ...r.bat!,
          innings: r.bat!.innings.map(({ inningsId, runs, balls: b, outs }) => ({
            inningsId,
            runs,
            balls: b,
            outs,
          })),
        },
      });
    });
    const board = await t.query(api.stats.leaderboard, { token: a1.token, orgId });
    expect(row(board!.batting, a1)!.duckStreak).toBe(1);
  });

  test("D3: a junior who took the wicket stays in the senior's head-to-head", async () => {
    const t = newTest();
    const { a1, a2, b1, j, orgId } = await setup(t);
    const matchId = await playMatch(
      t,
      a1,
      orgId,
      [a1, a2],
      [b1, j],
      { striker: a1, other: a2, bowler: j, balls: [...balls(4, 0, 0, 0, 0), { out: a1.userId }] },
      quietChase({ b1, j, a2 }),
    );
    const { matchups } = await stampsOf(t, matchId);
    const mine = matchups.find((m) => String(m.userId) === String(a1.userId))!;
    expect(row(mine.byBowler, j)).toMatchObject({
      balls: 6,
      dots: 5,
      outs: 1,
      runs: 0,
      fours: 0,
      sixes: 0,
    });

    const seniorView = await profile(t, a1, orgId, a1);
    expect(row(seniorView.vsBowlers, j)).toMatchObject({ balls: 6, outs: 1, runs: 0 });
    // The junior keeps every number on their own side.
    const juniorView = await profile(t, a1, orgId, j);
    expect(row(juniorView.vsBatters, a1)).toMatchObject({ balls: 6, outs: 1, runs: 4, fours: 1 });
  });

  test("D3: a slow-scoring read never names a junior, whose runs stay out", async () => {
    const t = newTest();
    const { a1, a2, b1, j, orgId } = await setup(t);
    const chase = quietChase({ b1, j, a2 });
    await playMatch(t, a1, orgId, [a1, a2], [b1, j], { striker: a1, other: a2, bowler: j, balls: balls(4, 4, 4, 4, 4, 4) }, chase);
    await playMatch(t, a1, orgId, [a1, a2], [b1, j], { striker: a1, other: a2, bowler: b1, balls: balls(2, 2, 2, 2, 2, 2) }, chase);
    const stats = await profile(t, a1, orgId, a1);
    expect(row(stats.vsBowlers, j)).toMatchObject({ balls: 6, runs: 0 });
    expect(String(stats.matchups.batting.toughest!.userId)).toBe(String(b1.userId));
    expect(stats.matchups.batting.easiest).toBeNull();
  });

  test("D1: an innings only off juniors breaks a run of ducks and counts no innings", async () => {
    const t = newTest();
    const { a1, a2, b1, j, orgId } = await setup(t);
    const chase = quietChase({ b1, j, a2 });
    const duck = { striker: a1, other: a2, bowler: b1, balls: [...balls(0, 0, 0, 0, 0), { out: a1.userId }] };
    await playMatch(t, a1, orgId, [a1, a2], [b1, j], duck, chase);
    await playMatch(t, a1, orgId, [a1, a2], [b1, j], { striker: a1, other: a2, bowler: j, balls: balls(6, 6, 6, 6, 6, 6) }, chase);
    await playMatch(t, a1, orgId, [a1, a2], [b1, j], duck, chase);
    const board = await t.query(api.stats.leaderboard, { token: a1.token, orgId });
    const mine = row(board!.batting, a1)!;
    expect(mine.duckStreak).toBe(1);
    expect(mine.innings).toBe(2);
    const stats = await profile(t, a1, orgId, a1);
    expect(stats.log.flatMap((r) => r.bat).map((i) => i.runs).sort()).toEqual([0, 0, 36]);
  });

  test("D4: a scoring shot off a junior ends a dot run", async () => {
    const t = newTest();
    const { a1, a2, b1, j, orgId } = await setup(t);
    const matchId = await playMatch(
      t,
      a1,
      orgId,
      [a1, a2],
      [b1, j],
      { striker: a1, other: a2, bowler: b1, balls: balls(0, 0, 0, 0, 0, 0) },
      quietChase({ b1, j, a2 }),
    );
    const folded = await foldBalls(t, matchId, [j], [
      { striker: a1, bowler: b1, at: 1 },
      { striker: a1, bowler: b1, at: 2 },
      { striker: a1, bowler: j, runsBat: 4, at: 3 },
      { striker: a1, bowler: b1, at: 4 },
    ]);
    expect(row(folded.players, a1)!.bat!.dotRun).toBe(2);
  });

  test("D4: a dot off a junior neither extends nor ends a run", async () => {
    const t = newTest();
    const { a1, a2, b1, j, orgId } = await setup(t);
    const matchId = await playMatch(
      t,
      a1,
      orgId,
      [a1, a2],
      [b1, j],
      { striker: a1, other: a2, bowler: b1, balls: balls(0, 0, 0, 0, 0, 0) },
      quietChase({ b1, j, a2 }),
    );
    const folded = await foldBalls(t, matchId, [j], [
      { striker: a1, bowler: b1, at: 1 },
      { striker: a1, bowler: j, at: 2 },
      { striker: a1, bowler: b1, at: 3 },
    ]);
    const bat = row(folded.players, a1)!.bat!;
    expect(bat.dotRun).toBe(2);
    expect(bat.dots).toBe(2);
    // A shot off a junior makes a row for the log, with no counted numbers.
    const onlyJunior = await foldBalls(t, matchId, [j], [
      { striker: a1, bowler: j, runsBat: 4, at: 1 },
    ]);
    expect(row(onlyJunior.players, a1)!.bat).toMatchObject({ runs: 0, balls: 0 });
    expect(row(onlyJunior.players, a1)!.bat!.innings[0]).toMatchObject({ runs: 0, realRuns: 4 });
  });

  test("D5: the log reads like the match card and career numbers stay counted", async () => {
    const t = newTest();
    const { a1, a2, b1, j, orgId } = await setup(t);
    await playMatch(
      t,
      a1,
      orgId,
      [a1, a2],
      [b1, j],
      { striker: a1, other: a2, bowler: j, balls: [...balls(6, 6, 6, 6, 6), { out: a1.userId }] },
      { striker: j, other: b1, bowler: a1, balls: [...balls(0, 0, 0, 0, 0), { out: j.userId }] },
    );
    const stats = await profile(t, a1, orgId, a1);
    expect(stats.log[0].bat).toEqual([{ runs: 30, balls: 6, out: true }]);
    expect(stats.log[0].bowl[0]).toMatchObject({ wickets: 1, runs: 0, legalBalls: 6 });
    // Counted: no runs, no wicket, and no thirty on the career line.
    expect(stats.batting).toMatchObject({ runs: 0, bestScore: 0, thirties: 0 });
    expect(stats.bowling).toMatchObject({ wickets: 0 });
  });

  test("D5: an innings only off juniors, not out, still shows in the log", async () => {
    const t = newTest();
    const { a1, a2, b1, j, orgId } = await setup(t);
    await playMatch(
      t,
      a1,
      orgId,
      [a1, a2],
      [b1, j],
      { striker: a1, other: a2, bowler: j, balls: balls(6, 6, 6, 6, 6, 6) },
      quietChase({ b1, j, a2 }),
    );
    const stats = await profile(t, a1, orgId, a1);
    expect(stats.log[0].bat).toEqual([{ runs: 36, balls: 6, out: false }]);
    expect(stats.batting).toBeNull();
  });
});

describe("bowling at juniors", () => {
  test("D6: career economy, average and strike rate read counted numbers", async () => {
    const t = newTest();
    const { a1, a2, b1, j, orgId } = await setup(t);
    await playMatch(
      t,
      a1,
      orgId,
      [a1, a2],
      [b1, j],
      { striker: a1, other: a2, bowler: b1, balls: balls(6, 0, 0, 0, 0, 0) },
      // Four balls and one run to the junior, then two balls and four runs to
      // the senior, with his wicket.
      { striker: j, other: b1, bowler: a1, balls: [...balls(0, 0, 0, 1, 4), { out: b1.userId }] },
    );
    const stats = await profile(t, a1, orgId, a1);
    expect(stats.bowling).toMatchObject({
      economy: 12,
      average: 4,
      strikeRate: 2,
      countedBalls: 2,
      countedRuns: 4,
      countedOversText: "0.2",
      wickets: 1,
    });
  });

  test("real wickets sit on the spell that took them", async () => {
    const t = newTest();
    const { a1, a2, b1, j, orgId } = await setup(t);
    const matchId = await playMatch(
      t,
      a1,
      orgId,
      [a1, a2],
      [b1, j],
      { striker: a1, other: a2, bowler: b1, balls: balls(1, 1, 1, 1, 1, 1) },
      { striker: j, other: b1, bowler: a1, balls: [{ out: j.userId }, ...balls(0, 0), { out: b1.userId }] },
    );
    const stamp = await stampOf(t, matchId, a1);
    expect(stamp.bowl!.innings[0]).toMatchObject({ wickets: 1, realWickets: 2 });
    const stats = await profile(t, a1, orgId, a1);
    expect(stats.log[0].bowl[0].wickets).toBe(2);
    expect(stats.bowling!.wickets).toBe(1);
  });

  test("Best figures leave out runs off juniors, as the Conceded beside them does", async () => {
    const t = newTest();
    const { a1, a2, b1, j, orgId } = await setup(t);
    await playMatch(
      t,
      a1,
      orgId,
      [a1, a2],
      [b1, j],
      { striker: a1, other: a2, bowler: b1, balls: balls(6, 6, 6, 6, 6, 6) },
      { striker: j, other: b1, bowler: a1, balls: [...balls(4, 4, 4, 4, 4), { out: b1.userId }] },
    );
    const stats = await profile(t, a1, orgId, a1);
    expect(stats.bowling).toMatchObject({ best: "1/0", countedRuns: 0 });
    expect(stats.log[0].bowl[0]).toMatchObject({ wickets: 1, runs: 20 });
  });

  test("D6: Miser needs a counted economy on counted balls", () => {
    const shelf = (bowling: Record<string, unknown>) =>
      computeTrophies({
        batting: null,
        matchesPlayed: 1,
        bowling: { best: null, rank: null, ...bowling },
      } as unknown as Profile).map((x) => x.id);
    expect(shelf({ economy: 4, legalBalls: 60, countedBalls: 10 })).not.toContain("miser");
    expect(shelf({ economy: 4, legalBalls: 60, countedBalls: 36 })).toContain("miser");
    expect(shelf({ economy: 6, legalBalls: 60, countedBalls: 60 })).not.toContain("miser");
  });

  test("D8: balls to juniors do not move the bowling tie-break markers", async () => {
    const t = newTest();
    const { a1, a2, b1, j, orgId } = await setup(t);
    const matchId = await playMatch(
      t,
      a1,
      orgId,
      [a1, a2],
      [b1, j],
      { striker: a1, other: a2, bowler: b1, balls: balls(0, 0, 0, 0, 0, 0) },
      quietChase({ b1, j, a2 }),
    );
    const folded = await foldBalls(t, matchId, [j], [
      { striker: b1, bowler: a1, runsBat: 1, at: 100 },
      { striker: j, bowler: a1, runsBat: 1, at: 200 },
    ]);
    const reached = row(folded.players, a1)!.reached;
    expect(reached).toContainEqual({ k: "bowl.runs", at: 100 });
    expect(reached).toContainEqual({ k: "bowl.legalBalls", at: 100 });
    // The junior's own batting marker still moves.
    expect(row(folded.players, j)!.reached).toContainEqual({ k: "bat.runs", at: 200 });
  });
});

describe("boards and fielding", () => {
  test("D7: a visitor stays off the junior board", async () => {
    const t = newTest();
    const a1 = await person(t, "Senior One");
    const v = await person(t, "Visitor");
    const b1 = await person(t, "Senior Three");
    const j = await person(t, "Young One");
    const orgId = await community(t, a1, [v, b1, j], {
      [String(j.userId)]: ["junior"],
      [String(v.userId)]: ["visitor"],
    });
    await t.run(async (ctx) => {
      await ctx.db.patch(orgId, { features: { juniorBoard: true } });
    });
    await playMatch(
      t,
      a1,
      orgId,
      [a1, v],
      [b1, j],
      { striker: v, other: a1, bowler: j, balls: balls(4, 1, 4, 0, 0, 0) },
      { striker: b1, other: j, bowler: v, balls: balls(0, 0, 0, 0, 0, 0) },
    );
    const board = await t.query(api.stats.juniorBoard, { token: a1.token, orgId });
    expect(row(board!.rows, a1)?.runs).toBe(4);
    expect(row(board!.rows, v)).toBeUndefined();
  });

  test("D9: Held % counts catches off juniors, and the career catches do not", async () => {
    const t = newTest();
    const { a1, a2, b1, j, orgId } = await setup(t);
    const matchId = await playMatch(
      t,
      a1,
      orgId,
      [a1, a2],
      [b1, j],
      { striker: a1, other: a2, bowler: b1, balls: balls(6, 0, 0, 0, 0, 0) },
      {
        striker: j,
        other: b1,
        bowler: a2,
        balls: [...balls(0, 0, 0, 0, 0), { out: j.userId, wicketType: "caught", fielderId: a1.userId }],
      },
    );
    await t.run(async (ctx) => {
      const ball = await ctx.db
        .query("balls")
        .withIndex("by_match", (q) => q.eq("matchId", matchId))
        .first();
      await ctx.db.patch(ball!._id, { droppedById: a1.userId });
    });
    await t.mutation(internal.stats.backfillStamps, { orgId });
    const f = (await profile(t, a1, orgId, a1)).fielding;
    expect(f).toMatchObject({ catches: 0, realCatches: 1, drops: 1 });
  });
});

describe("saved match totals", () => {
  test("real: every player stamp holds every ball", async () => {
    const t = newTest();
    const { a1, a2, b1, j, orgId } = await setup(t);
    const matchId = await playMatch(
      t,
      a1,
      orgId,
      [a1, a2],
      [b1, j],
      { striker: a1, other: a2, bowler: j, balls: balls(4, 0, 6, 0, 0, 0) },
      {
        striker: j,
        other: b1,
        bowler: a2,
        balls: [...balls(2, 0, 0, 0, 0), { out: j.userId, wicketType: "caught", fielderId: a1.userId }],
      },
    );
    const { players } = await stampsOf(t, matchId);
    for (const r of players) expect(r.real).toBeDefined();
    expect(row(players, a1)!.real).toEqual({ runs: 10, ballsFaced: 6, wickets: 0, catches: 1 });
    expect(row(players, a2)!.real).toEqual({ runs: 0, ballsFaced: 0, wickets: 1, catches: 0 });
    expect(row(players, j)!.real).toEqual({ runs: 2, ballsFaced: 6, wickets: 0, catches: 0 });
    expect(row(players, b1)!.real).toEqual({ runs: 0, ballsFaced: 0, wickets: 0, catches: 0 });
  });

  test("S4: run-outs sit on the fielder's stamp and read from there", async () => {
    const t = newTest();
    const { a1, a2, b1, j, orgId } = await setup(t);
    const matchId = await playMatch(
      t,
      a1,
      orgId,
      [a1, a2],
      [b1, j],
      { striker: a1, other: a2, bowler: b1, balls: balls(6, 0, 0, 0, 0, 0) },
      {
        striker: j,
        other: b1,
        bowler: a2,
        balls: [...balls(0, 0, 0, 0, 0), { out: j.userId, wicketType: "runout", fielderId: a1.userId }],
      },
    );
    const { players } = await stampsOf(t, matchId);
    expect(row(players, a1)!.runOuts).toBe(1);
    expect(row(players, a2)!.runOuts ?? 0).toBe(0);
    // A run-out is nobody's bowling.
    expect(row(players, a2)!.real!.wickets).toBe(0);

    // The profile must not need anyone else's match-ups for this.
    await t.run(async (ctx) => {
      const rows = await ctx.db
        .query("playerMatchups")
        .withIndex("by_match", (q) => q.eq("matchId", matchId))
        .collect();
      for (const r of rows) await ctx.db.patch(r._id, { byFielder: [] });
    });
    expect((await profile(t, a1, orgId, a1)).fielding.runOuts).toBe(1);
  });

  test("S3: the match list reads saved Player of the Match, with old rows as before", async () => {
    const t = newTest();
    const { a1, a2, b1, j, orgId } = await setup(t);
    const matchId = await playMatch(
      t,
      a1,
      orgId,
      [a1, a2],
      [b1, j],
      { striker: a1, other: a2, bowler: b1, balls: balls(4, 6, 0, 0, 0, 0) },
      { striker: j, other: b1, bowler: a2, balls: balls(2, 0, 0, 0, 0, 0) },
    );
    const { match } = await stampsOf(t, matchId);
    expect(match!.potm).toEqual([
      { userId: a1.userId, runs: 10, wickets: 0, catches: 0 },
    ]);

    const list = () => t.query(api.matches.list, { token: a1.token, orgId });
    const saved = (await list())[0].potm;
    expect(saved).toEqual([
      { userId: a1.userId, name: "Senior One", runs: 10, wickets: 0, catches: 0 },
    ]);

    // Old row, no saved field: the old code gives the same answer.
    await t.run(async (ctx) => {
      await ctx.db.patch(match!._id, { potm: undefined });
    });
    expect((await list())[0].potm).toEqual(saved);

    // With the field present, no player stamp is needed at all.
    await t.run(async (ctx) => {
      await ctx.db.patch(match!._id, {
        potm: [{ userId: a2.userId, runs: 1, wickets: 2, catches: 3 }],
      });
      const players = await ctx.db
        .query("playerMatchStats")
        .withIndex("by_match", (q) => q.eq("matchId", matchId))
        .collect();
      for (const r of players) await ctx.db.delete(r._id);
    });
    expect((await list())[0].potm).toEqual([
      { userId: a2.userId, name: "Senior Two", runs: 1, wickets: 2, catches: 3 },
    ]);
  });

  test("S3: ties share it, values include juniors, and no points gives none", async () => {
    const t = newTest();
    const { a1, a2, b1, j, orgId } = await setup(t);
    const tied = await playMatch(
      t,
      a1,
      orgId,
      [a1, a2],
      [b1, j],
      // a1: 4 counted off the senior. b1 in reply: 4 counted off a2.
      { striker: a1, other: a2, bowler: b1, balls: balls(4, 0, 0, 0, 0, 0) },
      { striker: b1, other: j, bowler: a2, balls: balls(4, 0, 0, 0, 0, 0) },
    );
    expect((await stampsOf(t, tied)).match!.potm).toEqual([
      { userId: a1.userId, runs: 4, wickets: 0, catches: 0 },
      { userId: b1.userId, runs: 4, wickets: 0, catches: 0 },
    ]);

    const offJunior = await playMatch(
      t,
      a1,
      orgId,
      [a1, a2],
      [b1, j],
      // a1 earns no points off the junior. The junior's two runs win it, and
      // the wicket of a senior lifts the junior further.
      { striker: a1, other: a2, bowler: j, balls: [...balls(6, 0, 0, 0, 0), { out: a1.userId }] },
      { striker: j, other: b1, bowler: a1, balls: balls(2, 0, 0, 0, 0, 0) },
    );
    expect((await stampsOf(t, offJunior)).match!.potm).toEqual([
      { userId: j.userId, runs: 2, wickets: 1, catches: 0 },
    ]);

    const blank = await playMatch(
      t,
      a1,
      orgId,
      [a1, a2],
      [b1, j],
      { striker: a1, other: a2, bowler: b1, balls: balls(0, 0, 0, 0, 0, 0) },
      { striker: b1, other: j, bowler: a2, balls: balls(0, 0, 0, 0, 0, 0) },
    );
    expect((await stampsOf(t, blank)).match!.potm).toEqual([]);
  });

  test("checkStamps reports a stamp from before the new fields", async () => {
    const t = newTest();
    const { a1, a2, b1, j, orgId } = await setup(t);
    const matchId = await playMatch(
      t,
      a1,
      orgId,
      [a1, a2],
      [b1, j],
      { striker: a1, other: a2, bowler: b1, balls: balls(4, 0, 0, 0, 0, 0) },
      quietChase({ b1, j, a2 }),
    );
    expect((await t.query(internal.stats.checkStamps, { orgId })).mismatches).toEqual([]);
    const { match } = await stampsOf(t, matchId);
    await t.run(async (ctx) => {
      await ctx.db.patch(match!._id, { potm: undefined });
    });
    expect((await t.query(internal.stats.checkStamps, { orgId })).mismatches).toHaveLength(1);
    await t.mutation(internal.stats.backfillStamps, { orgId });
    expect((await t.query(internal.stats.checkStamps, { orgId })).mismatches).toEqual([]);
  });
});

describe("restamp", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  /** Everything in the stamps except the ids Convex gives each new row. */
  const snapshot = async (t: T, matchId: Id<"matches">) => {
    const bare = <R extends { _id: unknown; _creationTime: unknown }>(r: R) => {
      const { _id, _creationTime, ...rest } = r;
      return rest;
    };
    const s = await stampsOf(t, matchId);
    return {
      players: s.players.map(bare),
      matchups: s.matchups.map(bare),
      match: bare(s.match!),
    };
  };

  const junioredMatch = async (t: T) => {
    const { a1, a2, b1, j, orgId } = await setup(t);
    const matchId = await playMatch(
      t,
      a1,
      orgId,
      [a1, a2],
      [b1, j],
      { striker: a1, other: a2, bowler: j, balls: [...balls(4, 0, 6, 0, 0), { out: a1.userId }] },
      {
        striker: j,
        other: b1,
        bowler: a2,
        balls: [...balls(2, 0, 0, 0, 0), { out: j.userId, wicketType: "caught", fielderId: a1.userId }],
      },
    );
    return { a1, j, orgId, matchId };
  };

  test("a repeat restamp gives the same stamps", async () => {
    const t = newTest();
    const { orgId, matchId } = await junioredMatch(t);
    const before = await snapshot(t, matchId);
    await t.mutation(internal.stats.backfillStamps, { orgId });
    await t.mutation(internal.stats.backfillStamps, { orgId });
    expect(await snapshot(t, matchId)).toEqual(before);
  });

  test("undo, then the same ball again, gives the same stamps", async () => {
    // A re-scored ball takes the clock's time, and `reached` holds that time.
    vi.useFakeTimers({ toFake: ["Date"], now: 1_800_000_000_000 });
    const t = newTest();
    const { a1, j, matchId } = await junioredMatch(t);
    const before = await snapshot(t, matchId);

    await t.mutation(api.scoring.undoLastBall, { token: a1.token, matchId });
    expect((await stampsOf(t, matchId)).players).toEqual([]);
    await t.mutation(api.scoring.recordBall, {
      token: a1.token,
      matchId,
      runsBat: 0,
      isWicket: true,
      wicketType: "caught",
      playerOutId: j.userId,
      fielderId: a1.userId,
    });
    expect(await snapshot(t, matchId)).toEqual(before);
  });
});
