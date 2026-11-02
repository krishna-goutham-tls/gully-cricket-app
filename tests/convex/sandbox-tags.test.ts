import { describe, expect, test } from "vitest";
import { internal } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { api, community, newTest, person } from "./fixtures";

describe("tags stay put", () => {
  test("a sandbox copies each player's tags, and the one-time pass fills old rows", async () => {
    const t = newTest();
    const admin = await person(t, "Asha");
    const junior = await person(t, "Dev");
    const orgId = await community(t, admin, [junior], { [String(junior.userId)]: ["junior"] });
    const { userId: guestId } = await t.mutation(api.players.addGuest, { token: admin.token, orgId, name: "Gary" });

    const { orgId: sandboxId } = await t.mutation(api.orgs.enterSandbox, { token: admin.token, orgId });
    const tagsIn = async (org: Id<"orgs">) =>
      new Map(
        (await t.query(api.players.listOrgPlayers, { token: admin.token, orgId: org })).map((p) => [
          String(p.userId),
          p.playerTags,
        ]),
      );
    let sandbox = await tagsIn(sandboxId);
    expect(sandbox.get(String(guestId))).toEqual([]);
    expect(sandbox.get(String(junior.userId))).toEqual(["junior"]);
    expect(sandbox.get(String(admin.userId))).toEqual([]);

    // A row from before the copy: no tags at all, so the guest read as a Visitor.
    const sandboxRow = await t.run(async (ctx) => {
      const row = await ctx.db
        .query("orgMembers")
        .withIndex("by_org_user", (q) => q.eq("orgId", sandboxId).eq("userId", guestId))
        .unique();
      await ctx.db.patch(row!._id, { playerTags: undefined });
      return row!._id;
    });
    expect((await tagsIn(sandboxId)).get(String(guestId))).toEqual(["visitor"]);

    expect(await t.mutation(internal.maintenance.copySandboxTags, {})).toMatchObject({ copied: 1 });
    expect((await t.run((ctx) => ctx.db.get(sandboxRow)))!.playerTags).toEqual([]);
    expect(await t.mutation(internal.maintenance.copySandboxTags, {})).toMatchObject({ copied: 0 });

    // Entering again fills a row with no tags too.
    await t.run((ctx) => ctx.db.patch(sandboxRow, { playerTags: undefined }));
    await t.mutation(api.orgs.enterSandbox, { token: admin.token, orgId });
    sandbox = await tagsIn(sandboxId);
    expect(sandbox.get(String(guestId))).toEqual([]);
  });

  test("setting a guest's PIN keeps the tags it had", async () => {
    const t = newTest();
    const admin = await person(t, "Asha");
    const orgId = await community(t, admin, []);
    const guestId = await t.run(async (ctx) => {
      const id = await ctx.db.insert("users", {
        phone: "+917099999901",
        displayName: "Old Guest",
        isGuest: true,
        failedPinAttempts: 0,
        createdAt: 0,
        updatedAt: 0,
      });
      // An old row: never written, so it reads as a Visitor.
      await ctx.db.insert("orgMembers", {
        orgId,
        userId: id,
        status: "active",
        roles: ["player"],
        requestedAt: 0,
      });
      return id;
    });
    await t.mutation(internal.admin.setPin, { phone: "7099999901", pin: "1234" });
    const row = await t.run((ctx) =>
      ctx.db
        .query("orgMembers")
        .withIndex("by_org_user", (q) => q.eq("orgId", orgId).eq("userId", guestId))
        .unique(),
    );
    expect(row!.playerTags).toEqual(["visitor"]);
  });
});
