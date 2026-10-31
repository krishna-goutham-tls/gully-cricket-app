import { v } from "convex/values";
import {
  internalMutation,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { Id } from "./_generated/dataModel";
import { requireOrgAdmin, requireOrgViewer } from "./lib/session";
import { seasonsForOrg } from "./lib/seasons";
import { loadRegularsBoard } from "./stats";
import {
  AWARD_MIN_BALLS,
  AWARD_MIN_INNINGS,
  ECONOMY_COUNTERS,
  awardsFromShelf,
  economyQualifies,
  pickWinner,
  seasonAwardKinds,
  type Contender,
  type SeasonAward,
  type SeasonAwardKind,
} from "./lib/awards";

export type { SeasonAward, SeasonAwardKind };

function seasonLabel(n: number) {
  return `Season-${String(n).padStart(2, "0")}`;
}

/** Oldest match in the org — any status. Season-01's window starts here. */
async function earliestMatchCreatedAt(
  ctx: QueryCtx | MutationCtx,
  orgId: Id<"orgs">,
): Promise<number | null> {
  const matches = await ctx.db
    .query("matches")
    .withIndex("by_org", (q) => q.eq("orgId", orgId))
    .collect();
  if (matches.length === 0) return null;
  let min = matches[0].createdAt;
  for (const m of matches) {
    if (m.createdAt < min) min = m.createdAt;
  }
  return min;
}

function award<T extends Contender>(
  kind: SeasonAwardKind,
  won: { row: T; value: number },
  display: string,
): SeasonAward {
  return { kind, userId: won.row.userId, value: won.value, display };
}

type Board = Awaited<ReturnType<typeof loadRegularsBoard>>;

/**
 * One winner per kind from a regulars-only board — the six caps, then the
 * twelve shelf trophies. Rate awards are omitted when nobody clears
 * RECORD_MIN_BALLS and RECORD_MIN_INNINGS, and every winner goes through the
 * same tie-break ladder the live shelf uses (convex/lib/awards.ts), so a
 * stamped season and the shelf can never disagree about who won.
 */
export function awardsFromBoard(board: Board): SeasonAward[] {
  const out: SeasonAward[] = [];

  // Points are runs + wickets + catches + bonuses, so the last of those to
  // move is when the total was reached — that is what rung (c) needs.
  const pots = pickWinner(board.allRound, (r) => r.points, {
    counters: ["bat.runs", "bowl.wickets", "field.catches"],
  });
  if (pots) out.push(award("pots", pots, String(pots.value)));

  const orange = pickWinner(board.batting, (r) => r.runs, {
    counters: ["bat.runs"],
  });
  if (orange) out.push(award("orange_cap", orange, String(orange.value)));

  const purple = pickWinner(board.bowling, (r) => r.wickets, {
    counters: ["bowl.wickets"],
  });
  if (purple) out.push(award("purple_cap", purple, String(purple.value)));

  const sixes = pickWinner(board.batting, (r) => r.sixes, {
    counters: ["bat.sixes"],
  });
  if (sixes) out.push(award("most_sixes", sixes, String(sixes.value)));

  const srPool = board.batting.filter(
    (r) =>
      r.balls >= AWARD_MIN_BALLS &&
      r.innings >= AWARD_MIN_INNINGS &&
      r.balls > 0,
  );
  // A rate is settled by the last ball that fed it, either side of the ratio.
  const sr = pickWinner(srPool, (r) => r.strikeRate, {
    counters: ["bat.runs", "bat.balls"],
  });
  if (sr) out.push(award("highest_sr", sr, sr.value.toFixed(1)));

  const econPool = board.bowling.filter(economyQualifies);
  const econ = pickWinner(econPool, (r) => r.countedEconomy, {
    better: (a, b) => a < b,
    keepZero: true,
    counters: ECONOMY_COUNTERS,
  });
  if (econ) out.push(award("best_economy", econ, econ.value.toFixed(1)));

  for (const a of awardsFromShelf(board.shelf)) {
    out.push({
      kind: a.kind,
      userId: a.userId,
      value: a.value,
      display: a.display,
    });
  }

  return out;
}

export const current = query({
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
    return (
      (await seasonsForOrg(ctx, args.orgId)).find((s) => s.status === "active") ??
      null
    );
  },
});

export const list = query({
  args: {
    token: v.optional(v.string()),
    orgId: v.id("orgs"),
  },
  handler: async (ctx, args) => {
    // Null, not a throw: a stale token or a revoked membership must degrade
    // into the page's own "unavailable" copy, the way every sibling query
    // already does. A throw here takes the whole screen with it.
    try {
      await requireOrgViewer(ctx, args.token, args.orgId);
    } catch {
      return null;
    }
    return await seasonsForOrg(ctx, args.orgId);
  },
});

export const get = query({
  args: {
    token: v.optional(v.string()),
    orgId: v.id("orgs"),
    seasonId: v.id("seasons"),
  },
  handler: async (ctx, args) => {
    try {
      await requireOrgViewer(ctx, args.token, args.orgId);
    } catch {
      return null;
    }
    const season = await ctx.db.get(args.seasonId);
    if (!season || String(season.orgId) !== String(args.orgId)) return null;
    const awards = await Promise.all(
      (season.awards ?? []).map(async (a) => {
        const u = await ctx.db.get(a.userId);
        return {
          ...a,
          displayName:
            u && "displayName" in u ? (u.displayName as string) : "Player",
        };
      }),
    );
    return { ...season, awards };
  },
});

export const start = mutation({
  args: {
    token: v.string(),
    orgId: v.id("orgs"),
    name: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { user } = await requireOrgAdmin(ctx, args.token, args.orgId);

    const active = await ctx.db
      .query("seasons")
      .withIndex("by_org_status", (q) =>
        q.eq("orgId", args.orgId).eq("status", "active"),
      )
      .unique();
    if (active) throw new Error("A season is already active");

    const existing = await ctx.db
      .query("seasons")
      .withIndex("by_org", (q) => q.eq("orgId", args.orgId))
      .collect();
    const n = existing.length + 1;
    const trimmed = args.name?.trim();
    const name = trimmed && trimmed.length > 0 ? trimmed : seasonLabel(n);
    let startedAt = Date.now();
    // First season takes the existing book. Later seasons still start from now.
    if (n === 1) {
      const earliest = await earliestMatchCreatedAt(ctx, args.orgId);
      if (earliest != null) startedAt = earliest;
    }

    return await ctx.db.insert("seasons", {
      orgId: args.orgId,
      name,
      status: "active",
      startedAt,
      createdBy: user._id,
    });
  },
});

/**
 * Point the first season at the oldest match in each real org.
 * Use after a Season-01 that was started "now" and missed the existing book.
 */
export const backfillSeason01 = internalMutation({
  args: {},
  handler: async (ctx) => {
    const orgs = await ctx.db.query("orgs").collect();
    const out: Array<{ org: string; season: string; matchesFrom: number }> = [];
    for (const org of orgs) {
      if (org.isSandbox) continue;
      const earliest = await earliestMatchCreatedAt(ctx, org._id);
      const existing = await ctx.db
        .query("seasons")
        .withIndex("by_org", (q) => q.eq("orgId", org._id))
        .collect();
      existing.sort((a, b) => a.startedAt - b.startedAt);

      if (existing.length === 0) {
        if (earliest == null) continue;
        await ctx.db.insert("seasons", {
          orgId: org._id,
          name: seasonLabel(1),
          status: "active",
          startedAt: earliest,
          createdBy: org.createdBy,
        });
        out.push({ org: org.name, season: seasonLabel(1), matchesFrom: earliest });
        continue;
      }

      const first = existing[0];
      const startedAt = earliest != null ? Math.min(first.startedAt, earliest) : first.startedAt;
      await ctx.db.patch(first._id, {
        startedAt,
        name: first.name.startsWith("Season") ? seasonLabel(1) : first.name,
      });
      out.push({ org: org.name, season: seasonLabel(1), matchesFrom: startedAt });
    }
    return out;
  },
});

export const end = mutation({
  args: {
    token: v.string(),
    orgId: v.id("orgs"),
  },
  handler: async (ctx, args) => {
    const { user } = await requireOrgAdmin(ctx, args.token, args.orgId);

    const active = await ctx.db
      .query("seasons")
      .withIndex("by_org_status", (q) =>
        q.eq("orgId", args.orgId).eq("status", "active"),
      )
      .unique();
    if (!active) throw new Error("No active season");

    const endedAt = Date.now();
    const board = await loadRegularsBoard(ctx, args.orgId, {
      afterTs: active.startedAt,
      beforeTs: endedAt,
    });
    const awards = awardsFromBoard(board);

    await ctx.db.patch(active._id, {
      status: "complete",
      endedAt,
      endedBy: user._id,
      awards,
      awardKinds: awards.map((a) => a.kind),
    });
    return active._id;
  },
});

/**
 * After a change to what counts (LOG 2026-09-25, 2026-10-31): redo the saved
 * awards of every ended season from the restamped board. A season keeps the
 * kinds it saved, so one that ended before the trophy shelf keeps its six.
 * `awardKinds` remembers a kind with no winner today, so it returns when it
 * has one again. `dryRun` returns what would change without writing. Run after
 * `stats:backfillStamps`.
 *   npx convex run seasons:recomputeSeriesAwards '{"orgId":"…","dryRun":true}'
 */
export const recomputeSeriesAwards = internalMutation({
  args: { orgId: v.id("orgs"), dryRun: v.optional(v.boolean()) },
  handler: async (ctx, { orgId, dryRun }) => {
    const ended = await ctx.db
      .query("seasons")
      .withIndex("by_org_status", (q) =>
        q.eq("orgId", orgId).eq("status", "complete"),
      )
      .collect();
    const changes: Array<{
      seasonId: Id<"seasons">;
      kind: SeasonAwardKind;
      before: SeasonAward | null;
      after: SeasonAward | null;
    }> = [];
    for (const season of ended) {
      if (season.endedAt === undefined) continue;
      const board = await loadRegularsBoard(ctx, orgId, {
        afterTs: season.startedAt,
        beforeTs: season.endedAt,
      });
      const fresh = new Map(awardsFromBoard(board).map((a) => [a.kind, a]));
      const saved = season.awards ?? [];
      const kinds = seasonAwardKinds(
        saved.map((a) => a.kind),
        season.awardKinds,
      );
      const next: SeasonAward[] = [];
      let changed = false;
      for (const kind of kinds) {
        const before = saved.find((a) => a.kind === kind) ?? null;
        const after = fresh.get(kind) ?? null;
        if (after) next.push(after);
        if (
          String(before?.userId) === String(after?.userId) &&
          before?.value === after?.value
        ) {
          continue;
        }
        changed = true;
        changes.push({ seasonId: season._id, kind, before, after });
      }
      if (changed && !dryRun) {
        await ctx.db.patch(season._id, { awards: next, awardKinds: kinds });
      }
    }
    return { seasonsChecked: ended.length, changed: changes.length, changes };
  },
});

/**
 * Move a season's start back to take matches played before it was started.
 * Matches are not tagged, so the window is the only link. Refuses to overlap
 * the season before it. `dryRun` lists the matches the move takes in.
 *   npx convex run seasons:moveStart '{"seasonId":"…","startedAt":0,"dryRun":true}'
 */
export const moveStart = internalMutation({
  args: {
    seasonId: v.id("seasons"),
    startedAt: v.number(),
    dryRun: v.optional(v.boolean()),
  },
  handler: async (ctx, { seasonId, startedAt, dryRun }) => {
    const season = await ctx.db.get(seasonId);
    if (!season) throw new Error("No such season");
    if (startedAt >= season.startedAt) {
      throw new Error("New start must be earlier than the current start");
    }
    const others = await seasonsForOrg(ctx, season.orgId);
    for (const s of others) {
      if (s._id === seasonId || s.startedAt > season.startedAt) continue;
      if ((s.endedAt ?? Infinity) > startedAt) {
        throw new Error(`Would overlap ${s.name}`);
      }
    }
    const matches = await ctx.db
      .query("matches")
      .withIndex("by_org", (q) => q.eq("orgId", season.orgId))
      .collect();
    const takenIn = matches
      .filter((m) => m.createdAt >= startedAt && m.createdAt < season.startedAt)
      .map((m) => m._id);
    if (!dryRun) await ctx.db.patch(seasonId, { startedAt });
    return { before: season.startedAt, after: startedAt, takenIn };
  },
});
