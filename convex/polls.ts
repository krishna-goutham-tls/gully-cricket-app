import { v } from "convex/values";
import { mutation, query, QueryCtx } from "./_generated/server";
import { Doc, Id } from "./_generated/dataModel";
import {
  getActiveMembership,
  requireActiveMembership,
  requireOrgViewer,
  requireUser,
} from "./lib/session";
import { HOME_LABEL, groundsOf, resolvePlayableGround } from "./lib/grounds";
import { pollAnswer } from "./schema";

/**
 * "Who's in?" — one question for one day's game. Any active member can ask
 * and answer; the asker and admins close or cancel. A poll whose day has
 * passed reads as closed (`closesAt`), so nothing has to sweep them.
 *
 * `pollView` is the whole read shape, keyed only by the poll, so a public
 * share page can serve the same data later without a second copy.
 */

const NOTE_MAX = 120;
const DAY_MS = 24 * 60 * 60 * 1000;

type Answer = "in" | "maybe" | "out";
type Status = Doc<"polls">["status"];

function pollStatusAt(poll: Doc<"polls">, now: number): Status {
  return poll.status === "open" && now >= poll.closesAt ? "closed" : poll.status;
}

async function pollView(
  ctx: QueryCtx,
  poll: Doc<"polls">,
  viewer: { userId: Id<"users">; isAdmin: boolean } | null,
  now: number,
) {
  const [responses, grounds, creator] = await Promise.all([
    ctx.db
      .query("pollResponses")
      .withIndex("by_poll", (q) => q.eq("pollId", poll._id))
      .collect(),
    groundsOf(ctx, poll.orgId),
    ctx.db.get(poll.createdBy),
  ]);

  // First to answer first, so the list reads the way the group filled up.
  responses.sort((a, b) => a.updatedAt - b.updatedAt);
  const groups: Record<Answer, Array<{ userId: Id<"users">; displayName: string }>> =
    { in: [], maybe: [], out: [] };
  let myAnswer: Answer | null = null;
  for (const r of responses) {
    const u = await ctx.db.get(r.userId);
    if (!u) continue;
    groups[r.answer].push({ userId: u._id, displayName: u.displayName });
    if (viewer && String(r.userId) === String(viewer.userId)) myAnswer = r.answer;
  }

  const ground = poll.groundId
    ? grounds.find((g) => String(g._id) === String(poll.groundId))
    : grounds.find((g) => g.isHome && !g.archived);

  // A match deleted after it was started from the poll leaves a stale id.
  const match = poll.matchId ? await ctx.db.get(poll.matchId) : null;

  return {
    _id: poll._id,
    orgId: poll.orgId,
    date: poll.date,
    time: poll.time,
    startsAt: poll.startsAt,
    closesAt: poll.closesAt,
    note: poll.note,
    status: pollStatusAt(poll, now),
    groundId: ground?._id,
    // One ground (or none) means every game is at the same place — the
    // name would be noise on the card.
    groundName: grounds.length >= 2 ? (ground?.name ?? HOME_LABEL) : undefined,
    createdBy: poll.createdBy,
    createdByName: creator?.displayName ?? "Player",
    matchId: match ? match._id : undefined,
    counts: {
      in: groups.in.length,
      maybe: groups.maybe.length,
      out: groups.out.length,
    },
    groups,
    myAnswer,
    canManage:
      !!viewer &&
      (viewer.isAdmin || String(viewer.userId) === String(poll.createdBy)),
  };
}

export type PollView = Awaited<ReturnType<typeof pollView>>;

async function viewerOf(
  ctx: QueryCtx,
  token: string | undefined,
  orgId: Id<"orgs">,
) {
  const { user, membership } = await requireOrgViewer(ctx, token, orgId);
  return membership
    ? { userId: user._id, isAdmin: membership.roles.includes("admin") }
    : null;
}

/** Open polls whose day has not passed, soonest first. Home's card. */
export const current = query({
  args: {
    token: v.optional(v.string()),
    orgId: v.id("orgs"),
  },
  handler: async (ctx, args) => {
    let viewer;
    try {
      viewer = await viewerOf(ctx, args.token, args.orgId);
    } catch {
      return [];
    }
    const now = Date.now();
    const open = await ctx.db
      .query("polls")
      .withIndex("by_org_status_date", (q) =>
        q.eq("orgId", args.orgId).eq("status", "open"),
      )
      .collect();
    const live = open
      .filter((p) => pollStatusAt(p, now) === "open")
      .sort((a, b) => a.startsAt - b.startsAt);
    return Promise.all(live.map((p) => pollView(ctx, p, viewer, now)));
  },
});

export const get = query({
  args: {
    token: v.optional(v.string()),
    pollId: v.id("polls"),
  },
  handler: async (ctx, args) => {
    const poll = await ctx.db.get(args.pollId);
    if (!poll) return null;
    let viewer;
    try {
      viewer = await viewerOf(ctx, args.token, poll.orgId);
    } catch {
      return null;
    }
    return pollView(ctx, poll, viewer, Date.now());
  },
});

export const create = mutation({
  args: {
    token: v.string(),
    orgId: v.id("orgs"),
    /** Local calendar day, YYYY-MM-DD. */
    date: v.string(),
    /** Local start, HH:MM (24h). */
    time: v.string(),
    /** The device's reading of date + time, and of the end of that day. */
    startsAt: v.number(),
    closesAt: v.number(),
    groundId: v.optional(v.id("grounds")),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { user } = await requireActiveMembership(ctx, args.token, args.orgId);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(args.date)) throw new Error("Pick a day");
    if (!/^\d{2}:\d{2}$/.test(args.time)) throw new Error("Pick a time");
    const now = Date.now();
    if (args.closesAt <= now) throw new Error("That day has already gone");
    if (
      args.startsAt > args.closesAt ||
      args.closesAt - args.startsAt > DAY_MS + 60 * 60 * 1000
    ) {
      throw new Error("That time does not fall on that day");
    }

    // One ask per day: a second tap on the same Saturday opens the first.
    const sameDay = await ctx.db
      .query("polls")
      .withIndex("by_org_status_date", (q) =>
        q.eq("orgId", args.orgId).eq("status", "open").eq("date", args.date),
      )
      .first();
    if (sameDay && pollStatusAt(sameDay, now) === "open") {
      return { pollId: sameDay._id, existing: true };
    }

    const groundId = await resolvePlayableGround(ctx, args.orgId, args.groundId);
    const note = (args.note ?? "").trim().slice(0, NOTE_MAX);
    const pollId = await ctx.db.insert("polls", {
      orgId: args.orgId,
      createdBy: user._id,
      date: args.date,
      time: args.time,
      startsAt: args.startsAt,
      closesAt: args.closesAt,
      ...(groundId ? { groundId } : {}),
      ...(note ? { note } : {}),
      status: "open",
      createdAt: now,
    });
    // Whoever asks is playing — that is why they asked. One tap undoes it.
    await ctx.db.insert("pollResponses", {
      pollId,
      userId: user._id,
      answer: "in",
      updatedAt: now,
    });
    return { pollId, existing: false };
  },
});

export const respond = mutation({
  args: {
    token: v.string(),
    pollId: v.id("polls"),
    answer: pollAnswer,
  },
  handler: async (ctx, args) => {
    const poll = await ctx.db.get(args.pollId);
    if (!poll) throw new Error("Poll not found");
    const { user } = await requireActiveMembership(ctx, args.token, poll.orgId);
    if (pollStatusAt(poll, Date.now()) !== "open") {
      throw new Error("This poll is closed");
    }
    const existing = await ctx.db
      .query("pollResponses")
      .withIndex("by_poll_user", (q) =>
        q.eq("pollId", poll._id).eq("userId", user._id),
      )
      .unique();
    const now = Date.now();
    if (existing) {
      if (existing.answer !== args.answer) {
        await ctx.db.patch(existing._id, { answer: args.answer, updatedAt: now });
      }
    } else {
      await ctx.db.insert("pollResponses", {
        pollId: poll._id,
        userId: user._id,
        answer: args.answer,
        updatedAt: now,
      });
    }
    return { ok: true };
  },
});

/** Close, cancel or reopen. The asker and admins only. */
export const setStatus = mutation({
  args: {
    token: v.string(),
    pollId: v.id("polls"),
    status: v.union(
      v.literal("open"),
      v.literal("closed"),
      v.literal("cancelled"),
    ),
  },
  handler: async (ctx, args) => {
    const poll = await ctx.db.get(args.pollId);
    if (!poll) throw new Error("Poll not found");
    const user = await requireUser(ctx, args.token);
    const membership = await getActiveMembership(ctx, poll.orgId, user._id);
    if (!membership) throw new Error("Not an active member of this org");
    const may =
      membership.roles.includes("admin") ||
      String(poll.createdBy) === String(user._id);
    if (!may) throw new Error("Only the person who asked, or an admin");
    if (args.status === "open" && poll.closesAt <= Date.now()) {
      throw new Error("That day has already gone");
    }
    await ctx.db.patch(poll._id, { status: args.status });
    return { ok: true };
  },
});
