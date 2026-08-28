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
     * Platform owner — vets access requests and may create communities
     * without one. Deliberately a flag on the row rather than a phone number
     * hardcoded in source: a second owner needs no deploy, and no personal
     * number enters git history. Set via `access:setPlatformAdmin`.
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
    status: matchStatus,
    sideAName: v.string(),
    sideBName: v.string(),
    sideAPlayerIds: v.array(v.id("users")),
    sideBPlayerIds: v.array(v.id("users")),
    battingFirst: v.optional(side),
    ruleSnapshot: rulesObject,
    resultText: v.optional(v.string()),
    winnerSide: v.optional(side),
    createdBy: v.id("users"),
    createdAt: v.number(),
  })
    .index("by_org", ["orgId"])
    .index("by_org_status", ["orgId", "status"])
    .index("by_tournament", ["tournamentId"]),

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
