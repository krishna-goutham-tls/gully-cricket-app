import { Id } from "../_generated/dataModel";
import { MutationCtx, QueryCtx } from "../_generated/server";

export type PlayerTag = "visitor" | "junior";
export type LegacyPlayerLabel = "regular" | "visitor" | "junior";

const TAG_ORDER: PlayerTag[] = ["visitor", "junior"];

export function sortTags(tags: Iterable<PlayerTag>): PlayerTag[] {
  const set = new Set(tags);
  return TAG_ORDER.filter((t) => set.has(t));
}

export function looksLikeJunior(name: string): boolean {
  return /\bjr\.?\s*$/i.test(name.trim());
}

/**
 * `playerTags` wins once written (including `[]` = regular). Until then,
 * fall back to the old exclusive `playerLabel`, then to isGuest → visitor.
 */
export function resolvePlayerTags(
  storedTags: PlayerTag[] | undefined,
  legacyLabel: LegacyPlayerLabel | undefined,
  isGuest: boolean,
): PlayerTag[] {
  if (storedTags !== undefined) return sortTags(storedTags);
  const tags: PlayerTag[] = [];
  if (legacyLabel === "visitor" || (!legacyLabel && isGuest)) {
    tags.push("visitor");
  }
  if (legacyLabel === "junior") tags.push("junior");
  return tags;
}

export function isBoardRegular(tags: PlayerTag[]): boolean {
  return tags.length === 0;
}

export async function tagsForMember(
  ctx: QueryCtx | MutationCtx,
  orgId: Id<"orgs">,
  userId: Id<"users">,
): Promise<PlayerTag[]> {
  const membership = await ctx.db
    .query("orgMembers")
    .withIndex("by_org_user", (q) =>
      q.eq("orgId", orgId).eq("userId", userId),
    )
    .unique();
  const user = await ctx.db.get(userId);
  return resolvePlayerTags(
    membership?.playerTags,
    membership?.playerLabel,
    user?.isGuest ?? false,
  );
}

export async function tagsForUsers(
  ctx: QueryCtx | MutationCtx,
  orgId: Id<"orgs">,
  userIds: Iterable<string>,
): Promise<Map<string, PlayerTag[]>> {
  const map = new Map<string, PlayerTag[]>();
  await Promise.all(
    Array.from(userIds).map(async (key) => {
      map.set(key, await tagsForMember(ctx, orgId, key as Id<"users">));
    }),
  );
  return map;
}
