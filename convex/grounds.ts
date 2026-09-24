import { v } from "convex/values";
import { mutation, query, MutationCtx } from "./_generated/server";
import { Doc, Id } from "./_generated/dataModel";
import { requireOrgAdmin, requireOrgViewer } from "./lib/session";
import { GROUND_NAME_MAX, groundsOf } from "./lib/grounds";

/**
 * Grounds: where a community plays. Any member reads them; only admins add,
 * rename, move Home or archive. One active ground is always Home once any
 * exist — the first one added takes it, and Home cannot be archived until
 * another ground has taken it over.
 */

const PLACE_MAX = 200;

function cleanName(raw: string) {
  const name = raw.trim().replace(/\s+/g, " ").slice(0, GROUND_NAME_MAX);
  if (!name) throw new Error("Give the ground a name");
  return name;
}

/** One optional field: a link is kept as the maps link, anything else as the area. */
function cleanPlace(raw: string | undefined) {
  const place = (raw ?? "").trim().slice(0, PLACE_MAX);
  if (!place) return { area: undefined, mapsUrl: undefined };
  return /^https?:\/\//i.test(place)
    ? { area: undefined, mapsUrl: place }
    : { area: place, mapsUrl: undefined };
}

function assertUniqueName(
  all: Doc<"grounds">[],
  name: string,
  except?: Id<"grounds">,
) {
  const clash = all.find(
    (g) =>
      !g.archived &&
      String(g._id) !== String(except) &&
      g.name.toLowerCase() === name.toLowerCase(),
  );
  if (clash) throw new Error(`${clash.name} is already a ground`);
}

async function requireGroundAdmin(
  ctx: MutationCtx,
  token: string,
  groundId: Id<"grounds">,
) {
  const ground = await ctx.db.get(groundId);
  if (!ground) throw new Error("Ground not found");
  const { user } = await requireOrgAdmin(ctx, token, ground.orgId);
  return { ground, user };
}

/** Home first, then by name. Archived grounds come back flagged, last. */
export const list = query({
  args: {
    token: v.optional(v.string()),
    orgId: v.id("orgs"),
  },
  handler: async (ctx, args) => {
    try {
      await requireOrgViewer(ctx, args.token, args.orgId);
    } catch {
      return null;
    }
    const all = await groundsOf(ctx, args.orgId);
    const rank = (g: Doc<"grounds">) => (g.archived ? 2 : g.isHome ? 0 : 1);
    return all
      .sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name))
      .map((g) => ({
        _id: g._id,
        name: g.name,
        area: g.area,
        mapsUrl: g.mapsUrl,
        isHome: g.isHome && !g.archived,
        archived: g.archived,
      }));
  },
});

/**
 * The ground a match was played at, for its header. Null when there is
 * nothing worth printing: a community with one ground (or none) plays every
 * game in the same place.
 */
export const ofMatch = query({
  args: {
    token: v.optional(v.string()),
    matchId: v.id("matches"),
  },
  handler: async (ctx, args) => {
    const match = await ctx.db.get(args.matchId);
    if (!match) return null;
    try {
      await requireOrgViewer(ctx, args.token, match.orgId);
    } catch {
      return null;
    }
    const all = await groundsOf(ctx, match.orgId);
    if (all.length < 2) return null;
    const ground = match.groundId
      ? all.find((g) => String(g._id) === String(match.groundId))
      : all.find((g) => g.isHome && !g.archived);
    return ground ? { name: ground.name } : null;
  },
});

export const add = mutation({
  args: {
    token: v.string(),
    orgId: v.id("orgs"),
    name: v.string(),
    /** Area or a maps link. Optional. */
    place: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { user } = await requireOrgAdmin(ctx, args.token, args.orgId);
    const name = cleanName(args.name);
    const all = await groundsOf(ctx, args.orgId);
    assertUniqueName(all, name);
    const hasHome = all.some((g) => g.isHome && !g.archived);
    const groundId = await ctx.db.insert("grounds", {
      orgId: args.orgId,
      name,
      ...cleanPlace(args.place),
      // The first ground is Home — the one every old match was played at.
      isHome: !hasHome,
      archived: false,
      createdBy: user._id,
      createdAt: Date.now(),
    });
    return { groundId };
  },
});

export const update = mutation({
  args: {
    token: v.string(),
    groundId: v.id("grounds"),
    name: v.string(),
    place: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { ground } = await requireGroundAdmin(ctx, args.token, args.groundId);
    const name = cleanName(args.name);
    assertUniqueName(await groundsOf(ctx, ground.orgId), name, ground._id);
    await ctx.db.patch(ground._id, { name, ...cleanPlace(args.place) });
    return { ok: true };
  },
});

export const setHome = mutation({
  args: {
    token: v.string(),
    groundId: v.id("grounds"),
  },
  handler: async (ctx, args) => {
    const { ground } = await requireGroundAdmin(ctx, args.token, args.groundId);
    if (ground.archived) throw new Error("Bring the ground back first");
    for (const g of await groundsOf(ctx, ground.orgId)) {
      const isHome = String(g._id) === String(ground._id);
      if (g.isHome !== isHome) await ctx.db.patch(g._id, { isHome });
    }
    return { ok: true };
  },
});

/**
 * Archive hides a ground from new matches and polls; its matches keep it.
 * Home cannot go — pick a new Home first, so there is always one.
 */
export const setArchived = mutation({
  args: {
    token: v.string(),
    groundId: v.id("grounds"),
    archived: v.boolean(),
  },
  handler: async (ctx, args) => {
    const { ground } = await requireGroundAdmin(ctx, args.token, args.groundId);
    if (args.archived && ground.isHome) {
      throw new Error("Make another ground Home before archiving this one");
    }
    if (!args.archived) {
      assertUniqueName(await groundsOf(ctx, ground.orgId), ground.name, ground._id);
    }
    await ctx.db.patch(ground._id, { archived: args.archived });
    return { ok: true };
  },
});
