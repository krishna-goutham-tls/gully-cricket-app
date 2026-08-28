/**
 * The wishlist vocabulary, in one place.
 *
 * Imported by BOTH the Convex mutations and the board UI on purpose — same
 * reason as `lib/access.ts`. A label edited on only one side would start
 * failing submissions silently.
 *
 * Categories are named the way a player says them out loud, not after the
 * module they touch. "My numbers", not "stats read-model".
 */
export const WISHLIST_CATEGORIES = [
  { key: "scoring", label: "Scoring a match" },
  { key: "numbers", label: "My numbers" },
  { key: "leaders", label: "Leaders and seasons" },
  { key: "setup", label: "Setting up a match or a series" },
  { key: "sharing", label: "Sharing and watching" },
  { key: "broken", label: "Something is broken" },
] as const;

export type WishlistCategory = (typeof WISHLIST_CATEGORIES)[number]["key"];

export function isWishlistCategory(value: string): value is WishlistCategory {
  return WISHLIST_CATEGORIES.some((c) => c.key === value);
}

export function wishlistCategoryLabel(key: WishlistCategory) {
  return WISHLIST_CATEGORIES.find((c) => c.key === key)?.label ?? key;
}

/**
 * Board sections, in the order they stack. Only the platform admin moves a
 * request between them — a community admin does not build the app, so it
 * cannot honestly say "Building".
 *
 * `open` is where every request starts and carries no badge on the card:
 * a board where everything is labelled is a board nobody reads.
 */
export const WISHLIST_STATES = [
  { key: "building", label: "Building", closed: false },
  { key: "planned", label: "Planned", closed: false },
  { key: "open", label: "Open", closed: false },
  { key: "shipped", label: "Shipped", closed: true },
  { key: "not_doing", label: "Not doing", closed: true },
] as const;

export type WishlistState = (typeof WISHLIST_STATES)[number]["key"];

/** Stacking order of the live sections, top to bottom. */
export const WISHLIST_LIVE_STATES = ["building", "planned", "open"] as const;

/** Collapsed at the foot of the board, newest first. */
export const WISHLIST_CLOSED_STATES = ["shipped", "not_doing"] as const;

export function isWishlistState(value: string): value is WishlistState {
  return WISHLIST_STATES.some((s) => s.key === value);
}

export function wishlistStateLabel(key: WishlistState) {
  return WISHLIST_STATES.find((s) => s.key === key)?.label ?? key;
}

export function isClosedWishlistState(key: WishlistState) {
  return WISHLIST_STATES.find((s) => s.key === key)?.closed ?? false;
}

/** One ask is one short paragraph, not an essay. */
export const WISHLIST_TEXT_MAX = 500;

/**
 * One ask per player per day, per community.
 *
 * A rolling window, not a calendar day: the server has no idea what timezone
 * the player is in, and "resets at midnight somewhere" is worse than "try
 * again in four hours".
 */
export const WISHLIST_ASK_WINDOW_MS = 1000 * 60 * 60 * 24;

/** Plain-English wait, for the error the player actually reads. */
export function wishlistWaitLabel(msLeft: number) {
  const hours = Math.ceil(msLeft / (1000 * 60 * 60));
  if (hours <= 1) return "in an hour";
  return `in ${hours} hours`;
}
