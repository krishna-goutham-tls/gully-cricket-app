import { describe, expect, test } from "vitest";
import { internal } from "../../convex/_generated/api";
import { api, community, newTest, person } from "./fixtures";

describe("pinFeatureDefaults", () => {
  test("keeps Series and Test matches on where a community used them, and never overwrites", async () => {
    const t = newTest();
    const asha = await person(t, "Asha");
    const bala = await person(t, "Bala");
    const chitra = await person(t, "Chitra");
    const dev = await person(t, "Dev");

    // Played a series and a Test.
    const sonesta = await community(t, asha, [bala, chitra, dev]);
    await t.mutation(api.orgs.setFeature, { token: asha.token, orgId: sonesta, key: "series", on: true });
    await t.mutation(api.tournaments.create, {
      token: asha.token,
      orgId: sonesta,
      name: "Cup",
      format: "limited",
      oversPerInnings: 1,
      sideAName: "Reds",
      sideBName: "Blues",
      sideASquadIds: [asha.userId, bala.userId],
      sideACoreIds: [asha.userId],
      sideBSquadIds: [chitra.userId, dev.userId],
      sideBCoreIds: [chitra.userId],
      matchCount: 3,
    });
    // `series` was stored by the switch above; drop it to look like an old community.
    await t.run(async (ctx) => {
      await ctx.db.patch(sonesta, { features: undefined });
    });
    await t.mutation(api.matches.create, {
      token: asha.token,
      orgId: sonesta,
      sideAPlayerIds: [asha.userId, bala.userId],
      sideBPlayerIds: [chitra.userId, dev.userId],
      overs: 10,
      format: "test",
      durationMinutes: 90,
    });

    // Only friendlies, and an admin already turned Series on by hand.
    const office = await community(t, chitra, [asha, bala, dev]);
    await t.mutation(api.orgs.setFeature, { token: chitra.token, orgId: office, key: "series", on: true });
    await t.mutation(api.matches.create, {
      token: chitra.token,
      orgId: office,
      sideAPlayerIds: [chitra.userId, asha.userId],
      sideBPlayerIds: [bala.userId, dev.userId],
      overs: 5,
    });
    const { orgId: sandbox } = await t.mutation(api.orgs.enterSandbox, { token: chitra.token, orgId: office });

    const first = await t.mutation(internal.maintenance.pinFeatureDefaults, {});
    const byOrg = new Map(first.map((r) => [String(r.orgId), r.set]));
    expect(byOrg.get(String(sonesta))).toEqual({ series: true, testMatches: true });
    expect(byOrg.get(String(office))).toEqual({ testMatches: false });
    expect(byOrg.has(String(sandbox))).toBe(false);

    const features = async (orgId: typeof sonesta) => (await t.run((ctx) => ctx.db.get(orgId)))!.features;
    expect(await features(sonesta)).toEqual({ series: true, testMatches: true });
    expect(await features(office)).toEqual({ series: true, testMatches: false });
    expect(await features(sandbox)).toBeUndefined();

    // A second run sets nothing.
    expect(await t.mutation(internal.maintenance.pinFeatureDefaults, {})).toEqual([]);
  });
});
