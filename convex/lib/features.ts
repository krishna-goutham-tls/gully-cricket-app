import type { Doc } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

/**
 * What a community has switched on. `orgs.features` stores only the keys a
 * community has set; everything else reads its default here. Read a feature
 * through `isFeatureOn`, never from the org row.
 */
export const FEATURE_DEFAULTS = {
  /**
   * The Series tab, the Home series card and new series. Off for a new
   * community; `maintenance.pinFeatureDefaults` kept it on for the ones that
   * had played one.
   */
  series: false,
  /**
   * The Test or ODI choice at match setup and the format filter on Leaders.
   * Off: every new match is limited overs. Old Tests and their stats stay.
   */
  testMatches: false,
  /** The Roast tab, roast cards, roast lines in Story, the Nemesis card. */
  roast: true,
  /** A Roast board of the points regulars did not earn against juniors. */
  juniorBoard: false,
  /**
   * Seniors earn nothing against juniors on boards, Caps, records and
   * milestones. On for every community. Only an agent changes it, because it
   * moves numbers (`maintenance.setJuniorRule`).
   */
  juniorRule: true,
  /** Visitors and juniors on Leaders and Records. Off: regulars only. */
  visitorsOnLeaders: false,
  /** The Impact tab on Leaders: value per match against the average player. */
  impactPlayers: true,
} as const;

export type FeatureKey = keyof typeof FEATURE_DEFAULTS;

export function isFeatureOn(
  org: Pick<Doc<"orgs">, "features"> | null | undefined,
  key: FeatureKey,
): boolean {
  return org?.features?.[key] ?? FEATURE_DEFAULTS[key];
}

export type Features = Record<FeatureKey, boolean>;

/** Every key resolved, defaults filled in. */
export function resolveFeatures(
  org: Pick<Doc<"orgs">, "features"> | null | undefined,
): Features {
  const out = {} as Features;
  for (const key of Object.keys(FEATURE_DEFAULTS) as FeatureKey[]) {
    out[key] = isFeatureOn(org, key);
  }
  return out;
}

export function isFeatureKey(key: string): key is FeatureKey {
  return Object.prototype.hasOwnProperty.call(FEATURE_DEFAULTS, key);
}

/** The keys an admin can flip. The junior rule moves numbers, so it is not one. */
export function isAdminSwitch(key: string): key is FeatureKey {
  return isFeatureKey(key) && key !== "juniorRule";
}

/**
 * The juniors a match's points leave out. `matches.juniorIds` always holds
 * the real juniors, so turning the rule back on restores them. With the rule
 * off nobody is left out.
 */
export function countedJuniors(
  juniorIds: readonly Doc<"users">["_id"][] | Set<string> | undefined,
  ruleOn: boolean,
): Set<string> {
  if (!ruleOn || !juniorIds) return new Set();
  return juniorIds instanceof Set ? juniorIds : new Set(juniorIds.map(String));
}

/**
 * The community whose switches apply. A sandbox has none of its own: it
 * follows the real community it belongs to.
 */
export async function featureOrg(
  ctx: QueryCtx | MutationCtx,
  org: Doc<"orgs">,
): Promise<Doc<"orgs">> {
  if (!org.isSandbox || !org.sandboxForOrgId) return org;
  return (await ctx.db.get(org.sandboxForOrgId)) ?? org;
}

/** One feature for a community id, sandbox resolved. Off when the id is gone. */
export async function orgFeatureOn(
  ctx: QueryCtx | MutationCtx,
  orgId: Doc<"orgs">["_id"],
  key: FeatureKey,
): Promise<boolean> {
  const org = await ctx.db.get(orgId);
  if (!org) return FEATURE_DEFAULTS[key];
  return isFeatureOn(await featureOrg(ctx, org), key);
}

export const DEFAULT_JUNIOR_BOARD_TITLE = "Playground Bullies";
export const JUNIOR_BOARD_TITLE_MAX = 30;

/** A community's own title: trimmed, and short enough for a section label. */
export function cleanJuniorBoardTitle(title: string): string {
  const clean = title.trim().replace(/\s+/g, " ");
  if (!clean) throw new Error("Title cannot be empty");
  if (clean.length > JUNIOR_BOARD_TITLE_MAX)
    throw new Error(`Title can be ${JUNIOR_BOARD_TITLE_MAX} characters at most`);
  return clean;
}
