import { Id } from "../_generated/dataModel";

export function countOnSquad(
  playerIds: Id<"users">[],
  squadIds: Id<"users">[],
) {
  const squad = new Set(squadIds.map(String));
  return playerIds.filter((id) => squad.has(String(id))).length;
}

/**
 * Walk-ons (org players not on either fixed squad) are allowed. Each XI must
 * still include at least one player from that series side so match A/B keeps
 * mapping to tournament A/B. Missing starred cores stay a UI warning — this
 * does not block them.
 */
export function assertSeriesSides(args: {
  sideAName: string;
  sideBName: string;
  sideASquadIds: Id<"users">[];
  sideBSquadIds: Id<"users">[];
  sideAPlayerIds: Id<"users">[];
  sideBPlayerIds: Id<"users">[];
}) {
  if (countOnSquad(args.sideAPlayerIds, args.sideASquadIds) < 1) {
    throw new Error(
      `${args.sideAName} must have at least one of its own players in the XI`,
    );
  }
  if (countOnSquad(args.sideBPlayerIds, args.sideBSquadIds) < 1) {
    throw new Error(
      `${args.sideBName} must have at least one of its own players in the XI`,
    );
  }
}
