import { describe, expect, test } from "vitest";
import type { Id } from "../../convex/_generated/dataModel";
import { api, community, newTest, person, playMatch, type Person, type T } from "./fixtures";

const balls = (runs: number[]) => runs.map((runsBat) => ({ runsBat }));

const rowOf = (t: T, orgId: Id<"orgs">, userId: Id<"users">) =>
  t.run((ctx) =>
    ctx.db
      .query("orgMembers")
      .withIndex("by_org_user", (q) => q.eq("orgId", orgId).eq("userId", userId))
      .unique(),
  );

let nextNew = 7200000000;
const newPhone = () => String((nextNew += 1));

async function setup() {
  const t = newTest();
  const admin = await person(t, "Asha");
  const mate = await person(t, "Bala");
  const orgId = await community(t, admin, [mate]);
  const { code } = await t.mutation(api.orgs.getInvite, { token: admin.token, orgId });
  return { t, admin, mate, orgId, code };
}

describe("no Visitor tag by default", () => {
  test("a player added by name has no tag", async () => {
    const { t, admin, orgId } = await setup();
    const { userId } = await t.mutation(api.players.addGuest, { token: admin.token, orgId, name: "Gary" });
    expect((await rowOf(t, orgId, userId))!.playerTags).toEqual([]);
    const players = await t.query(api.players.listOrgPlayers, { token: admin.token, orgId });
    expect(players.find((p) => p.userId === userId)!.playerTags).toEqual([]);
  });

  test("claiming an account adds no tag and keeps the tags it had", async () => {
    const { t, admin, orgId, code } = await setup();
    const claim = (claimUserId: Id<"users">, displayName: string) =>
      t.mutation(api.auth.signUp, { phone: newPhone(), pin: "1234", displayName, inviteCode: code, claimUserId });

    const { userId: plain } = await t.mutation(api.players.addGuest, { token: admin.token, orgId, name: "Plain Pat" });
    await claim(plain, "Plain Pat");
    expect((await rowOf(t, orgId, plain))!.playerTags).toEqual([]);

    const { userId: kid } = await t.mutation(api.players.addGuest, { token: admin.token, orgId, name: "Kid Kiran" });
    await t.mutation(api.players.togglePlayerTag, { token: admin.token, orgId, userId: kid, tag: "junior" });
    await claim(kid, "Kid Kiran");
    expect((await rowOf(t, orgId, kid))!.playerTags).toEqual(["junior"]);

    // An old guest row with no tags written reads as Visitor. It stays one.
    const { userId: old } = await t.mutation(api.players.addGuest, { token: admin.token, orgId, name: "Old Omar" });
    const row = (await rowOf(t, orgId, old))!;
    await t.run((ctx) => ctx.db.patch(row._id, { playerTags: undefined }));
    await claim(old, "Old Omar");
    expect((await rowOf(t, orgId, old))!.playerTags).toEqual(["visitor"]);
  });
});

describe("Show visitors on Leaders", () => {
  async function league() {
    const t = newTest();
    const admin = await person(t, "Asha");
    const mate = await person(t, "Bala");
    const vis = await person(t, "Vimal");
    const other = await person(t, "Other");
    const orgId = await community(t, admin, [mate, vis, other], {
      [String(vis.userId)]: ["visitor"],
    });
    await playMatch(
      t,
      admin,
      orgId,
      [admin, vis],
      [mate, other],
      { striker: vis, other: admin, bowler: mate, balls: balls([4, 4, 1, 0, 0, 0]) },
      { striker: mate, other, bowler: vis, balls: balls([1, 1, 0, 0, 0, 0]) },
    );
    return { t, admin, mate, vis, orgId };
  }

  const names = async (t: T, who: Person, orgId: Id<"orgs">) => {
    const board = (await t.query(api.stats.leaderboard, { token: who.token, orgId }))!;
    return {
      on: board.includeVisitorsAndJuniors,
      batting: board.batting.map((r) => r.displayName),
      bowling: board.bowling.map((r) => r.displayName),
    };
  };

  test("off by default hides a tagged visitor; on shows them; any member sees it", async () => {
    const { t, admin, mate, orgId } = await league();
    const off = await names(t, mate, orgId);
    expect(off.on).toBe(false);
    expect(off.batting).not.toContain("Vimal");
    expect(off.bowling).not.toContain("Vimal");

    await t.mutation(api.orgs.setFeature, { token: admin.token, orgId, key: "visitorsOnLeaders", on: true });
    const on = await names(t, mate, orgId);
    expect(on.on).toBe(true);
    expect(on.batting).toContain("Vimal");
    expect(on.bowling).toContain("Vimal");

    await t.mutation(api.orgs.setFeature, { token: admin.token, orgId, key: "visitorsOnLeaders", on: false });
    expect((await names(t, mate, orgId)).batting).not.toContain("Vimal");
  });

  test("auto-form teams and season caps pass their own value and ignore the setting", async () => {
    const { t, admin, orgId } = await league();
    await t.mutation(api.orgs.setFeature, { token: admin.token, orgId, key: "visitorsOnLeaders", on: true });
    const regulars = await t.query(api.stats.leaderboard, {
      token: admin.token,
      orgId,
      includeVisitorsAndJuniors: false,
    });
    expect(regulars!.batting.map((r) => r.displayName)).not.toContain("Vimal");
    await t.mutation(api.orgs.setFeature, { token: admin.token, orgId, key: "visitorsOnLeaders", on: false });
    const everyone = await t.query(api.stats.leaderboard, {
      token: admin.token,
      orgId,
      includeVisitorsAndJuniors: true,
    });
    expect(everyone!.batting.map((r) => r.displayName)).toContain("Vimal");
  });

  test("a non-admin cannot flip it", async () => {
    const { t, mate, orgId } = await league();
    await expect(
      t.mutation(api.orgs.setFeature, { token: mate.token, orgId, key: "visitorsOnLeaders", on: true }),
    ).rejects.toThrow("Admin only");
  });
});
