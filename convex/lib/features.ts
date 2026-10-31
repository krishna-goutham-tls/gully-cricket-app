import type { Doc } from "../_generated/dataModel";

/**
 * What a community has switched on. `orgs.features` stores only the keys a
 * community has set; everything else reads its default here. Read a feature
 * through `isFeatureOn`, never from the org row.
 */
export const FEATURE_DEFAULTS = {
  /** A Roast board of the points regulars did not earn against juniors. */
  juniorBoard: false,
} as const;

export type FeatureKey = keyof typeof FEATURE_DEFAULTS;

export function isFeatureOn(
  org: Pick<Doc<"orgs">, "features"> | null | undefined,
  key: FeatureKey,
): boolean {
  return org?.features?.[key] ?? FEATURE_DEFAULTS[key];
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
