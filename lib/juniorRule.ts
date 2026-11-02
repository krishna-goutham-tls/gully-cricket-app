/**
 * The Visitors screen's Juniors row. The junior rule moves numbers, so it has
 * no switch: Change emails Krishna, and an agent runs `maintenance:setJuniorRule`.
 * `on` is the rule as it is now: seniors get no points off a Junior.
 */
export function juniorRuleChangeMailto(communityName: string, on: boolean): string {
  const subject = on
    ? `${communityName}: count seniors' points against juniors`
    : `${communityName}: turn the junior rule back on`;
  return `mailto:krishna@thelaunch.space?subject=${encodeURIComponent(subject)}`;
}
