import { describe, expect, test } from "vitest";
import {
  MVP_CATCH,
  MVP_DROP,
  MVP_WICKET,
  emptyMvpTotals,
  mvpBaseline,
  mvpMinMatches,
  mvpScore,
} from "../../convex/lib/mvp";
import { api, community, newTest, person, playMatch } from "./fixtures";

const balls = (runs: number[]) => runs.map((runsBat) => ({ runsBat }));

describe("MVP formula", () => {
  test("bat, bowl and field are runs against the average, per match", () => {
    const base = { runsPerBall: 1, outsPerBall: 0.05, givenPerBall: 1.2, wicketsPerBall: 0.1 };
    const t = {
      ...emptyMvpTotals(),
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
    const s = mvpScore(t, base);
    // Out twice where an average batter is out once off 20 balls.
    expect(s.bat).toBeCloseTo((30 - 20 - (2 - 1) * MVP_WICKET) / 2);
    // One wicket off 12 balls, against an average of 1.2.
    expect(s.bowl).toBeCloseTo((12 * 1.2 - 10 + (1 - 1.2) * MVP_WICKET) / 2);
    expect(s.field).toBeCloseTo((2 * MVP_CATCH - MVP_DROP) / 2);
    expect(s.total).toBeCloseTo(s.bat + s.bowl + s.field);
  });

  test("the average is every player's balls together", () => {
    const base = mvpBaseline([
      { ...emptyMvpTotals(), runs: 10, ballsFaced: 10, outs: 1, runsGiven: 6, legalBalls: 6 },
      { ...emptyMvpTotals(), runs: 20, ballsFaced: 10, outs: 0, runsGiven: 12, legalBalls: 6, wickets: 3 },
    ]);
    expect(base.runsPerBall).toBeCloseTo(1.5);
    expect(base.outsPerBall).toBeCloseTo(0.05);
    expect(base.givenPerBall).toBeCloseTo(1.5);
    expect(base.wicketsPerBall).toBeCloseTo(0.25);
  });

  test("a quarter of the matches qualifies, never under three", () => {
    expect(mvpMinMatches(2)).toBe(3);
    expect(mvpMinMatches(68)).toBe(17);
  });
});

describe("MVP board", () => {
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
    const board = await t.query(api.stats.mvp, { token: fast.token, orgId });
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
});
