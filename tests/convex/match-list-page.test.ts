import { describe, expect, test } from "vitest";
import type { Id } from "../../convex/_generated/dataModel";
import { api, community, newTest, person, playMatch, type Person, type T } from "./fixtures";

/** `n` unstarted matches between the same four, oldest first. */
async function makeMatches(t: T, scorer: Person, orgId: Id<"orgs">, sides: Person[][], n: number) {
  const ids: Id<"matches">[] = [];
  for (let i = 0; i < n; i++) {
    const { matchId } = await t.mutation(api.matches.create, {
      token: scorer.token,
      orgId,
      sideAPlayerIds: sides[0].map((p) => p.userId),
      sideBPlayerIds: sides[1].map((p) => p.userId),
      overs: 1,
    });
    ids.push(matchId);
  }
  return ids;
}

async function setup(t: T) {
  const a1 = await person(t, "Page One");
  const a2 = await person(t, "Page Two");
  const b1 = await person(t, "Page Three");
  const b2 = await person(t, "Page Four");
  const orgId = await community(t, a1, [a2, b1, b2]);
  return { a1, a2, b1, b2, orgId, sides: [[a1, a2], [b1, b2]] };
}

const page = (t: T, token: string, orgId: Id<"orgs">, cursor: string | null, numItems = 20) =>
  t.query(api.matches.listPage, { token, orgId, paginationOpts: { numItems, cursor } });

describe("matches.listPage", () => {
  test("pages of 20, newest first, no repeats, then done", async () => {
    const t = newTest();
    const s = await setup(t);
    const ids = await makeMatches(t, s.a1, s.orgId, s.sides, 25);
    const newestFirst = [...ids].reverse().map(String);

    const first = await page(t, s.a1.token, s.orgId, null);
    expect(first.page).toHaveLength(20);
    expect(first.isDone).toBe(false);
    expect(first.page.map((m) => String(m._id))).toEqual(newestFirst.slice(0, 20));

    const second = await page(t, s.a1.token, s.orgId, first.continueCursor);
    expect(second.page.map((m) => String(m._id))).toEqual(newestFirst.slice(20));
    expect(second.isDone).toBe(true);
  });

  test("goes past the 40 that list stops at", async () => {
    const t = newTest();
    const s = await setup(t);
    await makeMatches(t, s.a1, s.orgId, s.sides, 45);

    expect(await t.query(api.matches.list, { token: s.a1.token, orgId: s.orgId })).toHaveLength(40);

    let cursor: string | null = null;
    let seen = 0;
    for (;;) {
      const res = await page(t, s.a1.token, s.orgId, cursor);
      seen += res.page.length;
      if (res.isDone) break;
      cursor = res.continueCursor;
    }
    expect(seen).toBe(45);
  });

  test("a finished match has the same row as list", async () => {
    const t = newTest();
    const s = await setup(t);
    await playMatch(
      t,
      s.a1,
      s.orgId,
      [s.a1, s.a2],
      [s.b1, s.b2],
      { striker: s.a1, other: s.a2, bowler: s.b1, balls: [4, 1, 0, 6, 0, 1].map((r) => ({ runsBat: r })) },
      { striker: s.b1, other: s.b2, bowler: s.a2, balls: [0, 0, 1, 0, 0, 0].map((r) => ({ runsBat: r })) },
    );

    const fromList = await t.query(api.matches.list, { token: s.a1.token, orgId: s.orgId });
    const fromPage = await page(t, s.a1.token, s.orgId, null);
    expect(fromPage.page).toEqual(fromList);
    expect(fromPage.page[0].status).toBe("completed");
    expect(fromPage.page[0].scoreA).toBe("12/0");
  });

  test("only members see a community's matches", async () => {
    const t = newTest();
    const s = await setup(t);
    await makeMatches(t, s.a1, s.orgId, s.sides, 3);

    const outsider = await person(t, "Not In It");
    const theirs = await community(t, outsider, []);

    const denied = await page(t, outsider.token, s.orgId, null);
    expect(denied.page).toEqual([]);
    expect(denied.isDone).toBe(true);

    const noToken = await t.query(api.matches.listPage, {
      orgId: s.orgId,
      paginationOpts: { numItems: 20, cursor: null },
    });
    expect(noToken.page).toEqual([]);

    expect(await page(t, outsider.token, theirs, null)).toMatchObject({ page: [], isDone: true });
    expect((await page(t, s.b2.token, s.orgId, null)).page).toHaveLength(3);
  });
});
