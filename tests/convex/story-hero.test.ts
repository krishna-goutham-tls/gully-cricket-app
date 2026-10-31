import { expect, test } from "vitest";
import type { Doc, Id } from "../../convex/_generated/dataModel";
import { computeCareerBaseline } from "../../convex/hero";
import {
  api,
  community,
  newTest,
  person,
  type Ball,
  type Person,
  type T,
} from "./fixtures";

type Inn = {
  striker: Person;
  other: Person;
  bowler: Person;
  /** Batters still to come, in order, for each wicket that needs one. */
  next?: Person[];
  balls: Ball[];
};

/** Like fixtures' playMatch, and it also sends in the next batter after a wicket. */
async function play(
  t: T,
  scorer: Person,
  orgId: Id<"orgs">,
  sideA: Person[],
  sideB: Person[],
  innings: Inn[],
) {
  const token = scorer.token;
  const made = await t.mutation(api.matches.create, {
    token,
    orgId,
    sideAPlayerIds: sideA.map((p) => p.userId),
    sideBPlayerIds: sideB.map((p) => p.userId),
    overs: 1,
  });
  const matchId = ((made as { matchId?: Id<"matches"> }).matchId ?? made) as Id<"matches">;
  await t.mutation(api.scoring.setBattingFirst, { token, matchId, side: "A" });
  for (const inn of innings) {
    await t.mutation(api.scoring.startInnings, {
      token,
      matchId,
      strikerId: inn.striker.userId,
      nonStrikerId: inn.other.userId,
      openingBowlerId: inn.bowler.userId,
    });
    const next = [...(inn.next ?? [])];
    const state = () =>
      t.run(async (ctx) => {
        const rows = await ctx.db
          .query("innings")
          .withIndex("by_match", (q) => q.eq("matchId", matchId))
          .collect();
        const current = rows.find((r) => r.status === "in_progress");
        return { open: current !== undefined, needsBatter: current?.needBatsman ?? false };
      });
    const bowl = async (b: Ball) => {
      await t.mutation(api.scoring.recordBall, {
        token,
        matchId,
        runsBat: b.runsBat ?? 0,
        ...(b.out
          ? {
              isWicket: true,
              wicketType: b.wicketType ?? "bowled",
              playerOutId: b.out,
              fielderId: b.fielderId,
            }
          : {}),
      });
      if ((await state()).needsBatter) {
        await t.mutation(api.scoring.setNextBatsman, {
          token,
          matchId,
          batsmanId: next.shift()!.userId,
        });
      }
    };
    for (const b of inn.balls) await bowl(b);
    // Dots to the end of the innings, so the match always completes.
    while ((await state()).open) await bowl({ runsBat: 0 });
  }
  return matchId;
}

const dots = (n: number): Ball[] => Array.from({ length: n }, () => ({ runsBat: 0 }));
const runs = (...xs: number[]): Ball[] => xs.map((runsBat) => ({ runsBat }));

/** The career replay as it stood before stamps, kept here as the reference. */
async function oldReplay(t: T, playerId: Id<"users">, dayStart: number, orgId: Id<"orgs">) {
  return t.run(async (ctx) => {
    const key = String(playerId);
    const completed = await ctx.db
      .query("matches")
      .withIndex("by_org_status", (q) => q.eq("orgId", orgId).eq("status", "completed"))
      .collect();
    const prior = completed.filter(
      (m) =>
        m.createdAt < dayStart &&
        [...m.sideAPlayerIds, ...m.sideBPlayerIds].some((id) => String(id) === key),
    );
    if (prior.length === 0) return null;
    let careerRuns = 0;
    let careerBallsFaced = 0;
    let careerWickets = 0;
    for (const match of prior) {
      const balls = await ctx.db
        .query("balls")
        .withIndex("by_match", (q) => q.eq("matchId", match._id))
        .collect();
      for (const b of balls) {
        if (b.isRetire) continue;
        if (String(b.strikerId) === key) {
          careerRuns += b.runsBat;
          if (b.isLegal || b.extrasType === "noball") careerBallsFaced += 1;
        }
        if (b.isWicket && b.wicketType !== "runout" && String(b.bowlerId) === key) {
          careerWickets += 1;
        }
      }
    }
    return {
      careerMatches: prior.length,
      careerBallsFaced,
      careerSR: careerBallsFaced > 0 ? (careerRuns / careerBallsFaced) * 100 : 0,
      careerWicketsPerMatch: careerWickets / prior.length,
    };
  });
}

/** Stream 1A writes `real` in the fold. Until that merges, tests patch it from the balls. */
async function patchReal(t: T, matchId: Id<"matches">) {
  await t.run(async (ctx) => {
    const balls = await ctx.db
      .query("balls")
      .withIndex("by_match", (q) => q.eq("matchId", matchId))
      .collect();
    const rows = await ctx.db
      .query("playerMatchStats")
      .withIndex("by_match", (q) => q.eq("matchId", matchId))
      .collect();
    for (const r of rows) {
      const real = { runs: 0, ballsFaced: 0, wickets: 0, catches: 0 };
      for (const b of balls) {
        if (b.isRetire) continue;
        if (b.strikerId === r.userId) {
          real.runs += b.runsBat;
          if (b.isLegal || b.extrasType === "noball") real.ballsFaced += 1;
        }
        if (b.isWicket && b.wicketType !== "runout" && b.bowlerId === r.userId) real.wickets += 1;
        if (b.isWicket && b.wicketType === "caught" && b.fielderId === r.userId) real.catches += 1;
      }
      await ctx.db.patch(r._id, { real });
    }
  });
}

async function deleteBalls(t: T, matchId: Id<"matches">) {
  await t.run(async (ctx) => {
    const balls = await ctx.db
      .query("balls")
      .withIndex("by_match", (q) => q.eq("matchId", matchId))
      .collect();
    for (const b of balls) await ctx.db.delete(b._id);
  });
}

async function completed(t: T, orgId: Id<"orgs">): Promise<Doc<"matches">[]> {
  return t.run((ctx) =>
    ctx.db
      .query("matches")
      .withIndex("by_org_status", (q) => q.eq("orgId", orgId).eq("status", "completed"))
      .collect(),
  );
}

const newBaseline = (t: T, playerId: Id<"users">, dayStart: number, orgId: Id<"orgs">) =>
  completed(t, orgId).then((all) =>
    t.run((ctx) => computeCareerBaseline(ctx, orgId, playerId, dayStart, all)),
  );

/** Four named sides, with one junior in the bowling side, for a pair of matches. */
async function setup(t: T) {
  const a1 = await person(t, "Asha");
  const a2 = await person(t, "Bala");
  const b1 = await person(t, "Chitra");
  const j1 = await person(t, "Junior Dev");
  const orgId = await community(t, a1, [a2, b1, j1], {
    [String(j1.userId)]: ["junior"],
  });
  return { a1, a2, b1, j1, orgId };
}

test("story shows the same badges as before, with plurals fixed", async () => {
  const t = newTest();
  const { a1, a2, b1, j1, orgId } = await setup(t);
  const matchId = await play(t, a1, orgId, [a1, a2], [b1, j1], [
    {
      striker: a1,
      other: a2,
      bowler: b1,
      balls: runs(6, 6, 4, 0, 1, 0),
    },
    {
      striker: b1,
      other: j1,
      bowler: a1,
      balls: [
        { out: b1.userId, wicketType: "caught", fielderId: a2.userId },
      ],
    },
  ]);
  const story = await t.query(api.story.matchStory, { token: a1.token, matchId });
  expect(story?.badges.map((b) => [b.key, b.playerName])).toEqual([
    ["potm", "Asha"],
    ["goldenduck", "Chitra"],
  ]);
  const potm = story!.badges[0];
  expect(potm.stat).toBe("17 runs · 1 wkt");
  expect(potm.receipt).toContain("37 points");
});

test("a catch and a wicket read in the singular, and two read in the plural", async () => {
  const t = newTest();
  const a1 = await person(t, "Asha");
  const a2 = await person(t, "Bala");
  const a3 = await person(t, "Esha");
  const b1 = await person(t, "Chitra");
  const b2 = await person(t, "Farah");
  const b3 = await person(t, "Gopi");
  const orgId = await community(t, a1, [a2, a3, b1, b2, b3]);
  const matchId = await play(t, a1, orgId, [a1, a2, a3], [b1, b2, b3], [
    { striker: a1, other: a2, bowler: b1, balls: dots(6) },
    {
      striker: b1,
      other: b2,
      bowler: a1,
      next: [b3],
      balls: [
        { out: b1.userId, wicketType: "caught", fielderId: a1.userId },
        { out: b2.userId, wicketType: "caught", fielderId: a1.userId },
      ],
    },
  ]);
  const story = await t.query(api.story.matchStory, { token: a1.token, matchId });
  expect(story!.badges[0].stat).toBe("2 wkts · 2 catches");
});

test("story reads this match only: other matches' balls change nothing", async () => {
  const t = newTest();
  const { a1, a2, b1, j1, orgId } = await setup(t);
  // One bowler gets one batter out in three matches. The old scan counted the
  // third one as "the 3rd time".
  const inn: Inn[] = [
    {
      striker: a1,
      other: a2,
      bowler: b1,
      balls: [{ out: a1.userId }],
    },
    { striker: b1, other: j1, bowler: a1, balls: dots(6) },
  ];
  const first = await play(t, a1, orgId, [a1, a2], [b1, j1], inn);
  const second = await play(t, a1, orgId, [a1, a2], [b1, j1], inn);
  const third = await play(t, a1, orgId, [a1, a2], [b1, j1], inn);

  const before = await t.query(api.story.matchStory, { token: a1.token, matchId: third });
  expect(before!.timeline.some((b) => "nemesisCount" in b && b.nemesisCount)).toBe(false);

  await deleteBalls(t, first);
  await deleteBalls(t, second);
  const after = await t.query(api.story.matchStory, { token: a1.token, matchId: third });
  expect(after).toEqual(before);
});

test("story keeps the fields old phones read", async () => {
  const t = newTest();
  const { a1, a2, b1, j1, orgId } = await setup(t);
  const matchId = await play(t, a1, orgId, [a1, a2], [b1, j1], [
    { striker: a1, other: a2, bowler: b1, balls: runs(1, 0, 0, 0, 0, 0) },
    { striker: b1, other: j1, bowler: a1, balls: dots(6) },
  ]);
  const story = await t.query(api.story.matchStory, { token: a1.token, matchId });
  expect(Object.keys(story!).sort()).toEqual(
    [
      "badges",
      "battingFirst",
      "durationMin",
      "endedAt",
      "format",
      "innings",
      "matchId",
      "numbers",
      "resultText",
      "sideAName",
      "sideBName",
      "startedAt",
      "timeline",
      "totalBalls",
      "totalWickets",
      "turningPoint",
      "winnerSide",
    ].sort(),
  );
  expect(story!.timeline).toHaveLength(12);
  expect(story!.innings[1].firstBallIndex).toBe(6);
  expect(story!.turningPoint?.ballIndex).toBeGreaterThanOrEqual(0);
});

test("turning point lines say what happened in plain words", async () => {
  const t = newTest();
  const a1 = await person(t, "Asha");
  const a2 = await person(t, "Bala");
  const a3 = await person(t, "Esha");
  const a4 = await person(t, "Hari");
  const b1 = await person(t, "Chitra");
  const b2 = await person(t, "Farah");
  const orgId = await community(t, a1, [a2, a3, a4, b1, b2]);

  const three = await play(t, a1, orgId, [a1, a2, a3, a4], [b1, b2], [
    {
      striker: a1,
      other: a2,
      bowler: b1,
      next: [a3, a4],
      balls: [
        { out: a1.userId },
        { runsBat: 0 },
        { out: a3.userId },
        { runsBat: 0 },
        { runsBat: 0 },
        { out: a4.userId },
      ],
    },
    { striker: b1, other: b2, bowler: a1, balls: dots(6) },
  ]);
  const clustered = await t.query(api.story.matchStory, { token: a1.token, matchId: three });
  expect(clustered!.turningPoint!.meta).toBe("3 wickets in 6 balls · overs 0.1 to 0.6");
  expect(clustered!.turningPoint!.text).toContain("Two wickets in");

  const two = await play(t, a1, orgId, [a1, a2, a3, a4], [b1, b2], [
    {
      striker: a1,
      other: a2,
      bowler: b1,
      next: [a3, a4],
      balls: [{ out: a1.userId }, { runsBat: 0 }, { out: a3.userId }],
    },
    { striker: b1, other: b2, bowler: a1, balls: dots(6) },
  ]);
  const pair = await t.query(api.story.matchStory, { token: a1.token, matchId: two });
  expect(pair!.turningPoint!.meta).toBe("Overs 0.1 to 0.3");

  const noWickets = await play(t, a1, orgId, [a1, a2], [b1, b2], [
    { striker: a1, other: a2, bowler: b1, balls: runs(4, 0, 0, 0, 0, 0) },
    { striker: b1, other: b2, bowler: a1, balls: dots(6) },
  ]);
  const big = await t.query(api.story.matchStory, { token: a1.token, matchId: noWickets });
  expect(big!.turningPoint!.meta).toBe("Biggest over of the match · over 1");
  expect(big!.turningPoint!.at).toBeGreaterThan(0);
  for (const s of [clustered, pair, big]) {
    expect(s!.turningPoint!.meta).not.toContain("Detected");
  }
});

test("the poster's Player of the Match comes from stamps and agrees with Story", async () => {
  const t = newTest();
  const { a1, a2, b1, j1, orgId } = await setup(t);
  const matchId = await play(t, a1, orgId, [a1, a2], [b1, j1], [
    // Asha's sixes come off a junior, so they earn no points but still show.
    { striker: a1, other: a2, bowler: j1, balls: runs(6, 6, 0, 0, 0, 0) },
    {
      striker: b1,
      other: j1,
      bowler: a1,
      balls: [
        { out: b1.userId, wicketType: "caught", fielderId: a2.userId },
      ],
    },
  ]);
  const story = await t.query(api.story.matchStory, { token: a1.token, matchId });
  const badge = story!.badges.find((b) => b.key === "potm")!;
  const potm = await t.query(api.story.matchPotm, { token: a1.token, matchId });
  expect(potm).toEqual({ name: badge.playerName, line: badge.stat });
  expect(potm!.line).toBe("12 runs · 1 wkt");

  // It reads no balls.
  await deleteBalls(t, matchId);
  expect(await t.query(api.story.matchPotm, { token: a1.token, matchId })).toEqual(potm);
});

test("the poster and Story name the same player on a tie", async () => {
  const t = newTest();
  const { a1, a2, b1, j1, orgId } = await setup(t);
  const matchId = await play(t, a1, orgId, [a1, a2], [b1, j1], [
    { striker: a1, other: a2, bowler: b1, balls: runs(4, 0, 0, 0, 0, 0) },
    { striker: b1, other: j1, bowler: a1, balls: runs(4, 0, 0, 0, 0, 0) },
  ]);
  const story = await t.query(api.story.matchStory, { token: a1.token, matchId });
  const badge = story!.badges.find((b) => b.key === "potm")!;
  const potm = await t.query(api.story.matchPotm, { token: a1.token, matchId });
  expect(potm?.name).toBe(badge.playerName);
});

test("the poster has no Player of the Match while a match is live", async () => {
  const t = newTest();
  const { a1, a2, b1, j1, orgId } = await setup(t);
  const made = await t.mutation(api.matches.create, {
    token: a1.token,
    orgId,
    sideAPlayerIds: [a1.userId, a2.userId],
    sideBPlayerIds: [b1.userId, j1.userId],
    overs: 1,
  });
  const matchId = ((made as { matchId?: Id<"matches"> }).matchId ?? made) as Id<"matches">;
  expect(await t.query(api.story.matchPotm, { token: a1.token, matchId })).toBeNull();
});

/** Two prior matches with a junior in play, then the day we look back from. */
async function heroHistory(t: T) {
  const { a1, a2, b1, j1, orgId } = await setup(t);
  const m1 = await play(t, a1, orgId, [a1, a2], [b1, j1], [
    // Asha scores off the junior and a senior, and later bowls the junior out.
    { striker: a1, other: a2, bowler: j1, balls: runs(6, 4, 1, 0, 2, 1) },
    {
      striker: j1,
      other: b1,
      bowler: a1,
      balls: [{ out: j1.userId }, { runsBat: 1 }, { runsBat: 0 }],
    },
  ]);
  const m2 = await play(t, a1, orgId, [a1, a2], [b1, j1], [
    { striker: a1, other: a2, bowler: b1, balls: runs(1, 0, 4, 1, 0, 0) },
    {
      striker: b1,
      other: j1,
      bowler: a1,
      balls: [{ out: b1.userId }, { runsBat: 0 }],
    },
  ]);
  return { a1, a2, b1, j1, orgId, m1, m2, dayStart: Date.now() + 1000 };
}

test("hero baseline from stamps equals the old replay, junior in play", async () => {
  const t = newTest();
  const h = await heroHistory(t);
  await patchReal(t, h.m1);
  await patchReal(t, h.m2);

  // The junior's balls really are left out of the counted numbers, so reading
  // `bat` here would be wrong and `real` is the right field.
  const stamp = await t.run((ctx) =>
    ctx.db
      .query("playerMatchStats")
      .withIndex("by_match", (q) => q.eq("matchId", h.m1))
      .collect(),
  );
  const asha = stamp.find((r) => r.userId === h.a1.userId)!;
  expect(asha.bat?.runs ?? 0).toBeLessThan(asha.real!.runs);

  for (const p of [h.a1, h.a2, h.b1, h.j1]) {
    const expected = await oldReplay(t, p.userId, h.dayStart, h.orgId);
    expect(await newBaseline(t, p.userId, h.dayStart, h.orgId)).toEqual(expected);
  }
  const reference = await oldReplay(t, h.a1.userId, h.dayStart, h.orgId);
  expect(reference!.careerMatches).toBe(2);
  expect(reference!.careerWicketsPerMatch).toBe(1);

  // With every stamp ready, the path reads no balls at all.
  await deleteBalls(t, h.m1);
  await deleteBalls(t, h.m2);
  expect(await newBaseline(t, h.a1.userId, h.dayStart, h.orgId)).toEqual(reference);
});

test("hero baseline replays only the match whose stamp has no real numbers", async () => {
  const t = newTest();
  const h = await heroHistory(t);
  await patchReal(t, h.m1);
  const reference = await oldReplay(t, h.a1.userId, h.dayStart, h.orgId);
  expect(await newBaseline(t, h.a1.userId, h.dayStart, h.orgId)).toEqual(reference);

  // m1 can come from the stamp alone, m2 still needs its balls.
  await deleteBalls(t, h.m1);
  expect(await newBaseline(t, h.a1.userId, h.dayStart, h.orgId)).toEqual(reference);
});

test("hero baseline with no real numbers yet is the old replay", async () => {
  const t = newTest();
  const h = await heroHistory(t);
  for (const p of [h.a1, h.a2, h.b1, h.j1]) {
    const expected = await oldReplay(t, p.userId, h.dayStart, h.orgId);
    expect(await newBaseline(t, p.userId, h.dayStart, h.orgId)).toEqual(expected);
  }
});

test("hero baseline keeps practice matches, which have no stamps", async () => {
  const t = newTest();
  const h = await heroHistory(t);
  await patchReal(t, h.m1);
  await patchReal(t, h.m2);
  const practice = await play(t, h.a1, h.orgId, [h.a1, h.a2], [h.b1, h.j1], [
    { striker: h.a1, other: h.a2, bowler: h.b1, balls: runs(6, 0, 0, 0, 0, 0) },
    { striker: h.b1, other: h.j1, bowler: h.a1, balls: dots(6) },
  ]);
  await t.run(async (ctx) => {
    await ctx.db.patch(practice, { practice: true });
    const rows = await ctx.db
      .query("playerMatchStats")
      .withIndex("by_match", (q) => q.eq("matchId", practice))
      .collect();
    for (const r of rows) await ctx.db.delete(r._id);
  });
  const reference = await oldReplay(t, h.a1.userId, h.dayStart, h.orgId);
  expect(reference!.careerMatches).toBe(3);
  expect(await newBaseline(t, h.a1.userId, h.dayStart, h.orgId)).toEqual(reference);
});

test("hero baseline is null with no prior match, and leaves out later days", async () => {
  const t = newTest();
  const h = await heroHistory(t);
  await patchReal(t, h.m1);
  await patchReal(t, h.m2);
  expect(await newBaseline(t, h.a1.userId, 0, h.orgId)).toBeNull();

  const m2Start = await t.run(async (ctx) => (await ctx.db.get(h.m2))!.createdAt);
  const expected = await oldReplay(t, h.a1.userId, m2Start, h.orgId);
  expect(await newBaseline(t, h.a1.userId, m2Start, h.orgId)).toEqual(expected);
});
