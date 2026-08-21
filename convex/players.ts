import { v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import { requireActiveMembership, requireOrgAdmin } from "./lib/session";
import { normalizePhone } from "./lib/phone";
import { playerTag } from "./schema";
import {
  looksLikeJunior,
  resolvePlayerTags,
  sortTags,
  type PlayerTag,
} from "./lib/playerLabel";

/**
 * Quick-add a guest player to the org pool. Guests have no PIN; if a phone
 * is given, signing up with that phone later claims this player and all
 * their match history. Walk-ons start as Visitor; a "Jr." name also gets Junior.
 */
export const addGuest = mutation({
  args: {
    token: v.string(),
    orgId: v.id("orgs"),
    name: v.string(),
    phone: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { user } = await requireActiveMembership(ctx, args.token, args.orgId);

    const rawName = args.name.trim();
    if (rawName.length < 2) throw new Error("Name is too short");
    if (rawName.length > 40) throw new Error("Name is too long");

    // Two guests (or a guest and a real player) sharing a name are otherwise
    // indistinguishable everywhere a display name is shown alone — the draft
    // pool, pickers, scorecards. Centralized here so every addGuest call site
    // (match create, tournament create, mid-match squad edit, players page)
    // gets it for free.
    const orgMembers = await ctx.db
      .query("orgMembers")
      .withIndex("by_org_status", (q) =>
        q.eq("orgId", args.orgId).eq("status", "active"),
      )
      .collect();
    const existingNames = new Set(
      (
        await Promise.all(orgMembers.map((m) => ctx.db.get(m.userId)))
      )
        .filter((u): u is NonNullable<typeof u> => u !== null)
        .map((u) => u.displayName.trim().toLowerCase()),
    );
    let displayName = rawName.slice(0, 36);
    if (existingNames.has(displayName.toLowerCase())) {
      for (let n = 2; n < 100; n++) {
        const candidate = `${displayName} (${n})`;
        if (!existingNames.has(candidate.toLowerCase())) {
          displayName = candidate;
          break;
        }
      }
    }

    let phone: string | undefined;
    if (args.phone && args.phone.trim().length > 0) {
      const normalized = normalizePhone(args.phone);
      if (!normalized) throw new Error("Enter a valid phone number");
      const existing = await ctx.db
        .query("users")
        .withIndex("by_phone", (q) => q.eq("phone", normalized))
        .unique();
      if (existing) {
        throw new Error(
          `This number already belongs to ${existing.displayName}. Pick them from the list instead.`,
        );
      }
      phone = normalized;
    }

    const now = Date.now();
    const userId = await ctx.db.insert("users", {
      phone,
      displayName,
      isGuest: true,
      failedPinAttempts: 0,
      createdAt: now,
      updatedAt: now,
    });

    const tags: PlayerTag[] = ["visitor"];
    if (looksLikeJunior(displayName)) tags.push("junior");

    await ctx.db.insert("orgMembers", {
      orgId: args.orgId,
      userId,
      status: "active",
      roles: ["player"],
      playerTags: sortTags(tags),
      requestedAt: now,
      decidedAt: now,
      decidedBy: user._id,
    });

    return { userId, displayName };
  },
});

/** The org player pool: every active member (including guests). */
export const listOrgPlayers = query({
  args: {
    token: v.optional(v.string()),
    orgId: v.id("orgs"),
  },
  handler: async (ctx, args) => {
    try {
      await requireActiveMembership(ctx, args.token, args.orgId);
    } catch {
      return [];
    }

    const members = await ctx.db
      .query("orgMembers")
      .withIndex("by_org_status", (q) =>
        q.eq("orgId", args.orgId).eq("status", "active"),
      )
      .collect();

    const rows = await Promise.all(
      members.map(async (m) => {
        const u = await ctx.db.get(m.userId);
        if (!u) return null;
        return {
          userId: u._id,
          displayName: u.displayName,
          isGuest: u.isGuest ?? false,
          playerTags: resolvePlayerTags(
            m.playerTags,
            m.playerLabel,
            u.isGuest ?? false,
          ),
          isAdmin: m.roles.includes("admin"),
          photoUrl: u.photoUrl,
        };
      }),
    );

    return rows
      .filter((r): r is NonNullable<typeof r> => r !== null)
      .sort((a, b) => a.displayName.localeCompare(b.displayName));
  },
});

/**
 * Counts for the admin badge in the app shell: things waiting on an admin
 * decision right now. Runs on every screen for every member, so it stays two
 * indexed reads and returns zeroes instead of throwing for non-admins.
 * Approved PIN resets are excluded — those are already actioned; they linger
 * in the Players list only until the player burns the temp PIN.
 */
export const pendingApprovals = query({
  args: {
    token: v.optional(v.string()),
    orgId: v.id("orgs"),
  },
  handler: async (ctx, args) => {
    const none = { isAdmin: false, joinRequests: 0, pinResets: 0, total: 0 };

    let isAdmin = false;
    try {
      const { membership } = await requireActiveMembership(
        ctx,
        args.token,
        args.orgId,
      );
      isAdmin = membership.roles.includes("admin");
    } catch {
      return none;
    }
    if (!isAdmin) return none;

    const joinRequests = (
      await ctx.db
        .query("orgMembers")
        .withIndex("by_org_status", (q) =>
          q.eq("orgId", args.orgId).eq("status", "pending"),
        )
        .collect()
    ).length;

    const pinResets = (
      await ctx.db
        .query("pinResets")
        .withIndex("by_org_status", (q) =>
          q.eq("orgId", args.orgId).eq("status", "pending"),
        )
        .collect()
    ).length;

    return {
      isAdmin: true,
      joinRequests,
      pinResets,
      total: joinRequests + pinResets,
    };
  },
});

/**
 * Admin-only. Turns one board tag on or off. Visitor and junior stack.
 */
export const togglePlayerTag = mutation({
  args: {
    token: v.string(),
    orgId: v.id("orgs"),
    userId: v.id("users"),
    tag: playerTag,
  },
  handler: async (ctx, args) => {
    await requireOrgAdmin(ctx, args.token, args.orgId);
    const membership = await ctx.db
      .query("orgMembers")
      .withIndex("by_org_user", (q) =>
        q.eq("orgId", args.orgId).eq("userId", args.userId),
      )
      .unique();
    if (!membership || membership.status !== "active") {
      throw new Error("Member not found");
    }
    const user = await ctx.db.get(args.userId);
    const current = resolvePlayerTags(
      membership.playerTags,
      membership.playerLabel,
      user?.isGuest ?? false,
    );
    const next = current.includes(args.tag)
      ? current.filter((t) => t !== args.tag)
      : [...current, args.tag];
    const playerTags = sortTags(next);
    await ctx.db.patch(membership._id, { playerTags });
    return { ok: true, playerTags };
  },
});

/**
 * One-shot: write playerTags from the old exclusive label, stamp Visitor on
 * unclaimed walk-ons, and Junior on names that end in Jr.
 *   npx convex run players:backfillPlayerTags '{}'
 */
export const backfillPlayerTags = internalMutation({
  args: {},
  handler: async (ctx) => {
    const members = await ctx.db.query("orgMembers").collect();
    let patched = 0;
    for (const m of members) {
      const u = await ctx.db.get(m.userId);
      const tags = new Set(
        resolvePlayerTags(m.playerTags, m.playerLabel, u?.isGuest ?? false),
      );
      if (u && looksLikeJunior(u.displayName)) tags.add("junior");
      if (u?.isGuest) tags.add("visitor");
      const playerTags = sortTags(tags);
      const same =
        m.playerTags !== undefined &&
        m.playerTags.length === playerTags.length &&
        m.playerTags.every((t, i) => t === playerTags[i]);
      if (same) continue;
      await ctx.db.patch(m._id, { playerTags });
      patched += 1;
    }
    return { patched };
  },
});
