import { describe, expect, test } from "vitest";
import { internal } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { api, community, newTest, person, playMatch, type Person, type T } from "./fixtures";

const balls = (runs: number[]) => runs.map((runsBat) => ({ runsBat }));

/**
 * Senior hits Junior's bowling for 12 in each of two matches, and Other's for
 * 4 in the chase. With the rule on, those 12 runs stay off Senior's counted
 * numbers. A season holds both matches and has ended.
 */
async function league(t: T) {
  const senior = await person(t, "Senior");
  const junior = await person(t, "Junior");
  const other = await person(t, "Other");
  const mate = await person(t, "Mate");
  const orgId = await community(t, senior, [junior, other, mate], {
    [String(junior.userId)]: ["junior"],
  });
  const matchIds: Id<"matches">[] = [];
  for (let i = 0; i < 2; i += 1) {
    matchIds.push(
      await playMatch(
        t,
        senior,
        orgId,
        [senior, mate],
        [junior, other],
        { striker: senior, other: mate, bowler: junior, balls: balls([2, 2, 2, 2, 2, 2]) },
        { striker: other, other: junior, bowler: senior, balls: balls([1, 1, 1, 1, 0, 0]) },
      ),
    );
  }
  await t.mutation(api.seasons.start, { token: senior.token, orgId });
  const seasonId = await t.mutation(api.seasons.end, { token: senior.token, orgId });
  return { orgId, matchIds, seasonId, senior, junior };
}

/** Every stamp of a community, without row ids, in a stable order. */
async function stamps(t: T, orgId: Id<"orgs">) {
  return t.run(async (ctx) => {
    const strip = <R extends { _id: unknown; _creationTime: unknown }>(r: R) => {
      const { _id, _creationTime, ...rest } = r;
      void _id;
      void _creationTime;
      return rest;
    };
    const key = (r: { matchId: unknown; userId?: unknown }) => `${r.matchId}:${r.userId ?? ""}`;
    const players = (await ctx.db.query("playerMatchStats").collect())
      .filter((r) => r.orgId === orgId)
      .map(strip)
      .sort((a, b) => key(a).localeCompare(key(b)));
    const matches = (await ctx.db.query("matchStats").collect())
      .filter((r) => r.orgId === orgId)
      .map(strip)
      .sort((a, b) => key(a).localeCompare(key(b)));
    return { players, matches };
  });
}

async function setRule(t: T, orgId: Id<"orgs">, on: boolean) {
  await t.mutation(internal.maintenance.setJuniorRule, { orgId, on });
  let cursor: string | null | undefined = undefined;
  for (;;) {
    const res: { isDone: boolean; continueCursor: string | null } = await t.mutation(
      internal.stats.backfillStamps,
      { orgId, cursor },
    );
    if (res.isDone) break;
    cursor = res.continueCursor;
  }
  await t.mutation(internal.seasons.recomputeSeriesAwards, { orgId });
  const check = await t.query(internal.stats.checkStamps, { orgId });
  expect(check.mismatches).toEqual([]);
}

async function seniorRuns(t: T, orgId: Id<"orgs">, senior: Person) {
  return t.run(async (ctx) =>
    (await ctx.db.query("playerMatchStats").collect())
      .filter((r) => r.orgId === orgId && r.userId === senior.userId)
      .map((r) => ({ runs: r.bat?.runs ?? 0, off: r.offJuniors?.runs ?? 0 })),
  );
}

const awards = (t: T, seasonId: Id<"seasons">) =>
  t.run(async (ctx) => (await ctx.db.get(seasonId))!.awards ?? []);

describe("the junior rule", () => {
  test("a new community picks a rule; absent means Scorecard only", async () => {
    const t = newTest();
    const owner = await person(t, "Owner");
    await t.run((ctx) => ctx.db.patch(owner.userId, { isPlatformAdmin: true }));

    const { orgId: everywhere } = await t.mutation(api.orgs.create, {
      token: owner.token,
      name: "Count All",
      juniorRule: false,
    });
    const { orgId: plain } = await t.mutation(api.orgs.create, {
      token: owner.token,
      name: "Default Club",
    });
    const scorecard = await t.mutation(api.orgs.create, {
      token: owner.token,
      name: "Scorecard Club",
      juniorRule: true,
    });

    const rule = async (orgId: Id<"orgs">) =>
      (await t.query(api.orgs.settings, { token: owner.token, orgId }))!.features.juniorRule;
    expect(await rule(everywhere)).toBe(false);
    expect(await rule(plain)).toBe(true);
    expect(await rule(scorecard.orgId)).toBe(true);
    // The default stores no row, so a later default change reaches it.
    const stored = await t.run(async (ctx) => (await ctx.db.get(plain))!.features);
    expect(stored ?? null).toBeNull();

    const boot = await t.query(api.auth.bootstrap, { token: owner.token });
    const row = boot!.memberships.find((m) => m.orgId === everywhere)!;
    expect(row.features!.juniorRule).toBe(false);
  });

  test("an admin cannot change the rule; only the agent command can", async () => {
    const t = newTest();
    const { orgId, senior } = await league(t);
    await expect(
      t.mutation(api.orgs.setFeature, { token: senior.token, orgId, key: "juniorRule", on: false }),
    ).rejects.toThrow("Unknown setting");
    const sandboxId = await t.run((ctx) =>
      ctx.db.insert("orgs", {
        name: "SANDBOX — x",
        createdBy: senior.userId,
        isDiscoverable: false,
        isSandbox: true,
        sandboxForOrgId: orgId,
        createdAt: Date.now(),
      }),
    );
    await expect(
      t.mutation(internal.maintenance.setJuniorRule, { orgId: sandboxId, on: false }),
    ).rejects.toThrow("A sandbox follows its real community");
  });

  test("rule off counts everything; rule on again gives back every stamp and award", async () => {
    const t = newTest();
    const { orgId, matchIds, seasonId, senior, junior } = await league(t);
    await t.run((ctx) =>
      ctx.db.patch(orgId, { features: { roast: true, juniorBoard: true } }),
    );

    const before = await stamps(t, orgId);
    const awardsBefore = await awards(t, seasonId);
    expect(awardsBefore.length).toBeGreaterThan(0);
    expect(await seniorRuns(t, orgId, senior)).toEqual([
      { runs: 0, off: 12 },
      { runs: 0, off: 12 },
    ]);
    expect(await t.query(api.stats.juniorBoard, { token: senior.token, orgId })).not.toBeNull();
    const receipt = async () =>
      (await t.query(api.story.matchStory, { token: senior.token, matchId: matchIds[0] }))!
        .badges.find((b) => b.key === "potm")!.receipt;
    expect(await receipt()).toContain("nothing off juniors");
    // Hero: with the rule on, Senior's 12 off Junior count nothing, so Other's
    // 4 wins each match. With it off, Senior wins both.
    const heroPotm = async () =>
      (await t.query(api.hero.heroDay, {
        token: senior.token,
        orgId,
        playerId: senior.userId,
        dayStart: 0,
        dayEnd: Date.now() + 60_000,
      }))!.moments.potmCount;
    expect(await heroPotm()).toBe(0);

    await setRule(t, orgId, false);
    expect(await heroPotm()).toBe(2);
    expect(await seniorRuns(t, orgId, senior)).toEqual([
      { runs: 12, off: 0 },
      { runs: 12, off: 0 },
    ]);
    // The real juniors stay on each match, so the change can be undone.
    for (const id of matchIds) {
      const m = await t.run(async (ctx) => (await ctx.db.get(id))!);
      expect(m.juniorIds!.map(String)).toEqual([String(junior.userId)]);
    }
    expect(await t.query(api.stats.juniorBoard, { token: senior.token, orgId })).toBeNull();
    expect(await receipt()).not.toContain("juniors");

    await setRule(t, orgId, true);
    expect(await stamps(t, orgId)).toEqual(before);
    expect(await awards(t, seasonId)).toEqual(awardsBefore);
    expect(await t.query(api.stats.juniorBoard, { token: senior.token, orgId })).not.toBeNull();
    expect(await receipt()).toContain("nothing off juniors");
    expect(await heroPotm()).toBe(0);
  });

  test("a sandbox folds by its real community's rule, and the command names it", async () => {
    const t = newTest();
    const { orgId, senior, junior } = await league(t);
    const sandboxId = await t.run((ctx) =>
      ctx.db.insert("orgs", {
        name: "SANDBOX — x",
        createdBy: senior.userId,
        isDiscoverable: false,
        isSandbox: true,
        sandboxForOrgId: orgId,
        createdAt: Date.now(),
      }),
    );
    const res = await t.mutation(internal.maintenance.setJuniorRule, { orgId, on: false });
    expect(res.sandboxIds.map(String)).toEqual([String(sandboxId)]);
    const counted = await t.run(async (ctx) => {
      const { countedJuniors, orgFeatureOn } = await import("../../convex/lib/features");
      return countedJuniors([junior.userId], await orgFeatureOn(ctx, sandboxId, "juniorRule")).size;
    });
    expect(counted).toBe(0);
  });

  test("a match completed under Count everywhere still saves its real juniors", async () => {
    const t = newTest();
    const senior = await person(t, "Senior");
    const junior = await person(t, "Junior");
    const other = await person(t, "Other");
    const mate = await person(t, "Mate");
    const orgId = await community(t, senior, [junior, other, mate], {
      [String(junior.userId)]: ["junior"],
    });
    await t.run((ctx) => ctx.db.patch(orgId, { features: { juniorRule: false } }));
    const matchId = await playMatch(
      t,
      senior,
      orgId,
      [senior, mate],
      [junior, other],
      { striker: senior, other: mate, bowler: junior, balls: balls([2, 2, 2, 2, 2, 2]) },
      { striker: other, other: junior, bowler: senior, balls: balls([1, 1, 1, 1, 0, 0]) },
    );
    const m = await t.run(async (ctx) => (await ctx.db.get(matchId))!);
    expect(m.juniorIds!.map(String)).toEqual([String(junior.userId)]);
    expect(await seniorRuns(t, orgId, senior)).toEqual([{ runs: 12, off: 0 }]);
  });
});
