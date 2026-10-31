import { MutationCtx, QueryCtx } from "../_generated/server";
import { Doc, Id } from "../_generated/dataModel";

// No 0, o, 1, l or i, so a code read aloud stays right.
const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";
const CODE_LENGTH = 8;

export function cleanInviteCode(raw: string) {
  return raw.trim().toLowerCase();
}

export async function newInviteCode(ctx: MutationCtx) {
  for (let tries = 0; tries < 5; tries++) {
    const bytes = new Uint8Array(CODE_LENGTH);
    crypto.getRandomValues(bytes);
    const code = Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("");
    const taken = await ctx.db
      .query("orgs")
      .withIndex("by_invite_code", (q) => q.eq("inviteCode", code))
      .first();
    if (!taken) return code;
  }
  throw new Error("Could not make a link. Try again.");
}

/** The community a code opens. A sandbox never opens by link. */
export async function orgByInviteCode(ctx: QueryCtx | MutationCtx, raw: string) {
  const code = cleanInviteCode(raw);
  if (!code) return null;
  const org = await ctx.db
    .query("orgs")
    .withIndex("by_invite_code", (q) => q.eq("inviteCode", code))
    .first();
  return org && !org.isSandbox ? org : null;
}

/**
 * The person becomes an active member. An active member stays exactly as they
 * are, roles included. Anyone else who held a row joins again as a player.
 */
export async function joinOrg(
  ctx: MutationCtx,
  org: Doc<"orgs">,
  userId: Id<"users">,
) {
  const existing = await ctx.db
    .query("orgMembers")
    .withIndex("by_org_user", (q) => q.eq("orgId", org._id).eq("userId", userId))
    .unique();
  if (existing?.status === "active") {
    return { membershipId: existing._id, alreadyMember: true };
  }

  const now = Date.now();
  const fields = {
    status: "active" as const,
    roles: ["player" as const],
    requestedAt: now,
    decidedAt: now,
    decidedBy: userId,
    joinedByLinkAt: now,
  };
  const membershipId = existing
    ? existing._id
    : await ctx.db.insert("orgMembers", { orgId: org._id, userId, ...fields });
  if (existing) await ctx.db.patch(existing._id, fields);
  await ctx.db.patch(userId, { preferredOrgId: org._id, updatedAt: now });
  return { membershipId, alreadyMember: false };
}

function nameWords(name: string) {
  return name
    .toLowerCase()
    .split(/[\s.,()_-]+/)
    .filter((w) => w.length >= 2);
}

export function namesShareWord(a: string, b: string) {
  const words = new Set(nameWords(a));
  return nameWords(b).some((w) => words.has(w));
}

/** Added players with no phone and no PIN: nothing else can tie them to a person. */
export function isUnclaimedNoPhone(user: Doc<"users">) {
  return (user.isGuest ?? false) && !user.phone && !user.pinHash;
}

/**
 * A row someone may claim from the link. A removed one counts: with no phone,
 * this is the only way back to their stats. An admin row never counts, because
 * a claim would hand over admin.
 */
export function isClaimableRow(member: Doc<"orgMembers"> | null | undefined) {
  return (
    !!member &&
    (member.status === "active" || member.status === "removed") &&
    !member.roles.includes("admin")
  );
}

/** Same rule as added players: two people with one name read as one person. */
export async function uniqueNameInOrg(
  ctx: MutationCtx,
  orgId: Id<"orgs">,
  name: string,
) {
  const members = await ctx.db
    .query("orgMembers")
    .withIndex("by_org_status", (q) => q.eq("orgId", orgId).eq("status", "active"))
    .collect();
  const users = await Promise.all(members.map((m) => ctx.db.get(m.userId)));
  const taken = new Set(
    users.flatMap((u) => (u ? [u.displayName.trim().toLowerCase()] : [])),
  );
  const base = name.slice(0, 36);
  if (!taken.has(base.toLowerCase())) return name;
  for (let n = 2; n < 100; n++) {
    const candidate = `${base} (${n})`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
  return name;
}
