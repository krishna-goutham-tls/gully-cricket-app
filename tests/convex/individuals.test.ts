import { describe, expect, test } from "vitest";
import { api, community, newTest, person, type Person, type T } from "./fixtures";
import type { Id } from "../../convex/_generated/dataModel";
import {
  individualsResultText,
  winnersOf,
  type StandingRow,
} from "../../convex/lib/individuals";

async function setup(names = ["Asha", "Ravi", "Teja"]) {
  const t = newTest();
  const people: Person[] = [];
  for (const n of names) people.push(await person(t, n));
  const orgId = await community(t, people[0], people.slice(1));
  return { t, people, orgId };
}

async function create(
  t: T,
  scorer: Person,
  orgId: Id<"orgs">,
  players: Person[],
  oversEach?: number,
) {
  const { matchId } = await t.mutation(api.matches.create, {
    token: scorer.token,
    orgId,
    play: "individuals",
    sideAPlayerIds: players.map((p) => p.userId),
    sideBPlayerIds: [],
    overs: 1,
    ...(oversEach !== undefined ? { oversEach } : {}),
  });
  await t.mutation(api.scoring.startInnings, {
    token: scorer.token,
    matchId,
    strikerId: players[0].userId,
    openingBowlerId: players[1].userId,
  });
  return matchId;
}

const ball = (t: T, token: string, matchId: Id<"matches">, runsBat: number) =>
  t.mutation(api.scoring.recordBall, { token, matchId, runsBat });
const out = (t: T, token: string, matchId: Id<"matches">, who: Person) =>
  t.mutation(api.scoring.recordBall, {
    token,
    matchId,
    runsBat: 0,
    isWicket: true,
    wicketType: "bowled",
    playerOutId: who.userId,
  });

describe("individuals", () => {
  test("limited: one innings, retire at the balls, most points wins", async () => {
    const { t, people, orgId } = await setup();
    const [asha, ravi, teja] = people;
    const tok = asha.token;
    const matchId = await create(t, asha, orgId, people, 1);

    // Asha faces her 6 balls off Ravi: 15 runs.
    for (const r of [4, 4, 1, 0, 0, 6]) await ball(t, tok, matchId, r);
    // Over end: Asha bats, Ravi just bowled, so Teja bowls.
    await t.mutation(api.scoring.setBowler, { token: tok, matchId, bowlerId: teja.userId });
    let live = await t.query(api.scoring.liveState, { token: tok, matchId });
    expect(live!.live!.needRetire).toBe(true);
    expect(live!.live!.potBalls).toBe(0);

    await t.mutation(api.scoring.retireBatsman, { token: tok, matchId, batsmanId: asha.userId });
    await t.mutation(api.scoring.setNextBatsman, { token: tok, matchId, batsmanId: ravi.userId });
    await out(t, tok, matchId, ravi);
    // No pot: Ravi's 5 unused balls go nowhere.
    live = await t.query(api.scoring.liveState, { token: tok, matchId });
    expect(live!.live!.potBalls).toBe(0);
    // Teja was bowling and now bats: Asha takes the ball.
    await t.mutation(api.scoring.setNextBatsman, { token: tok, matchId, batsmanId: teja.userId });
    await t.mutation(api.scoring.setBowler, { token: tok, matchId, bowlerId: asha.userId });
    for (let i = 0; i < 5; i++) await ball(t, tok, matchId, 1);
    // Over ends; Ravi is free to bowl.
    await t.mutation(api.scoring.setBowler, { token: tok, matchId, bowlerId: ravi.userId });
    await ball(t, tok, matchId, 1);

    // Teja used her 6 balls and nobody is left: the match is over.
    const match = await t.run((ctx) => ctx.db.get(matchId));
    expect(match!.status).toBe("completed");
    // Teja: 6 runs + 20 for Ravi's wicket = 26. Asha: 15.
    expect(match!.winnerUserIds).toEqual([teja.userId]);
    expect(match!.resultText).toBe("Teja won · 26 pts");
    expect(match!.winnerSide).toBeUndefined();

    const stamp = await t.run((ctx) =>
      ctx.db.query("matchStats").withIndex("by_match", (q) => q.eq("matchId", matchId)).first(),
    );
    expect(stamp!.play).toBe("individuals");
    expect(stamp!.winnerUserIds).toEqual([teja.userId]);
    expect(stamp!.potm!.map((p) => p.userId)).toEqual([teja.userId]);
    const rows = await t.run((ctx) =>
      ctx.db.query("playerMatchStats").withIndex("by_match", (q) => q.eq("matchId", matchId)).collect(),
    );
    expect(rows).toHaveLength(3);
    // No team numbers: never in wins, win % or streaks.
    for (const r of rows) {
      expect(r.play).toBe("individuals");
      expect(r.work).toBeUndefined();
    }

    live = await t.query(api.scoring.liveState, { token: tok, matchId });
    const table = live!.individuals!.standings;
    expect(table.map((r) => [r.displayName, r.points, r.rank, r.winner])).toEqual([
      ["Teja", 26, 1, true],
      ["Asha", 15, 2, false],
      ["Ravi", 0, 3, false],
    ]);
    expect(table.find((r) => r.displayName === "Ravi")!.out).toBe(true);
  });

  test("unlimited with two players: points level, fewer balls wins", async () => {
    const { t, people, orgId } = await setup(["Asha", "Ravi"]);
    const [asha, ravi] = people;
    const tok = asha.token;
    const matchId = await create(t, asha, orgId, people);

    await ball(t, tok, matchId, 4);
    await out(t, tok, matchId, asha);
    await t.mutation(api.scoring.setNextBatsman, { token: tok, matchId, batsmanId: ravi.userId });
    await t.mutation(api.scoring.setBowler, { token: tok, matchId, bowlerId: asha.userId });
    for (let i = 0; i < 4; i++) await ball(t, tok, matchId, 1);
    // Over over, and Asha is the only one free: she bowls again.
    const live = await t.query(api.scoring.liveState, { token: tok, matchId });
    expect(live!.availableBowlers.map((b) => b.displayName)).toEqual(["Asha"]);
    await t.mutation(api.scoring.setBowler, { token: tok, matchId, bowlerId: asha.userId });
    await out(t, tok, matchId, ravi);

    const match = await t.run((ctx) => ctx.db.get(matchId));
    expect(match!.status).toBe("completed");
    // Both 24 points and 4 runs; Asha faced 2 balls, Ravi 5.
    expect(match!.winnerUserIds).toEqual([asha.userId]);
    expect(match!.resultText).toBe("Asha won · 24 pts");
  });

  test("undo after the end reopens the match and clears the winner", async () => {
    const { t, people, orgId } = await setup(["Asha", "Ravi"]);
    const [asha, ravi] = people;
    const tok = asha.token;
    const matchId = await create(t, asha, orgId, people);
    await ball(t, tok, matchId, 2);
    await out(t, tok, matchId, asha);
    await t.mutation(api.scoring.setNextBatsman, { token: tok, matchId, batsmanId: ravi.userId });
    await t.mutation(api.scoring.setBowler, { token: tok, matchId, bowlerId: asha.userId });
    await out(t, tok, matchId, ravi);
    expect((await t.run((ctx) => ctx.db.get(matchId)))!.status).toBe("completed");

    await t.mutation(api.scoring.undoLastBall, { token: tok, matchId });
    const match = await t.run((ctx) => ctx.db.get(matchId));
    expect(match!.status).toBe("live");
    expect(match!.winnerUserIds).toBeUndefined();
    const stamps = await t.run((ctx) =>
      ctx.db.query("matchStats").withIndex("by_match", (q) => q.eq("matchId", matchId)).collect(),
    );
    expect(stamps).toHaveLength(0);
  });

  test("End finishes an unlimited match on the scores so far", async () => {
    const { t, people, orgId } = await setup();
    const [asha] = people;
    const tok = asha.token;
    const matchId = await create(t, asha, orgId, people);
    await ball(t, tok, matchId, 6);
    await t.mutation(api.scoring.endInnings, { token: tok, matchId });
    const match = await t.run((ctx) => ctx.db.get(matchId));
    expect(match!.status).toBe("completed");
    expect(match!.resultText).toBe("Asha won · 6 pts");
    const live = await t.query(api.scoring.liveState, { token: tok, matchId });
    const ravi = live!.individuals!.standings.find((r) => r.displayName === "Ravi")!;
    expect(ravi.batted).toBe(false);
  });

  test("switched off: no individuals match can be created", async () => {
    const { t, people, orgId } = await setup();
    await t.mutation(api.orgs.setFeature, {
      token: people[0].token,
      orgId,
      key: "individuals",
      on: false,
    });
    await expect(create(t, people[0], orgId, people)).rejects.toThrow(/switched off/);
  });
});

describe("individuals winner rules", () => {
  const row = (id: string, points: number, runs: number, balls: number, boundaries: number): StandingRow => ({
    userId: id as Id<"users">,
    points,
    runs,
    balls,
    boundaries,
  });

  test("tie-breaks: points, runs, fewer balls, boundaries, then shared", () => {
    expect(winnersOf([row("a", 30, 10, 8, 1), row("b", 31, 2, 4, 0)]).map((w) => w.userId)).toEqual(["b"]);
    expect(winnersOf([row("a", 30, 10, 8, 1), row("b", 30, 12, 9, 0)]).map((w) => w.userId)).toEqual(["b"]);
    expect(winnersOf([row("a", 30, 10, 8, 1), row("b", 30, 10, 7, 0)]).map((w) => w.userId)).toEqual(["b"]);
    expect(winnersOf([row("a", 30, 10, 8, 1), row("b", 30, 10, 8, 2)]).map((w) => w.userId)).toEqual(["b"]);
    expect(winnersOf([row("a", 30, 10, 8, 1), row("b", 30, 10, 8, 1)]).map((w) => w.userId)).toEqual(["a", "b"]);
    expect(winnersOf([row("a", 0, 0, 3, 0), row("b", 0, 0, 1, 0)])).toEqual([]);
  });

  test("result text", () => {
    expect(individualsResultText([])).toBe("No winner");
    expect(individualsResultText([{ name: "Ravi", points: 40 }, { name: "Teja", points: 40 }])).toBe(
      "Ravi and Teja share the win · 40 pts",
    );
  });
});

describe("individuals on the boards", () => {
  test("Impact: individuals play has its own average, team values do not move", async () => {
    const { playMatch } = await import("./fixtures");
    const { t, people, orgId } = await setup(["Asha", "Ravi", "Teja", "Kiran", "Mani"]);
    const [asha, ravi, teja, kiran, mani] = people;
    const tok = asha.token;
    await playMatch(
      t,
      asha,
      orgId,
      [asha, ravi],
      [teja, kiran],
      { striker: asha, other: ravi, bowler: teja, balls: [{ runsBat: 4 }, { runsBat: 1 }, { out: asha.userId }, {}, { runsBat: 2 }, { runsBat: 6 }] },
      { striker: teja, other: kiran, bowler: asha, balls: [{ runsBat: 1 }, {}, { out: kiran.userId }, { runsBat: 4 }, {}, { runsBat: 1 }] },
    );
    const before = await t.query(api.stats.impact, { token: tok, orgId });
    const ashaBefore = before!.rows.find((r) => r.displayName === "Asha")!;

    // Ravi, Teja and Mani play individuals; big unlimited scores.
    const matchId = await create(t, asha, orgId, [ravi, teja, mani]);
    for (const r of [6, 6, 6, 6, 6]) await ball(t, tok, matchId, r);
    await t.mutation(api.scoring.endInnings, { token: tok, matchId });

    const after = await t.query(api.stats.impact, { token: tok, orgId });
    const ashaAfter = after!.rows.find((r) => r.displayName === "Asha")!;
    expect(ashaAfter.total).toBeCloseTo(ashaBefore.total, 9);
    expect(after!.rows.find((r) => r.displayName === "Mani")!.matches).toBe(1);
    // Ravi played both kinds: two matches on the board.
    expect(after!.rows.find((r) => r.displayName === "Ravi")!.matches).toBe(2);

    // Leaders: individuals runs count on the default board; team wins skip it.
    const board = await t.query(api.stats.leaderboard, { token: tok, orgId });
    expect(board!.batting.find((r) => r.displayName === "Ravi")!.runs).toBeGreaterThanOrEqual(30);
    expect(board!.formats.individuals).toBe(1);
    expect(board!.teams.some((r) => r.name === "Individuals")).toBe(false);
    const solo = await t.query(api.stats.leaderboard, { token: tok, orgId, format: "individuals" });
    expect(solo!.matchCount).toBe(1);
    const teamsLimited = await t.query(api.stats.leaderboard, { token: tok, orgId, format: "limited" });
    expect(teamsLimited!.matchCount).toBe(1);
  });
});
