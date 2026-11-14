type Format = "limited" | "test";
type BattingMode = "double" | "single";

export type RuleSnapshot =
  | {
      /** Individuals: everyone on their own (convex/lib/individuals.ts). */
      format: "limited";
      play: "individuals";
      inningsPerSide: 1;
      maxOversInnings: number;
      maxOversPerBowler: number;
      /** Absent = Unlimited: bat till out or retired. */
      maxBallsPerBatsman?: number;
      ballsPerOver: 6;
      battingModeDefault: "single";
      lastBatsmanAlone: boolean;
    }
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
/**
 * Individuals has no innings or bowler limit of its own: the innings ends when
 * every player is out or has used their balls, or when the scorer taps End.
 * 200 overs is the engine's ceiling for any innings, far above a real day.
 */
export const INDIVIDUALS_INNINGS_OVERS = 200;
/** Overs each batter gets in Individuals Limited. */
export const MIN_OVERS_EACH = 1;
export const MAX_OVERS_EACH = 20;
export const DEFAULT_OVERS_EACH = 2;

/**
 * Individuals rule snapshot. `oversEach` absent = Unlimited. One batter at a
 * time; no common-player halves (everyone is on both sides here); no bowler
 * cap, because whoever is not batting bowls.
 */
export function buildIndividualsSnapshot(opts: {
  oversEach?: number;
}): RuleSnapshot {
  const { oversEach } = opts;
  if (
    oversEach !== undefined &&
    (!Number.isInteger(oversEach) ||
      oversEach < MIN_OVERS_EACH ||
      oversEach > MAX_OVERS_EACH)
  ) {
    throw new Error(
      `Overs each must be between ${MIN_OVERS_EACH} and ${MAX_OVERS_EACH}`,
    );
  }
  return {
    format: "limited",
    play: "individuals",
    inningsPerSide: 1,
    maxOversInnings: INDIVIDUALS_INNINGS_OVERS,
    maxOversPerBowler: INDIVIDUALS_INNINGS_OVERS,
    ...(oversEach !== undefined ? { maxBallsPerBatsman: oversEach * 6 } : {}),
    ballsPerOver: 6,
    battingModeDefault: "single",
    lastBatsmanAlone: true,
  };
}

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
