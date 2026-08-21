import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import {
  getUserBySessionToken,
  requireActiveMembership,
  requireOrgAdmin,
  requireUser,
} from "./lib/session";
import { maskPhone } from "./lib/phone";
import { requireCreateOrgAllowance } from "./access";
import { deleteMatchCascade } from "./lib/matches";
import { orgRole } from "./schema";

export const create = mutation({
  args: {
    token: v.string(),
    name: v.string(),
    location: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Invite-only: the caller must hold an approved, unspent access request
    // (or be the platform owner). Without this the landing page's promise is
    // decoration — anyone who signs up could still mint their own community.
    const { user, request } = await requireCreateOrgAllowance(ctx, args.token);
    const name = args.name.trim();
    if (name.length < 2) throw new Error("Community name is too short");
    if (name.length > 60) throw new Error("Community name is too long");

    const now = Date.now();
    const orgId = await ctx.db.insert("orgs", {
      name,
      location: args.location?.trim() || undefined,
      createdBy: user._id,
      isDiscoverable: true,
      createdAt: now,
    });

    await ctx.db.insert("orgMembers", {
      orgId,
      userId: user._id,
      status: "active",
      roles: ["admin", "player"],
      requestedAt: now,
      decidedAt: now,
      decidedBy: user._id,
    });

    await ctx.db.patch(user._id, {
      preferredOrgId: orgId,
      updatedAt: now,
    });

    // Spend the approval: one vetted organiser gets one community. Null only
    // for the platform owner, who is not rate-limited by a request row.
    if (request) {
      await ctx.db.patch(request._id, { usedAt: now, usedOrgId: orgId });
    }

    return { orgId };
  },
});

/**
 * Enter the sandbox paired with a real org, creating it on first use.
 *
 * Isolation is structural rather than rule-based: leaderboards, player pools
 * and match lists are all scoped by org already, so a separate org keeps
 * sandbox scoring out of the real stats without a single "is this a sandbox?"
 * check in the stats or match code.
 *
 * Sandbox matches are meant to leave no residue, but scoring fundamentally
 * needs the ball log persisted (the engine replays it, and undo depends on
 * it). So instead of not saving, entry sweeps up: every sandbox match that is
 * no longer being scored is deleted, leaving each session a clean slate.
 * Anything still `live` is spared — the sandbox is shared, so a stray entry
 * must never delete a game someone is in the middle of.
 *
 * Membership re-syncs on every entry so anyone who joined the real org since
 * last time can be picked. Everyone is an admin in here — it's a sandbox, and
 * nobody should be locked out of resetting it.
 */
export const enterSandbox = mutation({
  args: {
    token: v.string(),
    orgId: v.id("orgs"),
  },
  handler: async (ctx, args) => {
    const { user } = await requireActiveMembership(ctx, args.token, args.orgId);
    const org = await ctx.db.get(args.orgId);
    if (!org) throw new Error("Org not found");
    if (org.isSandbox) {
      throw new Error("You're already in the sandbox");
    }

    const now = Date.now();
    let sandbox = await ctx.db
      .query("orgs")
      .withIndex("by_sandbox_for", (q) => q.eq("sandboxForOrgId", args.orgId))
      .first();

    if (!sandbox) {
      const sandboxId = await ctx.db.insert("orgs", {
        // Named so it's unmistakable wherever an org name is shown.
        name: `SANDBOX — ${org.name}`,
        location: org.location,
        createdBy: user._id,
        // Never surfaced in the join list — reached via the toggle only.
        isDiscoverable: false,
        isSandbox: true,
        sandboxForOrgId: args.orgId,
        createdAt: now,
      });
      sandbox = await ctx.db.get(sandboxId);
      if (!sandbox) throw new Error("Could not create the sandbox");
    }

    const stale = (
      await ctx.db
        .query("matches")
        .withIndex("by_org", (q) => q.eq("orgId", sandbox!._id))
        .collect()
    ).filter((m) => m.status !== "live");
    for (const m of stale) await deleteMatchCascade(ctx, m._id);

    const realMembers = await ctx.db
      .query("orgMembers")
      .withIndex("by_org_status", (q) =>
        q.eq("orgId", args.orgId).eq("status", "active"),
      )
      .collect();

    const existing = await ctx.db
      .query("orgMembers")
      .withIndex("by_org", (q) => q.eq("orgId", sandbox!._id))
      .collect();
    const already = new Set(existing.map((m) => String(m.userId)));

    for (const m of realMembers) {
      if (already.has(String(m.userId))) continue;
      await ctx.db.insert("orgMembers", {
        orgId: sandbox._id,
        userId: m.userId,
        status: "active",
        roles: ["admin", "player"],
        requestedAt: now,
        decidedAt: now,
        decidedBy: user._id,
      });
    }

    return { orgId: sandbox._id, name: sandbox.name, cleared: stale.length };
  },
});

/**
 * Wipe every match in a sandbox org on demand, keeping its player pool. Only
 * ever touches an org flagged isSandbox, so a real season can't be deleted
 * through this path.
 */
export const clearSandboxData = mutation({
  args: {
    token: v.string(),
    orgId: v.id("orgs"),
  },
  handler: async (ctx, args) => {
    await requireActiveMembership(ctx, args.token, args.orgId);
    const org = await ctx.db.get(args.orgId);
    if (!org) throw new Error("Org not found");
    if (!org.isSandbox) {
      throw new Error("That isn't a sandbox");
    }

    const matches = await ctx.db
      .query("matches")
      .withIndex("by_org", (q) => q.eq("orgId", args.orgId))
      .collect();
    for (const match of matches) await deleteMatchCascade(ctx, match._id);

    return { matchesRemoved: matches.length };
  },
});

export const listDiscoverable = query({
  args: {
    token: v.optional(v.string()),
    search: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await getUserBySessionToken(ctx, args.token);
    if (!user) return [];

    const orgs = (
      await ctx.db
        .query("orgs")
        .withIndex("by_discoverable", (q) => q.eq("isDiscoverable", true))
        .collect()
    ).filter((o) => !o.isSandbox);

    const myMemberships = await ctx.db
      .query("orgMembers")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();
    const byOrg = new Map(myMemberships.map((m) => [m.orgId, m]));

    const q = args.search?.trim().toLowerCase();
    return orgs
      .filter((o) => {
        if (!q) return true;
        return (
          o.name.toLowerCase().includes(q) ||
          (o.location?.toLowerCase().includes(q) ?? false)
        );
      })
      .map((o) => ({
        _id: o._id,
        name: o.name,
        location: o.location,
        membershipStatus: byOrg.get(o._id)?.status ?? null,
        myRoles: byOrg.get(o._id)?.roles ?? [],
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  },
});

export const myMemberships = query({
  args: { token: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const user = await getUserBySessionToken(ctx, args.token);
    if (!user) return [];

    const memberships = await ctx.db
      .query("orgMembers")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();

    const rows = await Promise.all(
      memberships.map(async (m) => {
        const org = await ctx.db.get(m.orgId);
        if (!org) return null;
        return {
          membershipId: m._id,
          orgId: org._id,
          orgName: org.name,
          location: org.location,
          status: m.status,
          roles: m.roles,
          requestedAt: m.requestedAt,
        };
      }),
    );

    return rows.filter(Boolean);
  },
});

export const requestJoin = mutation({
  args: {
    token: v.string(),
    orgId: v.id("orgs"),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx, args.token);
    const org = await ctx.db.get(args.orgId);
    if (!org || !org.isDiscoverable) throw new Error("Org not found");

    const existing = await ctx.db
      .query("orgMembers")
      .withIndex("by_org_user", (q) => q.eq("orgId", args.orgId).eq("userId", user._id))
      .unique();

    const now = Date.now();
    if (existing) {
      if (existing.status === "active") throw new Error("Already a member");
      if (existing.status === "pending") throw new Error("Request already pending");
      if (existing.status === "rejected" || existing.status === "left" || existing.status === "removed") {
        await ctx.db.patch(existing._id, {
          status: "pending",
          roles: ["player"],
          requestedAt: now,
          decidedAt: undefined,
          decidedBy: undefined,
        });
        return { membershipId: existing._id, status: "pending" as const };
      }
    }

    const membershipId = await ctx.db.insert("orgMembers", {
      orgId: args.orgId,
      userId: user._id,
      status: "pending",
      roles: ["player"],
      requestedAt: now,
    });
    return { membershipId, status: "pending" as const };
  },
});

export const listPending = query({
  args: {
    token: v.optional(v.string()),
    orgId: v.id("orgs"),
  },
  handler: async (ctx, args) => {
    const user = await getUserBySessionToken(ctx, args.token);
    if (!user) return [];

    const membership = await ctx.db
      .query("orgMembers")
      .withIndex("by_org_user", (q) => q.eq("orgId", args.orgId).eq("userId", user._id))
      .unique();
    if (!membership || membership.status !== "active" || !membership.roles.includes("admin")) {
      return [];
    }

    const pending = await ctx.db
      .query("orgMembers")
      .withIndex("by_org_status", (q) => q.eq("orgId", args.orgId).eq("status", "pending"))
      .collect();

    const rows = await Promise.all(
      pending.map(async (m) => {
        const u = await ctx.db.get(m.userId);
        if (!u) return null;
        return {
          membershipId: m._id,
          userId: u._id,
          displayName: u.displayName,
          phoneMasked: u.phone ? maskPhone(u.phone) : "—",
          primaryRole: u.primaryRole,
          requestedAt: m.requestedAt,
        };
      }),
    );

    return rows
      .filter(Boolean)
      .sort((a, b) => (a!.requestedAt < b!.requestedAt ? 1 : -1));
  },
});

export const approveMember = mutation({
  args: {
    token: v.string(),
    membershipId: v.id("orgMembers"),
  },
  handler: async (ctx, args) => {
    const membership = await ctx.db.get(args.membershipId);
    if (!membership) throw new Error("Request not found");
    const { user } = await requireOrgAdmin(ctx, args.token, membership.orgId);
    if (membership.status !== "pending") throw new Error("Not a pending request");

    await ctx.db.patch(membership._id, {
      status: "active",
      decidedAt: Date.now(),
      decidedBy: user._id,
      roles: membership.roles.includes("player")
        ? membership.roles
        : [...membership.roles, "player"],
    });
    return { ok: true };
  },
});

export const rejectMember = mutation({
  args: {
    token: v.string(),
    membershipId: v.id("orgMembers"),
  },
  handler: async (ctx, args) => {
    const membership = await ctx.db.get(args.membershipId);
    if (!membership) throw new Error("Request not found");
    const { user } = await requireOrgAdmin(ctx, args.token, membership.orgId);
    if (membership.status !== "pending") throw new Error("Not a pending request");

    await ctx.db.patch(membership._id, {
      status: "rejected",
      decidedAt: Date.now(),
      decidedBy: user._id,
    });
    return { ok: true };
  },
});

export const setRoles = mutation({
  args: {
    token: v.string(),
    orgId: v.id("orgs"),
    userId: v.id("users"),
    roles: v.array(orgRole),
  },
  handler: async (ctx, args) => {
    await requireOrgAdmin(ctx, args.token, args.orgId);
    const membership = await ctx.db
      .query("orgMembers")
      .withIndex("by_org_user", (q) => q.eq("orgId", args.orgId).eq("userId", args.userId))
      .unique();
    if (!membership || membership.status !== "active") {
      throw new Error("Member not found");
    }

    const roles = Array.from(new Set(args.roles));
    if (!roles.includes("player")) roles.push("player");
    if (roles.length === 0) throw new Error("At least one role required");

    await ctx.db.patch(membership._id, { roles });
    return { ok: true, roles };
  },
});

export const listActiveMembers = query({
  args: {
    token: v.optional(v.string()),
    orgId: v.id("orgs"),
    search: v.optional(v.string()),
    roleFilter: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await getUserBySessionToken(ctx, args.token);
    if (!user) return [];

    const me = await ctx.db
      .query("orgMembers")
      .withIndex("by_org_user", (q) => q.eq("orgId", args.orgId).eq("userId", user._id))
      .unique();
    if (!me || me.status !== "active") return [];

    const members = await ctx.db
      .query("orgMembers")
      .withIndex("by_org_status", (q) => q.eq("orgId", args.orgId).eq("status", "active"))
      .collect();

    const q = args.search?.trim().toLowerCase();
    const rows = await Promise.all(
      members.map(async (m) => {
        const u = await ctx.db.get(m.userId);
        if (!u) return null;
        if (q && !u.displayName.toLowerCase().includes(q)) return null;
        if (args.roleFilter && u.primaryRole !== args.roleFilter) return null;
        return {
          userId: u._id,
          displayName: u.displayName,
          photoUrl: u.photoUrl,
          bio: u.bio,
          primaryRole: u.primaryRole,
          secondaryRole: u.secondaryRole,
          roles: m.roles,
        };
      }),
    );

    return rows
      .filter(Boolean)
      .sort((a, b) => a!.displayName.localeCompare(b!.displayName));
  },
});

export const getOrg = query({
  args: {
    token: v.optional(v.string()),
    orgId: v.id("orgs"),
  },
  handler: async (ctx, args) => {
    const user = await getUserBySessionToken(ctx, args.token);
    if (!user) return null;
    const org = await ctx.db.get(args.orgId);
    if (!org) return null;
    const membership = await ctx.db
      .query("orgMembers")
      .withIndex("by_org_user", (q) => q.eq("orgId", args.orgId).eq("userId", user._id))
      .unique();
    if (!membership || membership.status !== "active") return null;
    return {
      _id: org._id,
      name: org.name,
      location: org.location,
      roles: membership.roles,
    };
  },
});
