import { convexTest } from "convex-test";
import schema from "../../convex/schema";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

process.env.PIN_PEPPER = process.env.PIN_PEPPER ?? "test-only-pepper";

const modules = import.meta.glob("../../convex/**/*.{ts,js}");

export type T = ReturnType<typeof newTest>;
export const newTest = () => convexTest(schema, modules);
export { api };

export type Person = { token: string; userId: Id<"users"> };

let nextPhone = 7000000000;
/** A signed-up person, through the real sign-up function. */
export async function person(t: T, displayName: string): Promise<Person> {
  nextPhone += 1;
  const phone = String(nextPhone);
  const res = await t.mutation(api.auth.signUp, { phone, pin: "1234", displayName });
  const userId = await t.run(async (ctx) => {
    const u = await ctx.db
      .query("users")
      .withIndex("by_phone", (q) => q.eq("phone", `+91${phone}`))
      .unique();
    return u!._id;
  });
  return { token: res.token, userId };
}

/** A community with the given people as active members. `tags` go on members. */
export async function community(
  t: T,
  admin: Person,
  members: Person[],
  tags: Record<string, Array<"junior" | "visitor">> = {},
) {
  const orgId = await t.run(async (ctx) => {
    const now = Date.now();
    const id = await ctx.db.insert("orgs", {
      name: `Test ${now}`,
      createdBy: admin.userId,
      isDiscoverable: true,
      createdAt: now,
    });
    for (const [p, roles] of [
      [admin, ["admin", "player"]],
      ...members.map((m) => [m, ["player"]] as const),
    ] as const) {
      await ctx.db.insert("orgMembers", {
        orgId: id,
        userId: (p as Person).userId,
        roles: roles as unknown as Array<"admin" | "player">,
        status: "active",
        playerTags: tags[String((p as Person).userId)],
        requestedAt: now,
      } as never);
    }
    return id;
  });
  return orgId;
}

export type Ball = {
  runsBat?: number;
  out?: Id<"users">;
  wicketType?: "bowled" | "caught" | "runout";
  fielderId?: Id<"users">;
};

/** Plays a match of `overs` overs for each side through the real scoring functions. */
export async function playMatch(
  t: T,
  scorer: Person,
  orgId: Id<"orgs">,
  sideA: Person[],
  sideB: Person[],
  inningsOne: { striker: Person; other: Person; bowler: Person; balls: Ball[] },
  inningsTwo: { striker: Person; other: Person; bowler: Person; balls: Ball[] },
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
  for (const inn of [inningsOne, inningsTwo]) {
    await t.mutation(api.scoring.startInnings, {
      token,
      matchId,
      strikerId: inn.striker.userId,
      nonStrikerId: inn.other.userId,
      openingBowlerId: inn.bowler.userId,
    });
    for (const b of inn.balls) {
      await t.mutation(api.scoring.recordBall, {
        token,
        matchId,
        runsBat: b.runsBat ?? 0,
        ...(b.out
          ? { isWicket: true, wicketType: b.wicketType ?? "bowled", playerOutId: b.out, fielderId: b.fielderId }
          : {}),
      });
    }
  }
  return matchId;
}
