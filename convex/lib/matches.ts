import { MutationCtx } from "../_generated/server";
import { Id } from "../_generated/dataModel";

/**
 * Delete a match and everything scored in it (balls, innings, live state).
 *
 * Shared by the sandbox sweep (`orgs.enterSandbox` / `orgs.clearSandboxData`)
 * and tournament deletion, which only ever hands it matches that were never
 * started — see `tournaments.remove`.
 */
export async function deleteMatchCascade(
  ctx: MutationCtx,
  matchId: Id<"matches">,
): Promise<void> {
  const balls = await ctx.db
    .query("balls")
    .withIndex("by_match", (q) => q.eq("matchId", matchId))
    .collect();
  for (const b of balls) await ctx.db.delete(b._id);

  const innings = await ctx.db
    .query("innings")
    .withIndex("by_match", (q) => q.eq("matchId", matchId))
    .collect();
  for (const i of innings) await ctx.db.delete(i._id);

  const live = await ctx.db
    .query("matchLiveState")
    .withIndex("by_match", (q) => q.eq("matchId", matchId))
    .unique();
  if (live) await ctx.db.delete(live._id);

  await ctx.db.delete(matchId);
}
