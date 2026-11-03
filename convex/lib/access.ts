/**
 * The chips the old landing-page form asked. The form is gone since open
 * sign-up (2026-11-03); `access.submitRequest` still checks them for old
 * phones until Phase 7.
 */
export const GROUP_TYPES = [
  "Friends",
  "Apartment / society",
  "Office",
  "Mixed",
] as const;

// Note the EN DASH in "15–30" — it must match the chip label byte for byte.
export const GROUP_SIZES = ["Under 15", "15–30", "30+"] as const;

export type GroupType = (typeof GROUP_TYPES)[number];
export type GroupSize = (typeof GROUP_SIZES)[number];

export function isGroupType(value: string): value is GroupType {
  return (GROUP_TYPES as readonly string[]).includes(value);
}

export function isGroupSize(value: string): value is GroupSize {
  return (GROUP_SIZES as readonly string[]).includes(value);
}
