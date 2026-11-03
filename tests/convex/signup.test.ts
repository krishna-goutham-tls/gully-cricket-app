import { describe, expect, test } from "vitest";
import { internal } from "../../convex/_generated/api";
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

const balls = (...runs: number[]): Ball[] => runs.map((runsBat) => ({ runsBat }));

async function makeOwner(t: T, p: Person) {
  await t.run(async (ctx) => {
    await ctx.db.patch(p.userId, { isPlatformAdmin: true });
  });
}

/** Four players and a one-over match: 4, 6, 1 and a catch; then a quiet chase. */
async function played(t: T) {
  const a1 = await person(t, "Asha One");
  const a2 = await person(t, "Bala Two");
  const b1 = await person(t, "Chitra Three");
  const b2 = await person(t, "Dev Four");
  const orgId = await community(t, a1, [a2, b1, b2]);
  const matchId = await playMatch(
    t,
    a1,
    orgId,
    [a1, a2],
    [b1, b2],
    {
      striker: a1,
      other: a2,
      bowler: b1,
      balls: [
        { runsBat: 4 },
        { runsBat: 6 },
        { runsBat: 1 },
        { runsBat: 0, out: a2.userId, wicketType: "caught", fielderId: b2.userId },
        ...balls(0, 0),
      ],
    },
    { striker: b1, other: b2, bowler: a2, balls: balls(0, 0, 0, 0, 0, 0) },
  );
  return { a1, a2, b1, b2, orgId, matchId };
}

const site = (t: T) => t.query(api.stats.siteTotals, {});
const ONE_MATCH = { matches: 1, runs: 11, wickets: 1, sixes: 1, fours: 1, catches: 1 };
const NONE = { matches: 0, runs: 0, wickets: 0, sixes: 0, fours: 0, catches: 0 };

describe("open sign-up", () => {
  test("anyone signed in creates a community without an approval, up to 3", async () => {
    const t = newTest();
    const asha = await person(t, "Asha");
    expect(await t.query(api.access.canCreateOrg, { token: asha.token })).toEqual({
      allowed: true,
      reason: "open",
    });
    for (const name of ["One", "Two", "Three"]) {
      await t.mutation(api.orgs.create, { token: asha.token, name: `Club ${name}` });
    }
    await expect(
      t.mutation(api.orgs.create, { token: asha.token, name: "Club Four" }),
    ).rejects.toThrow(/3 communities at most/);
    expect((await t.query(api.access.canCreateOrg, { token: asha.token })).allowed).toBe(false);
  });

  test("a sandbox does not count toward the cap, and the owner has none", async () => {
    const t = newTest();
    const asha = await person(t, "Asha");
    const { orgId } = await t.mutation(api.orgs.create, { token: asha.token, name: "Club One" });
    await t.mutation(api.orgs.enterSandbox, { token: asha.token, orgId });
    await t.mutation(api.orgs.create, { token: asha.token, name: "Club Two" });
    await t.mutation(api.orgs.create, { token: asha.token, name: "Club Three" });

    const owner = await person(t, "Owner");
    await makeOwner(t, owner);
    for (let i = 0; i < 4; i++) {
      await t.mutation(api.orgs.create, { token: owner.token, name: `Owner ${i}` });
    }
  });

  test("the community list is for the platform owner only", async () => {
    const t = newTest();
    const asha = await person(t, "Asha");
    await t.mutation(api.orgs.create, { token: asha.token, name: "Club One" });
    const bala = await person(t, "Bala");
    expect(await t.query(api.orgs.listDiscoverable, { token: bala.token })).toEqual([]);
    await makeOwner(t, bala);
    expect(await t.query(api.orgs.listDiscoverable, { token: bala.token })).toHaveLength(1);
  });
});

describe("closing a community", () => {
  test("a closed community refuses its members; opening it again restores them", async () => {
    const t = newTest();
    const { a1, a2, orgId } = await played(t);
    const owner = await person(t, "Owner");
    await makeOwner(t, owner);
    const { orgId: sandboxId } = await t.mutation(api.orgs.enterSandbox, { token: a1.token, orgId });

    await expect(
      t.mutation(admin(), { token: a1.token, orgId, closed: true }),
    ).rejects.toThrow();
    await t.mutation(admin(), { token: owner.token, orgId, closed: true });

    expect(await t.query(api.stats.leaderboard, { token: a2.token, orgId })).toBeNull();
    expect(await t.query(api.orgs.getOrg, { token: a2.token, orgId })).toBeNull();
    expect(await t.query(api.orgs.listActiveMembers, { token: a2.token, orgId })).toEqual([]);
    await expect(
      t.mutation(api.matches.create, {
        token: a1.token,
        orgId,
        sideAPlayerIds: [a1.userId],
        sideBPlayerIds: [a2.userId],
        overs: 1,
      }),
    ).rejects.toThrow();
    await expect(
      t.mutation(api.orgs.getInvite, { token: a1.token, orgId }),
    ).rejects.toThrow();
    // Its sandbox closes with it.
    await expect(
      t.mutation(api.orgs.clearSandboxData, { token: a1.token, orgId: sandboxId }),
    ).rejects.toThrow();

    const boot = await t.query(api.auth.bootstrap, { token: a2.token });
    expect(boot!.memberships.find((m) => m.orgId === orgId)!.status).toBe("closed");

    // The owner still watches it.
    expect(await t.query(api.stats.leaderboard, { token: owner.token, orgId })).not.toBeNull();
    const list = await t.query(api.admin.newCommunities, { token: owner.token });
    expect(list.find((r) => r.orgId === orgId)!.closed).toBe(true);

    await t.mutation(admin(), { token: owner.token, orgId, closed: false });
    expect(await t.query(api.stats.leaderboard, { token: a2.token, orgId })).not.toBeNull();
    const again = await t.query(api.auth.bootstrap, { token: a2.token });
    expect(again!.memberships.find((m) => m.orgId === orgId)!.status).toBe("active");
  });

  test("a closed community's invite link stops", async () => {
    const t = newTest();
    const asha = await person(t, "Asha");
    const owner = await person(t, "Owner");
    await makeOwner(t, owner);
    const { orgId } = await t.mutation(api.orgs.create, { token: asha.token, name: "Club One" });
    const { code } = await t.mutation(api.orgs.getInvite, { token: asha.token, orgId });
    await t.mutation(admin(), { token: owner.token, orgId, closed: true });
    expect(await t.query(api.orgs.inviteInfo, { code })).toBeNull();
  });

  test("the New communities list leaves out sandboxes and is empty for others", async () => {
    const t = newTest();
    const asha = await person(t, "Asha");
    const owner = await person(t, "Owner");
    await makeOwner(t, owner);
    const { orgId } = await t.mutation(api.orgs.create, { token: asha.token, name: "Club One" });
    await t.mutation(api.orgs.enterSandbox, { token: asha.token, orgId });
    expect(await t.query(api.admin.newCommunities, { token: asha.token })).toEqual([]);
    const rows = await t.query(api.admin.newCommunities, { token: owner.token });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ name: "Club One", matches: 0, adminName: "Asha", closed: false });
    expect(rows[0].adminPhone).toMatch(/^\+91\d{10}$/);
  });
});

const admin = () => api.admin.setClosed;

describe("the counters", () => {
  test("a completed match adds its numbers once, and the check passes", async () => {
    const t = newTest();
    const { a1, orgId } = await played(t);
    expect(await site(t)).toEqual(ONE_MATCH);
    const card = await t.query(api.stats.communityCard, { token: a1.token, orgId });
    expect(card).toMatchObject({ ...ONE_MATCH, players: 4 });
    // A wicket is 20 points, more than 11 runs.
    expect(card!.top!.displayName).toBe("Chitra Three");
    expect((await t.query(internal.stats.checkTotals, { orgId })).mismatches).toEqual([]);
    expect((await t.query(internal.stats.checkTotals, {})).mismatches).toEqual([]);
  });

  test("a restamp and an undo never count twice", async () => {
    const t = newTest();
    const { a1, orgId, matchId } = await played(t);
    await t.mutation(internal.stats.backfillStamps, { orgId });
    await t.mutation(internal.stats.backfillStamps, { orgId });
    expect(await site(t)).toEqual(ONE_MATCH);

    // Undo the last ball: the match is live again and leaves the counters.
    await t.mutation(api.scoring.undoLastBall, { token: a1.token, matchId });
    expect(await site(t)).toEqual(NONE);
    await t.mutation(api.scoring.recordBall, { token: a1.token, matchId, runsBat: 6 });
    expect(await site(t)).toEqual({ ...ONE_MATCH, runs: 17, sixes: 2 });
    expect((await t.query(internal.stats.checkTotals, { orgId })).mismatches).toEqual([]);
  });

  test("practice matches and sandboxes stay out", async () => {
    const t = newTest();
    const { a1, a2, b1, b2, orgId, matchId } = await played(t);
    await t.mutation(internal.maintenance.markPractice, { matchIds: [matchId], practice: true });
    expect(await site(t)).toEqual(NONE);
    await t.mutation(internal.maintenance.markPractice, { matchIds: [matchId], practice: false });
    expect(await site(t)).toEqual(ONE_MATCH);

    const { orgId: sandboxId } = await t.mutation(api.orgs.enterSandbox, { token: a1.token, orgId });
    await playMatch(
      t,
      a1,
      sandboxId,
      [a1, a2],
      [b1, b2],
      { striker: a1, other: a2, bowler: b1, balls: balls(6, 6, 6, 6, 6, 6) },
      { striker: b1, other: b2, bowler: a2, balls: balls(0, 0, 0, 0, 0, 0) },
    );
    expect(await site(t)).toEqual(ONE_MATCH);
  });

  test("closing takes a community off the site counter but keeps its card", async () => {
    const t = newTest();
    const { orgId } = await played(t);
    const owner = await person(t, "Owner");
    await makeOwner(t, owner);
    await t.mutation(admin(), { token: owner.token, orgId, closed: true });
    expect(await site(t)).toEqual(NONE);
    expect((await t.query(internal.stats.checkTotals, {})).mismatches).toEqual([]);
    const card = await t.query(api.stats.communityCard, { token: owner.token, orgId });
    expect(card).toMatchObject(ONE_MATCH);
    await t.mutation(admin(), { token: owner.token, orgId, closed: false });
    expect(await site(t)).toEqual(ONE_MATCH);
  });

  test("the backfill fills stamps from before the counters, once", async () => {
    const t = newTest();
    const { orgId } = await played(t);
    // As prod stands before the release: stamps without totals, no rows.
    await t.run(async (ctx) => {
      for (const r of await ctx.db.query("matchStats").collect()) {
        await ctx.db.patch(r._id, { totals: undefined });
      }
      for (const r of await ctx.db.query("communityTotals").collect()) await ctx.db.delete(r._id);
      for (const r of await ctx.db.query("siteTotals").collect()) await ctx.db.delete(r._id);
    });
    expect((await t.query(internal.stats.checkTotals, { orgId })).mismatches).not.toEqual([]);

    const dry = await t.mutation(internal.stats.backfillTotals, { orgId, dryRun: true });
    expect(dry.filled).toBe(1);
    expect(await site(t)).toEqual(NONE);

    await t.mutation(internal.stats.backfillTotals, { orgId });
    await t.mutation(internal.stats.backfillTotals, { orgId });
    expect(await site(t)).toEqual(ONE_MATCH);
    expect((await t.query(internal.stats.checkTotals, { orgId })).mismatches).toEqual([]);
    expect((await t.query(internal.stats.checkTotals, {})).mismatches).toEqual([]);
  });

  test("the public counter returns six numbers and no names", async () => {
    const t = newTest();
    await played(t);
    const out = await site(t);
    expect(Object.keys(out).sort()).toEqual(
      ["catches", "fours", "matches", "runs", "sixes", "wickets"],
    );
  });
});
