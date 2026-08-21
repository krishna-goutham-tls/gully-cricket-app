import { Id } from "../_generated/dataModel";

export type ExtrasType = "wide" | "noball" | "bye" | "legbye";
export type WicketType =
  | "bowled"
  | "caught"
  | "lbw"
  | "runout"
  | "stumped"
  | "hitwicket"
  | "other";

export type BallEvent = {
  isLegal: boolean;
  runsBat: number;
  extrasType?: ExtrasType;
  extrasRuns: number;
  isWicket: boolean;
  wicketType?: WicketType;
  playerOutId?: Id<"users">;
};

export function legalBallToOverText(legalBalls: number, ballsPerOver: number) {
  const overs = Math.floor(legalBalls / ballsPerOver);
  const balls = legalBalls % ballsPerOver;
  return `${overs}.${balls}`;
}

export function runRate(totalRuns: number, legalBalls: number, ballsPerOver: number) {
  if (legalBalls <= 0) return 0;
  const overs = legalBalls / ballsPerOver;
  return totalRuns / overs;
}

export function requiredRunRate(
  target: number,
  totalRuns: number,
  legalBalls: number,
  maxOvers: number,
  ballsPerOver: number,
) {
  const remaining = target - totalRuns;
  if (remaining <= 0) return 0;
  const maxBalls = maxOvers * ballsPerOver;
  const ballsLeft = maxBalls - legalBalls;
  if (ballsLeft <= 0) return Infinity;
  return remaining / (ballsLeft / ballsPerOver);
}

export function ballRuns(event: BallEvent) {
  return event.runsBat + event.extrasRuns;
}

/**
 * After a non-wicket delivery, should strike rotate?
 * The automatic +1 of a wide/no-ball is not a run the batters ran,
 * so it does not count toward the odd/even rotation.
 */
export function shouldRotateStrike(event: BallEvent) {
  if (event.isWicket) {
    // runouts may leave strike as-is; for v1 rotate only if odd total runs and not out
    return false;
  }
  const penalty = isExtraIllegal(event.extrasType) ? 1 : 0;
  const total = ballRuns(event) - penalty;
  return total % 2 === 1;
}

export function isExtraIllegal(extrasType?: ExtrasType) {
  return extrasType === "wide" || extrasType === "noball";
}

export function validateBallEvent(event: BallEvent) {
  if (event.runsBat < 0 || event.extrasRuns < 0) {
    throw new Error("Runs cannot be negative");
  }
  if (event.runsBat > 6) {
    throw new Error("Runs off bat max 6");
  }
  if (event.extrasType === "wide" || event.extrasType === "noball") {
    if (event.extrasRuns < 1) {
      throw new Error("Wide/no-ball must add at least 1 extra");
    }
  }
  if ((event.extrasType === "bye" || event.extrasType === "legbye") && event.runsBat > 0) {
    throw new Error("Byes/leg-byes cannot have bat runs");
  }
  if (event.isWicket && !event.wicketType) {
    throw new Error("Wicket type required");
  }
  if (event.isWicket && !event.playerOutId) {
    throw new Error("Player out required");
  }
}

export type RecomputeInput = {
  balls: Array<{
    isLegal: boolean;
    runsBat: number;
    extrasType?: ExtrasType;
    extrasRuns: number;
    isWicket: boolean;
    playerOutId?: Id<"users">;
    isRetire?: boolean;
    strikerId: Id<"users">;
    nonStrikerId?: Id<"users">;
    bowlerId: Id<"users">;
    _id: Id<"balls">;
  }>;
  openerStrikerId: Id<"users">;
  /** Absent = single-batter innings: no rotation, no end swap, all players bat. */
  openerNonStrikerId?: Id<"users">;
  openingBowlerId: Id<"users">;
  ballsPerOver: number;
  maxOversInnings: number;
  squadSize: number;
  target?: number;
  /** Gully rule: the last not-out batter carries on alone. Off = innings
   * ends when the second-to-last wicket falls, as in proper cricket. */
  lastBatsmanAlone: boolean;
};

export type RecomputeResult = {
  totalRuns: number;
  wickets: number;
  legalBalls: number;
  extras: number;
  oversText: string;
  ballsThisOver: number;
  overNumber: number;
  strikerId: Id<"users">;
  nonStrikerId: Id<"users"> | undefined;
  bowlerId: Id<"users"> | undefined;
  needBowler: boolean;
  needBatsman: boolean;
  outPlayerIds: Id<"users">[];
  retiredNotOutIds: Id<"users">[];
  /** Legal balls faced per batsman (wides/no-balls excluded) — feeds quotas. */
  ballsFacedByBatsman: Record<string, number>;
  /** Legal balls bowled per bowler — feeds bowling quotas. */
  ballsBowledByBowler: Record<string, number>;
  /**
   * Set when the last event is a retirement whose player still occupies a
   * crease end. Unlike outs (permanent, so outSet detects vacancies globally),
   * retirees may return later — only the trailing retire marks a vacancy.
   */
  pendingRetireeId: Id<"users"> | undefined;
  lastBallId: Id<"balls"> | undefined;
  inningsComplete: boolean;
  completeReason?: "all_out" | "overs" | "target";
};

/**
 * Pure recompute from ball log + openers.
 * setBowler / setNextBatsman patch innings directly and are not folded in here.
 */
export function recomputeFromBalls(input: RecomputeInput): RecomputeResult {
  const {
    balls,
    openerStrikerId,
    openerNonStrikerId,
    openingBowlerId,
    ballsPerOver,
    maxOversInnings,
    squadSize,
    target,
    lastBatsmanAlone,
  } = input;

  const solo = openerNonStrikerId === undefined;
  let strikerId = openerStrikerId;
  let nonStrikerId: Id<"users"> | undefined = openerNonStrikerId;
  let bowlerId: Id<"users"> | undefined = openingBowlerId;
  let totalRuns = 0;
  let wickets = 0;
  let legalBalls = 0;
  let extras = 0;
  const outPlayerIds: Id<"users">[] = [];
  const retiredNotOutIds: Id<"users">[] = [];
  const ballsFacedByBatsman: Record<string, number> = {};
  const ballsBowledByBowler: Record<string, number> = {};
  let lastBallId: Id<"balls"> | undefined;
  let needBowler = false;
  let needBatsman = false;

  for (let i = 0; i < balls.length; i++) {
    const b = balls[i];
    lastBallId = b._id;
    needBowler = false;
    needBatsman = false;

    strikerId = b.strikerId;
    nonStrikerId = b.nonStrikerId;
    bowlerId = b.bowlerId;

    // Retirement marker: not a delivery — no runs, no legal ball, no rotation.
    if (b.isRetire && b.playerOutId) {
      if (!retiredNotOutIds.includes(b.playerOutId)) {
        retiredNotOutIds.push(b.playerOutId);
      }
      if (b.playerOutId === strikerId || b.playerOutId === nonStrikerId) {
        needBatsman = true;
      }
      continue;
    }

    totalRuns += b.runsBat + b.extrasRuns;
    extras += b.extrasRuns;
    if (b.isLegal) {
      legalBalls += 1;
      const sKey = String(b.strikerId);
      ballsFacedByBatsman[sKey] = (ballsFacedByBatsman[sKey] ?? 0) + 1;
      const bKey = String(b.bowlerId);
      ballsBowledByBowler[bKey] = (ballsBowledByBowler[bKey] ?? 0) + 1;
    }

    if (b.isWicket && b.playerOutId) {
      wickets += 1;
      if (!outPlayerIds.includes(b.playerOutId)) {
        outPlayerIds.push(b.playerOutId);
      }
      if (b.playerOutId === strikerId || b.playerOutId === nonStrikerId) {
        needBatsman = true;
        // Gully last-man rule: when this wicket leaves exactly one batter
        // never dismissed, that survivor carries on alone — striker slot,
        // empty non-striker end (so no strike rotation), nothing to pick.
        // Derived here so undo replays through it cleanly.
        if (
          !solo &&
          lastBatsmanAlone &&
          wickets === squadSize - 1 &&
          nonStrikerId !== undefined
        ) {
          const survivor =
            b.playerOutId === strikerId ? nonStrikerId : strikerId;
          if (survivor !== undefined && survivor !== b.playerOutId) {
            strikerId = survivor;
            nonStrikerId = undefined;
            needBatsman = false;
          }
        }
      }
    } else if (nonStrikerId !== undefined) {
      // Automatic wide/no-ball penalty is not a run the batters ran
      const penalty = isExtraIllegal(b.extrasType) ? 1 : 0;
      const total = b.runsBat + b.extrasRuns - penalty;
      if (total % 2 === 1) {
        const tmp = strikerId;
        strikerId = nonStrikerId;
        nonStrikerId = tmp;
      }
    }

    if (b.isLegal && legalBalls % ballsPerOver === 0) {
      if (nonStrikerId !== undefined) {
        const tmp = strikerId;
        strikerId = nonStrikerId;
        nonStrikerId = tmp;
      }
      needBowler = true;
      bowlerId = undefined;
    }
  }

  const last = balls.length > 0 ? balls[balls.length - 1] : undefined;
  const pendingRetireeId =
    last?.isRetire &&
    last.playerOutId &&
    (last.playerOutId === strikerId || last.playerOutId === nonStrikerId)
      ? last.playerOutId
      : undefined;

  // Solo: every player bats alone, so the innings holds squadSize wickets.
  // Pairs with the gully last-man rule get the same budget: the survivor of
  // the (N-1)th wicket bats on until his own dismissal is the Nth.
  const maxWickets = Math.max(
    1,
    solo || lastBatsmanAlone ? squadSize : squadSize - 1,
  );
  const maxBalls = maxOversInnings * ballsPerOver;
  let inningsComplete = false;
  let completeReason: RecomputeResult["completeReason"];

  if (wickets >= maxWickets) {
    inningsComplete = true;
    completeReason = "all_out";
    needBatsman = false;
    needBowler = false;
  } else if (legalBalls >= maxBalls) {
    inningsComplete = true;
    completeReason = "overs";
    needBatsman = false;
    needBowler = false;
  } else if (target !== undefined && totalRuns >= target) {
    inningsComplete = true;
    completeReason = "target";
    needBatsman = false;
    needBowler = false;
  }

  const oversText = legalBallToOverText(legalBalls, ballsPerOver);
  const ballsThisOver = legalBalls % ballsPerOver;
  const overNumber = Math.floor(legalBalls / ballsPerOver);

  return {
    totalRuns,
    wickets,
    legalBalls,
    extras,
    oversText,
    ballsThisOver,
    overNumber,
    strikerId,
    nonStrikerId,
    bowlerId,
    needBowler,
    needBatsman,
    outPlayerIds,
    retiredNotOutIds,
    ballsFacedByBatsman,
    ballsBowledByBowler,
    pendingRetireeId,
    lastBallId,
    inningsComplete,
    completeReason,
  };
}
