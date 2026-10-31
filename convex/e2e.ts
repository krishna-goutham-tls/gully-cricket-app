import { internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { normalizePhone } from "./lib/phone";

/**
 * Test scripts ask this first. Only Convex dev has E2E_ALLOWED set, so the
 * seed stops on any other deployment.
 */
export const guard = internalQuery({
  args: {},
  handler: async () => {
    if (process.env.E2E_ALLOWED !== "1") {
      throw new Error("Test scripts do not run on this deployment");
    }
    return { allowed: true };
  },
});

/** Takes a test number's account away, so an invite test can start as a stranger. */
export const forgetPhone = internalMutation({
  args: { phone: v.string() },
  handler: async (ctx, args) => {
    if (process.env.E2E_ALLOWED !== "1") {
      throw new Error("Test scripts do not run on this deployment");
    }
    const phone = normalizePhone(args.phone);
    if (!phone) return { forgotten: false };
    const user = await ctx.db
      .query("users")
      .withIndex("by_phone", (q) => q.eq("phone", phone))
      .unique();
    if (!user) return { forgotten: false };
    const rows = await ctx.db
      .query("orgMembers")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();
    for (const r of rows) await ctx.db.delete(r._id);
    await ctx.db.delete(user._id);
    return { forgotten: true };
  },
});

/** Takes away a community a test made through the screens. */
export const forgetOrg = internalMutation({
  args: { orgId: v.id("orgs") },
  handler: async (ctx, args) => {
    if (process.env.E2E_ALLOWED !== "1") {
      throw new Error("Test scripts do not run on this deployment");
    }
    const rows = await ctx.db
      .query("orgMembers")
      .withIndex("by_org", (q) => q.eq("orgId", args.orgId))
      .collect();
    for (const r of rows) {
      const user = await ctx.db.get(r.userId);
      if (user?.preferredOrgId === args.orgId) {
        await ctx.db.patch(r.userId, { preferredOrgId: undefined });
      }
      await ctx.db.delete(r._id);
    }
    await ctx.db.delete(args.orgId);
    return { forgotten: true };
  },
});

/** Lets a test see a community as if nobody has joined by link yet. */
export const clearLinkMarks = internalMutation({
  args: { orgId: v.id("orgs") },
  handler: async (ctx, args) => {
    if (process.env.E2E_ALLOWED !== "1") {
      throw new Error("Test scripts do not run on this deployment");
    }
    const rows = await ctx.db
      .query("orgMembers")
      .withIndex("by_org", (q) => q.eq("orgId", args.orgId))
      .collect();
    for (const r of rows) {
      if (r.joinedByLinkAt) await ctx.db.patch(r._id, { joinedByLinkAt: undefined });
    }
    return { cleared: true };
  },
});
