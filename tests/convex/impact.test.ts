import { describe, expect, test } from "vitest";
import {
  emptyImpactTotals,
  impactBaseline,
  impactMinMatches,
  impactScore,
} from "../../convex/lib/impact";
import { api, community, newTest, person, playMatch } from "./fixtures";

const balls = (runs: number[]) => runs.map((runsBat) => ({ runsBat }));

describe("Impact formula", () => {
  test("bat, bowl and field are runs against the average, per match", () => {
    const base = {
      runsPerBall: 1,
      outsPerBall: 0.05,
      givenPerBall: 1.2,
      wicketsPerBall: 0.1,
      wicketValue: 20,
      catchValue: 10,
    };
    const t = {
      ...emptyImpactTotals(),
      matches: 2,
      runs: 30,
      ballsFaced: 20,
      outs: 2,
      legalBalls: 12,
      runsGiven: 10,
      wickets: 1,
      catches: 2,
      drops: 1,
    };
    const s = impactScore(t, base);
    // Out twice where an average batter is out once off 20 balls.
    expect(s.bat).toBeCloseTo((30 - 20 - (2 - 1) * 20) / 2);
    // One wicket off 12 balls, against an average of 1.2.
    expect(s.bowl).toBeCloseTo((12 * 1.2 - 10 + (1 - 1.2) * 20) / 2);
    expect(s.field).toBeCloseTo(((2 - 1) * 10) / 2);
    expect(s.total).toBeCloseTo(s.bat + s.bowl + s.field);
  });

  test("every value comes from the community's own balls", () => {
    const base = impactBaseline([
      { ...emptyImpactTotals(), runs: 10, ballsFaced: 10, outs: 1, innings: 1, runsGiven: 6, legalBalls: 6 },
      { ...emptyImpactTotals(), runs: 20, ballsFaced: 10, outs: 0, innings: 2, runsGiven: 12, legalBalls: 6, wickets: 3 },
    ]);
    expect(base.runsPerBall).toBeCloseTo(1.5);
    expect(base.outsPerBall).toBeCloseTo(0.05);
    expect(base.givenPerBall).toBeCloseTo(1.5);
    expect(base.wicketsPerBall).toBeCloseTo(0.25);
    // 30 runs in 3 innings: a wicket is worth 10, a catch half that.
    expect(base.wicketValue).toBeCloseTo(10);
    expect(base.catchValue).toBeCloseTo(5);
  });

  test("a higher-scoring community values a wicket higher", () => {
    const low = impactBaseline([{ ...emptyImpactTotals(), runs: 60, ballsFaced: 60, innings: 6 }]);
    const high = impactBaseline([{ ...emptyImpactTotals(), runs: 180, ballsFaced: 120, innings: 6 }]);
    expect(low.wicketValue).toBeCloseTo(10);
    expect(high.wicketValue).toBeCloseTo(30);
  });

  test("few dismissals do not blow a wicket up: it stays one average innings", () => {
    const base = impactBaseline([{ ...emptyImpactTotals(), runs: 400, ballsFaced: 300, outs: 1, innings: 20 }]);
    expect(base.wicketValue).toBeCloseTo(20);
    const none = impactBaseline([emptyImpactTotals()]);
    expect(none.wicketValue).toBe(0);
  });

  test("a quarter of the matches qualifies, never under three", () => {
    expect(impactMinMatches(2)).toBe(3);
    expect(impactMinMatches(68)).toBe(17);
  });
});

describe("Impact board", () => {
  test("fast scoring and cheap bowling rank first; a one-match player waits", async () => {
    const t = newTest();
    const fast = await person(t, "Fast");
    const slow = await person(t, "Slow");
    const a2 = await person(t, "Partner A");
    const b2 = await person(t, "Partner B");
    const late = await person(t, "Late");
    const orgId = await community(t, fast, [slow, a2, b2, late]);
    // Fast makes 18 off 6 and gives 1 off 6. Slow makes 1 off 6 and gives 18.
    for (let i = 0; i < 4; i += 1) {
      await playMatch(
        t,
        fast,
        orgId,
        [fast, i === 3 ? late : a2],
        [slow, b2],
        { striker: fast, other: i === 3 ? late : a2, bowler: slow, balls: balls([6, 6, 6, 0, 0, 0]) },
        { striker: slow, other: b2, bowler: fast, balls: balls([0, 0, 0, 0, 0, 1]) },
      );
    }
    const board = await t.query(api.stats.impact, { token: fast.token, orgId });
    expect(board!.matchCount).toBe(4);
    expect(board!.minMatches).toBe(3);
    // 19 runs off 12 balls a match: SR 158.3 for bat and bowl alike.
    expect(board!.strikeRate).toBeCloseTo((19 / 12) * 100);
    const by = new Map(board!.rows.map((r) => [r.displayName, r]));
    expect(board!.rows[0].displayName).toBe("Fast");
    expect(by.get("Fast")!.bat).toBeCloseTo(18 - 6 * (19 / 12));
    expect(by.get("Fast")!.bowl).toBeCloseTo(6 * (19 / 12) - 1);
    expect(by.get("Slow")!.total).toBeCloseTo(-by.get("Fast")!.total);
    expect(by.get("Late")!.qualified).toBe(false);
    expect(board!.rows.at(-1)!.displayName).toBe("Late");
  });

  test("an admin can switch Impact players off; the board then reads nothing", async () => {
    const t = newTest();
    const admin = await person(t, "Admin");
    const other = await person(t, "Other");
    const orgId = await community(t, admin, [other]);
    expect(await t.query(api.stats.impact, { token: admin.token, orgId })).not.toBeNull();
    await t.mutation(api.orgs.setFeature, { token: admin.token, orgId, key: "impactPlayers", on: false });
    expect(await t.query(api.stats.impact, { token: admin.token, orgId })).toBeNull();
  });
});
