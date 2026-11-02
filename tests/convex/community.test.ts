import { describe, expect, test } from "vitest";
import type { Id } from "../../convex/_generated/dataModel";
import { api, community, newTest, person, type Ball, type Person, type T } from "./fixtures";

type Inn = { striker: Person; other: Person; bowler: Person; balls: Ball[] };

/** Plays a 1-over match to the end. Dots fill each innings. */
async function play(t: T, scorer: Person, orgId: Id<"orgs">, a: Person[], b: Person[], innings: Inn[]) {
  const token = scorer.token;
  const made = await t.mutation(api.matches.create, {
    token,
    orgId,
    sideAPlayerIds: a.map((p) => p.userId),
    sideBPlayerIds: b.map((p) => p.userId),
    overs: 1,
  });
  const matchId = ((made as { matchId?: Id<"matches"> }).matchId ?? made) as Id<"matches">;
  await t.mutation(api.scoring.setBattingFirst, { token, matchId, side: "A" });
  await scoreInnings(t, token, matchId, innings);
  return matchId;
}

async function scoreInnings(t: T, token: string, matchId: Id<"matches">, innings: Inn[]) {
  const open = () =>
    t.run(async (ctx) => {
      const rows = await ctx.db
        .query("innings")
        .withIndex("by_match", (q) => q.eq("matchId", matchId))
        .collect();
      return rows.some((r) => r.status === "in_progress");
    });
  for (const inn of innings) {
    await t.mutation(api.scoring.startInnings, {
      token,
      matchId,
      strikerId: inn.striker.userId,
      nonStrikerId: inn.other.userId,
      openingBowlerId: inn.bowler.userId,
    });
    const bowl = (b: Ball) =>
      t.mutation(api.scoring.recordBall, {
        token,
        matchId,
        runsBat: b.runsBat ?? 0,
        ...(b.out ? { isWicket: true, wicketType: b.wicketType ?? "bowled", playerOutId: b.out } : {}),
      });
    for (const b of inn.balls) await bowl(b);
    while (await open()) await bowl({ runsBat: 0 });
  }
}

const runs = (...xs: number[]): Ball[] => xs.map((runsBat) => ({ runsBat }));

async function setup() {
  const t = newTest();
  const admin = await person(t, "Asha");
  const a2 = await person(t, "Bala");
  const b1 = await person(t, "Chitra");
  const j1 = await person(t, "Dev");
  const orgId = await community(t, admin, [a2, b1, j1], { [String(j1.userId)]: ["junior"] });
  return { t, admin, a2, b1, j1, orgId };
}

const flip = (t: T, who: Person, orgId: Id<"orgs">, key: string, on: boolean) =>
  t.mutation(api.orgs.setFeature, { token: who.token, orgId, key, on });

const membership = async (t: T, who: Person, orgId: Id<"orgs">) => {
  const boot = await t.query(api.auth.bootstrap, { token: who.token });
  return boot!.memberships.find((m) => m.orgId === orgId)!;
};

describe("community switches", () => {
  test("new communities start with Series and The Roast on, junior board off", async () => {
    const { t, admin, orgId } = await setup();
    expect((await membership(t, admin, orgId)).features).toEqual({
      series: true,
      roast: true,
      juniorBoard: false,
      juniorRule: true,
    });
    const s = await t.query(api.orgs.settings, { token: admin.token, orgId });
    expect(s!.features).toEqual({ series: true, roast: true, juniorBoard: false, juniorRule: true });
    expect(s!.admins).toEqual(["Asha"]);
    expect(s!.juniorBoardTitle).toBe("Playground Bullies");
  });

  test("each switch off, on, off, on leaves every number the same", async () => {
    const { t, admin, a2, b1, j1, orgId } = await setup();
    const matchId = await play(t, admin, orgId, [admin, a2], [b1, j1], [
      { striker: admin, other: a2, bowler: j1, balls: runs(6, 4, 1) },
      { striker: b1, other: j1, bowler: admin, balls: [{ out: b1.userId }] },
    ]);
    const snapshot = async () => ({
      board: await t.query(api.stats.leaderboard, { token: admin.token, orgId }),
      profile: await t.query(api.stats.playerStats, { token: admin.token, orgId, userId: admin.userId }),
      stamps: await t.run((ctx) =>
        ctx.db
          .query("playerMatchStats")
          .withIndex("by_org_date", (q) => q.eq("orgId", orgId))
          .collect(),
      ),
      match: await t.run((ctx) => ctx.db.get(matchId)),
    });
    const before = await snapshot();
    for (const key of ["series", "roast", "juniorBoard"]) {
      for (const on of [false, true, false, true]) {
        await flip(t, admin, orgId, key, on);
        expect(await snapshot()).toEqual(before);
      }
    }
  });

  test("The Roast off drops roast lines from Story and the junior board; on brings them back", async () => {
    const { t, admin, a2, b1, j1, orgId } = await setup();
    await flip(t, admin, orgId, "juniorBoard", true);
    const matchId = await play(t, admin, orgId, [admin, a2], [b1, j1], [
      { striker: admin, other: a2, bowler: j1, balls: runs(6, 4, 1) },
      { striker: b1, other: j1, bowler: admin, balls: [{ out: b1.userId }] },
    ]);
    const keys = async () =>
      (await t.query(api.story.matchStory, { token: admin.token, matchId }))!.badges.map((b) => b.key);
    const board = () => t.query(api.stats.juniorBoard, { token: admin.token, orgId });

    expect(await keys()).toContain("goldenduck");
    expect(await board()).not.toBeNull();

    await flip(t, admin, orgId, "roast", false);
    expect(await keys()).not.toContain("goldenduck");
    expect(await board()).toBeNull();
    expect((await membership(t, admin, orgId)).features.roast).toBe(false);

    await flip(t, admin, orgId, "roast", true);
    expect(await keys()).toContain("goldenduck");
    expect(await board()).not.toBeNull();
  });

  test("Series off stops new series work, and a running series match still finishes", async () => {
    const { t, admin, a2, b1, j1, orgId } = await setup();
    const newSeries = () =>
      t.mutation(api.tournaments.create, {
        token: admin.token,
        orgId,
        name: "Cup",
        format: "limited",
        oversPerInnings: 1,
        sideAName: "Reds",
        sideBName: "Blues",
        sideASquadIds: [admin.userId, a2.userId],
        sideACoreIds: [admin.userId],
        sideBSquadIds: [b1.userId, j1.userId],
        sideBCoreIds: [b1.userId],
        matchCount: 3,
      });
    const { tournamentId } = await newSeries();
    const start = () =>
      t.mutation(api.tournaments.startMatch, {
        token: admin.token,
        tournamentId,
        sideAPlayerIds: [admin.userId, a2.userId],
        sideBPlayerIds: [b1.userId, j1.userId],
      });
    const { matchId } = await start();
    await t.mutation(api.scoring.setBattingFirst, { token: admin.token, matchId, side: "A" });

    await flip(t, admin, orgId, "series", false);
    await expect(newSeries()).rejects.toThrow("Series is off for this community");
    await expect(start()).rejects.toThrow("Series is off for this community");
    const friendly = await play(t, admin, orgId, [admin, a2], [b1, j1], [
      { striker: admin, other: a2, bowler: b1, balls: runs(1) },
      { striker: b1, other: j1, bowler: admin, balls: runs(1) },
    ]);
    await expect(
      t.mutation(api.tournaments.linkMatch, { token: admin.token, tournamentId, matchId: friendly }),
    ).rejects.toThrow("Series is off for this community");

    // The match that started before the switch plays to the end.
    await scoreInnings(t, admin.token, matchId, [
      { striker: admin, other: a2, bowler: b1, balls: runs(2) },
      { striker: b1, other: j1, bowler: admin, balls: runs(1) },
    ]);
    const done = await t.run((ctx) => ctx.db.get(matchId));
    expect(done!.status).toBe("completed");
    expect(done!.tournamentId).toBe(tournamentId);

    await flip(t, admin, orgId, "series", true);
    await expect(newSeries()).resolves.toBeTruthy();
  });

  test("a sandbox follows its community and refuses every setting", async () => {
    const { t, admin, orgId } = await setup();
    await flip(t, admin, orgId, "series", false);
    const { orgId: sandboxId } = await t.mutation(api.orgs.enterSandbox, { token: admin.token, orgId });
    expect((await membership(t, admin, sandboxId)).features.series).toBe(false);

    await flip(t, admin, orgId, "series", true);
    expect((await membership(t, admin, sandboxId)).features.series).toBe(true);

    await expect(flip(t, admin, sandboxId, "roast", false)).rejects.toThrow("Not in the sandbox");
    await expect(
      t.mutation(api.orgs.rename, { token: admin.token, orgId: sandboxId, name: "Other" }),
    ).rejects.toThrow("Not in the sandbox");
    await expect(
      t.mutation(api.orgs.setJuniorBoardTitle, { token: admin.token, orgId: sandboxId, title: "X" }),
    ).rejects.toThrow("Not in the sandbox");
    expect(await t.query(api.orgs.settings, { token: admin.token, orgId: sandboxId })).toBeNull();

    // Series off in the community stops series in its sandbox too.
    await flip(t, admin, orgId, "series", false);
    await expect(
      t.mutation(api.tournaments.create, {
        token: admin.token,
        orgId: sandboxId,
        name: "Cup",
        format: "limited",
        oversPerInnings: 1,
        sideAName: "Reds",
        sideBName: "Blues",
        sideASquadIds: [],
        sideACoreIds: [],
        sideBSquadIds: [],
        sideBCoreIds: [],
      }),
    ).rejects.toThrow("Series is off for this community");
  });

  test("a non-admin cannot read or change settings", async () => {
    const { t, a2, orgId } = await setup();
    await expect(flip(t, a2, orgId, "series", false)).rejects.toThrow("Admin only");
    await expect(t.mutation(api.orgs.rename, { token: a2.token, orgId, name: "Mine" })).rejects.toThrow("Admin only");
    await expect(
      t.mutation(api.orgs.setJuniorBoardTitle, { token: a2.token, orgId, title: "Mine" }),
    ).rejects.toThrow("Admin only");
    expect(await t.query(api.orgs.settings, { token: a2.token, orgId })).toBeNull();
  });

  test("setFeature refuses the junior rule and unknown keys", async () => {
    const { t, admin, orgId } = await setup();
    await expect(flip(t, admin, orgId, "juniorRule", false)).rejects.toThrow("Unknown setting");
    await expect(flip(t, admin, orgId, "nope", false)).rejects.toThrow("Unknown setting");
  });

  test("the junior board title is cleaned and saved", async () => {
    const { t, admin, orgId } = await setup();
    await t.mutation(api.orgs.setJuniorBoardTitle, { token: admin.token, orgId, title: "  Kid   Bashers " });
    expect((await t.query(api.orgs.settings, { token: admin.token, orgId }))!.juniorBoardTitle).toBe("Kid Bashers");
    await expect(
      t.mutation(api.orgs.setJuniorBoardTitle, { token: admin.token, orgId, title: "   " }),
    ).rejects.toThrow("Title cannot be empty");
  });
});

describe("rename and admins", () => {
  test("rename trims, checks length and renames the sandbox with its prefix", async () => {
    const { t, admin, orgId } = await setup();
    const { orgId: sandboxId } = await t.mutation(api.orgs.enterSandbox, { token: admin.token, orgId });
    await t.mutation(api.orgs.rename, { token: admin.token, orgId, name: "  Sunday   XI " });
    const [org, sandbox] = await t.run(async (ctx) => [await ctx.db.get(orgId), await ctx.db.get(sandboxId)]);
    expect(org!.name).toBe("Sunday XI");
    expect(sandbox!.name).toBe("SANDBOX — Sunday XI");
    await expect(t.mutation(api.orgs.rename, { token: admin.token, orgId, name: "A" })).rejects.toThrow("too short");
    await expect(
      t.mutation(api.orgs.rename, { token: admin.token, orgId, name: "x".repeat(41) }),
    ).rejects.toThrow("40 characters");
  });

  test("the last admin who can sign in keeps admin; a guest admin does not count", async () => {
    const { t, admin, a2, orgId } = await setup();
    const demote = (who: Person) =>
      t.mutation(api.orgs.setRoles, { token: admin.token, orgId, userId: who.userId, roles: ["player"] });

    await expect(demote(admin)).rejects.toThrow("A community needs one admin");

    // Old data can hold a guest with the admin tag. It does not count.
    const { userId: guestId } = await t.mutation(api.players.addGuest, { token: admin.token, orgId, name: "Guest Gary" });
    await t.run(async (ctx) => {
      const row = await ctx.db
        .query("orgMembers")
        .withIndex("by_org_user", (q) => q.eq("orgId", orgId).eq("userId", guestId))
        .unique();
      await ctx.db.patch(row!._id, { roles: ["admin", "player"] });
    });
    await expect(demote(admin)).rejects.toThrow("A community needs one admin");

    await t.mutation(api.orgs.setRoles, { token: admin.token, orgId, userId: a2.userId, roles: ["admin", "player"] });
    await expect(demote(admin)).resolves.toMatchObject({ ok: true });
  });
});

describe("Leaders format filter", () => {
  test("the board counts matches per format", async () => {
    const { t, admin, a2, b1, j1, orgId } = await setup();
    await play(t, admin, orgId, [admin, a2], [b1, j1], [
      { striker: admin, other: a2, bowler: b1, balls: runs(1) },
      { striker: b1, other: j1, bowler: admin, balls: runs(1) },
    ]);
    const board = await t.query(api.stats.leaderboard, { token: admin.token, orgId });
    expect(board!.formats).toEqual({ test: 0, limited: 1 });
  });
});

describe("admin, tags and guest names", () => {
  const makeAdmin = (t: T, by: Person, orgId: Id<"orgs">, userId: Id<"users">) =>
    t.mutation(api.orgs.setRoles, { token: by.token, orgId, userId, roles: ["admin", "player"] });
  const tag = (t: T, by: Person, orgId: Id<"orgs">, userId: Id<"users">, which: "junior" | "visitor") =>
    t.mutation(api.players.togglePlayerTag, { token: by.token, orgId, userId, tag: which });

  test("a junior, a visitor or a guest cannot be made admin", async () => {
    const { t, admin, a2, j1, orgId } = await setup();
    await expect(makeAdmin(t, admin, orgId, j1.userId)).rejects.toThrow("Only a regular player with an account");
    await tag(t, admin, orgId, a2.userId, "visitor");
    await expect(makeAdmin(t, admin, orgId, a2.userId)).rejects.toThrow("Only a regular player with an account");
    const { userId: guestId } = await t.mutation(api.players.addGuest, { token: admin.token, orgId, name: "Guest Gary" });
    await tag(t, admin, orgId, guestId, "visitor"); // guests start as Visitor; take it off
    await expect(makeAdmin(t, admin, orgId, guestId)).rejects.toThrow("Only a regular player with an account");
    await tag(t, admin, orgId, a2.userId, "visitor");
    await expect(makeAdmin(t, admin, orgId, a2.userId)).resolves.toMatchObject({ ok: true });
  });

  test("an admin cannot be tagged junior or visitor; untagging stays allowed", async () => {
    const { t, admin, a2, orgId } = await setup();
    await makeAdmin(t, admin, orgId, a2.userId);
    await expect(tag(t, admin, orgId, a2.userId, "junior")).rejects.toThrow("Remove admin first");
    await expect(tag(t, admin, orgId, a2.userId, "visitor")).rejects.toThrow("Remove admin first");
    // Old data: an admin who already has a tag can lose it.
    await t.run(async (ctx) => {
      const row = await ctx.db
        .query("orgMembers")
        .withIndex("by_org_user", (q) => q.eq("orgId", orgId).eq("userId", a2.userId))
        .unique();
      await ctx.db.patch(row!._id, { playerTags: ["junior"] });
    });
    expect((await tag(t, admin, orgId, a2.userId, "junior")).playerTags).toEqual([]);
  });

  test("the sandbox makes everyone admin, so tags work there", async () => {
    const { t, admin, a2, orgId } = await setup();
    const { orgId: sandboxId } = await t.mutation(api.orgs.enterSandbox, { token: admin.token, orgId });
    await expect(tag(t, admin, sandboxId, a2.userId, "junior")).resolves.toMatchObject({ ok: true });
    const { userId: guestId } = await t.mutation(api.players.addGuest, { token: admin.token, orgId, name: "Gary" });
    await expect(
      t.mutation(api.players.renameGuest, { token: admin.token, orgId: sandboxId, userId: guestId, name: "G" + "ary K" }),
    ).rejects.toThrow();
  });

  test("a player can be both junior and visitor", async () => {
    const { t, admin, j1, orgId } = await setup();
    const res = await tag(t, admin, orgId, j1.userId, "visitor");
    expect(res.playerTags.sort()).toEqual(["junior", "visitor"]);
  });

  test("an admin renames a guest, not a player with an account", async () => {
    const { t, admin, a2, orgId } = await setup();
    const { userId: guestId } = await t.mutation(api.players.addGuest, { token: admin.token, orgId, name: "Gary" });
    const rename = (userId: Id<"users">, name: string, by = admin) =>
      t.mutation(api.players.renameGuest, { token: by.token, orgId, userId, name });
    await rename(guestId, "  Gary   Kumar ");
    expect((await t.run((ctx) => ctx.db.get(guestId)))!.displayName).toBe("Gary Kumar");
    await expect(rename(guestId, "bala")).rejects.toThrow("already has that name");
    await expect(rename(a2.userId, "New Name")).rejects.toThrow("Only a guest");
    await expect(rename(guestId, "Mine", a2)).rejects.toThrow("Admin only");
    const players = await t.query(api.players.listOrgPlayers, { token: admin.token, orgId });
    expect(players.find((p) => p.userId === guestId)!.hasAccount).toBe(false);
    expect(players.find((p) => p.userId === a2.userId)!.hasAccount).toBe(true);
  });
});
