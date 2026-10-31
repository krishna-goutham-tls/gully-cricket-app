import { api, NAMES } from "./env.mjs";

/** Plays a full 1-over match through the real scoring functions. */
export async function playOneOverMatch(c, org, players) {
  const id = (n) => players.find((p) => p.displayName === n).userId;
  const sideA = [id(NAMES.organiser), id(NAMES.admin2), id(NAMES.junior)];
  const sideB = [id(NAMES.player), id(NAMES.visitor), id("E2E Added Phone")];
  const token = org.token;
  const made = await c.mutation(api.matches.create, {
    token, orgId: org.orgId, sideAPlayerIds: sideA, sideBPlayerIds: sideB, overs: 1,
  });
  const matchId = made.matchId ?? made;
  await c.mutation(api.scoring.setBattingFirst, { token, matchId, side: "A" });
  await c.mutation(api.scoring.startInnings, { token, matchId, strikerId: sideA[0], nonStrikerId: sideA[1], openingBowlerId: sideB[0] });
  for (const runsBat of [4, 1, 0, 6, 1, 1]) {
    await c.mutation(api.scoring.recordBall, { token, matchId, runsBat });
  }
  await c.mutation(api.scoring.startInnings, { token, matchId, strikerId: sideB[0], nonStrikerId: sideB[1], openingBowlerId: sideA[2] });
  for (const runsBat of [0, 1, 0, 1, 0, 1]) {
    await c.mutation(api.scoring.recordBall, { token, matchId, runsBat });
  }
  return matchId;
}
