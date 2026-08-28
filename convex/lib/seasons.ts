import { Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

export type FeaturedSeason = {
  id: Id<"seasons">;
  name: string;
  status: "active" | "complete";
  seasonCount: number;
};

/**
 * Table scan on purpose: this table is tiny, and after a snapshot import
 * the by_org indexes can lag the documents.
 */
export async function seasonsForOrg(
  ctx: QueryCtx | MutationCtx,
  orgId: Id<"orgs">,
) {
  const rows = await ctx.db.query("seasons").collect();
  return rows
    .filter((s) => String(s.orgId) === String(orgId))
    .sort((a, b) => b.startedAt - a.startedAt);
}

export async function featuredSeasonForOrg(
  ctx: QueryCtx | MutationCtx,
  orgId: Id<"orgs">,
): Promise<FeaturedSeason | null> {
  const seasons = await seasonsForOrg(ctx, orgId);
  const featured =
    seasons.find((s) => s.status === "active") ?? seasons[0] ?? null;
  if (!featured) return null;
  return {
    id: featured._id,
    name: featured.name,
    status: featured.status,
    seasonCount: seasons.length,
  };
}
