import { describe, expect, test } from "vitest";
import type { Id } from "../../convex/_generated/dataModel";
import { api, community, newTest, person, playMatch } from "./fixtures";

const balls = (runs: number[]) => runs.map((runsBat) => ({ runsBat }));
const wholeDay = { dayStart: 0, dayEnd: Number.MAX_SAFE_INTEGER };

describe("Home's match day card", () => {
  test("counts balls against a junior, as the scorecard does", async () => {
    const t = newTest();
    const senior = await person(t, "Senior");
    const junior = await person(t, "Junior");
    const other = await person(t, "Other");
    const mate = await person(t, "Mate");
    const orgId = await community(t, senior, [junior, other, mate], {
      [String(junior.userId)]: ["junior"],
    });
    // Two sixes and a four off the junior; the junior blocks four dots.
    await playMatch(
      t,
      senior,
      orgId,
      [senior, mate],
      [junior, other],
      { striker: senior, other: mate, bowler: junior, balls: balls([6, 6, 4, 0, 0, 1]) },
      { striker: junior, other, bowler: senior, balls: balls([0, 0, 0, 0, 1, 1]) },
    );

    const day = await t.query(api.hero.matchDay, { token: senior.token, orgId, ...wholeDay });
    expect(day!.isYou).toBe(true);
    expect(day!.numbers).toMatchObject({ runs: 17, fours: 1, sixes: 2, ballsFaced: 6 });
    expect(day!.insights).toContain("2 sixes — started clearing the ropes");

    // The stamp keeps the counted numbers apart, so the boards still drop them.
    const stamp = await t.run(async (ctx) =>
      (await ctx.db.query("playerMatchStats").collect()).find((r) => r.userId === senior.userId),
    );
    expect(stamp!.bat!.sixes).toBe(0);
    expect(stamp!.real).toMatchObject({ fours: 1, sixes: 2, bestOver: 17, bowlDots: 4 });
    expect(stamp!.bowl!.dots).toBe(0);
  });

  test("a viewer who did not play sees the latest Player of the Match of the day", async () => {
    const t = newTest();
    const a = await person(t, "Asha");
    const b = await person(t, "Bala");
    const c = await person(t, "Chitra");
    const d = await person(t, "Dev");
    const bench = await person(t, "Bench");
    const orgId = await community(t, a, [b, c, d, bench]);
    const first = await playMatch(
      t,
      a,
      orgId,
      [a, b],
      [c, d],
      { striker: a, other: b, bowler: c, balls: balls([6, 6, 6, 6, 6, 6]) },
      { striker: c, other: d, bowler: a, balls: balls([0, 0, 0, 0, 0, 0]) },
    );
    const second = await playMatch(
      t,
      a,
      orgId,
      [a, b],
      [c, d],
      { striker: b, other: a, bowler: d, balls: balls([1, 0, 0, 0, 0, 0]) },
      { striker: d, other: c, bowler: b, balls: balls([0, 0, 0, 0, 0, 0]) },
    );
    // The last match of the day named nobody.
    const potmOfFirst = await t.run(async (ctx) => {
      const stats = await ctx.db.query("matchStats").collect();
      const byId = (id: Id<"matches">) => stats.find((m) => m.matchId === id)!;
      await ctx.db.patch(byId(second)._id, { potm: [], date: byId(first).date + 1 });
      return byId(first).potm![0].userId;
    });

    const day = await t.query(api.hero.matchDay, { token: bench.token, orgId, ...wholeDay });
    expect(day!.isYou).toBe(false);
    expect(String(day!.playerId)).toBe(String(potmOfFirst));
  });
});
