import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export const playerRole = v.union(
  v.literal("batsman"),
  v.literal("bowler"),
  v.literal("all-rounder"),
  v.literal("keeper"),
);

export const membershipStatus = v.union(
  v.literal("pending"),
  v.literal("active"),
  v.literal("rejected"),
  v.literal("left"),
  v.literal("removed"),
);

export const orgRole = v.union(
  v.literal("admin"),
  v.literal("umpire"),
  v.literal("player"),
);

/**
 * Slack-style board tags. Independent of `users.isGuest` (no PIN yet).
 * Visitor and junior stack: a walk-on kid has both. Neither = regular.
 *
 * `playerLabel` is the old exclusive enum (regular | visitor | junior). Kept
 * so existing rows still validate; new writes go to `playerTags`.
 */
export const playerLabel = v.union(
  v.literal("regular"),
  v.literal("visitor"),
  v.literal("junior"),
);
export const playerTag = v.union(v.literal("visitor"), v.literal("junior"));

export const battingMode = v.union(v.literal("double"), v.literal("single"));

export const wishlistCategory = v.union(
  v.literal("scoring"),
  v.literal("numbers"),
  v.literal("leaders"),
  v.literal("setup"),
  v.literal("sharing"),
  v.literal("broken"),
);

export const wishlistState = v.union(
  v.literal("open"),
  v.literal("planned"),
  v.literal("building"),
  v.literal("shipped"),
  v.literal("not_doing"),
);

/** Which of the two match sides. Sides are defined per match, unique to it. */
export const side = v.union(v.literal("A"), v.literal("B"));

export const matchStatus = v.union(
  v.literal("scheduled"),
  v.literal("live"),
  v.literal("completed"),
  v.literal("abandoned"),
);

export const inningsStatus = v.union(
  v.literal("in_progress"),
  v.literal("complete"),
);

export const extrasType = v.union(
  v.literal("wide"),
  v.literal("noball"),
  v.literal("bye"),
  v.literal("legbye"),
);

export const wicketType = v.union(
  v.literal("bowled"),
  v.literal("caught"),
  v.literal("lbw"),
  v.literal("runout"),
  v.literal("stumped"),
  v.literal("hitwicket"),
  v.literal("other"),
);

export const matchFormat = v.union(v.literal("limited"), v.literal("test"));

export const pollStatus = v.union(
  v.literal("open"),
  v.literal("closed"),
  v.literal("cancelled"),
);

export const pollAnswer = v.union(
  v.literal("in"),
  v.literal("maybe"),
  v.literal("out"),
);

export const tournamentStatus = v.union(
  v.literal("active"),
  v.literal("paused"),
  v.literal("complete"),
);

/**
 * Full rules object frozen onto each match at creation.
 * New fields are optional so pre-format match docs keep validating;
 * absent means "no cap" / one innings per side.
 */
export const rulesObject = v.object({
  format: v.optional(matchFormat),
  /** 1 (limited) or 2 (test). Absent = 1. */
  inningsPerSide: v.optional(v.number()),
  maxOversInnings: v.number(),
  maxOversPerBowler: v.number(),
  /** Legal balls (wides/no-balls excluded) a batsman may face before retiring. */
  maxBallsPerBatsman: v.optional(v.number()),
  /** Tighter caps for common players (in both squads), per side. */
  commonMaxBallsPerBatsman: v.optional(v.number()),
  commonMaxOversPerBowler: v.optional(v.number()),
  ballsPerOver: v.number(),
  battingModeDefault: battingMode,
  lastBatsmanAlone: v.boolean(),
  extrasNotes: v.optional(v.string()),
});

/**
 * Test-only match clock. Lives on `matches`, not matchLiveState — that row
 * is replaced on every ball.
 */
export const matchClock = v.object({
  durationMs: v.number(),
  /** Always 5. */
  dayCount: v.number(),
  startedAt: v.optional(v.number()),
  pausedAt: v.optional(v.number()),
  pauseAccumulatedMs: v.number(),
  pauses: v.array(
    v.object({
      at: v.number(),
      until: v.optional(v.number()),
    }),
  ),
  overtime: v.optional(v.boolean()),
});

/** One opponent in a stamped head-to-head. `seq` is the latest ball met. */
const headToHead = v.object({
  userId: v.id("users"),
  outs: v.number(),
  runs: v.number(),
  balls: v.number(),
  fours: v.number(),
  sixes: v.number(),
  dots: v.number(),
  types: v.array(v.object({ type: v.string(), count: v.number() })),
  seq: v.number(),
});

export default defineSchema({
  users: defineTable({
    // Guests have no PIN (and possibly no phone) until they claim the account.
    phone: v.optional(v.string()),
    pinHash: v.optional(v.string()),
    pinSalt: v.optional(v.string()),
    isGuest: v.optional(v.boolean()),
    /** Set after an admin-approved PIN reset; forces a new PIN at next sign-in. */
    mustChangePin: v.optional(v.boolean()),
    displayName: v.string(),
    photoUrl: v.optional(v.string()),
    bio: v.optional(v.string()),
    primaryRole: v.optional(playerRole),
    secondaryRole: v.optional(playerRole),
    preferredOrgId: v.optional(v.id("orgs")),
    /**
     * Platform owner — vets access requests, may create communities without
     * one, and may watch any community without a membership row. Deliberately
     * a flag on the row rather than a phone number hardcoded in source: a
     * second owner needs no deploy, and no personal number enters git
     * history. Set via `access:setPlatformAdmin`.
     */
    isPlatformAdmin: v.optional(v.boolean()),
    failedPinAttempts: v.number(),
    lockUntil: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_phone", ["phone"]),

  sessions: defineTable({
    userId: v.id("users"),
    tokenHash: v.string(),
    expiresAt: v.number(),
    createdAt: v.number(),
  })
    .index("by_tokenHash", ["tokenHash"])
    .index("by_userId", ["userId"]),

  orgs: defineTable({
    name: v.string(),
    location: v.optional(v.string()),
    logoUrl: v.optional(v.string()),
    createdBy: v.id("users"),
    isDiscoverable: v.boolean(),
    /**
     * Sandbox orgs are throwaway spaces paired 1:1 with a real org. Every
     * stat, player pool and match list is already scoped by org, so the org
     * boundary alone keeps sandbox matches out of the real leaderboards —
     * there is no "exclude sandbox" filtering anywhere.
     */
    isSandbox: v.optional(v.boolean()),
    sandboxForOrgId: v.optional(v.id("orgs")),
    createdAt: v.number(),
  })
    .index("by_discoverable", ["isDiscoverable"])
    .index("by_name", ["name"])
    .index("by_sandbox_for", ["sandboxForOrgId"]),

  orgMembers: defineTable({
    orgId: v.id("orgs"),
    userId: v.id("users"),
    status: membershipStatus,
    roles: v.array(orgRole),
    /** @deprecated exclusive enum. Read via resolvePlayerTags; do not write. */
    playerLabel: v.optional(playerLabel),
    /** Board tags for this community. Empty / absent = regular. */
    playerTags: v.optional(v.array(playerTag)),
    requestedAt: v.number(),
    decidedAt: v.optional(v.number()),
    decidedBy: v.optional(v.id("users")),
  })
    .index("by_org", ["orgId"])
    .index("by_user", ["userId"])
    .index("by_org_user", ["orgId", "userId"])
    .index("by_org_status", ["orgId", "status"]),

  /**
   * Forgot-PIN requests. With no SMS channel, a human vouches: an org admin
   * approves and hands the player a one-time temp PIN in person.
   * (Replaceable by an OTP flow later without touching the rest of auth.)
   */
  pinResets: defineTable({
    userId: v.id("users"),
    orgId: v.id("orgs"),
    status: v.union(
      v.literal("pending"),
      v.literal("approved"),
      v.literal("rejected"),
    ),
    requestedAt: v.number(),
    decidedAt: v.optional(v.number()),
    decidedBy: v.optional(v.id("users")),
    /** One-time temp PIN, shown to the admin until the player changes it. */
    tempPin: v.optional(v.string()),
  })
    .index("by_user", ["userId"])
    .index("by_user_status", ["userId", "status"])
    .index("by_org_status", ["orgId", "status"]),

  /**
   * Signup is invite-only: an organiser fills the form on the landing page,
   * gets vetted over WhatsApp, and only then may create a community.
   *
   * Deliberately NOT tied to a user row — the request is made by a stranger
   * with no account, so `phone` is the only link between the form and the
   * account they create later. It is normalized through `normalizePhone` on
   * the way in so it matches `users.phone` exactly; anything else and an
   * approval would silently fail to unlock the person it was meant for.
   *
   * `usedAt`/`usedOrgId` make approval single-use: one vetted organiser gets
   * one community, not an unlimited licence to spawn them.
   */
  accessRequests: defineTable({
    name: v.string(),
    /** Normalized (+91…), the join key to `users.phone`. */
    phone: v.string(),
    groupType: v.string(),
    groupSize: v.string(),
    status: v.union(
      v.literal("pending"),
      v.literal("approved"),
      v.literal("dismissed"),
    ),
    requestedAt: v.number(),
    decidedAt: v.optional(v.number()),
    decidedBy: v.optional(v.id("users")),
    /** Stamped when the approval is spent creating a community. */
    usedAt: v.optional(v.number()),
    usedOrgId: v.optional(v.id("orgs")),
  })
    .index("by_phone", ["phone"])
    .index("by_status", ["status"]),

  /**
   * A tournament is a fixed two-team series inside one org. Teams exist ONLY
   * for tournaments — regular matches stay the self-contained scoring-first
   * model. Each side has a fixed squad; a subset are "core" (expected to
   * show; a soft warning fires if any are missing), the rest are challengers
   * who also play. Common players (in both squads) are allowed. Standings are
   * derived on demand from the matches tagged with this tournament; the
   * official winner is admin-set.
   */
  tournaments: defineTable({
    orgId: v.id("orgs"),
    name: v.string(),
    format: matchFormat,
    oversPerInnings: v.number(),
    /** Limited only: overs each player may bat & bowl (even; common get half). */
    oversPerPlayer: v.optional(v.number()),
    battingMode: battingMode,
    /** Test series only. Copied onto each match clock at startMatch. */
    matchDurationMinutes: v.optional(v.number()),
    sideAName: v.string(),
    sideBName: v.string(),
    sideASquadIds: v.array(v.id("users")),
    sideACoreIds: v.array(v.id("users")),
    sideBSquadIds: v.array(v.id("users")),
    sideBCoreIds: v.array(v.id("users")),
    matchCount: v.number(),
    status: tournamentStatus,
    /** Admin-declared series winner (most wins is only a suggestion). */
    winnerSide: v.optional(side),
    winnerText: v.optional(v.string()),
    createdBy: v.id("users"),
    createdAt: v.number(),
  }).index("by_org", ["orgId"]),

  /**
   * A match is self-contained: both teams (names + the exact player
   * combination picked for this match) live on the match doc itself.
   * Players may appear on both sides (gully cricket common players).
   * A match tagged with a tournamentId counts toward that tournament's
   * standings (side A = tournament team A); untagged matches are friendlies.
   */
  matches: defineTable({
    orgId: v.id("orgs"),
    tournamentId: v.optional(v.id("tournaments")),
    /** Where it was played. Absent = the community's Home ground, read live. */
    groundId: v.optional(v.id("grounds")),
    status: matchStatus,
    sideAName: v.string(),
    sideBName: v.string(),
    sideAPlayerIds: v.array(v.id("users")),
    sideBPlayerIds: v.array(v.id("users")),
    battingFirst: v.optional(side),
    ruleSnapshot: rulesObject,
    clock: v.optional(matchClock),
    resultText: v.optional(v.string()),
    winnerSide: v.optional(side),
    createdBy: v.id("users"),
    createdAt: v.number(),
  })
    .index("by_org", ["orgId"])
    .index("by_org_status", ["orgId", "status"])
    .index("by_tournament", ["tournamentId"]),

  /**
   * Where a community plays. Exactly one active ground per community is Home
   * (enforced in convex/grounds.ts); it is the default everywhere, and a
   * match with no groundId reads as Home. A community with no rows here
   * behaves as if it had a single Home ground. Only admins write this table.
   */
  grounds: defineTable({
    orgId: v.id("orgs"),
    name: v.string(),
    area: v.optional(v.string()),
    mapsUrl: v.optional(v.string()),
    isHome: v.boolean(),
    archived: v.boolean(),
    createdBy: v.id("users"),
    createdAt: v.number(),
  }).index("by_org", ["orgId"]),

  /**
   * "Who's in?" — one ask for one day's game. `date` is the local calendar
   * day (YYYY-MM-DD) and `time` the local start (HH:MM), both as the creator
   * typed them; `closesAt` is the end of that local day in ms, so a poll whose
   * day has passed reads as closed without a cron. `matchId` is set when a
   * match is started from it.
   */
  polls: defineTable({
    orgId: v.id("orgs"),
    createdBy: v.id("users"),
    date: v.string(),
    time: v.string(),
    startsAt: v.number(),
    closesAt: v.number(),
    groundId: v.optional(v.id("grounds")),
    note: v.optional(v.string()),
    status: pollStatus,
    matchId: v.optional(v.id("matches")),
    createdAt: v.number(),
  }).index("by_org_status_date", ["orgId", "status", "date"]),

  /** One row per player per poll. Changing an answer rewrites the row. */
  pollResponses: defineTable({
    pollId: v.id("polls"),
    userId: v.id("users"),
    answer: pollAnswer,
    updatedAt: v.number(),
  })
    .index("by_poll", ["pollId"])
    .index("by_poll_user", ["pollId", "userId"]),

  innings: defineTable({
    matchId: v.id("matches"),
    inningsNo: v.number(),
    battingSide: side,
    totalRuns: v.number(),
    wickets: v.number(),
    legalBalls: v.number(),
    extras: v.number(),
    target: v.optional(v.number()),
    status: inningsStatus,
    openerStrikerId: v.id("users"),
    /** Absent in single-batter matches — the whole innings is batted solo. */
    openerNonStrikerId: v.optional(v.id("users")),
    openingBowlerId: v.id("users"),
    currentStrikerId: v.optional(v.id("users")),
    currentNonStrikerId: v.optional(v.id("users")),
    currentBowlerId: v.optional(v.id("users")),
    needBowler: v.boolean(),
    needBatsman: v.boolean(),
    outPlayerIds: v.array(v.id("users")),
    /** Batters who retired not-out (quota or manual). May return to bat. */
    retiredNotOutIds: v.optional(v.array(v.id("users"))),
    completedAt: v.optional(v.number()),
  })
    .index("by_match", ["matchId"])
    .index("by_match_no", ["matchId", "inningsNo"]),

  balls: defineTable({
    matchId: v.id("matches"),
    inningsId: v.id("innings"),
    sequence: v.number(),
    overNumber: v.number(),
    ballInOver: v.number(),
    isLegal: v.boolean(),
    strikerId: v.id("users"),
    /** Absent in single-batter matches. */
    nonStrikerId: v.optional(v.id("users")),
    bowlerId: v.id("users"),
    runsBat: v.number(),
    extrasType: v.optional(extrasType),
    extrasRuns: v.number(),
    isWicket: v.boolean(),
    wicketType: v.optional(wicketType),
    playerOutId: v.optional(v.id("users")),
    /** Retirement marker row: not a delivery. isLegal false, 0 runs, playerOutId = retiree. */
    isRetire: v.optional(v.boolean()),
    fielderId: v.optional(v.id("users")),
    /** Retroactive tag: a catch was put down off this delivery. Never changes the score. */
    droppedById: v.optional(v.id("users")),
    createdBy: v.id("users"),
    createdAt: v.number(),
  })
    .index("by_innings", ["inningsId"])
    .index("by_innings_seq", ["inningsId", "sequence"])
    .index("by_match", ["matchId"]),

  /**
   * Stat stamps: the ball log of one completed match, folded once per player.
   * A read-model only — every row is rebuilt from `balls` by `restampMatch`
   * (convex/lib/matchStats.ts) and can be thrown away and rebuilt at will.
   * The Leaders, Records, Players and profile queries sum these instead of
   * replaying every ball of every match on each read.
   *
   * `date` is the match's createdAt (the window every board filters on);
   * `matchOrder` is its _creationTime, so folds run in the same match order
   * the old ball replay did and tie orderings come out identical.
   */
  matchStats: defineTable({
    orgId: v.id("orgs"),
    matchId: v.id("matches"),
    date: v.number(),
    matchOrder: v.number(),
    format: matchFormat,
    /** The match's groundId as stamped. Absent = Home, resolved at read time. */
    groundId: v.optional(v.id("grounds")),
    winnerSide: v.optional(side),
    sideAName: v.string(),
    sideBName: v.string(),
    /** Index 0 of each side — resolves "Team A" to "Team {captain}". */
    sideACaptainId: v.optional(v.id("users")),
    sideBCaptainId: v.optional(v.id("users")),
  })
    .index("by_org_date", ["orgId", "date"])
    .index("by_match", ["matchId"]),

  playerMatchStats: defineTable({
    orgId: v.id("orgs"),
    matchId: v.id("matches"),
    userId: v.id("users"),
    date: v.number(),
    matchOrder: v.number(),
    format: matchFormat,
    groundId: v.optional(v.id("grounds")),
    winnerSide: v.optional(side),
    /** Named in either XI — turnout. */
    named: v.boolean(),
    /** Batted, bowled or held a catch — the all-round "matches" column. */
    contributed: v.boolean(),
    /** Where the player first entered each tally in this match's replay. */
    order: v.object({
      turnout: v.optional(v.number()),
      bat: v.optional(v.number()),
      bowl: v.optional(v.number()),
      catch: v.optional(v.number()),
      drop: v.optional(v.number()),
    }),
    bat: v.optional(
      v.object({
        runs: v.number(),
        balls: v.number(),
        fours: v.number(),
        sixes: v.number(),
        dots: v.number(),
        singles: v.number(),
        dismissals: v.number(),
        ducks: v.number(),
        goldenDucks: v.number(),
        facedDucks: v.number(),
        innings: v.array(
          v.object({
            inningsId: v.id("innings"),
            runs: v.number(),
            balls: v.number(),
            outs: v.number(),
          }),
        ),
      }),
    ),
    bowl: v.optional(
      v.object({
        legalBalls: v.number(),
        runs: v.number(),
        wickets: v.number(),
        dots: v.number(),
        widesNoballs: v.number(),
        sixesConceded: v.number(),
        innings: v.array(
          v.object({
            inningsId: v.id("innings"),
            wickets: v.number(),
            runs: v.number(),
            legalBalls: v.number(),
          }),
        ),
      }),
    ),
    catches: v.number(),
    drops: v.number(),
    /** Named players only: the all-round points behind win credit and share. */
    work: v.optional(
      v.object({
        onA: v.boolean(),
        onB: v.boolean(),
        pointsA: v.number(),
        pointsB: v.number(),
        teamA: v.number(),
        teamB: v.number(),
        sizeA: v.number(),
        sizeB: v.number(),
      }),
    ),
    /** Latest ball createdAt that moved each counter — the shelf tie-break. */
    reached: v.array(v.object({ k: v.string(), at: v.number() })),
  })
    .index("by_org_date", ["orgId", "date"])
    .index("by_org_user_date", ["orgId", "userId", "date"])
    .index("by_match", ["matchId"]),

  /**
   * Profile-only detail for one player in one match: how they got out, how
   * they took wickets, and every head-to-head. Kept off `playerMatchStats` so
   * the boards, which read every row, never carry it.
   */
  playerMatchups: defineTable({
    orgId: v.id("orgs"),
    matchId: v.id("matches"),
    userId: v.id("users"),
    date: v.number(),
    matchOrder: v.number(),
    format: matchFormat,
    dismissalTypes: v.array(v.object({ type: v.string(), count: v.number() })),
    wicketTypes: v.array(v.object({ type: v.string(), count: v.number() })),
    byBowler: v.array(headToHead),
    byFielder: v.array(headToHead),
    byBatter: v.array(headToHead),
  })
    .index("by_org_user_date", ["orgId", "userId", "date"])
    .index("by_match", ["matchId"]),

  matchLiveState: defineTable({
    matchId: v.id("matches"),
    currentInningsId: v.optional(v.id("innings")),
    inningsNo: v.number(),
    battingSide: v.optional(side),
    strikerId: v.optional(v.id("users")),
    nonStrikerId: v.optional(v.id("users")),
    bowlerId: v.optional(v.id("users")),
    needBowler: v.boolean(),
    needBatsman: v.boolean(),
    totalRuns: v.number(),
    wickets: v.number(),
    legalBalls: v.number(),
    oversText: v.string(),
    ballsThisOver: v.number(),
    lastBallId: v.optional(v.id("balls")),
    target: v.optional(v.number()),
    resultText: v.optional(v.string()),
    /** Soft "who's scoring" indicator — last person to touch this match. */
    scorerId: v.optional(v.id("users")),
    scorerName: v.optional(v.string()),
    scorerAt: v.optional(v.number()),
    updatedAt: v.number(),
  }).index("by_match", ["matchId"]),

  /**
   * Org-scoped scoring window. Matches are not tagged; the board filters
   * completed matches by createdAt against startedAt / endedAt.
   */
  seasons: defineTable({
    orgId: v.id("orgs"),
    name: v.string(),
    status: v.union(v.literal("active"), v.literal("complete")),
    startedAt: v.number(),
    endedAt: v.optional(v.number()),
    createdBy: v.id("users"),
    endedBy: v.optional(v.id("users")),
    awards: v.optional(
      v.array(
        v.object({
          kind: v.union(
            v.literal("pots"),
            v.literal("orange_cap"),
            v.literal("purple_cap"),
            v.literal("most_sixes"),
            v.literal("highest_sr"),
            v.literal("best_economy"),
            // The trophy shelf, added on top of the six above. Additive on
            // purpose: seasons that ended before the shelf existed carry only
            // the first six, and those rows still have to validate.
            v.literal("run_machine"),
            v.literal("six_machine"),
            v.literal("boundary_king"),
            v.literal("the_anchor"),
            v.literal("nudger"),
            v.literal("wicket_taker"),
            v.literal("workhorse"),
            v.literal("the_miser"),
            v.literal("safe_hands"),
            v.literal("dot_magnet"),
            v.literal("duck_collector"),
            v.literal("butterfingers"),
          ),
          userId: v.id("users"),
          value: v.number(),
          display: v.string(),
        }),
      ),
    ),
  })
    .index("by_org", ["orgId"])
    .index("by_org_status", ["orgId", "status"]),
  /**
   * A player's ask, on their own community's board. Nothing here touches the
   * ball log or any scoring read-model — the wishlist is a separate room.
   *
   * `upCount` / `downCount` / `score` are denormalised onto the row so the
   * board sorts on one indexed field instead of counting ballots on every
   * read. `wishlistVotes` is the ledger those numbers are derived from; the
   * two are written in the same mutation and must never drift.
   */
  wishlistRequests: defineTable({
    orgId: v.id("orgs"),
    authorId: v.id("users"),
    category: wishlistCategory,
    text: v.string(),
    state: wishlistState,
    upCount: v.number(),
    downCount: v.number(),
    /** upCount - downCount. Sorted on; never computed at read time. */
    score: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
    /** Stamped when the platform admin moves it between sections. */
    stateChangedAt: v.optional(v.number()),
    stateChangedBy: v.optional(v.id("users")),
  })
    .index("by_org", ["orgId"])
    .index("by_org_state", ["orgId", "state"])
    .index("by_org_author", ["orgId", "authorId"]),

  /**
   * One row per player per request — the ballot slips behind the score.
   * Without them a player could tap the arrow ten times and the board would
   * be fiction. Switching a vote rewrites this row; taking it back deletes it.
   */
  wishlistVotes: defineTable({
    requestId: v.id("wishlistRequests"),
    userId: v.id("users"),
    /** 1 for the up arrow, -1 for the down arrow. Never 0 — that is a delete. */
    value: v.union(v.literal(1), v.literal(-1)),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_request_user", ["requestId", "userId"])
    .index("by_request", ["requestId"])
    .index("by_user", ["userId"]),
});
