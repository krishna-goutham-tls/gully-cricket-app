import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { Doc } from "./_generated/dataModel";
import { hashPin, hashToken, randomToken, verifyPin } from "./lib/crypto";
import { isValidPin, normalizePhone } from "./lib/phone";
import {
  getUserBySessionToken,
  requireOrgAdmin,
  sessionTtlMs,
} from "./lib/session";
import { playerRole } from "./schema";
import { resolvePlayerTags, sortTags } from "./lib/playerLabel";

const MAX_FAILED = 8;
const LOCK_MS = 1000 * 60 * 15;

function publicUser(user: Doc<"users">) {
  return {
    _id: user._id,
    phone: user.phone,
    displayName: user.displayName,
    photoUrl: user.photoUrl,
    bio: user.bio,
    isGuest: user.isGuest ?? false,
    mustChangePin: user.mustChangePin ?? false,
    primaryRole: user.primaryRole,
    secondaryRole: user.secondaryRole,
    preferredOrgId: user.preferredOrgId,
    createdAt: user.createdAt,
  };
}

export const me = query({
  args: { token: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const user = await getUserBySessionToken(ctx, args.token);
    if (!user) return null;
    return publicUser(user);
  },
});

/**
 * Single round-trip session bootstrap: current user + memberships (with org
 * names) in one query, so the app shell renders without a query waterfall.
 */
export const bootstrap = query({
  args: { token: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const user = await getUserBySessionToken(ctx, args.token);
    if (!user) return null;

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
          // Lets the shell flag sandbox mode without a second round trip,
          // and works off the localStorage cache on a warm start.
          isSandbox: org.isSandbox ?? false,
          sandboxForOrgId: org.sandboxForOrgId,
        };
      }),
    );

    return {
      user: publicUser(user),
      memberships: rows.filter((r): r is NonNullable<typeof r> => r !== null),
    };
  },
});

export const signUp = mutation({
  args: {
    phone: v.string(),
    pin: v.string(),
    displayName: v.string(),
  },
  handler: async (ctx, args) => {
    const phone = normalizePhone(args.phone);
    if (!phone) throw new Error("Enter a valid phone number");
    if (!isValidPin(args.pin)) throw new Error("PIN must be 4 digits");
    const displayName = args.displayName.trim();
    if (displayName.length < 2) throw new Error("Name is too short");
    if (displayName.length > 40) throw new Error("Name is too long");

    const existing = await ctx.db
      .query("users")
      .withIndex("by_phone", (q) => q.eq("phone", phone))
      .unique();

    const now = Date.now();

    // Someone already owns this phone with a real PIN — most likely this is
    // that same player hitting "Create account" out of habit rather than a
    // stranger. Treat it as a sign-in attempt on their existing account
    // instead of bouncing them to a separate screen.
    if (existing && (!(existing.isGuest ?? false) || existing.pinHash)) {
      if (!existing.pinHash || !existing.pinSalt) {
        throw new Error("Phone already registered. Sign in instead.");
      }
      if (existing.lockUntil && existing.lockUntil > now) {
        throw new Error("Too many attempts. Try again in a few minutes.");
      }

      const ok = await verifyPin(args.pin, existing.pinSalt, existing.pinHash);
      if (!ok) {
        const failed = existing.failedPinAttempts + 1;
        await ctx.db.patch(existing._id, {
          failedPinAttempts: failed,
          lockUntil: failed >= MAX_FAILED ? now + LOCK_MS : undefined,
          updatedAt: now,
        });
        throw new Error(
          "Phone already registered and that PIN didn't match. Sign in instead.",
        );
      }

      await ctx.db.patch(existing._id, {
        failedPinAttempts: 0,
        lockUntil: undefined,
        updatedAt: now,
      });

      const token = randomToken(32);
      const tokenHash = await hashToken(token);
      await ctx.db.insert("sessions", {
        userId: existing._id,
        tokenHash,
        expiresAt: now + sessionTtlMs(),
        createdAt: now,
      });

      return { token, user: publicUser(existing), claimed: false };
    }

    const { hash, salt } = await hashPin(args.pin);

    let userId;
    if (existing) {
      // Claim: the guest row becomes the real account — all match history
      // already points at this user id, so nothing needs migrating.
      await ctx.db.patch(existing._id, {
        pinHash: hash,
        pinSalt: salt,
        displayName,
        isGuest: false,
        failedPinAttempts: 0,
        lockUntil: undefined,
        updatedAt: now,
      });
      userId = existing._id;
      // Walk-on stays a Visitor on the board until an admin says otherwise.
      // isGuest is about to flip false, so make sure Visitor is in the tags
      // without wiping Junior if they already have it.
      const memberships = await ctx.db
        .query("orgMembers")
        .withIndex("by_user", (q) => q.eq("userId", existing._id))
        .collect();
      for (const m of memberships) {
        const tags = new Set(
          resolvePlayerTags(m.playerTags, m.playerLabel, true),
        );
        tags.add("visitor");
        await ctx.db.patch(m._id, { playerTags: sortTags(tags) });
      }
    } else {
      userId = await ctx.db.insert("users", {
        phone,
        pinHash: hash,
        pinSalt: salt,
        displayName,
        failedPinAttempts: 0,
        createdAt: now,
        updatedAt: now,
      });
    }

    const token = randomToken(32);
    const tokenHash = await hashToken(token);
    await ctx.db.insert("sessions", {
      userId,
      tokenHash,
      expiresAt: now + sessionTtlMs(),
      createdAt: now,
    });

    const user = await ctx.db.get(userId);
    return { token, user: publicUser(user!), claimed: !!existing };
  },
});

export const signIn = mutation({
  args: {
    phone: v.string(),
    pin: v.string(),
  },
  handler: async (ctx, args) => {
    const phone = normalizePhone(args.phone);
    if (!phone) throw new Error("Enter a valid phone number");
    if (!isValidPin(args.pin)) throw new Error("PIN must be 4 digits");

    const user = await ctx.db
      .query("users")
      .withIndex("by_phone", (q) => q.eq("phone", phone))
      .unique();
    if (!user) throw new Error("No account for this phone. Sign up first.");
    if (!user.pinHash || !user.pinSalt) {
      throw new Error(
        "This number belongs to a guest player. Sign up to claim it.",
      );
    }

    const now = Date.now();
    if (user.lockUntil && user.lockUntil > now) {
      throw new Error("Too many attempts. Try again in a few minutes.");
    }

    const ok = await verifyPin(args.pin, user.pinSalt, user.pinHash);
    if (!ok) {
      const failed = user.failedPinAttempts + 1;
      await ctx.db.patch(user._id, {
        failedPinAttempts: failed,
        lockUntil: failed >= MAX_FAILED ? now + LOCK_MS : undefined,
        updatedAt: now,
      });
      throw new Error("Incorrect PIN");
    }

    await ctx.db.patch(user._id, {
      failedPinAttempts: 0,
      lockUntil: undefined,
      updatedAt: now,
    });

    const token = randomToken(32);
    const tokenHash = await hashToken(token);
    await ctx.db.insert("sessions", {
      userId: user._id,
      tokenHash,
      expiresAt: now + sessionTtlMs(),
      createdAt: now,
    });

    return { token, user: publicUser(user) };
  },
});

/** Cryptographically random 4-digit temp PIN. */
function randomPin(): string {
  const arr = new Uint32Array(1);
  crypto.getRandomValues(arr);
  return String(arr[0] % 10000).padStart(4, "0");
}

/**
 * Locked-out player asks their org admin to reset their PIN.
 * Unauthenticated by necessity — they cannot sign in. Idempotent: an
 * existing pending request is reused rather than stacked.
 */
export const requestPinReset = mutation({
  args: { phone: v.string() },
  handler: async (ctx, args) => {
    const phone = normalizePhone(args.phone);
    if (!phone) throw new Error("Enter a valid phone number");

    const user = await ctx.db
      .query("users")
      .withIndex("by_phone", (q) => q.eq("phone", phone))
      .unique();
    if (!user) throw new Error("No account for this phone. Sign up first.");

    const memberships = await ctx.db
      .query("orgMembers")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();
    const active = memberships.filter((m) => m.status === "active");
    if (active.length === 0) {
      throw new Error(
        "You are not in a community yet. Ask your community admin to add you.",
      );
    }

    const preferred =
      active.find((m) => m.orgId === user.preferredOrgId) ?? active[0];

    const existing = await ctx.db
      .query("pinResets")
      .withIndex("by_user_status", (q) =>
        q.eq("userId", user._id).eq("status", "pending"),
      )
      .unique();

    const org = await ctx.db.get(preferred.orgId);
    if (existing) {
      return { alreadyPending: true, orgName: org?.name ?? "your community" };
    }

    await ctx.db.insert("pinResets", {
      userId: user._id,
      orgId: preferred.orgId,
      status: "pending",
      requestedAt: Date.now(),
    });

    return { alreadyPending: false, orgName: org?.name ?? "your community" };
  },
});

/** Admin view of PIN reset requests, plus temp PINs still waiting to be used. */
export const listPinResets = query({
  args: { token: v.optional(v.string()), orgId: v.id("orgs") },
  handler: async (ctx, args) => {
    const user = await getUserBySessionToken(ctx, args.token);
    if (!user) return [];

    const membership = await ctx.db
      .query("orgMembers")
      .withIndex("by_org_user", (q) =>
        q.eq("orgId", args.orgId).eq("userId", user._id),
      )
      .unique();
    if (
      !membership ||
      membership.status !== "active" ||
      !membership.roles.includes("admin")
    ) {
      return [];
    }

    const pending = await ctx.db
      .query("pinResets")
      .withIndex("by_org_status", (q) =>
        q.eq("orgId", args.orgId).eq("status", "pending"),
      )
      .collect();
    const approved = await ctx.db
      .query("pinResets")
      .withIndex("by_org_status", (q) =>
        q.eq("orgId", args.orgId).eq("status", "approved"),
      )
      .collect();

    // Approved rows stay visible only while their temp PIN is unused
    const rows = [...pending, ...approved.filter((r) => r.tempPin)];

    const out = await Promise.all(
      rows.map(async (r) => {
        const u = await ctx.db.get(r.userId);
        if (!u) return null;
        return {
          resetId: r._id,
          userId: u._id,
          displayName: u.displayName,
          phone: u.phone,
          status: r.status,
          tempPin: r.tempPin,
          requestedAt: r.requestedAt,
        };
      }),
    );

    return out
      .filter((r): r is NonNullable<typeof r> => r !== null)
      .sort((a, b) => b.requestedAt - a.requestedAt);
  },
});

/**
 * Admin approves: generates a one-time temp PIN, clears any lockout, and
 * flags the account so the player must set their own PIN at next sign-in.
 */
export const approvePinReset = mutation({
  args: { token: v.string(), resetId: v.id("pinResets") },
  handler: async (ctx, args) => {
    const reset = await ctx.db.get(args.resetId);
    if (!reset) throw new Error("Request not found");
    const { user: admin } = await requireOrgAdmin(ctx, args.token, reset.orgId);
    if (reset.status !== "pending") throw new Error("Already handled");

    const target = await ctx.db.get(reset.userId);
    if (!target) throw new Error("Player not found");

    const tempPin = randomPin();
    const { hash, salt } = await hashPin(tempPin);
    const now = Date.now();

    await ctx.db.patch(target._id, {
      pinHash: hash,
      pinSalt: salt,
      mustChangePin: true,
      failedPinAttempts: 0,
      lockUntil: undefined,
      updatedAt: now,
    });

    await ctx.db.patch(reset._id, {
      status: "approved",
      decidedAt: now,
      decidedBy: admin._id,
      tempPin,
    });

    return { tempPin, displayName: target.displayName };
  },
});

export const rejectPinReset = mutation({
  args: { token: v.string(), resetId: v.id("pinResets") },
  handler: async (ctx, args) => {
    const reset = await ctx.db.get(args.resetId);
    if (!reset) throw new Error("Request not found");
    const { user: admin } = await requireOrgAdmin(ctx, args.token, reset.orgId);
    if (reset.status !== "pending") throw new Error("Already handled");

    await ctx.db.patch(reset._id, {
      status: "rejected",
      decidedAt: Date.now(),
      decidedBy: admin._id,
    });
    return { ok: true };
  },
});

/** Set a new PIN for the signed-in user; retires any temp PIN. */
export const changePin = mutation({
  args: {
    token: v.string(),
    newPin: v.string(),
    currentPin: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await getUserBySessionToken(ctx, args.token);
    if (!user) throw new Error("Not authenticated");
    if (!isValidPin(args.newPin)) throw new Error("PIN must be 4 digits");

    // Coming from a normal profile change (not a forced reset), confirm the old PIN
    if (!(user.mustChangePin ?? false)) {
      if (!args.currentPin) throw new Error("Enter your current PIN");
      if (!user.pinHash || !user.pinSalt) {
        throw new Error("This account has no PIN yet");
      }
      const ok = await verifyPin(args.currentPin, user.pinSalt, user.pinHash);
      if (!ok) throw new Error("Current PIN is incorrect");
    }

    const { hash, salt } = await hashPin(args.newPin);
    const now = Date.now();
    await ctx.db.patch(user._id, {
      pinHash: hash,
      pinSalt: salt,
      mustChangePin: false,
      failedPinAttempts: 0,
      lockUntil: undefined,
      updatedAt: now,
    });

    // Burn the temp PIN so it stops showing in the admin's list
    const approved = await ctx.db
      .query("pinResets")
      .withIndex("by_user_status", (q) =>
        q.eq("userId", user._id).eq("status", "approved"),
      )
      .collect();
    for (const row of approved) {
      if (row.tempPin) await ctx.db.patch(row._id, { tempPin: undefined });
    }

    return { ok: true };
  },
});

export const signOut = mutation({
  args: { token: v.optional(v.string()) },
  handler: async (ctx, args) => {
    if (!args.token) return { ok: true };
    const tokenHash = await hashToken(args.token);
    const session = await ctx.db
      .query("sessions")
      .withIndex("by_tokenHash", (q) => q.eq("tokenHash", tokenHash))
      .unique();
    if (session) await ctx.db.delete(session._id);
    return { ok: true };
  },
});

export const updateProfile = mutation({
  args: {
    token: v.string(),
    displayName: v.optional(v.string()),
    bio: v.optional(v.string()),
    photoUrl: v.optional(v.string()),
    primaryRole: v.optional(playerRole),
    secondaryRole: v.optional(playerRole),
  },
  handler: async (ctx, args) => {
    const user = await getUserBySessionToken(ctx, args.token);
    if (!user) throw new Error("Not authenticated");

    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    if (args.displayName !== undefined) {
      const name = args.displayName.trim();
      if (name.length < 2) throw new Error("Name is too short");
      patch.displayName = name;
    }
    if (args.bio !== undefined) patch.bio = args.bio.trim().slice(0, 280);
    if (args.photoUrl !== undefined) patch.photoUrl = args.photoUrl.trim() || undefined;
    if (args.primaryRole !== undefined) patch.primaryRole = args.primaryRole;
    if (args.secondaryRole !== undefined) patch.secondaryRole = args.secondaryRole;

    await ctx.db.patch(user._id, patch);
    const updated = await ctx.db.get(user._id);
    return publicUser(updated!);
  },
});

export const setPreferredOrg = mutation({
  args: {
    token: v.string(),
    orgId: v.id("orgs"),
  },
  handler: async (ctx, args) => {
    const user = await getUserBySessionToken(ctx, args.token);
    if (!user) throw new Error("Not authenticated");

    const membership = await ctx.db
      .query("orgMembers")
      .withIndex("by_org_user", (q) => q.eq("orgId", args.orgId).eq("userId", user._id))
      .unique();
    if (!membership || membership.status !== "active") {
      throw new Error("Not an active member of this org");
    }

    await ctx.db.patch(user._id, {
      preferredOrgId: args.orgId,
      updatedAt: Date.now(),
    });
    return { ok: true };
  },
});
