import { QueryCtx, MutationCtx } from "../_generated/server";
import { Id } from "../_generated/dataModel";
import { hashToken } from "./crypto";

const SESSION_MS = 1000 * 60 * 60 * 24 * 60; // 60 days

export function sessionTtlMs() {
  return SESSION_MS;
}

export async function getUserBySessionToken(
  ctx: QueryCtx | MutationCtx,
  token: string | null | undefined,
) {
  if (!token) return null;
  const tokenHash = await hashToken(token);
  const session = await ctx.db
    .query("sessions")
    .withIndex("by_tokenHash", (q) => q.eq("tokenHash", tokenHash))
    .unique();
  if (!session) return null;
  if (session.expiresAt < Date.now()) return null;
  const user = await ctx.db.get(session.userId);
  return user;
}

export async function requireUser(
  ctx: QueryCtx | MutationCtx,
  token: string | null | undefined,
) {
  const user = await getUserBySessionToken(ctx, token);
  if (!user) throw new Error("Not authenticated");
  return user;
}

export async function getActiveMembership(
  ctx: QueryCtx | MutationCtx,
  orgId: Id<"orgs">,
  userId: Id<"users">,
) {
  const membership = await ctx.db
    .query("orgMembers")
    .withIndex("by_org_user", (q) => q.eq("orgId", orgId).eq("userId", userId))
    .unique();
  if (!membership || membership.status !== "active") return null;
  return membership;
}

export async function requireActiveMembership(
  ctx: QueryCtx | MutationCtx,
  token: string | null | undefined,
  orgId: Id<"orgs">,
) {
  const user = await requireUser(ctx, token);
  const membership = await getActiveMembership(ctx, orgId, user._id);
  if (!membership) {
    throw new Error("Not an active member of this org");
  }
  return { user, membership };
}

/**
 * Read access to a community. A real member sees it as themselves. The
 * platform owner may also watch a community they have not joined: no
 * membership row, so they do not appear on the board or in team pickers.
 */
export async function requireOrgViewer(
  ctx: QueryCtx | MutationCtx,
  token: string | null | undefined,
  orgId: Id<"orgs">,
) {
  const user = await requireUser(ctx, token);
  const membership = await getActiveMembership(ctx, orgId, user._id);
  if (membership) {
    return { user, membership, isObserver: false as const };
  }
  if (user.isPlatformAdmin ?? false) {
    return { user, membership: null, isObserver: true as const };
  }
  throw new Error("Not an active member of this org");
}

/**
 * The platform owner. Gates the access-request queue, creating a community
 * without a vetted request, and read-only observation of every community.
 */
export async function requirePlatformAdmin(
  ctx: QueryCtx | MutationCtx,
  token: string | null | undefined,
) {
  const user = await requireUser(ctx, token);
  if (!(user.isPlatformAdmin ?? false)) throw new Error("Not authorized");
  return user;
}

export async function requireOrgAdmin(
  ctx: QueryCtx | MutationCtx,
  token: string | null | undefined,
  orgId: Id<"orgs">,
) {
  const { user, membership } = await requireActiveMembership(ctx, token, orgId);
  if (!membership.roles.includes("admin")) {
    throw new Error("Admin only");
  }
  return { user, membership };
}
