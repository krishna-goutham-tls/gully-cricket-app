/**
 * Words for the junior rule, shared by the create step and Community
 * Settings. `true` is the rule on: seniors earn nothing against juniors
 * outside the scorecard.
 */
export const JUNIOR_RULE_HEADING = "Seniors' runs, wickets and catches against juniors";
export const JUNIOR_RULE_FOOTNOTE = "Juniors' own numbers always count.";

export function juniorRuleLabel(on: boolean): string {
  return on ? "Scorecard only" : "Count everywhere";
}

/** An email to Krishna asking for the other rule. Only an agent can change it. */
export function juniorRuleChangeMailto(communityName: string, on: boolean): string {
  const subject = `${communityName}: change Seniors against juniors to ${juniorRuleLabel(!on)}`;
  return `mailto:krishna@thelaunch.space?subject=${encodeURIComponent(subject)}`;
}
