import { describe, expect, test } from "vitest";
import { internal } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import {
  bestEconomyRow,
  economyQualifies,
  rankEconomy,
  seasonAwardKinds,
} from "../../convex/lib/awards";
import { awardsFromBoard } from "../../convex/seasons";
import { loadRegularsBoard } from "../../convex/stats";
import { api, community, newTest, person, playMatch, type Person, type T } from "./fixtures";

const balls = (runs: number[]) => runs.map((runsBat) => ({ runsBat }));

/**
 * Seven one-over matches. Against seniors, Cheap concedes 6 an over and Steady
 * concedes 4. Cheap also bowls three overs at a junior for one run an over, so
 * on all balls Cheap reads 27 / 7 = 3.86 and looks better than Steady's 4.
 */
async function juniorSpellLeague(t: T) {
  const steady = await person(t, "Steady");
  const junior = await person(t, "Junior");
  const cheap = await person(t, "Cheap");
  const other = await person(t, "Other");
  const orgId = await community(t, steady, [junior, cheap, other], {
    [String(junior.userId)]: ["junior"],
  });
  const sideA = [steady, junior];
  const sideB = [cheap, other];
  for (let i = 0; i < 4; i += 1) {
    await playMatch(
      t,
      steady,
      orgId,
      sideA,
      sideB,
      { striker: steady, other: junior, bowler: cheap, balls: balls([2, 2, 2, 0, 0, 0]) },
      { striker: cheap, other, bowler: steady, balls: balls([2, 2, 0, 0, 0, 0]) },
    );
  }
  for (let i = 0; i < 3; i += 1) {
    await playMatch(
      t,
      steady,
      orgId,
      sideA,
      sideB,
      { striker: junior, other: steady, bowler: cheap, balls: balls([0, 0, 0, 0, 0, 1]) },
      // Junior bowls the chase, so Steady's numbers stay on the four matches.
      { striker: other, other: cheap, bowler: junior, balls: balls([0, 0, 0, 0, 0, 0]) },
    );
  }
  return { orgId, steady, cheap };
}

describe("D2: one economy winner", () => {
  test("a cheap spell against juniors wins on no screen and on no saved award", async () => {
    const t = newTest();
    const { orgId, steady, cheap } = await juniorSpellLeague(t);

    const board = await t.query(api.stats.leaderboard, { token: steady.token, orgId });
    expect(board).not.toBeNull();
    const row = (p: Person) =>
      board!.bowling.find((r) => String(r.userId) === String(p.userId))!;

    // The old screen rule, which this test exists to retire, names Cheap.
    expect(row(cheap).economy).toBeLessThan(row(steady).economy);
    expect(row(cheap).countedEconomy).toBe(6);
    expect(row(steady).countedEconomy).toBe(4);

    const saved = await t.run(async (ctx) =>
      awardsFromBoard(await loadRegularsBoard(ctx, orgId)).find(
        (a) => a.kind === "best_economy",
      ),
    );
    const shown = bestEconomyRow(board!.bowling, board!.turnout);
    expect(String(saved!.userId)).toBe(String(steady.userId));
    expect(String(shown!.userId)).toBe(String(saved!.userId));
    expect(shown!.countedEconomy.toFixed(1)).toBe(saved!.display);

    // The runs a screen prints agree with the rate and overs it prints.
    expect(row(steady).countedOversText).toBe("4.0");
    expect(row(steady).countedRuns).toBe(16);
    expect(row(cheap).countedOversText).toBe("4.0");
    expect(row(cheap).countedRuns).toBe(24);
  });

  const bowler = (id: string, over: Partial<Parameters<typeof economyQualifies>[0]> = {}) => ({
    userId: id as Id<"users">,
    innings: 3,
    countedBalls: 24,
    countedEconomy: 5,
    ...over,
  });

  test("the bar reads counted balls, not all balls", () => {
    expect(economyQualifies(bowler("a"))).toBe(true);
    expect(economyQualifies(bowler("a", { countedBalls: 23 }))).toBe(false);
    expect(economyQualifies(bowler("a", { innings: 2 }))).toBe(false);
    expect(bestEconomyRow([bowler("a", { countedBalls: 23, countedEconomy: 1 })], [])).toBeNull();
  });

  test("a tie goes to fewer matches, then to userId", () => {
    const ids = (rows: Array<{ userId: Id<"users"> }>) => rows.map((r) => String(r.userId));
    const turnout = [
      { userId: "a" as Id<"users">, matches: 9 },
      { userId: "b" as Id<"users">, matches: 4 },
      { userId: "c" as Id<"users">, matches: 4 },
    ];
    expect(ids(rankEconomy([bowler("a"), bowler("c"), bowler("b")], turnout))).toEqual(["b", "c", "a"]);
  });

  test("a tie on economy and matches goes to who got there first", () => {
    const turnout = [
      { userId: "b" as Id<"users">, matches: 4 },
      { userId: "c" as Id<"users">, matches: 4 },
    ];
    const rows = [bowler("b", { economyAt: 300 }), bowler("c", { economyAt: 100 })];
    expect(rankEconomy(rows, turnout).map((r) => String(r.userId))).toEqual(["c", "b"]);
  });

  test("a bowler with no counted balls sits last, below thin samples", () => {
    const rows = [
      bowler("none", { countedBalls: 0, countedEconomy: 0 }),
      bowler("thin", { countedBalls: 6, countedEconomy: 9 }),
      bowler("real"),
    ];
    expect(rankEconomy(rows, []).map((r) => String(r.userId))).toEqual(["real", "thin", "none"]);
  });
});

/** A season whose only six comes from one player, so a retag removes the kind. */
async function endedSeason(t: T) {
  const admin = await person(t, "Admin");
  const hitter = await person(t, "Hitter");
  const b1 = await person(t, "Bowler One");
  const b2 = await person(t, "Bowler Two");
  const orgId = await community(t, admin, [hitter, b1, b2]);
  await playMatch(
    t,
    admin,
    orgId,
    [admin, hitter],
    [b1, b2],
    { striker: hitter, other: admin, bowler: b1, balls: balls([6, 2, 2, 2, 2, 2]) },
    { striker: b1, other: b2, bowler: admin, balls: balls([2, 2, 0, 0, 0, 0]) },
  );
  await t.mutation(api.seasons.start, { token: admin.token, orgId });
  const seasonId = await t.mutation(api.seasons.end, { token: admin.token, orgId });
  const retag = (tags: Array<"visitor"> | undefined) =>
    t.run(async (ctx) => {
      const member = await ctx.db
        .query("orgMembers")
        .withIndex("by_org_user", (q) => q.eq("orgId", orgId).eq("userId", hitter.userId))
        .unique();
      await ctx.db.patch(member!._id, { playerTags: tags });
    });
  const season = () => t.run(async (ctx) => (await ctx.db.get(seasonId))!);
  const recompute = (dryRun?: boolean) =>
    t.mutation(internal.seasons.recomputeSeriesAwards, { orgId, dryRun });
  return { orgId, seasonId, hitter, retag, season, recompute };
}

const kindsOf = (s: { awards?: Array<{ kind: string }> }) => (s.awards ?? []).map((a) => a.kind);

describe("D10: a kind with no winner comes back", () => {
  test("ending a season remembers what it saved", async () => {
    const t = newTest();
    const { season } = await endedSeason(t);
    const s = await season();
    expect(kindsOf(s)).toContain("most_sixes");
    expect(s.awardKinds).toEqual(kindsOf(s));
  });

  test("the kind leaves with its winner, then returns in its own place", async () => {
    const t = newTest();
    const { season, recompute, retag, hitter } = await endedSeason(t);
    const original = await season();
    const originalKinds = kindsOf(original);

    await retag(["visitor"]);
    const lost = await recompute();
    expect(lost.changes.find((c) => c.kind === "most_sixes")?.after).toBeNull();
    const without = await season();
    expect(kindsOf(without)).not.toContain("most_sixes");
    expect(without.awardKinds).toContain("most_sixes");

    // Nothing moved, so a second run reports nothing and loses nothing.
    expect((await recompute()).changed).toBe(0);
    expect((await season()).awardKinds).toContain("most_sixes");

    await retag(undefined);
    const back = await recompute();
    const returned = back.changes.find((c) => c.kind === "most_sixes");
    expect(returned?.before).toBeNull();
    expect(String(returned?.after?.userId)).toBe(String(hitter.userId));
    const after = await season();
    expect(kindsOf(after)).toEqual(originalKinds);
    expect(after.awards).toEqual(original.awards);
  });

  test("dryRun reports the change and writes nothing", async () => {
    const t = newTest();
    const { season, recompute, retag } = await endedSeason(t);
    const before = await season();
    await retag(["visitor"]);
    const report = await recompute(true);
    expect(report.seasonsChecked).toBe(1);
    expect(report.changed).toBe(report.changes.length);
    expect(report.changes.find((c) => c.kind === "most_sixes")?.after).toBeNull();
    expect(await season()).toEqual(before);
  });

  test("an old season gains no brand-new kind, and keeps one it does hold", async () => {
    const t = newTest();
    const { seasonId, season, recompute, retag } = await endedSeason(t);
    const full = await season();
    // How a season saved before the shelf and before `awardKinds` looks.
    await t.run(async (ctx) => {
      await ctx.db.patch(seasonId, {
        awardKinds: undefined,
        awards: full.awards!.filter((a) => a.kind !== "most_sixes"),
      });
    });
    const report = await recompute();
    expect(report.changed).toBe(0);
    const old = await season();
    expect(kindsOf(old)).not.toContain("most_sixes");
    expect(old.awardKinds).toBeUndefined();

    // Retagging takes this hitter's other trophies. Those stay remembered.
    const heldKind = old.awards!.find((a) => a.kind === "six_machine");
    expect(heldKind).toBeDefined();
    await retag(["visitor"]);
    await recompute();
    await retag(undefined);
    await recompute();
    const again = await season();
    expect(kindsOf(again)).toContain("six_machine");
    expect(kindsOf(again)).not.toContain("most_sixes");
  });

  test("the kind list keeps saved order and drops what it does not know", () => {
    expect(seasonAwardKinds(["purple_cap", "orange_cap"], undefined)).toEqual([
      "pots",
      "orange_cap",
      "purple_cap",
    ]);
    expect(seasonAwardKinds(["the_miser"], ["highest_sr", "not_a_kind"])).toEqual([
      "pots",
      "highest_sr",
      "the_miser",
    ]);
  });
});
