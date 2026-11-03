import { MutationCtx, QueryCtx } from "../_generated/server";
import { Doc, Id } from "../_generated/dataModel";

/**
 * The counters: the landing page's six numbers and each community's card on
 * Records. Every completed, stamped match carries its own share on
 * `matchStats.totals`; the stamp writer adds that share when it stamps and
 * takes it away when it clears, so an undo or a restamp never counts twice.
 *
 * Counted like a scorecard: every ball, juniors too. Runs are off the bat.
 * Wickets are every dismissal (run-outs included, retirements not). Catches
 * are caught dismissals with a fielder named.
 *
 * Sandboxes never count. A closed community keeps its own row but leaves the
 * site row; `setClosed` (convex/admin.ts) moves its row out and back.
 */

export type MatchTotals = {
  runs: number;
  wickets: number;
  sixes: number;
  fours: number;
  catches: number;
};

export type Counter = MatchTotals & { matches: number };

export const ZERO: Counter = {
  matches: 0,
  runs: 0,
  wickets: 0,
  sixes: 0,
  fours: 0,
  catches: 0,
};

export const COUNTER_KEYS = [
  "matches",
  "runs",
  "wickets",
  "sixes",
  "fours",
  "catches",
] as const;

/** One match's share, from its ball log. */
export function totalsOfBalls(balls: Doc<"balls">[]): MatchTotals {
  const t = { runs: 0, wickets: 0, sixes: 0, fours: 0, catches: 0 };
  for (const b of balls) {
    if (b.isRetire) continue;
    t.runs += b.runsBat;
    if (b.runsBat === 4) t.fours += 1;
    if (b.runsBat === 6) t.sixes += 1;
    if (b.isWicket) {
      t.wickets += 1;
      if (b.wicketType === "caught" && b.fielderId) t.catches += 1;
    }
  }
  return t;
}

export function pickCounter(row: Partial<Counter> | null | undefined): Counter {
  return {
    matches: row?.matches ?? 0,
    runs: row?.runs ?? 0,
    wickets: row?.wickets ?? 0,
    sixes: row?.sixes ?? 0,
    fours: row?.fours ?? 0,
    catches: row?.catches ?? 0,
  };
}

function plus(a: Counter, b: Counter, sign: 1 | -1): Counter {
  const out = { ...a };
  for (const k of COUNTER_KEYS) out[k] = a[k] + sign * b[k];
  return out;
}

export async function communityTotalsRow(
  ctx: QueryCtx | MutationCtx,
  orgId: Id<"orgs">,
) {
  return ctx.db
    .query("communityTotals")
    .withIndex("by_org", (q) => q.eq("orgId", orgId))
    .unique();
}

export async function siteTotalsRow(ctx: QueryCtx | MutationCtx) {
  return ctx.db.query("siteTotals").first();
}

/** Adds (or with -1 takes away) a counter on the site row. */
export async function moveSiteTotals(
  ctx: MutationCtx,
  delta: Counter,
  sign: 1 | -1,
) {
  const site = await siteTotalsRow(ctx);
  const next = plus(pickCounter(site), delta, sign);
  if (site) await ctx.db.patch(site._id, { ...next, updatedAt: Date.now() });
  else await ctx.db.insert("siteTotals", { ...next, updatedAt: Date.now() });
}

/**
 * One stamped match comes in (+1) or goes out (-1): its community's row
 * moves, and the site row too unless the community is closed.
 */
export async function moveMatchTotals(
  ctx: MutationCtx,
  orgId: Id<"orgs">,
  totals: MatchTotals,
  sign: 1 | -1,
) {
  const org = await ctx.db.get(orgId);
  if (!org || org.isSandbox) return;
  const delta: Counter = { matches: 1, ...totals };
  const row = await communityTotalsRow(ctx, orgId);
  const next = plus(pickCounter(row), delta, sign);
  if (row) await ctx.db.patch(row._id, { ...next, updatedAt: Date.now() });
  else await ctx.db.insert("communityTotals", { orgId, ...next, updatedAt: Date.now() });
  if (!org.closedAt) await moveSiteTotals(ctx, delta, sign);
}
