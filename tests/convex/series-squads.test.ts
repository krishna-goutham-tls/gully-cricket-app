import { describe, expect, test } from "vitest";
import type { Id } from "../../convex/_generated/dataModel";
import { api, community, newTest, person, type Person, type T } from "./fixtures";

async function setup() {
  const t = newTest();
  const admin = await person(t, "Asha Rao");
  const a2 = await person(t, "Bala Iyer");
  const b1 = await person(t, "Chitra Nair");
  const b2 = await person(t, "Dev Shah");
  const orgId = await community(t, admin, [a2, b1, b2]);
  await t.mutation(api.orgs.setFeature, { token: admin.token, orgId, key: "series", on: true });
  return { t, admin, a2, b1, b2, orgId };
}

function create(
  t: T,
  who: Person,
  orgId: Id<"orgs">,
  a: Person[],
  b: Person[],
  extra: Record<string, unknown> = {},
) {
  return t.mutation(api.tournaments.create, {
    token: who.token,
    orgId,
    name: "Cup",
    format: "limited",
    oversPerInnings: 5,
    sideAName: "Team Asha",
    sideBName: "Blues",
    sideASquadIds: a.map((p) => p.userId),
    sideBSquadIds: b.map((p) => p.userId),
    ...extra,
  });
}

describe("series squads", () => {
  test("a new series needs no core players, and old clients that send them still work", async () => {
    const { t, admin, a2, b1, b2, orgId } = await setup();
    const { tournamentId } = await create(t, admin, orgId, [admin, a2], [b1, b2]);
    const stored = await t.run((ctx) => ctx.db.get(tournamentId));
    expect(stored!.sideACoreIds).toEqual([]);
    expect(stored!.sideBCoreIds).toEqual([]);

    const old = await create(t, admin, orgId, [admin, a2], [b1, b2], {
      sideACoreIds: [admin.userId],
      sideBCoreIds: [],
    });
    const got = await t.query(api.tournaments.get, { token: admin.token, tournamentId: old.tournamentId });
    expect(got!.sideA.find((p) => p.userId === admin.userId)!.isCore).toBe(true);

    await expect(
      create(t, admin, orgId, [admin, a2], [b1, b2], { sideACoreIds: [b1.userId] }),
    ).rejects.toThrow("Core players must be part of their squad");
  });

  test("an admin changes a captain on the series page; the name follows unless typed", async () => {
    const { t, admin, a2, b1, b2, orgId } = await setup();
    const { tournamentId } = await create(t, admin, orgId, [admin, a2], [b1, b2]);

    await t.mutation(api.tournaments.setCaptain, { token: admin.token, tournamentId, side: "A", userId: a2.userId });
    await t.mutation(api.tournaments.setCaptain, { token: admin.token, tournamentId, side: "B", userId: b2.userId });
    const got = await t.query(api.tournaments.get, { token: admin.token, tournamentId });
    expect(got!.sideA.map((p) => p.userId)).toEqual([a2.userId, admin.userId]);
    expect(got!.sideAName).toBe("Team Bala");
    expect(got!.sideB.map((p) => p.userId)).toEqual([b2.userId, b1.userId]);
    expect(got!.sideBName).toBe("Blues");
  });

  test("a captain must come from that team, and only an admin can change one", async () => {
    const { t, admin, a2, b1, b2, orgId } = await setup();
    const { tournamentId } = await create(t, admin, orgId, [admin, a2], [b1, b2]);
    await expect(
      t.mutation(api.tournaments.setCaptain, { token: admin.token, tournamentId, side: "A", userId: b1.userId }),
    ).rejects.toThrow("Pick a player from that team");
    await expect(
      t.mutation(api.tournaments.setCaptain, { token: a2.token, tournamentId, side: "A", userId: a2.userId }),
    ).rejects.toThrow();

    const both = await create(t, admin, orgId, [admin, a2, b2], [b1, b2]);
    await expect(
      t.mutation(api.tournaments.setCaptain, {
        token: admin.token,
        tournamentId: both.tournamentId,
        side: "A",
        userId: b2.userId,
      }),
    ).rejects.toThrow("A player on both teams cannot lead one");
  });

  test("a completed series keeps its captains", async () => {
    const { t, admin, a2, b1, b2, orgId } = await setup();
    const { tournamentId } = await create(t, admin, orgId, [admin, a2], [b1, b2]);
    await t.mutation(api.tournaments.setWinner, { token: admin.token, tournamentId, winnerSide: "A" });
    await expect(
      t.mutation(api.tournaments.setCaptain, { token: admin.token, tournamentId, side: "A", userId: a2.userId }),
    ).rejects.toThrow("This series is over");
    const got = await t.query(api.tournaments.get, { token: admin.token, tournamentId });
    expect(got!.sideA[0].userId).toBe(admin.userId);
  });
});
