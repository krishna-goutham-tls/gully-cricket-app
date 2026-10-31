import { expect, test } from "vitest";
import { community, newTest, person, playMatch } from "./fixtures";

test("a full match saves player summaries and freezes juniors", async () => {
  const t = newTest();
  const a1 = await person(t, "Admin A");
  const a2 = await person(t, "Senior A");
  const b1 = await person(t, "Senior B");
  const b2 = await person(t, "Junior B");
  const orgId = await community(t, a1, [a2, b1, b2], {
    [String(b2.userId)]: ["junior"],
  });
  const matchId = await playMatch(
    t,
    a1,
    orgId,
    [a1, a2],
    [b1, b2],
    { striker: a1, other: a2, bowler: b2, balls: [4, 1, 0, 6, 1, 1].map((runsBat) => ({ runsBat })) },
    { striker: b1, other: b2, bowler: a1, balls: [0, 1, 0, 1, 0, 1].map((runsBat) => ({ runsBat })) },
  );
  const { match, stamp } = await t.run(async (ctx) => ({
    match: await ctx.db.get(matchId),
    stamp: await ctx.db
      .query("playerMatchStats")
      .withIndex("by_org_user_date", (q) => q.eq("orgId", orgId).eq("userId", a1.userId))
      .first(),
  }));
  expect(match?.status).toBe("completed");
  expect(match?.juniorIds?.map(String)).toContain(String(b2.userId));
  expect(stamp?.offJuniors?.runs).toBeGreaterThan(0);
});
