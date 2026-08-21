type Format = "limited" | "test";
type BattingMode = "double" | "single";

export type RuleSnapshot =
  | {
      format: "limited";
      inningsPerSide: 1;
      maxOversInnings: number;
      maxOversPerBowler: number;
      maxBallsPerBatsman: number;
      commonMaxBallsPerBatsman: number;
      commonMaxOversPerBowler: number;
      ballsPerOver: 6;
      battingModeDefault: BattingMode;
      /** Gully rule: the last not-out batter carries on alone. Off = the
       * innings ends when one batter is left standing, as in proper cricket. */
      lastBatsmanAlone: boolean;
    }
  | {
      format: "test";
      inningsPerSide: 2;
      maxOversInnings: number;
      maxOversPerBowler: number;
      ballsPerOver: 6;
      battingModeDefault: BattingMode;
      lastBatsmanAlone: boolean;
    };

/**
 * Single source of truth for the per-match rule snapshot. Used by both
 * `matches.create` (friendlies) and `tournaments.startMatch` so the two paths
 * can never drift. Validates overs and (for limited) the even overs-per-player
 * knob that drives all four caps; common players get half.
 */
export function buildRuleSnapshot(opts: {
  format?: Format;
  overs: number;
  oversPerPlayer?: number;
  battingMode?: BattingMode;
  lastBatsmanAlone?: boolean;
}): RuleSnapshot {
  const { overs } = opts;
  if (!Number.isInteger(overs) || overs < 1 || overs > 200) {
    throw new Error("Overs must be between 1 and 200");
  }
  const battingModeDefault = opts.battingMode ?? "double";
  const lastBatsmanAlone = opts.lastBatsmanAlone ?? true;

  if ((opts.format ?? "limited") === "limited") {
    const oversPerPlayer = opts.oversPerPlayer ?? 2;
    if (
      !Number.isInteger(oversPerPlayer) ||
      oversPerPlayer < 2 ||
      oversPerPlayer > 20 ||
      oversPerPlayer % 2 !== 0
    ) {
      throw new Error("Overs per player must be an even number");
    }
    return {
      format: "limited",
      inningsPerSide: 1,
      maxOversInnings: overs,
      maxOversPerBowler: oversPerPlayer,
      maxBallsPerBatsman: oversPerPlayer * 6,
      commonMaxBallsPerBatsman: (oversPerPlayer / 2) * 6,
      commonMaxOversPerBowler: oversPerPlayer / 2,
      ballsPerOver: 6,
      battingModeDefault,
      lastBatsmanAlone,
    };
  }

  return {
    format: "test",
    inningsPerSide: 2,
    maxOversInnings: overs,
    maxOversPerBowler: overs,
    ballsPerOver: 6,
    battingModeDefault,
    lastBatsmanAlone,
  };
}
