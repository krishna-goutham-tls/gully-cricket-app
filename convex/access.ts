import { v } from "convex/values";
import {
  internalMutation,
  mutation,
  query,
  MutationCtx,
  QueryCtx,
} from "./_generated/server";
import { Doc, Id } from "./_generated/dataModel";
import { normalizePhone } from "./lib/phone";
import { isGroupSize, isGroupType } from "./lib/access";
import {
  getUserBySessionToken,
  requirePlatformAdmin,
  requireUser,
} from "./lib/session";

/** How many decided rows the queue keeps visible for reference. */
const RECENT_DECIDED = 20;

function publicRequest(r: Doc<"accessRequests">) {
  return {
    requestId: r._id,
    // Kept whole, not masked: the entire point is that Krishna WhatsApps them.
    name: r.name,
    phone: r.phone,
    groupType: r.groupType,
    groupSize: r.groupSize,
    status: r.status,
    requestedAt: r.requestedAt,
    decidedAt: r.decidedAt,
    used: r.usedAt !== undefined,
  };
}

/**
 * The old landing-page form. No screen calls it since open sign-up
 * (2026-11-03); old phones may, until Phase 7 removes it. Unauthenticated by necessity — the person filling it
 * in has no account and must not get one from this call. It creates a request
 * and nothing else: no user, no org, no membership.
 *
 * Exactly one row per phone number, ever. A repeat submission (pending,
 * approved or dismissed) is answered as "already have it" rather than
 * stacking a second row, which keeps the queue honest and makes the endpoint
 * pointless to hammer. A dismissed number stays dismissed until Krishna flips
 * it back from the queue — resubmitting cannot launder a rejection.
 */
export const submitRequest = mutation({
  args: {
    name: v.string(),
    phone: v.string(),
    groupType: v.optional(v.string()),
    groupSize: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const phone = normalizePhone(args.phone);
    if (!phone) throw new Error("Enter a valid WhatsApp number");

    // Anything not offered as a chip is junk or a stale client — drop it
    // rather than storing free text that lands in the admin queue.
    const groupType =
      args.groupType && isGroupType(args.groupType) ? args.groupType : "";
    const groupSize =
      args.groupSize && isGroupSize(args.groupSize) ? args.groupSize : "";

    const existing = await ctx.db
      .query("accessRequests")
      .withIndex("by_phone", (q) => q.eq("phone", phone))
      .first();
    if (existing) return { alreadyRequested: true };

    await ctx.db.insert("accessRequests", {
      name: args.name.trim().slice(0, 60),
      phone,
      groupType,
      groupSize,
      status: "pending",
      requestedAt: Date.now(),
    });

    return { alreadyRequested: false };
  },
});

/**
 * The old badge count. No screen calls it since open sign-up (2026-11-03);
 * it stays for old phones until Phase 7. Must never throw — a non-owner gets zero.
 */
export const pendingCount = query({
  args: { token: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const user = await getUserBySessionToken(ctx, args.token);
    if (!user || !(user.isPlatformAdmin ?? false)) return 0;

    const pending = await ctx.db
      .query("accessRequests")
      .withIndex("by_status", (q) => q.eq("status", "pending"))
      .collect();
    return pending.length;
  },
});

/** The owner's queue: everything waiting, plus recent decisions for context. */
export const listRequests = query({
  args: { token: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const user = await getUserBySessionToken(ctx, args.token);
    if (!user || !(user.isPlatformAdmin ?? false)) {
      return { pending: [], decided: [] };
    }

    const pending = await ctx.db
      .query("accessRequests")
      .withIndex("by_status", (q) => q.eq("status", "pending"))
      .collect();

    const approved = await ctx.db
      .query("accessRequests")
      .withIndex("by_status", (q) => q.eq("status", "approved"))
      .collect();
    const dismissed = await ctx.db
      .query("accessRequests")
      .withIndex("by_status", (q) => q.eq("status", "dismissed"))
      .collect();

    return {
      pending: pending
        .sort((a, b) => b.requestedAt - a.requestedAt)
        .map(publicRequest),
      decided: [...approved, ...dismissed]
        .sort((a, b) => (b.decidedAt ?? 0) - (a.decidedAt ?? 0))
        .slice(0, RECENT_DECIDED)
        .map(publicRequest),
    };
  },
});

/**
 * Approve: unlocks that phone number to create ONE community. Re-approving a
 * dismissed row is allowed and intentional — a wrong call should be
 * recoverable without touching the database by hand.
 */
export const approveRequest = mutation({
  args: { token: v.string(), requestId: v.id("accessRequests") },
  handler: async (ctx, args) => {
    const admin = await requirePlatformAdmin(ctx, args.token);
    const req = await ctx.db.get(args.requestId);
    if (!req) throw new Error("Request not found");
    if (req.usedAt) throw new Error("Already used to create a community");

    await ctx.db.patch(req._id, {
      status: "approved",
      decidedAt: Date.now(),
      decidedBy: admin._id,
    });
    return { ok: true };
  },
});

export const dismissRequest = mutation({
  args: { token: v.string(), requestId: v.id("accessRequests") },
  handler: async (ctx, args) => {
    const admin = await requirePlatformAdmin(ctx, args.token);
    const req = await ctx.db.get(args.requestId);
    if (!req) throw new Error("Request not found");
    // Their community already exists — dismissing now would be a lie the UI
    // can't act on. Remove them from the community instead.
    if (req.usedAt) throw new Error("Already used to create a community");

    await ctx.db.patch(req._id, {
      status: "dismissed",
      decidedAt: Date.now(),
      decidedBy: admin._id,
    });
    return { ok: true };
  },
});

/**
 * Whether the signed-in user may create a community right now. Anyone signed
 * in may (Krishna, 2026-11-03), up to `MAX_COMMUNITIES`. Mirrors
 * `requireCreateOrgAllowance` below, so the screen and the guard agree.
 */
export const canCreateOrg = query({
  args: { token: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const user = await getUserBySessionToken(ctx, args.token);
    if (!user) return { allowed: false, reason: "signed-out" as const };
    if (user.isPlatformAdmin ?? false) {
      return { allowed: true, reason: "platform-admin" as const };
    }
    if ((await communitiesMadeBy(ctx, user._id)) >= MAX_COMMUNITIES) {
      return { allowed: false, reason: "cap" as const };
    }
    return { allowed: true, reason: "open" as const };
  },
});

/**
 * Flip the platform-owner bit. Internal on purpose — reachable only from the
 * Convex dashboard or CLI, never from the app, so owning the app is not a
 * path to becoming its owner.
 *
 * Run once per deployment (dev and prod are separate databases):
 *   npx convex run access:setPlatformAdmin '{"phone":"9999999999"}'
 */
export const setPlatformAdmin = internalMutation({
  args: { phone: v.string(), value: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const phone = normalizePhone(args.phone);
    if (!phone) throw new Error("Enter a valid phone number");

    const user = await ctx.db
      .query("users")
      .withIndex("by_phone", (q) => q.eq("phone", phone))
      .unique();
    if (!user) throw new Error(`No account for ${phone}`);

    await ctx.db.patch(user._id, {
      isPlatformAdmin: args.value ?? true,
      updatedAt: Date.now(),
    });
    return { displayName: user.displayName, isPlatformAdmin: args.value ?? true };
  },
});

/** Signed-in echo of the owner bit, for UI that shouldn't render at all. */
export const amPlatformAdmin = query({
  args: { token: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const user = await getUserBySessionToken(ctx, args.token);
    return user?.isPlatformAdmin ?? false;
  },
});

/** A person may create this many communities. The platform owner has no cap. */
export const MAX_COMMUNITIES = 3;

/** Real communities this person made, closed ones too, so closing frees no slot. */
async function communitiesMadeBy(ctx: QueryCtx | MutationCtx, userId: Id<"users">) {
  const made = await ctx.db
    .query("orgs")
    .withIndex("by_created_by", (q) => q.eq("createdBy", userId))
    .collect();
  return made.filter((o) => !o.isSandbox).length;
}

/** Guard used by `orgs.create`; exported so the rule lives in one file. */
export async function requireCreateOrgAllowance(
  ctx: MutationCtx,
  token: string,
) {
  const user = await requireUser(ctx, token);
  if (user.isPlatformAdmin ?? false) return { user };
  if ((await communitiesMadeBy(ctx, user._id)) >= MAX_COMMUNITIES) {
    throw new Error(`You can make ${MAX_COMMUNITIES} communities at most.`);
  }
  return { user };
}
