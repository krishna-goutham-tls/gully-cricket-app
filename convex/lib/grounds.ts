import { QueryCtx, MutationCtx } from "../_generated/server";
import { Doc, Id } from "../_generated/dataModel";

/** What a community with no grounds calls the place it plays. */
export const HOME_LABEL = "Home";

export const GROUND_NAME_MAX = 30;

/** Every ground of a community, archived included. Communities have a few. */
export async function groundsOf(
  ctx: QueryCtx | MutationCtx,
  orgId: Id<"orgs">,
): Promise<Doc<"grounds">[]> {
  return ctx.db
    .query("grounds")
    .withIndex("by_org", (q) => q.eq("orgId", orgId))
    .collect();
}

/** The Home ground, or null for a community that has never added one. */
export async function homeGroundOf(
  ctx: QueryCtx | MutationCtx,
  orgId: Id<"orgs">,
): Promise<Doc<"grounds"> | null> {
  const all = await groundsOf(ctx, orgId);
  return all.find((g) => g.isHome && !g.archived) ?? null;
}

/**
 * A ground a new match or poll may be set at: this community's and not
 * archived. Absent resolves to Home (which may itself be absent).
 */
export async function resolvePlayableGround(
  ctx: MutationCtx,
  orgId: Id<"orgs">,
  groundId: Id<"grounds"> | undefined,
): Promise<Id<"grounds"> | undefined> {
  if (!groundId) return (await homeGroundOf(ctx, orgId))?._id;
  const g = await ctx.db.get(groundId);
  if (!g || String(g.orgId) !== String(orgId) || g.archived) {
    throw new Error("That ground is not one of this community's");
  }
  return g._id;
}
