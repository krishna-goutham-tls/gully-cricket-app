import { describe, expect, test } from "vitest";
import { api, community, newTest, person, type T } from "./fixtures";
import type { Id } from "../../convex/_generated/dataModel";

let nextNew = 7100000000;
const newPhone = () => String((nextNew += 1));

async function setup() {
  const t = newTest();
  const admin = await person(t, "Admin One");
  const member = await person(t, "Member Two");
  const orgId = await community(t, admin, [member]);
  const { code } = await t.mutation(api.orgs.getInvite, { token: admin.token, orgId });
  return { t, admin, member, orgId, code };
}

const rowOf = (t: T, orgId: Id<"orgs">, userId: Id<"users">) =>
  t.run((ctx) =>
    ctx.db
      .query("orgMembers")
      .withIndex("by_org_user", (q) => q.eq("orgId", orgId).eq("userId", userId))
      .unique(),
  );

async function addedNoPhone(t: T, orgId: Id<"orgs">, admin: { token: string }, name: string) {
  const { userId } = await t.mutation(api.players.addGuest, { token: admin.token, orgId, name });
  return userId;
}

const userByPhone = (t: T, phone: string) =>
  t.run((ctx) =>
    ctx.db
      .query("users")
      .withIndex("by_phone", (q) => q.eq("phone", `+91${phone}`))
      .unique(),
  );

describe("invite link", () => {
  test("the code stays the same until New link, and only an admin holds it", async () => {
    const { t, admin, member, orgId, code } = await setup();
    expect(await t.mutation(api.orgs.getInvite, { token: admin.token, orgId })).toEqual({ code });
    await expect(t.mutation(api.orgs.getInvite, { token: member.token, orgId })).rejects.toThrow("Admin only");
    await expect(t.mutation(api.orgs.resetInvite, { token: member.token, orgId })).rejects.toThrow("Admin only");
  });

  test("inviteInfo gives the name and nothing else, and a bad code gives null", async () => {
    const { t, code } = await setup();
    const org = await t.query(api.orgs.inviteInfo, { code });
    expect(Object.keys(org!).sort()).toEqual(["alreadyMember", "name"]);
    expect(org!.alreadyMember).toBe(false);
    expect(await t.query(api.orgs.inviteInfo, { code: "nosuchcode" })).toBeNull();
    expect(await t.query(api.orgs.inviteInfo, { code: "" })).toBeNull();
  });

  test("a new player signs up through the link and is a member with a New mark", async () => {
    const { t, orgId, code } = await setup();
    const phone = newPhone();
    const res = await t.mutation(api.auth.signUp, { phone, pin: "1234", displayName: "Fresh Face", inviteCode: code });
    const row = await rowOf(t, orgId, res.user._id);
    expect(row!.status).toBe("active");
    expect(row!.roles).toEqual(["player"]);
    expect(row!.joinedByLinkAt).toBeGreaterThan(0);
    const boot = await t.query(api.auth.bootstrap, { token: res.token });
    expect(boot!.user.preferredOrgId).toBe(orgId);
  });

  test("a player with a PIN joins, and a wrong PIN joins nobody", async () => {
    const { t, orgId, code } = await setup();
    const other = await person(t, "Other Team");
    const row0 = await rowOf(t, orgId, other.userId);
    expect(row0).toBeNull();
    const phone = await t.run(async (ctx) => (await ctx.db.get(other.userId))!.phone!);
    await expect(
      t.mutation(api.auth.signUp, { phone, pin: "9999", displayName: "Other", inviteCode: code }),
    ).rejects.toThrow();
    expect(await rowOf(t, orgId, other.userId)).toBeNull();

    const res = await t.mutation(api.orgs.joinByInvite, { token: other.token, code });
    expect(res.alreadyMember).toBe(false);
    expect((await rowOf(t, orgId, other.userId))!.status).toBe("active");
  });

  test("a member opening their own link changes nothing", async () => {
    const { t, admin, orgId, code } = await setup();
    const before = await rowOf(t, orgId, admin.userId);
    const res = await t.mutation(api.orgs.joinByInvite, { token: admin.token, code });
    expect(res.alreadyMember).toBe(true);
    expect(await rowOf(t, orgId, admin.userId)).toEqual(before);
    expect((await t.query(api.orgs.inviteInfo, { code, token: admin.token }))!.alreadyMember).toBe(true);
  });

  test("a player waiting on an old approval comes in through the link", async () => {
    const { t, orgId, code } = await setup();
    const other = await person(t, "Waiting Long");
    await t.mutation(api.orgs.requestJoin, { token: other.token, orgId });
    await t.mutation(api.orgs.joinByInvite, { token: other.token, code });
    expect((await rowOf(t, orgId, other.userId))!.status).toBe("active");
  });

  test("New link stops the old code and people who joined stay", async () => {
    const { t, admin, orgId, code } = await setup();
    const joined = await t.mutation(api.auth.signUp, { phone: newPhone(), pin: "1234", displayName: "Early Bird", inviteCode: code });
    const { code: next } = await t.mutation(api.orgs.resetInvite, { token: admin.token, orgId });
    expect(next).not.toBe(code);
    expect(await t.query(api.orgs.inviteInfo, { code })).toBeNull();
    await expect(
      t.mutation(api.auth.signUp, { phone: newPhone(), pin: "1234", displayName: "Late Bird", inviteCode: code }),
    ).rejects.toThrow("stopped working");
    const other = await person(t, "Other Late");
    await expect(t.mutation(api.orgs.joinByInvite, { token: other.token, code })).rejects.toThrow("stopped working");
    expect((await rowOf(t, orgId, joined.user._id))!.status).toBe("active");
    expect(await t.query(api.orgs.inviteInfo, { code: next })).not.toBeNull();
  });

  test("a bad code makes no account", async () => {
    const { t } = await setup();
    const phone = newPhone();
    await expect(
      t.mutation(api.auth.signUp, { phone, pin: "1234", displayName: "No Code", inviteCode: "wrongcode" }),
    ).rejects.toThrow("stopped working");
    expect(await userByPhone(t, phone)).toBeNull();
  });

  test("two people with one name stay apart", async () => {
    const { t, code } = await setup();
    const res = await t.mutation(api.auth.signUp, { phone: newPhone(), pin: "1234", displayName: "Member Two", inviteCode: code });
    expect(res.user.displayName).toBe("Member Two (2)");
  });

  test("an added player with a phone claims through the link and keeps the row", async () => {
    const { t, admin, orgId, code } = await setup();
    const phone = newPhone();
    const { userId } = await t.mutation(api.players.addGuest, { token: admin.token, orgId, name: "Has Phone", phone });
    const res = await t.mutation(api.auth.signUp, { phone, pin: "1234", displayName: "Has Phone", inviteCode: code });
    expect(res.user._id).toBe(userId);
    expect(res.claimed).toBe(true);
    expect((await rowOf(t, orgId, userId))!.joinedByLinkAt).toBeGreaterThan(0);
  });
});

describe("Is this you?", () => {
  test("a name match shows, and no match shows nothing", async () => {
    const { t, admin, orgId, code } = await setup();
    const asha = await addedNoPhone(t, orgId, admin, "Asha Rao");
    const found = await t.query(api.orgs.inviteNameMatches, { code, name: "asha k" });
    expect(found).toEqual([{ userId: asha, displayName: "Asha Rao" }]);
    expect(await t.query(api.orgs.inviteNameMatches, { code, name: "Zubin" })).toEqual([]);
    expect(await t.query(api.orgs.inviteNameMatches, { code: "bad", name: "Asha" })).toEqual([]);
    // Accounts never match, so nobody can take a real player's row.
    expect(await t.query(api.orgs.inviteNameMatches, { code, name: "Member" })).toEqual([]);
  });

  test("Yes keeps the old row and its visitor tag, and marks it New", async () => {
    const { t, admin, orgId, code } = await setup();
    const asha = await addedNoPhone(t, orgId, admin, "Asha Rao");
    const phone = newPhone();
    const res = await t.mutation(api.auth.signUp, { phone, pin: "1234", displayName: "Asha", inviteCode: code, claimUserId: asha });
    expect(res.user._id).toBe(asha);
    const u = await userByPhone(t, phone);
    expect(u!._id).toBe(asha);
    expect(u!.isGuest).toBe(false);
    const row = await rowOf(t, orgId, asha);
    expect(row!.playerTags).toContain("visitor");
    expect(row!.joinedByLinkAt).toBeGreaterThan(0);
    await expect(
      t.mutation(api.auth.signIn, { phone, pin: "1234" }),
    ).resolves.toBeTruthy();
  });

  test("No makes a second person and leaves the old row alone", async () => {
    const { t, admin, orgId, code } = await setup();
    const asha = await addedNoPhone(t, orgId, admin, "Asha Rao");
    const res = await t.mutation(api.auth.signUp, { phone: newPhone(), pin: "1234", displayName: "Asha", inviteCode: code });
    expect(res.user._id).not.toBe(asha);
    const old = await t.run((ctx) => ctx.db.get(asha));
    expect(old!.phone).toBeUndefined();
    expect(old!.isGuest).toBe(true);
  });

  test("a claim needs a real match in this community", async () => {
    const { t, admin, member, orgId, code } = await setup();
    const asha = await addedNoPhone(t, orgId, admin, "Asha Rao");
    const sign = (claimUserId: Id<"users">, displayName: string, inviteCode?: string) =>
      t.mutation(api.auth.signUp, { phone: newPhone(), pin: "1234", displayName, inviteCode, claimUserId });
    await expect(sign(asha, "Zubin", code)).rejects.toThrow("Could not claim");
    await expect(sign(member.userId, "Member", code)).rejects.toThrow("Could not claim");
    await expect(sign(asha, "Asha")).rejects.toThrow("Could not claim");

    const otherAdmin = await person(t, "Far Admin");
    const farOrg = await community(t, otherAdmin, []);
    const far = await addedNoPhone(t, farOrg, otherAdmin, "Asha Far");
    await expect(sign(far, "Asha", code)).rejects.toThrow("Could not claim");
    const boss = await addedNoPhone(t, orgId, admin, "Boss Added");
    await t.mutation(api.orgs.setRoles, { token: admin.token, orgId, userId: boss, roles: ["admin", "player"] });
    await expect(sign(boss, "Boss", code)).rejects.toThrow("Could not claim");
    expect(await t.query(api.orgs.inviteNameMatches, { code, name: "Boss" })).toEqual([]);
  });

  test("a removed added player gets their stats back from the link", async () => {
    const { t, admin, orgId, code } = await setup();
    const asha = await addedNoPhone(t, orgId, admin, "Asha Rao");
    await t.mutation(api.orgs.removeMember, { token: admin.token, orgId, userId: asha });
    expect(await t.query(api.orgs.inviteNameMatches, { code, name: "Asha" })).toHaveLength(1);
    const res = await t.mutation(api.auth.signUp, { phone: newPhone(), pin: "1234", displayName: "Asha", inviteCode: code, claimUserId: asha });
    expect(res.user._id).toBe(asha);
    expect((await rowOf(t, orgId, asha))!.status).toBe("active");
  });
});

describe("remove from community", () => {
  test("a removed member loses access, keeps the history row and can rejoin as a player", async () => {
    const { t, admin, member, orgId, code } = await setup();
    await t.mutation(api.orgs.removeMember, { token: admin.token, orgId, userId: member.userId });
    expect((await rowOf(t, orgId, member.userId))!.status).toBe("removed");
    expect(await t.query(api.players.listOrgPlayers, { token: member.token, orgId })).toEqual([]);
    const names = (await t.query(api.players.listOrgPlayers, { token: admin.token, orgId })).map((p) => p.displayName);
    expect(names).not.toContain("Member Two");

    const res = await t.mutation(api.orgs.joinByInvite, { token: member.token, code });
    expect(res.alreadyMember).toBe(false);
    const row = await rowOf(t, orgId, member.userId);
    expect(row!.status).toBe("active");
    expect(row!.roles).toEqual(["player"]);
  });

  test("a removed admin does not come back as admin", async () => {
    const { t, admin, member, orgId, code } = await setup();
    await t.mutation(api.orgs.setRoles, { token: admin.token, orgId, userId: member.userId, roles: ["admin", "player"] });
    await t.mutation(api.orgs.removeMember, { token: admin.token, orgId, userId: member.userId });
    await t.mutation(api.orgs.joinByInvite, { token: member.token, code });
    expect((await rowOf(t, orgId, member.userId))!.roles).toEqual(["player"]);
  });

  test("the last admin cannot remove themselves, and neither can any admin", async () => {
    const { t, admin, orgId } = await setup();
    await expect(
      t.mutation(api.orgs.removeMember, { token: admin.token, orgId, userId: admin.userId }),
    ).rejects.toThrow("yourself");
    expect((await rowOf(t, orgId, admin.userId))!.status).toBe("active");
  });

  test("a player cannot call admin actions", async () => {
    const { t, admin, member, orgId } = await setup();
    await expect(
      t.mutation(api.orgs.removeMember, { token: member.token, orgId, userId: admin.userId }),
    ).rejects.toThrow("Admin only");
    const outsider = await person(t, "Out Sider");
    await expect(
      t.mutation(api.orgs.removeMember, { token: outsider.token, orgId, userId: member.userId }),
    ).rejects.toThrow("Not an active member");
  });

  test("a sandbox refuses all of it, and removal reaches the sandbox and back", async () => {
    const { t, admin, member, orgId, code } = await setup();
    const { orgId: sandboxId } = await t.mutation(api.orgs.enterSandbox, { token: admin.token, orgId });
    for (const call of [
      t.mutation(api.orgs.getInvite, { token: admin.token, orgId: sandboxId }),
      t.mutation(api.orgs.resetInvite, { token: admin.token, orgId: sandboxId }),
      t.mutation(api.orgs.removeMember, { token: admin.token, orgId: sandboxId, userId: member.userId }),
    ]) {
      await expect(call).rejects.toThrow("sandbox");
    }
    await t.run((ctx) => ctx.db.patch(sandboxId, { inviteCode: "sandboxcode" }));
    expect(await t.query(api.orgs.inviteInfo, { code: "sandboxcode" })).toBeNull();
    await expect(t.mutation(api.orgs.joinByInvite, { token: member.token, code: "sandboxcode" })).rejects.toThrow("stopped");

    await t.mutation(api.orgs.removeMember, { token: admin.token, orgId, userId: member.userId });
    expect((await rowOf(t, sandboxId, member.userId))!.status).toBe("removed");
    await t.mutation(api.orgs.joinByInvite, { token: member.token, code });
    await t.mutation(api.orgs.enterSandbox, { token: member.token, orgId });
    expect((await rowOf(t, sandboxId, member.userId))!.status).toBe("active");
  });

  test("a removed player's PIN requests leave the admin's list", async () => {
    const { t, admin, member, orgId } = await setup();
    const phone = await t.run(async (ctx) => (await ctx.db.get(member.userId))!.phone!);
    await t.mutation(api.auth.requestPinReset, { phone });
    expect(await t.query(api.auth.listPinResets, { token: admin.token, orgId })).toHaveLength(1);
    await t.mutation(api.orgs.removeMember, { token: admin.token, orgId, userId: member.userId });
    expect(await t.query(api.auth.listPinResets, { token: admin.token, orgId })).toEqual([]);
  });

  test("an admin brings a removed player back, and a player cannot", async () => {
    const { t, admin, member, orgId } = await setup();
    const phone = newPhone();
    const { userId } = await t.mutation(api.players.addGuest, { token: admin.token, orgId, name: "Back Again", phone });
    await t.mutation(api.orgs.removeMember, { token: admin.token, orgId, userId });
    await expect(
      t.mutation(api.players.addGuest, { token: member.token, orgId, name: "Anything", phone }),
    ).rejects.toThrow("already belongs");
    expect((await rowOf(t, orgId, userId))!.status).toBe("removed");
    const res = await t.mutation(api.players.addGuest, { token: admin.token, orgId, name: "Anything", phone });
    expect(res.userId).toBe(userId);
    expect((await rowOf(t, orgId, userId))!.status).toBe("active");
  });

  test("adding a removed name with no phone gives the same player, for an admin only", async () => {
    const { t, admin, member, orgId } = await setup();
    const asha = await addedNoPhone(t, orgId, admin, "Asha Rao");
    await t.mutation(api.orgs.removeMember, { token: admin.token, orgId, userId: asha });
    const byMember = await t.mutation(api.players.addGuest, { token: member.token, orgId, name: "asha rao" });
    expect(byMember.userId).not.toBe(asha);
    await t.mutation(api.orgs.removeMember, { token: admin.token, orgId, userId: byMember.userId });
    const byAdmin = await t.mutation(api.players.addGuest, { token: admin.token, orgId, name: "Asha Rao" });
    expect([asha, byMember.userId]).toContain(byAdmin.userId);
  });

  test("a removed member who forgot their PIN can still ask, and a handed-out temp PIN survives", async () => {
    const { t, admin, member, orgId } = await setup();
    const phone = await t.run(async (ctx) => (await ctx.db.get(member.userId))!.phone!);
    await t.mutation(api.auth.requestPinReset, { phone });
    const [row] = await t.query(api.auth.listPinResets, { token: admin.token, orgId });
    await t.mutation(api.auth.approvePinReset, { token: admin.token, resetId: row.resetId });
    await t.mutation(api.orgs.removeMember, { token: admin.token, orgId, userId: member.userId });
    const [kept] = await t.query(api.auth.listPinResets, { token: admin.token, orgId });
    expect(kept.tempPin).toBeTruthy();

    const other = await person(t, "Far Away");
    const otherOrg = await community(t, admin, [other]);
    const otherPhone = await t.run(async (ctx) => (await ctx.db.get(other.userId))!.phone!);
    await t.mutation(api.orgs.removeMember, { token: admin.token, orgId: otherOrg, userId: other.userId });
    await expect(t.mutation(api.auth.requestPinReset, { phone: otherPhone })).resolves.toMatchObject({ alreadyPending: false });
  });
});
