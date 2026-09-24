import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { Id } from "./_generated/dataModel";
import { hashPin } from "./lib/crypto";
import { normalizePhone, isValidPin } from "./lib/phone";

/**
 * One-shot bootstrap: create an org, its admin, and all players in one run.
 * Run via CLI, e.g.:
 *   npx convex run admin:bootstrapOrg '{ "orgName": "Example Club", "adminPhone": "9999999999", "players": [{"phone":"9999999999","name":"Admin"}, ...] }'
 *
 * - Every account gets PIN "0000" by default (change after first login).
 * - The player whose phone matches `adminPhone` becomes admin + player.
 * - Idempotent: reuses an existing org of the same name and existing users.
 */
export const bootstrapOrg = internalMutation({
  args: {
    orgName: v.string(),
    location: v.optional(v.string()),
    adminPhone: v.string(),
    players: v.array(
      v.object({
        phone: v.string(),
        name: v.string(),
      }),
    ),
    pin: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const pin = args.pin ?? "0000";
    if (!isValidPin(pin)) throw new Error("PIN must be 4 digits");

    const orgName = args.orgName.trim();
    if (orgName.length < 2 || orgName.length > 60) {
      throw new Error("Org name must be 2-60 chars");
    }
    const adminPhone = normalizePhone(args.adminPhone);
    if (!adminPhone) throw new Error("Invalid admin phone");
    if (!args.players.some((p) => normalizePhone(p.phone) === adminPhone)) {
      throw new Error("adminPhone must be present in the players list");
    }

    const now = Date.now();

    async function ensureUser(phone: string, name: string): Promise<Id<"users">> {
      const existing = await ctx.db
        .query("users")
        .withIndex("by_phone", (q) => q.eq("phone", phone))
        .unique();
      if (existing) return existing._id;
      const { hash, salt } = await hashPin(pin);
      return ctx.db.insert("users", {
        phone,
        pinHash: hash,
        pinSalt: salt,
        displayName: name,
        failedPinAttempts: 0,
        createdAt: now,
        updatedAt: now,
      });
    }

    // Admin user must exist before the org (org.createdBy is required).
    const adminRow = args.players.find(
      (p) => normalizePhone(p.phone) === adminPhone,
    )!;
    const adminUserId = await ensureUser(adminPhone, adminRow.name.trim());

    // Reuse an org of the same name if one already exists.
    const sameName = await ctx.db
      .query("orgs")
      .withIndex("by_name", (q) => q.eq("name", orgName))
      .collect();
    let orgId = sameName[0]?._id;
    if (!orgId) {
      orgId = await ctx.db.insert("orgs", {
        name: orgName,
        location: args.location?.trim() || undefined,
        createdBy: adminUserId,
        isDiscoverable: true,
        createdAt: now,
      });
    }

    await ctx.db.patch(adminUserId, { preferredOrgId: orgId, updatedAt: now });

    const created: string[] = [];
    const existed: string[] = [];
    const membershipsSet: string[] = [];
    const errors: Array<{ phone: string; reason: string }> = [];

    for (const row of args.players) {
      const phone = normalizePhone(row.phone);
      const name = row.name.trim();
      if (!phone) {
        errors.push({ phone: row.phone, reason: "invalid phone" });
        continue;
      }
      if (name.length < 2 || name.length > 40) {
        errors.push({ phone: row.phone, reason: "name must be 2-40 chars" });
        continue;
      }

      const before = await ctx.db
        .query("users")
        .withIndex("by_phone", (q) => q.eq("phone", phone))
        .unique();
      const userId = await ensureUser(phone, name);
      if (before) existed.push(phone);
      else created.push(phone);

      const roles: Array<"admin" | "umpire" | "player"> =
        phone === adminPhone ? ["admin", "player"] : ["player"];

      const membership = await ctx.db
        .query("orgMembers")
        .withIndex("by_org_user", (q) =>
          q.eq("orgId", orgId!).eq("userId", userId),
        )
        .unique();

      if (!membership) {
        await ctx.db.insert("orgMembers", {
          orgId,
          userId,
          status: "active",
          roles,
          requestedAt: now,
          decidedAt: now,
          decidedBy: adminUserId,
        });
        membershipsSet.push(phone);
      } else {
        await ctx.db.patch(membership._id, {
          status: "active",
          roles,
          decidedAt: now,
          decidedBy: adminUserId,
        });
        membershipsSet.push(phone);
      }
    }

    return {
      org: orgName,
      orgId,
      admin: adminPhone,
      pin,
      createdCount: created.length,
      existedCount: existed.length,
      membershipsSetCount: membershipsSet.length,
      errorCount: errors.length,
      created,
      existed,
      errors,
    };
  },
});

/**
 * One-shot bulk player seeding. Run via CLI, e.g.:
 *   npx convex run admin:seedPlayers --prod '{ "orgId": "...", "players": [{"phone":"9916024894","name":"Naman"}] }'
 *
 * - Default PIN is "0000" (players change it later).
 * - Existing phones are not recreated; they are still ensured into the org.
 * - Idempotent: safe to run more than once.
 */
export const seedPlayers = internalMutation({
  args: {
    orgId: v.id("orgs"),
    players: v.array(
      v.object({
        phone: v.string(),
        name: v.string(),
      }),
    ),
    pin: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const org = await ctx.db.get(args.orgId);
    if (!org) throw new Error("Org not found");

    const pin = args.pin ?? "0000";
    if (!isValidPin(pin)) throw new Error("PIN must be 4 digits");

    const now = Date.now();
    const created: string[] = [];
    const existed: string[] = [];
    const addedToOrg: string[] = [];
    const errors: Array<{ phone: string; reason: string }> = [];

    for (const row of args.players) {
      const phone = normalizePhone(row.phone);
      const name = row.name.trim();
      if (!phone) {
        errors.push({ phone: row.phone, reason: "invalid phone" });
        continue;
      }
      if (name.length < 2 || name.length > 40) {
        errors.push({ phone: row.phone, reason: "name must be 2-40 chars" });
        continue;
      }

      let user = await ctx.db
        .query("users")
        .withIndex("by_phone", (q) => q.eq("phone", phone))
        .unique();

      if (!user) {
        const { hash, salt } = await hashPin(pin);
        const userId = await ctx.db.insert("users", {
          phone,
          pinHash: hash,
          pinSalt: salt,
          displayName: name,
          failedPinAttempts: 0,
          createdAt: now,
          updatedAt: now,
        });
        user = await ctx.db.get(userId);
        created.push(phone);
      } else {
        existed.push(phone);
      }
      if (!user) {
        errors.push({ phone, reason: "insert failed" });
        continue;
      }

      const membership = await ctx.db
        .query("orgMembers")
        .withIndex("by_org_user", (q) =>
          q.eq("orgId", args.orgId).eq("userId", user!._id),
        )
        .unique();

      if (!membership) {
        await ctx.db.insert("orgMembers", {
          orgId: args.orgId,
          userId: user._id,
          status: "active",
          roles: ["player"],
          requestedAt: now,
          decidedAt: now,
        });
        addedToOrg.push(phone);
      } else if (membership.status !== "active") {
        await ctx.db.patch(membership._id, {
          status: "active",
          decidedAt: now,
        });
        addedToOrg.push(phone);
      }
    }

    return {
      org: org.name,
      pin,
      createdCount: created.length,
      existedCount: existed.length,
      addedToOrgCount: addedToOrg.length,
      errorCount: errors.length,
      created,
      existed,
      addedToOrg,
      errors,
    };
  },
});

/**
 * Ops helper: rename players in an org by their current display name.
 *
 * Self-diagnosing and all-or-nothing: it resolves every rename first and only
 * applies them if all resolve to exactly one member with no name clash. If any
 * `from` is missing/ambiguous or any `to` collides, it patches NOTHING and
 * returns the org's full member list so the exact spelling is visible. Run via:
 *   npx convex run admin:renameMembers '{"orgName":"Example Club","renames":[{"from":"Old Name","to":"New Name"}]}'
 *
 * Internal-only.
 */
export const renameMembers = internalMutation({
  args: {
    orgId: v.optional(v.id("orgs")),
    orgName: v.optional(v.string()),
    renames: v.array(v.object({ from: v.string(), to: v.string() })),
  },
  handler: async (ctx, args) => {
    // Resolve the org by id, or by non-sandbox name.
    let org;
    if (args.orgId) {
      org = await ctx.db.get(args.orgId);
      if (!org) throw new Error("Org not found");
    } else if (args.orgName) {
      const matches = (
        await ctx.db
          .query("orgs")
          .withIndex("by_name", (q) => q.eq("name", args.orgName!.trim()))
          .collect()
      ).filter((o) => !(o.isSandbox ?? false));
      if (matches.length === 0) throw new Error(`No org named "${args.orgName}"`);
      if (matches.length > 1) {
        throw new Error(
          `Multiple orgs named "${args.orgName}" — pass orgId instead`,
        );
      }
      org = matches[0];
    } else {
      throw new Error("Provide orgId or orgName");
    }

    const members = await ctx.db
      .query("orgMembers")
      .withIndex("by_org_status", (q) =>
        q.eq("orgId", org!._id).eq("status", "active"),
      )
      .collect();
    const users = (
      await Promise.all(members.map((m) => ctx.db.get(m.userId)))
    ).filter((u): u is NonNullable<typeof u> => u !== null);
    const allNames = users.map((u) => u.displayName).sort();
    const norm = (s: string) => s.trim().toLowerCase();

    const problems: string[] = [];
    const toApply: Array<{ userId: Id<"users">; from: string; to: string }> = [];

    for (const { from, to } of args.renames) {
      const target = to.trim();
      if (target.length < 2 || target.length > 40) {
        problems.push(`"${to}" is not 2-40 chars`);
        continue;
      }
      const found = users.filter((u) => norm(u.displayName) === norm(from));
      if (found.length === 0) {
        problems.push(`No member named "${from}"`);
        continue;
      }
      if (found.length > 1) {
        problems.push(`${found.length} members named "${from}"`);
        continue;
      }
      // Name clash: another member already carries the target name.
      const clash = users.find(
        (u) => u._id !== found[0]._id && norm(u.displayName) === norm(target),
      );
      if (clash) {
        problems.push(`"${target}" already used by ${clash.displayName}`);
        continue;
      }
      toApply.push({ userId: found[0]._id, from: found[0].displayName, to: target });
    }

    if (problems.length > 0) {
      return { ok: false, applied: [], problems, allNames };
    }

    const now = Date.now();
    const applied: Array<{ from: string; to: string }> = [];
    for (const r of toApply) {
      await ctx.db.patch(r.userId, { displayName: r.to, updatedAt: now });
      applied.push({ from: r.from, to: r.to });
    }
    return { ok: true, applied, problems: [], allNames };
  },
});

/**
 * Ops helper: give an EXISTING guest a login (phone + PIN) while keeping them
 * a guest.
 *
 * A normal guest (players.addGuest) has no PIN and cannot sign in; seedPlayers
 * gives a PIN but clears the guest flag. This attaches a phone + PIN to a guest
 * already in the org pool and leaves `isGuest: true`, so the pool still shows a
 * guest badge but the player can now log in and score. For an occasional player
 * who already exists as a guest. Run via:
 *   npx convex run admin:attachGuestLogin '{"orgName":"Example Club","name":"Guest Name","phone":"9999999999","pin":"0000"}'
 *
 * Internal-only. Refuses if the guest can't be uniquely found, already has a
 * phone, isn't a guest, or the phone belongs to someone else.
 */
export const attachGuestLogin = internalMutation({
  args: {
    userId: v.optional(v.id("users")),
    orgId: v.optional(v.id("orgs")),
    orgName: v.optional(v.string()),
    name: v.optional(v.string()),
    phone: v.string(),
    pin: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const pin = args.pin ?? "0000";
    if (!isValidPin(pin)) throw new Error("PIN must be 4 digits");

    const phone = normalizePhone(args.phone);
    if (!phone) throw new Error("Invalid phone");

    // Resolve the target guest — either directly by id, or by (name in org).
    let target;
    if (args.userId) {
      target = await ctx.db.get(args.userId);
      if (!target) throw new Error("User not found");
    } else {
      if (!args.name) throw new Error("Provide userId, or name (+ org)");

      // Resolve the org by id, or by non-sandbox name.
      let org;
      if (args.orgId) {
        org = await ctx.db.get(args.orgId);
        if (!org) throw new Error("Org not found");
      } else if (args.orgName) {
        const matches = (
          await ctx.db
            .query("orgs")
            .withIndex("by_name", (q) => q.eq("name", args.orgName!.trim()))
            .collect()
        ).filter((o) => !(o.isSandbox ?? false));
        if (matches.length === 0) {
          throw new Error(`No org named "${args.orgName}"`);
        }
        if (matches.length > 1) {
          throw new Error(
            `Multiple orgs named "${args.orgName}" — pass orgId instead`,
          );
        }
        org = matches[0];
      } else {
        throw new Error("Provide orgId or orgName to resolve by name");
      }

      const wanted = args.name.trim().toLowerCase();
      const members = await ctx.db
        .query("orgMembers")
        .withIndex("by_org_status", (q) =>
          q.eq("orgId", org!._id).eq("status", "active"),
        )
        .collect();
      const named = (
        await Promise.all(members.map((m) => ctx.db.get(m.userId)))
      ).filter(
        (u): u is NonNullable<typeof u> =>
          u !== null && u.displayName.trim().toLowerCase() === wanted,
      );
      if (named.length === 0) {
        throw new Error(`No active member named "${args.name}" in ${org.name}`);
      }
      if (named.length > 1) {
        throw new Error(
          `${named.length} members named "${args.name}" in ${org.name} — pass userId`,
        );
      }
      target = named[0];
    }

    // Safety: only ever augment a phone-less guest, never clobber a real login.
    if (!(target.isGuest ?? false)) {
      throw new Error(
        `${target.displayName} is not a guest — use admin:setPin instead`,
      );
    }
    if (target.phone) {
      throw new Error(
        `${target.displayName} already has a phone (${target.phone})`,
      );
    }
    const phoneOwner = await ctx.db
      .query("users")
      .withIndex("by_phone", (q) => q.eq("phone", phone))
      .unique();
    if (phoneOwner) {
      throw new Error(
        `Phone already belongs to ${phoneOwner.displayName} (${phoneOwner._id})`,
      );
    }

    const { hash, salt } = await hashPin(pin);
    await ctx.db.patch(target._id, {
      phone,
      pinHash: hash,
      pinSalt: salt,
      isGuest: true,
      failedPinAttempts: 0,
      lockUntil: undefined,
      updatedAt: Date.now(),
    });

    return {
      userId: target._id,
      displayName: target.displayName,
      phone,
      pin,
      isGuest: true,
    };
  },
});

/**
 * Ops escape hatch: set a player's PIN directly by phone.
 *
 * Exists for the case the in-app reset cannot cover — the only admin of a
 * group forgetting their own PIN, so nobody is left to approve them. Run via:
 *   npx convex run admin:setPin '{"phone":"9999999999","pin":"0000"}'
 *
 * Internal-only: never callable from the app.
 */
export const setPin = internalMutation({
  args: {
    phone: v.string(),
    pin: v.string(),
    /** Force a change at next sign-in. Off by default so the PIN works as given. */
    mustChange: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const phone = normalizePhone(args.phone);
    if (!phone) throw new Error("Invalid phone");
    if (!isValidPin(args.pin)) throw new Error("PIN must be 4 digits");

    const user = await ctx.db
      .query("users")
      .withIndex("by_phone", (q) => q.eq("phone", phone))
      .unique();
    if (!user) throw new Error(`No user for ${phone}`);

    const { hash, salt } = await hashPin(args.pin);
    await ctx.db.patch(user._id, {
      pinHash: hash,
      pinSalt: salt,
      mustChangePin: args.mustChange ?? false,
      isGuest: false,
      failedPinAttempts: 0,
      lockUntil: undefined,
      updatedAt: Date.now(),
    });

    // Retire any outstanding reset requests so stale temp PINs don't linger
    const resets = await ctx.db
      .query("pinResets")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();
    for (const r of resets) {
      if (r.status === "pending") {
        await ctx.db.patch(r._id, { status: "rejected", decidedAt: Date.now() });
      } else if (r.tempPin) {
        await ctx.db.patch(r._id, { tempPin: undefined });
      }
    }

    return { phone, displayName: user.displayName, mustChange: args.mustChange ?? false };
  },
});

/**
 * Ops: move a phone+PIN onto an existing guest, and disable the duplicate
 * account that signed up with that number. Match history stays on the guest
 * user id. Run via:
 *   npx convex run admin:foldDuplicateLogin '{"keepUserId":"...","duplicateUserId":"...","phone":"9XXXXXXXXX","pin":"XXXX"}'
 *
 * Internal-only.
 */
export const foldDuplicateLogin = internalMutation({
  args: {
    keepUserId: v.id("users"),
    duplicateUserId: v.id("users"),
    phone: v.string(),
    pin: v.string(),
  },
  handler: async (ctx, args) => {
    if (String(args.keepUserId) === String(args.duplicateUserId)) {
      throw new Error("keep and duplicate must be different users");
    }
    const phone = normalizePhone(args.phone);
    if (!phone) throw new Error("Invalid phone");
    if (!isValidPin(args.pin)) throw new Error("PIN must be 4 digits");

    const keep = await ctx.db.get(args.keepUserId);
    const dup = await ctx.db.get(args.duplicateUserId);
    if (!keep) throw new Error("Keep user not found");
    if (!dup) throw new Error("Duplicate user not found");

    if (keep.phone && keep.phone !== phone) {
      throw new Error(
        `${keep.displayName} already has a different phone (${keep.phone})`,
      );
    }

    const phoneOwner = await ctx.db
      .query("users")
      .withIndex("by_phone", (q) => q.eq("phone", phone))
      .unique();
    if (
      phoneOwner &&
      String(phoneOwner._id) !== String(dup._id) &&
      String(phoneOwner._id) !== String(keep._id)
    ) {
      throw new Error(
        `Phone already belongs to ${phoneOwner.displayName} (${phoneOwner._id})`,
      );
    }

    const now = Date.now();
    await ctx.db.patch(dup._id, {
      phone: undefined,
      pinHash: undefined,
      pinSalt: undefined,
      isGuest: true,
      failedPinAttempts: 0,
      lockUntil: undefined,
      updatedAt: now,
    });

    const keepMembers = await ctx.db
      .query("orgMembers")
      .withIndex("by_user", (q) => q.eq("userId", keep._id))
      .collect();
    const keepActiveOrgs = new Set(
      keepMembers
        .filter((m) => m.status === "active")
        .map((m) => String(m.orgId)),
    );
    let preferredOrgId = keep.preferredOrgId;
    for (const m of keepMembers) {
      if (m.status !== "active") continue;
      const org = await ctx.db.get(m.orgId);
      if (org && !(org.isSandbox ?? false)) {
        preferredOrgId = org._id;
        break;
      }
    }

    const { hash, salt } = await hashPin(args.pin);
    await ctx.db.patch(keep._id, {
      phone,
      pinHash: hash,
      pinSalt: salt,
      isGuest: false,
      mustChangePin: false,
      failedPinAttempts: 0,
      lockUntil: undefined,
      preferredOrgId,
      updatedAt: now,
    });

    const dupMembers = await ctx.db
      .query("orgMembers")
      .withIndex("by_user", (q) => q.eq("userId", dup._id))
      .collect();
    let rejectedMemberships = 0;
    for (const m of dupMembers) {
      if (m.status === "pending" && keepActiveOrgs.has(String(m.orgId))) {
        await ctx.db.patch(m._id, {
          status: "rejected",
          decidedAt: now,
        });
        rejectedMemberships += 1;
      }
    }

    const sessions = await ctx.db
      .query("sessions")
      .withIndex("by_userId", (q) => q.eq("userId", dup._id))
      .collect();
    for (const s of sessions) {
      await ctx.db.delete(s._id);
    }

    return {
      keep: {
        userId: keep._id,
        displayName: keep.displayName,
        phone,
        preferredOrgId: preferredOrgId ?? null,
      },
      duplicateStripped: dup._id,
      rejectedMemberships,
      sessionsDeleted: sessions.length,
    };
  },
});

/**
 * Ops: delete a player who never played — e.g. a duplicate signup an org
 * admin asks us to remove. Refuses if the user appears in any match,
 * tournament squad, season, wishlist, or created an org. Deletes the user,
 * their memberships, sessions and PIN resets. Run via:
 *   npx convex run admin:deleteUnusedPlayer '{"userId":"..."}'
 *
 * Internal-only.
 */
export const deleteUnusedPlayer = internalMutation({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) throw new Error("User not found");
    if (user.isPlatformAdmin) throw new Error("Refusing to delete a platform admin");
    const id = String(user._id);
    const has = (ids: Array<Id<"users">> | undefined) =>
      (ids ?? []).some((x) => String(x) === id);

    const members = await ctx.db
      .query("orgMembers")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();

    for (const m of members) {
      const org = await ctx.db.get(m.orgId);
      if (org && String(org.createdBy) === id) {
        throw new Error(`${user.displayName} created ${org.name}`);
      }
      const matches = await ctx.db
        .query("matches")
        .withIndex("by_org", (q) => q.eq("orgId", m.orgId))
        .collect();
      for (const mt of matches) {
        if (has(mt.sideAPlayerIds) || has(mt.sideBPlayerIds) || String(mt.createdBy) === id) {
          throw new Error(`${user.displayName} is in match ${mt._id}`);
        }
      }
      const tournaments = await ctx.db
        .query("tournaments")
        .withIndex("by_org", (q) => q.eq("orgId", m.orgId))
        .collect();
      for (const t of tournaments) {
        if (JSON.stringify(t).includes(id)) {
          throw new Error(`${user.displayName} is in tournament ${t._id}`);
        }
      }
      const seasons = await ctx.db
        .query("seasons")
        .withIndex("by_org", (q) => q.eq("orgId", m.orgId))
        .collect();
      for (const s of seasons) {
        if (JSON.stringify(s).includes(id)) {
          throw new Error(`${user.displayName} is in season ${s._id}`);
        }
      }
      const wishes = await ctx.db
        .query("wishlistRequests")
        .withIndex("by_org_author", (q) => q.eq("orgId", m.orgId).eq("authorId", user._id))
        .collect();
      if (wishes.length) throw new Error(`${user.displayName} wrote wishlist requests`);
    }
    const votes = await ctx.db
      .query("wishlistVotes")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();
    if (votes.length) throw new Error(`${user.displayName} has wishlist votes`);

    const sessions = await ctx.db
      .query("sessions")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .collect();
    const resets = await ctx.db
      .query("pinResets")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();

    for (const m of members) await ctx.db.delete(m._id);
    for (const s of sessions) await ctx.db.delete(s._id);
    for (const r of resets) await ctx.db.delete(r._id);
    await ctx.db.delete(user._id);

    return {
      deleted: user.displayName,
      memberships: members.length,
      sessions: sessions.length,
      pinResets: resets.length,
    };
  },
});
