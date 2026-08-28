import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { Id } from "./_generated/dataModel";
import {
  requireActiveMembership,
  requirePlatformAdmin,
} from "./lib/session";
import {
  WISHLIST_ASK_WINDOW_MS,
  WISHLIST_CLOSED_STATES,
  WISHLIST_LIVE_STATES,
  WISHLIST_TEXT_MAX,
  wishlistWaitLabel,
  type WishlistState,
} from "./lib/wishlist";
import { wishlistCategory, wishlistState } from "./schema";

/**
 * The wishlist board for one community.
 *
 * Sections stack Building → Planned → Open, each ranked by net score, so the
 * top of the board is what ships first. Shipped and Not doing fall to a
 * closed pile, newest first — a decided ask should not outrank a live one
 * just because it collected votes on its way out.
 */
export const board = query({
  args: {
    token: v.optional(v.string()),
    orgId: v.id("orgs"),
  },
  handler: async (ctx, args) => {
    let me: Id<"users">;
    try {
      const { user } = await requireActiveMembership(
        ctx,
        args.token,
        args.orgId,
      );
      me = user._id;
    } catch {
      return null;
    }

    const rows = await ctx.db
      .query("wishlistRequests")
      .withIndex("by_org", (q) => q.eq("orgId", args.orgId))
      .collect();

    // One pass for names and my own ballot, so the board is a single read.
    const cards = await Promise.all(
      rows.map(async (r) => {
        const author = await ctx.db.get(r.authorId);
        const mine = await ctx.db
          .query("wishlistVotes")
          .withIndex("by_request_user", (q) =>
            q.eq("requestId", r._id).eq("userId", me),
          )
          .unique();
        return {
          _id: r._id,
          category: r.category,
          text: r.text,
          state: r.state as WishlistState,
          score: r.score,
          upCount: r.upCount,
          downCount: r.downCount,
          createdAt: r.createdAt,
          stateChangedAt: r.stateChangedAt,
          isMine: String(r.authorId) === String(me),
          authorName:
            author && "displayName" in author
              ? (author.displayName as string)
              : "Player",
          /** 1, -1, or 0 when this player has not voted. */
          myVote: mine ? mine.value : 0,
        };
      }),
    );

    const byScore = (a: (typeof cards)[number], b: (typeof cards)[number]) =>
      b.score - a.score || a.createdAt - b.createdAt;

    const live = WISHLIST_LIVE_STATES.map((state) => ({
      state,
      cards: cards.filter((c) => c.state === state).sort(byScore),
    })).filter((s) => s.cards.length > 0);

    const closed = WISHLIST_CLOSED_STATES.map((state) => ({
      state,
      cards: cards
        .filter((c) => c.state === state)
        .sort(
          (a, b) =>
            (b.stateChangedAt ?? b.createdAt) -
            (a.stateChangedAt ?? a.createdAt),
        ),
    })).filter((s) => s.cards.length > 0);

    const mine = await ctx.db
      .query("wishlistRequests")
      .withIndex("by_org_author", (q) =>
        q.eq("orgId", args.orgId).eq("authorId", me),
      )
      .collect();
    let lastAt = 0;
    for (const r of mine) if (r.createdAt > lastAt) lastAt = r.createdAt;
    const nextAskAt = lastAt ? lastAt + WISHLIST_ASK_WINDOW_MS : 0;

    return {
      live,
      closed,
      openCount: cards.filter((c) => c.state === "open").length,
      /** 0 when the player may ask now. Otherwise the epoch ms to wait for. */
      nextAskAt: nextAskAt > Date.now() ? nextAskAt : 0,
    };
  },
});

/** Just the number for the Profile row. Cheap enough to run on every visit. */
export const openCount = query({
  args: {
    token: v.optional(v.string()),
    orgId: v.id("orgs"),
  },
  handler: async (ctx, args) => {
    try {
      await requireActiveMembership(ctx, args.token, args.orgId);
    } catch {
      return 0;
    }
    const rows = await ctx.db
      .query("wishlistRequests")
      .withIndex("by_org_state", (q) =>
        q.eq("orgId", args.orgId).eq("state", "open"),
      )
      .collect();
    return rows.length;
  },
});

export const submit = mutation({
  args: {
    token: v.string(),
    orgId: v.id("orgs"),
    category: wishlistCategory,
    text: v.string(),
  },
  handler: async (ctx, args) => {
    const { user } = await requireActiveMembership(
      ctx,
      args.token,
      args.orgId,
    );

    const text = args.text.trim();
    if (text.length === 0) throw new Error("Say what you want");
    if (text.length > WISHLIST_TEXT_MAX) {
      throw new Error("Keep it under a paragraph");
    }

    const now = Date.now();

    // One ask a day. Enforced here and nowhere else — the board is a wishlist,
    // not a suggestion box, and ten asks from one player in one sitting buries
    // everybody else's.
    const mine = await ctx.db
      .query("wishlistRequests")
      .withIndex("by_org_author", (q) =>
        q.eq("orgId", args.orgId).eq("authorId", user._id),
      )
      .collect();
    let lastAt = 0;
    for (const r of mine) if (r.createdAt > lastAt) lastAt = r.createdAt;
    const waitMs = lastAt + WISHLIST_ASK_WINDOW_MS - now;
    if (waitMs > 0) {
      throw new Error(
        `You have already asked today. Try again ${wishlistWaitLabel(waitMs)}.`,
      );
    }
    const requestId = await ctx.db.insert("wishlistRequests", {
      orgId: args.orgId,
      authorId: user._id,
      category: args.category,
      text,
      state: "open",
      upCount: 0,
      downCount: 0,
      score: 0,
      createdAt: now,
      updatedAt: now,
    });

    // Asking for it is wanting it — the author's own up vote is implied, and
    // a board where every new ask sits at 0 tells you nothing.
    await ctx.db.insert("wishlistVotes", {
      requestId,
      userId: user._id,
      value: 1,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.patch(requestId, { upCount: 1, score: 1, updatedAt: now });

    return { requestId };
  },
});

/**
 * Cast, switch, or take back a vote.
 *
 * `value` 0 means "take my vote back". Tapping the arrow you already lit
 * sends 0 — a second tap should undo, not double.
 *
 * The counters on the request row and the ballot row are written together.
 * If they ever drift, the ballots are the truth.
 */
export const vote = mutation({
  args: {
    token: v.string(),
    requestId: v.id("wishlistRequests"),
    value: v.union(v.literal(1), v.literal(-1), v.literal(0)),
  },
  handler: async (ctx, args) => {
    const request = await ctx.db.get(args.requestId);
    if (!request) throw new Error("That request is gone");

    const { user } = await requireActiveMembership(
      ctx,
      args.token,
      request.orgId,
    );

    const existing = await ctx.db
      .query("wishlistVotes")
      .withIndex("by_request_user", (q) =>
        q.eq("requestId", args.requestId).eq("userId", user._id),
      )
      .unique();

    const before = existing ? existing.value : 0;
    const after = args.value;
    if (before === after) return { score: request.score, myVote: before };

    const now = Date.now();
    if (after === 0) {
      if (existing) await ctx.db.delete(existing._id);
    } else if (existing) {
      await ctx.db.patch(existing._id, { value: after, updatedAt: now });
    } else {
      await ctx.db.insert("wishlistVotes", {
        requestId: args.requestId,
        userId: user._id,
        value: after,
        createdAt: now,
        updatedAt: now,
      });
    }

    const upCount =
      request.upCount + (after === 1 ? 1 : 0) - (before === 1 ? 1 : 0);
    const downCount =
      request.downCount + (after === -1 ? 1 : 0) - (before === -1 ? 1 : 0);
    const score = upCount - downCount;
    await ctx.db.patch(args.requestId, {
      upCount,
      downCount,
      score,
      updatedAt: now,
    });

    return { score, myVote: after };
  },
});

/**
 * Move a request between sections. Platform admin only — a community admin
 * does not build the app, so it cannot honestly say "Building".
 */
export const setState = mutation({
  args: {
    token: v.string(),
    requestId: v.id("wishlistRequests"),
    state: wishlistState,
  },
  handler: async (ctx, args) => {
    const admin = await requirePlatformAdmin(ctx, args.token);
    const request = await ctx.db.get(args.requestId);
    if (!request) throw new Error("That request is gone");
    if (request.state === args.state) return { state: args.state };

    const now = Date.now();
    await ctx.db.patch(args.requestId, {
      state: args.state,
      stateChangedAt: now,
      stateChangedBy: admin._id,
      updatedAt: now,
    });
    return { state: args.state };
  },
});
