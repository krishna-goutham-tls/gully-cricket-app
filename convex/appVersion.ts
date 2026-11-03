import { v } from "convex/values";
import { internalMutation, query } from "./_generated/server";

/**
 * The live app version, pushed to every open app. An app on an older build
 * shows "Gully has an update". Public: it is a commit id and nothing else.
 */
export const live = query({
  args: {},
  handler: async (ctx) => {
    const row = await ctx.db.query("appVersion").first();
    return row?.version ?? null;
  },
});

/**
 * Run after Netlify finishes a release, with the commit that went live:
 *   npx convex run appVersion:set '{"version":"<main commit sha>"}' (prod key)
 * An empty string clears it, and no app shows the bar.
 */
export const set = internalMutation({
  args: { version: v.string() },
  handler: async (ctx, { version }) => {
    const row = await ctx.db.query("appVersion").first();
    if (row) await ctx.db.patch(row._id, { version, setAt: Date.now() });
    else await ctx.db.insert("appVersion", { version, setAt: Date.now() });
    return { version };
  },
});
