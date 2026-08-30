import { v } from "convex/values";
import { query, QueryCtx, MutationCtx } from "./_generated/server";
import { Doc, Id } from "./_generated/dataModel";
import { requireActiveMembership } from "./lib/session";
import { legalBallToOverText } from "./lib/scoring";
import { captainTeamLabel } from "./lib/teams";
import { matchFormat } from "./schema";
import {
  basePoints,
  battingMilestoneBonus,
  bowlingHaulBonus,
  CATCH_POINTS,
  WICKET_POINTS,
} from "./lib/points";
import {
  asPct,
  careerContribution,
  matchContribution,
  matchResult,
  type Side,
} from "./lib/contribution";
import {
  isBoardRegular,
  tagsForUsers,
  type PlayerTag,
} from "./lib/playerLabel";
import {
  SHELF_KINDS,
  awardTone,
  awardsFromShelf,
  isShelfKind,
  type SeasonAward,
  type ShelfAward,
  type ShelfRow,
} from "./lib/awards";

type Format = "limited" | "test";

/** Absent `ruleSnapshot.format` is a pre-format match — those were limited. */
function snapshotFormat(match: Doc<"matches">): Format {
  return match.ruleSnapshot.format === "test" ? "test" : "limited";
}

type BatAgg = {
  userId: Id<"users">;
  runs: number;
  balls: number;
  fours: number;
  sixes: number;
  /** Legal balls faced off which the bat scored nothing. */
  dots: number;
  /** Ones off the bat — the Nudger award's whole measure. */
  singles: number;
  innings: Set<string>;
  dismissals: number;
  /** Dismissed for 0; golden = dismissed off the first ball faced. */
  ducks: number;
  goldenDucks: number;
  /**
   * Ducks in an innings where they actually faced a ball. Separate from
   * `ducks` because that one counts the non-striker run out for 0 too, and
   * the shelf's Duck Collector is about failing with the bat, not standing
   * at the wrong end.
   */
  facedDucks: number;
  bestScore: number;
  scoreThisInnings: Map<string, number>;
  /** Balls faced per innings — lets a dismissal tell a golden duck apart. */
  ballsThisInnings: Map<string, number>;
};

type BowlAgg = {
  userId: Id<"users">;
  legalBalls: number;
  runs: number;
  wickets: number;
  /** Legal balls that cost nothing at all — bat or extras. */
  dots: number;
  /** Illegal deliveries (wides + no-balls) and sixes conceded — roast fodder. */
  widesNoballs: number;
  sixesConceded: number;
  innings: Set<string>;
  perInnings: Map<string, { wickets: number; runs: number }>;
  /** Credited wickets per match (all innings pooled) — the haul bonus unit. */
  wicketsByMatch: Map<string, number>;
};

type RecordAgg = {
  userId: Id<"users">;
  wins: number;
  decided: number;
  playerPoints: number;
  teamPoints: number;
};

/**
 * Everything one player did in one match, split by innings so a Test reads
 * "34 & 12*" rather than a meaningless sum.
 */
type FocusMatch = {
  match: Doc<"matches">;
  bat: Map<string, { runs: number; balls: number; out: boolean }>;
  bowl: Map<string, { wickets: number; runs: number; legalBalls: number }>;
  /** All-round base points this player made for each side, and the side totals. */
  work?: {
    pointsA: number;
    pointsB: number;
    teamA: number;
    teamB: number;
    sizeA: number;
    sizeB: number;
  };
};

/**
 * A running head-to-head. `at`/`seq` remember the most recent meeting, which
 * is what breaks a tie for nemesis — if two bowlers have you three times each,
 * the one who did it last week owns you.
 */
type Head2Head = {
  userId: Id<"users">;
  outs: number;
  runs: number;
  balls: number;
  fours: number;
  sixes: number;
  /** Legal balls in this match-up the bat got nothing off — for the dot%. */
  dots: number;
  types: Map<string, number>;
  at: number;
  seq: number;
};

type Focus = {
  perMatch: Map<string, FocusMatch>;
  /** How this player gets out, and how they take their wickets. */
  dismissalTypes: Map<string, number>;
  wicketTypes: Map<string, number>;
  /** Bowlers who have dismissed this player. */
  byBowler: Map<string, Head2Head>;
  /** Fielders who have caught, stumped or run this player out. */
  byFielder: Map<string, Head2Head>;
  /** Batters who have faced this player's bowling. */
  byBatter: Map<string, Head2Head>;
};

/**
 * Folds every ball of the org's completed matches into per-player batting
 * and bowling aggregates. Attribution rules mirror the per-match scorecard:
 * bat runs/balls to the striker (legal + noball), wickets to the bowler
 * except run-outs, dismissals via playerOutId.
 *
 * `focusPlayerId` additionally keeps that one player's match-by-match detail.
 * It rides along inside this loop on purpose: a profile needs both the
 * player's own log and the org table it is ranked against, and doing it here
 * means one pass over the ball log and one copy of the attribution rules.
 */
async function aggregateOrg(
  ctx: QueryCtx | MutationCtx,
  orgId: Id<"orgs">,
  opts: {
    focusPlayerId?: Id<"users">;
    /** Exclusive end. Weekly arrows and completed seasons use this. */
    beforeTs?: number;
    /** Inclusive start. Season boards use season.startedAt. */
    afterTs?: number;
    /** Leaders format slice. Absent = Tests and limited together. */
    format?: Format;
  } = {},
) {
  const { focusPlayerId, beforeTs, afterTs, format } = opts;
  const completedAll = await ctx.db
    .query("matches")
    .withIndex("by_org_status", (q) =>
      q.eq("orgId", orgId).eq("status", "completed"),
    )
    .collect();
  // Gully matches are created and finished the same day, so createdAt is
  // when they landed on the board. afterTs inclusive, beforeTs exclusive.
  const completed = completedAll.filter((m) => {
    if (afterTs !== undefined && m.createdAt < afterTs) return false;
    if (beforeTs !== undefined && m.createdAt >= beforeTs) return false;
    if (format !== undefined && snapshotFormat(m) !== format) return false;
    return true;
  });

  const batting = new Map<string, BatAgg>();
  const bowling = new Map<string, BowlAgg>();
  // All-rounder support: catches per player, and every match a player had a
  // hand in (bat, bowl or a catch) — the "matches" column on the Players tab.
  // Rides the same single pass as batting/bowling; no second loop over balls.
  const catches = new Map<string, number>();
  // Dropped catches, keyed by droppedById — a retroactive tag on the ball
  // (see convex/scoring.ts tagDrop), not a dismissal, so this never touches
  // the catches map above or the all-round points formula.
  const drops = new Map<string, number>();
  const allRoundMatches = new Map<string, Set<string>>();
  /**
   * Turnout: matches a player was *named in*, contribution or not.
   *
   * Deliberately not `allRoundMatches`, which only counts a match once someone
   * bats, bowls or takes a catch in it. Turnout is what "matches played" means
   * to a team arguing about who shows up — and the player who was picked and
   * did nothing all day is exactly the one that question is about, so counting
   * from the squad is the only source that can see them.
   */
  const turnout = new Map<string, number>();
  /**
   * Per player, per counter, the createdAt of the ball that last moved it.
   * Every counter here only ever goes up, so its last increment is the moment
   * the player reached the total they finish the window on — which is what the
   * shelf's "who got there first" tie-break needs, without a second pass.
   * Matches are not read in date order, hence the max rather than last-write.
   */
  const reachedAt = new Map<string, Map<string, number>>();
  const markAt = (userId: Id<"users">, counter: string, at: number) => {
    const key = String(userId);
    let row = reachedAt.get(key);
    if (!row) {
      row = new Map();
      reachedAt.set(key, row);
    }
    const seen = row.get(counter);
    if (seen === undefined || at > seen) row.set(counter, at);
  };
  /**
   * Win credit and contribution, keyed by player. Folded in the same match
   * pass as turnout so a named player with zero points still has a record.
   */
  const records = new Map<string, RecordAgg>();
  const getRecord = (userId: Id<"users">): RecordAgg => {
    const key = String(userId);
    let row = records.get(key);
    if (!row) {
      row = {
        userId,
        wins: 0,
        decided: 0,
        playerPoints: 0,
        teamPoints: 0,
      };
      records.set(key, row);
    }
    return row;
  };
  const bumpCatch = (userId: Id<"users">) => {
    const key = String(userId);
    catches.set(key, (catches.get(key) ?? 0) + 1);
  };
  const bumpDrop = (userId: Id<"users">) => {
    const key = String(userId);
    drops.set(key, (drops.get(key) ?? 0) + 1);
  };
  const trackMatch = (userId: Id<"users">, matchId: string) => {
    const key = String(userId);
    let set = allRoundMatches.get(key);
    if (!set) {
      set = new Set();
      allRoundMatches.set(key, set);
    }
    set.add(matchId);
  };

  const getBat = (userId: Id<"users">): BatAgg => {
    const key = String(userId);
    let agg = batting.get(key);
    if (!agg) {
      agg = {
        userId,
        runs: 0,
        balls: 0,
        fours: 0,
        sixes: 0,
        dots: 0,
        singles: 0,
        innings: new Set(),
        dismissals: 0,
        ducks: 0,
        goldenDucks: 0,
        facedDucks: 0,
        bestScore: 0,
        scoreThisInnings: new Map(),
        ballsThisInnings: new Map(),
      };
      batting.set(key, agg);
    }
    return agg;
  };

  const getBowl = (userId: Id<"users">): BowlAgg => {
    const key = String(userId);
    let agg = bowling.get(key);
    if (!agg) {
      agg = {
        userId,
        legalBalls: 0,
        runs: 0,
        wickets: 0,
        dots: 0,
        widesNoballs: 0,
        sixesConceded: 0,
        innings: new Set(),
        perInnings: new Map(),
        wicketsByMatch: new Map(),
      };
      bowling.set(key, agg);
    }
    return agg;
  };

  const isFocus = (id: Id<"users">) =>
    focusPlayerId !== undefined && String(id) === String(focusPlayerId);

  const focus: Focus = {
    perMatch: new Map(),
    dismissalTypes: new Map(),
    wicketTypes: new Map(),
    byBowler: new Map(),
    byFielder: new Map(),
    byBatter: new Map(),
  };
  /**
   * Returns null for the focus player themselves. The engine already stops
   * anyone bowling and batting at once, so this only ever fires on odd data —
   * but "your nemesis is you" is not a thing worth shipping.
   */
  const h2h = (
    m: Map<string, Head2Head>,
    userId: Id<"users">,
  ): Head2Head | null => {
    if (isFocus(userId)) return null;
    const key = String(userId);
    let e = m.get(key);
    if (!e) {
      e = {
        userId,
        outs: 0,
        runs: 0,
        balls: 0,
        fours: 0,
        sixes: 0,
        dots: 0,
        types: new Map(),
        at: 0,
        seq: 0,
      };
      m.set(key, e);
    }
    return e;
  };
  /** Keep the latest meeting — matches are not iterated in date order. */
  const touch = (e: Head2Head, at: number, seq: number) => {
    if (at > e.at || (at === e.at && seq > e.seq)) {
      e.at = at;
      e.seq = seq;
    }
  };
  const focusMatch = (match: Doc<"matches">): FocusMatch => {
    const key = String(match._id);
    let entry = focus.perMatch.get(key);
    if (!entry) {
      entry = { match, bat: new Map(), bowl: new Map() };
      focus.perMatch.set(key, entry);
    }
    return entry;
  };
  const bump = (m: Map<string, number>, k: string) =>
    m.set(k, (m.get(k) ?? 0) + 1);

  for (const match of completed) {
    // Squad membership, before a single ball is read — turnout must not depend
    // on doing anything with bat or ball. A common player named on both sides
    // still turned out once, hence the dedupe.
    for (const id of Array.from(
      new Set([...match.sideAPlayerIds, ...match.sideBPlayerIds].map(String)),
    )) {
      turnout.set(id, (turnout.get(id) ?? 0) + 1);
    }

    // Seed every match they were named in, so a game where they fielded all
    // day still shows up in their log instead of silently vanishing.
    if (
      focusPlayerId !== undefined &&
      [...match.sideAPlayerIds, ...match.sideBPlayerIds].some((id) =>
        isFocus(id),
      )
    ) {
      focusMatch(match);
    }

    const inningsRows = await ctx.db
      .query("innings")
      .withIndex("by_match", (q) => q.eq("matchId", match._id))
      .collect();
    const battingSideOf = new Map<string, Side>();
    for (const inn of inningsRows) battingSideOf.set(String(inn._id), inn.battingSide);

    const ptsA = new Map<string, number>();
    const ptsB = new Map<string, number>();
    const addPts = (side: Side, userId: Id<"users">, n: number) => {
      if (n === 0) return;
      const m = side === "A" ? ptsA : ptsB;
      const k = String(userId);
      m.set(k, (m.get(k) ?? 0) + n);
    };
    const sumPts = (m: Map<string, number>) => {
      let s = 0;
      for (const v of Array.from(m.values())) s += v;
      return s;
    };

    const balls = await ctx.db
      .query("balls")
      .withIndex("by_match", (q) => q.eq("matchId", match._id))
      .collect();
    balls.sort((a, b) => a.sequence - b.sequence);

    for (const b of balls) {
      // Drop tags ride every row (rare on a retirement marker, but the tag is
      // just a patched field, not a delivery) — count before the retire skip.
      if (b.droppedById) {
        bumpDrop(b.droppedById);
        markAt(b.droppedById, "field.drops", b.createdAt);
      }
      // Retirement markers are not deliveries
      if (b.isRetire) continue;
      const innKey = String(b.inningsId);
      const batSide = battingSideOf.get(innKey);
      const bowlSide: Side | undefined =
        batSide === "A" ? "B" : batSide === "B" ? "A" : undefined;
      if (batSide) addPts(batSide, b.strikerId, b.runsBat);

      const bat = getBat(b.strikerId);
      bat.innings.add(innKey);
      bat.runs += b.runsBat;
      trackMatch(b.strikerId, String(match._id));
      if (b.runsBat > 0) markAt(b.strikerId, "bat.runs", b.createdAt);
      const faced = b.isLegal || b.extrasType === "noball";
      if (faced) {
        bat.balls += 1;
        markAt(b.strikerId, "bat.balls", b.createdAt);
      }
      // A dot is a legal ball the bat got nothing off. Byes and leg-byes still
      // count as dots for the batter — the runs weren't theirs.
      if (b.isLegal && b.runsBat === 0) {
        bat.dots += 1;
        markAt(b.strikerId, "bat.dots", b.createdAt);
      }
      if (b.runsBat === 1) {
        bat.singles += 1;
        markAt(b.strikerId, "bat.singles", b.createdAt);
      }
      if (b.runsBat === 4) {
        bat.fours += 1;
        markAt(b.strikerId, "bat.fours", b.createdAt);
      }
      if (b.runsBat === 6) {
        bat.sixes += 1;
        markAt(b.strikerId, "bat.sixes", b.createdAt);
      }
      const prev = bat.scoreThisInnings.get(innKey) ?? 0;
      const next = prev + b.runsBat;
      bat.scoreThisInnings.set(innKey, next);
      if (next > bat.bestScore) bat.bestScore = next;
      if (faced)
        bat.ballsThisInnings.set(innKey, (bat.ballsThisInnings.get(innKey) ?? 0) + 1);

      if (isFocus(b.strikerId)) {
        const fm = focusMatch(match);
        const row = fm.bat.get(innKey) ?? { runs: 0, balls: 0, out: false };
        row.runs += b.runsBat;
        if (faced) row.balls += 1;
        fm.bat.set(innKey, row);

        // Every ball faced, by bowler — not just the ones that got them out.
        // A bowler who has never taken the wicket but keeps them to a crawl is
        // still a nemesis, and this is what makes that measurable.
        const e = h2h(focus.byBowler, b.bowlerId);
        if (e) {
          e.runs += b.runsBat;
          if (faced) e.balls += 1;
          if (b.isLegal && b.runsBat === 0) e.dots += 1;
          if (b.runsBat === 4) e.fours += 1;
          if (b.runsBat === 6) e.sixes += 1;
          touch(e, match.createdAt, b.sequence);
        }
      }

      if (b.isWicket && b.playerOutId) {
        const outBat = getBat(b.playerOutId);
        outBat.innings.add(innKey);
        outBat.dismissals += 1;
        // A duck is out for 0 off the bat; golden if it was the first ball
        // faced (a no-ball dismissal can't happen, so faced-balls == 1 is safe).
        if ((outBat.scoreThisInnings.get(innKey) ?? 0) === 0) {
          outBat.ducks += 1;
          const ballsFaced = outBat.ballsThisInnings.get(innKey) ?? 0;
          if (ballsFaced === 1) outBat.goldenDucks += 1;
          if (ballsFaced >= 1) {
            outBat.facedDucks += 1;
            markAt(b.playerOutId, "bat.ducks", b.createdAt);
          }
        }
        // Catches, mirroring story.ts's Player-of-the-Match credit: a caught
        // dismissal only, credited to the fielder on the ball.
        if (b.wicketType === "caught" && b.fielderId) {
          bumpCatch(b.fielderId);
          markAt(b.fielderId, "field.catches", b.createdAt);
          trackMatch(b.fielderId, String(match._id));
          if (bowlSide) addPts(bowlSide, b.fielderId, CATCH_POINTS);
        }
        if (isFocus(b.playerOutId)) {
          const fm = focusMatch(match);
          const row = fm.bat.get(innKey) ?? { runs: 0, balls: 0, out: false };
          row.out = true;
          fm.bat.set(innKey, row);
          if (b.wicketType) bump(focus.dismissalTypes, b.wicketType);

          // A run-out is nobody's bowling, so it never counts towards the
          // bowler who happened to be at the top of their mark.
          if (b.wicketType && b.wicketType !== "runout") {
            const e = h2h(focus.byBowler, b.bowlerId);
            if (e) {
              e.outs += 1;
              bump(e.types, b.wicketType);
              touch(e, match.createdAt, b.sequence);
            }
          }
          if (b.fielderId) {
            const e = h2h(focus.byFielder, b.fielderId);
            if (e) {
              e.outs += 1;
              if (b.wicketType) bump(e.types, b.wicketType);
              touch(e, match.createdAt, b.sequence);
            }
          }
        }
      }

      const bowl = getBowl(b.bowlerId);
      bowl.innings.add(innKey);
      trackMatch(b.bowlerId, String(match._id));
      bowl.runs += b.runsBat + b.extrasRuns;
      if (b.runsBat + b.extrasRuns > 0)
        markAt(b.bowlerId, "bowl.runs", b.createdAt);
      if (b.isLegal) {
        bowl.legalBalls += 1;
        markAt(b.bowlerId, "bowl.legalBalls", b.createdAt);
      }
      if (b.isLegal && b.runsBat + b.extrasRuns === 0) {
        bowl.dots += 1;
        markAt(b.bowlerId, "bowl.dots", b.createdAt);
      }
      if (b.extrasType === "wide" || b.extrasType === "noball")
        bowl.widesNoballs += 1;
      if (b.runsBat === 6) bowl.sixesConceded += 1;
      const per = bowl.perInnings.get(innKey) ?? { wickets: 0, runs: 0 };
      per.runs += b.runsBat + b.extrasRuns;
      const credited = b.isWicket && b.wicketType !== "runout";
      if (credited) {
        bowl.wickets += 1;
        markAt(b.bowlerId, "bowl.wickets", b.createdAt);
        per.wickets += 1;
        const mKey = String(match._id);
        bowl.wicketsByMatch.set(mKey, (bowl.wicketsByMatch.get(mKey) ?? 0) + 1);
        if (bowlSide) addPts(bowlSide, b.bowlerId, WICKET_POINTS);
      }
      bowl.perInnings.set(innKey, per);

      if (isFocus(b.bowlerId)) {
        const fm = focusMatch(match);
        const row =
          fm.bowl.get(innKey) ?? { wickets: 0, runs: 0, legalBalls: 0 };
        row.runs += b.runsBat + b.extrasRuns;
        if (b.isLegal) row.legalBalls += 1;
        if (credited) {
          row.wickets += 1;
          if (b.wicketType) bump(focus.wicketTypes, b.wicketType);
        }
        fm.bowl.set(innKey, row);

        // What each batter has done to this bowler. Runs off the bat only —
        // a wide is the bowler's own doing, not the batter's work.
        const e = h2h(focus.byBatter, b.strikerId);
        if (e) {
          e.runs += b.runsBat;
          if (faced) e.balls += 1;
          if (b.isLegal && b.runsBat === 0) e.dots += 1;
          if (b.runsBat === 4) e.fours += 1;
          if (b.runsBat === 6) e.sixes += 1;
          if (
            credited &&
            b.playerOutId &&
            String(b.playerOutId) === String(b.strikerId)
          ) {
            e.outs += 1;
          }
          touch(e, match.createdAt, b.sequence);
        }
      }
    }

    const teamA = sumPts(ptsA);
    const teamB = sumPts(ptsB);
    const sizeA = match.sideAPlayerIds.length;
    const sizeB = match.sideBPlayerIds.length;
    const named = new Set<Id<"users">>([
      ...match.sideAPlayerIds,
      ...match.sideBPlayerIds,
    ]);
    for (const id of Array.from(named)) {
      const k = String(id);
      const onA = match.sideAPlayerIds.some((x) => String(x) === k);
      const onB = match.sideBPlayerIds.some((x) => String(x) === k);
      const work = {
        onA,
        onB,
        winnerSide: match.winnerSide,
        pointsA: ptsA.get(k) ?? 0,
        pointsB: ptsB.get(k) ?? 0,
        teamA,
        teamB,
        sizeA,
        sizeB,
      };
      const rec = getRecord(id);
      if (match.winnerSide) {
        rec.decided += 1;
        if (matchResult(work) === "won") rec.wins += 1;
      }
      if (onA && onB) {
        rec.playerPoints += work.pointsA + work.pointsB;
        rec.teamPoints += teamA + teamB;
      } else if (onA) {
        rec.playerPoints += work.pointsA;
        rec.teamPoints += teamA;
      } else if (onB) {
        rec.playerPoints += work.pointsB;
        rec.teamPoints += teamB;
      }
      if (isFocus(id)) {
        const fm = focusMatch(match);
        fm.work = {
          pointsA: work.pointsA,
          pointsB: work.pointsB,
          teamA,
          teamB,
          sizeA,
          sizeB,
        };
      }
    }
  }

  return {
    batting,
    bowling,
    catches,
    drops,
    allRoundMatches,
    turnout,
    records,
    reachedAt,
    focus,
    matchCount: completed.length,
  };
}

function bestFigures(agg: BowlAgg): { wickets: number; runs: number } | null {
  let best: { wickets: number; runs: number } | null = null;
  for (const per of Array.from(agg.perInnings.values())) {
    if (
      !best ||
      per.wickets > best.wickets ||
      (per.wickets === best.wickets && per.runs < best.runs)
    ) {
      best = { wickets: per.wickets, runs: per.runs };
    }
  }
  return best;
}

/**
 * Gully cricket: nobody disappears from their own leaderboard. Qualification
 * only sorts thin samples below real ones — a single-over cameo can't leapfrog
 * a season's bowling on economy.
 */
const MIN_BALLS_FACED = 6;
const MIN_LEGAL_BALLS_BOWLED = 6;

/**
 * Ranked rows, built once. The profile reports "#3 of 14 by runs" against the
 * exact ordering the Leaders tab shows, so the two screens can never disagree
 * about where somebody stands.
 */
function buildBattingRows(
  batting: Map<string, BatAgg>,
  names: Map<string, string>,
) {
  return Array.from(batting.values())
    .map((agg) => ({
      userId: agg.userId,
      displayName: names.get(String(agg.userId)) ?? "Player",
      runs: agg.runs,
      innings: agg.innings.size,
      balls: agg.balls,
      fours: agg.fours,
      sixes: agg.sixes,
      dots: agg.dots,
      ducks: agg.ducks,
      goldenDucks: agg.goldenDucks,
      notOuts: Math.max(0, agg.innings.size - agg.dismissals),
      bestScore: agg.bestScore,
      strikeRate: agg.balls > 0 ? (agg.runs / agg.balls) * 100 : 0,
      average: agg.dismissals > 0 ? agg.runs / agg.dismissals : agg.runs,
      qualified: agg.balls >= MIN_BALLS_FACED,
    }))
    .sort(
      (a, b) =>
        Number(b.qualified) - Number(a.qualified) ||
        b.runs - a.runs ||
        b.strikeRate - a.strikeRate,
    );
}

function buildBowlingRows(
  bowling: Map<string, BowlAgg>,
  names: Map<string, string>,
) {
  return Array.from(bowling.values())
    .map((agg) => {
      const best = bestFigures(agg);
      return {
        userId: agg.userId,
        displayName: names.get(String(agg.userId)) ?? "Player",
        wickets: agg.wickets,
        oversText: legalBallToOverText(agg.legalBalls, 6),
        runs: agg.runs,
        dots: agg.dots,
        widesNoballs: agg.widesNoballs,
        sixesConceded: agg.sixesConceded,
        innings: agg.innings.size,
        economy: agg.legalBalls > 0 ? agg.runs / (agg.legalBalls / 6) : 0,
        best: best ? `${best.wickets}/${best.runs}` : "\u2014",
        legalBalls: agg.legalBalls,
        qualified: agg.legalBalls >= MIN_LEGAL_BALLS_BOWLED,
      };
    })
    .sort(
      (a, b) =>
        Number(b.qualified) - Number(a.qualified) ||
        b.wickets - a.wickets ||
        a.economy - b.economy,
    );
}

/**
 * Who turns up, most first. Its own board rather than a column on the
 * all-round rows because those are filtered to `points > 0` — the player who
 * was picked and did nothing is dropped there, and they are precisely the
 * player a turnout board exists to show.
 *
 * Sorted descending (most regular first) on purpose. The "who's irregular"
 * joke reads from the bottom of this list, but a board that *ranks* people by
 * absence would be a standing shaming surface; the roast belongs on the
 * records page, where it's one name and a punchline.
 */
/** Enough decided matches that a 100% off one game cannot sit on top. */
const RECORD_MIN_DECIDED = 3;

function buildRecordRows(
  records: Map<string, RecordAgg>,
  names: Map<string, string>,
) {
  return Array.from(records.values())
    .map((agg) => {
      const winPct = agg.decided > 0 ? (agg.wins / agg.decided) * 100 : 0;
      const contributionPct =
        agg.teamPoints > 0 ? (agg.playerPoints / agg.teamPoints) * 100 : 0;
      return {
        userId: agg.userId,
        displayName: names.get(String(agg.userId)) ?? "Player",
        wins: agg.wins,
        decided: agg.decided,
        winPct,
        contributionPct,
        qualifiedWin: agg.decided >= RECORD_MIN_DECIDED,
        qualifiedContrib: agg.teamPoints > 0 && agg.decided >= RECORD_MIN_DECIDED,
      };
    })
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
}

function buildTurnoutRows(
  turnout: Map<string, number>,
  names: Map<string, string>,
) {
  return Array.from(turnout.entries())
    .map(([key, matches]) => ({
      userId: key as Id<"users">,
      displayName: names.get(key) ?? "Player",
      matches,
      // Turnout has no minimum sample to clear — being named in one match is
      // already the whole measure.
      qualified: true,
    }))
    .sort(
      (a, b) =>
        b.matches - a.matches || a.displayName.localeCompare(b.displayName),
    );
}

/**
 * Butterfingers material: dropped catches, most first. Its own board, same
 * shape as turnout — drop keys are not guaranteed to be a subset of batting,
 * bowling or catches (a fielder who only ever drops one still has to name),
 * so it needs its own name-resolution reach exactly like turnout does.
 */
function buildDropsRows(drops: Map<string, number>, names: Map<string, string>) {
  return Array.from(drops.entries())
    .map(([key, count]) => ({
      userId: key as Id<"users">,
      displayName: names.get(key) ?? "Player",
      drops: count,
    }))
    .sort(
      (a, b) => b.drops - a.drops || a.displayName.localeCompare(b.displayName),
    );
}

/**
 * All-round points: base (runs + 20/wicket + 8/catch) plus the milestone
 * bonuses from convex/lib/points.ts — batting bonuses per innings, the
 * wicket-haul bonus per match. Must stay identical to `potmPoints` in
 * convex/story.ts (Player-of-the-Match) — the two are not allowed to drift.
 */
function buildAllRoundRows(
  batting: Map<string, BatAgg>,
  bowling: Map<string, BowlAgg>,
  catches: Map<string, number>,
  allRoundMatches: Map<string, Set<string>>,
  names: Map<string, string>,
) {
  const keys = new Set<string>([
    ...Array.from(batting.keys()),
    ...Array.from(bowling.keys()),
    ...Array.from(catches.keys()),
  ]);
  return Array.from(keys)
    .map((key) => {
      const runs = batting.get(key)?.runs ?? 0;
      const wickets = bowling.get(key)?.wickets ?? 0;
      const catchCount = catches.get(key) ?? 0;
      let bonus = 0;
      const inningsScores = batting.get(key)?.scoreThisInnings;
      if (inningsScores)
        for (const score of Array.from(inningsScores.values()))
          bonus += battingMilestoneBonus(score);
      const haulWickets = bowling.get(key)?.wicketsByMatch;
      if (haulWickets)
        for (const w of Array.from(haulWickets.values()))
          bonus += bowlingHaulBonus(w);
      return {
        // A fielding-only all-rounder (a catch, nothing else) has no batting
        // or bowling agg to pull userId from, so fall back to the map key —
        // it's the stringified userId itself.
        userId: (batting.get(key)?.userId ??
          bowling.get(key)?.userId ??
          (key as Id<"users">)) as Id<"users">,
        displayName: names.get(key) ?? "Player",
        points: basePoints(runs, wickets, catchCount) + bonus,
        runs,
        wickets,
        catches: catchCount,
        matches: allRoundMatches.get(key)?.size ?? 0,
      };
    })
    .filter((r) => r.points > 0)
    .sort(
      (a, b) =>
        b.points - a.points ||
        b.runs - a.runs ||
        a.displayName.localeCompare(b.displayName),
    );
}

/**
 * Nemesis: the best of `score` among already-eligible opponents, ties going to
 * whoever met them most recently — a rivalry is about who has the upper hand
 * *now*, which is the tie-break rule for every nemesis on the page.
 */
function pickH2H(
  entries: Head2Head[],
  score: (e: Head2Head) => number,
  better: (a: number, b: number) => boolean = (a, b) => a > b,
): Head2Head | null {
  let best: Head2Head | null = null;
  for (const e of entries) {
    if (
      !best ||
      better(score(e), score(best)) ||
      (score(e) === score(best) &&
        (e.at > best.at || (e.at === best.at && e.seq > best.seq)))
    ) {
      best = e;
    }
  }
  return best;
}

/** Two dismissals to own a batter; an over faced to have taken a bowler on. */
const NEMESIS_MIN_OUTS = 2;
const NEMESIS_MIN_BALLS = 6;

async function resolveNames(ctx: QueryCtx, keys: Iterable<string>) {
  const names = new Map<string, string>();
  await Promise.all(
    Array.from(keys).map(async (key) => {
      const u = await ctx.db.get(key as Id<"users">);
      if (u && "displayName" in u) names.set(key, u.displayName as string);
    }),
  );
  return names;
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Stamps each current row with where it sat a week ago, so the board can draw
 * a ↑/↓ against a name. A row is only "ranked" if it clears the qualification
 * bar (all-round rows carry no bar, so they always count) — matching exactly
 * what the reader sees numbered on screen, so the arrow can't point at a rank
 * the list never showed. `prevRank` is null for anyone who wasn't ranked a
 * week ago: a genuinely new face on the board.
 */
function withMovement<T extends { userId: Id<"users">; qualified?: boolean }>(
  current: T[],
  previous: T[],
): Array<T & { prevRank: number | null }> {
  const prevRankByUser = new Map<string, number>();
  let rank = 0;
  for (const r of previous) {
    if ((r.qualified ?? true) === false) continue;
    rank += 1;
    prevRankByUser.set(String(r.userId), rank);
  }
  return current.map((r) => ({
    ...r,
    prevRank: prevRankByUser.get(String(r.userId)) ?? null,
  }));
}

function stampTags<T extends { userId: Id<"users"> }>(
  rows: T[],
  tags: Map<string, PlayerTag[]>,
): Array<T & { playerTags: PlayerTag[] }> {
  return rows.map((r) => ({
    ...r,
    playerTags: tags.get(String(r.userId)) ?? [],
  }));
}

function boardFilter<T extends { playerTags: PlayerTag[] }>(
  rows: T[],
  includeVisitorsAndJuniors: boolean,
) {
  if (includeVisitorsAndJuniors) return rows;
  return rows.filter((r) => isBoardRegular(r.playerTags));
}

/**
 * Turnout and the reached-at marks, stamped onto whatever board row is being
 * ranked. Only the award tie-break ladder reads these — the Leaders payload
 * builds its own rows and never sees them.
 */
function stampContender<T extends { userId: Id<"users"> }>(
  rows: T[],
  turnout: Map<string, number>,
  reachedAt: Map<string, Map<string, number>>,
): Array<T & { turnoutMatches: number; at: Map<string, number> }> {
  return rows.map((r) => ({
    ...r,
    turnoutMatches: turnout.get(String(r.userId)) ?? 0,
    at: reachedAt.get(String(r.userId)) ?? new Map<string, number>(),
  }));
}

export async function loadRegularsBoard(
  ctx: QueryCtx | MutationCtx,
  orgId: Id<"orgs">,
  window: { afterTs?: number; beforeTs?: number } = {},
) {
  const snap = await aggregateOrg(ctx, orgId, window);
  // Drops and turnout reach players who never batted, bowled or held a catch —
  // the Butterfingers roast and the roast floor both need those names.
  const keys = [
    ...Array.from(snap.batting.keys()),
    ...Array.from(snap.bowling.keys()),
    ...Array.from(snap.catches.keys()),
    ...Array.from(snap.drops.keys()),
    ...Array.from(snap.turnout.keys()),
  ];
  const names = await resolveNames(ctx, keys);
  const tags = await tagsForUsers(ctx, orgId, keys);

  // One row per regular who turned out at all, carrying every counter the
  // shelf ranks on. Built here rather than on the three boards because a
  // player who only ever dropped a catch belongs on the shelf and on none
  // of them.
  const shelf: ShelfRow[] = Array.from(new Set(keys))
    .filter((key) => isBoardRegular(tags.get(key) ?? []))
    .map((key) => {
      const bat = snap.batting.get(key);
      const bowl = snap.bowling.get(key);
      return {
        userId: (bat?.userId ?? bowl?.userId ?? key) as Id<"users">,
        displayName: names.get(key) ?? "Player",
        turnoutMatches: snap.turnout.get(key) ?? 0,
        at: snap.reachedAt.get(key) ?? new Map<string, number>(),
        runs: bat?.runs ?? 0,
        fours: bat?.fours ?? 0,
        sixes: bat?.sixes ?? 0,
        ballsFaced: bat?.balls ?? 0,
        singles: bat?.singles ?? 0,
        dotsFaced: bat?.dots ?? 0,
        ducks: bat?.facedDucks ?? 0,
        wickets: bowl?.wickets ?? 0,
        legalBallsBowled: bowl?.legalBalls ?? 0,
        dotsConceded: bowl?.dots ?? 0,
        catches: snap.catches.get(key) ?? 0,
        drops: snap.drops.get(key) ?? 0,
      };
    });

  return {
    matchCount: snap.matchCount,
    allRound: stampContender(
      boardFilter(
        stampTags(
          buildAllRoundRows(
            snap.batting,
            snap.bowling,
            snap.catches,
            snap.allRoundMatches,
            names,
          ),
          tags,
        ),
        false,
      ),
      snap.turnout,
      snap.reachedAt,
    ),
    batting: stampContender(
      boardFilter(stampTags(buildBattingRows(snap.batting, names), tags), false),
      snap.turnout,
      snap.reachedAt,
    ),
    bowling: stampContender(
      boardFilter(stampTags(buildBowlingRows(snap.bowling, names), tags), false),
      snap.turnout,
      snap.reachedAt,
    ),
    shelf,
  };
}

export const leaderboard = query({
  args: {
    token: v.optional(v.string()),
    orgId: v.id("orgs"),
    /**
     * Default hides visitors and juniors. Pass true for auto-form teams and
     * the Leaders "Everyone" toggle, so ranks and weekly arrows stay honest.
     */
    includeVisitorsAndJuniors: v.optional(v.boolean()),
    seasonId: v.optional(v.id("seasons")),
    /** Tests or limited only. Omit for the mixed board (the default). */
    format: v.optional(matchFormat),
  },
  handler: async (ctx, args) => {
    try {
      await requireActiveMembership(ctx, args.token, args.orgId);
    } catch {
      return null;
    }

    const includeExtras = args.includeVisitorsAndJuniors === true;
    const now = Date.now();
    let afterTs: number | undefined;
    let beforeTs: number | undefined;
    let prevAfterTs: number | undefined;
    let prevBeforeTs: number | undefined = now - WEEK_MS;

    if (args.seasonId) {
      const season = await ctx.db.get(args.seasonId);
      if (!season || String(season.orgId) !== String(args.orgId)) return null;
      afterTs = season.startedAt;
      // Completed seasons freeze at endedAt; active ones use now.
      const windowEnd = Math.min(now, season.endedAt ?? now);
      beforeTs = windowEnd;
      prevAfterTs = season.startedAt;
      // Weekly lookback clipped into the season. If this is before startedAt
      // the previous snapshot is empty and baselineMatches is 0.
      prevBeforeTs = windowEnd - WEEK_MS;
    }

    const current = await aggregateOrg(ctx, args.orgId, {
      afterTs,
      beforeTs,
      format: args.format,
    });
    const previous = await aggregateOrg(ctx, args.orgId, {
      afterTs: prevAfterTs,
      beforeTs: prevBeforeTs,
      format: args.format,
    });

    // One name map for both snapshots — a week-ago player is always a subset of
    // today's, so today's keys cover everyone either snapshot can name.
    const keys = [
      ...Array.from(current.batting.keys()),
      ...Array.from(current.bowling.keys()),
      ...Array.from(current.catches.keys()),
      // Turnout reaches players who never touched the ball, so its keys are
      // not a subset of the three above — without this they'd render "Player".
      ...Array.from(current.turnout.keys()),
      // Same trap for drops: a fielder can put one down without ever batting,
      // bowling or holding a catch that innings.
      ...Array.from(current.drops.keys()),
      ...Array.from(current.records.keys()),
    ];
    const names = await resolveNames(ctx, keys);
    const tags = await tagsForUsers(ctx, args.orgId, keys);

    const rows = (snap: typeof current) => ({
      allRound: boardFilter(
        stampTags(
          buildAllRoundRows(
            snap.batting,
            snap.bowling,
            snap.catches,
            snap.allRoundMatches,
            names,
          ),
          tags,
        ),
        includeExtras,
      ),
      batting: boardFilter(
        stampTags(buildBattingRows(snap.batting, names), tags),
        includeExtras,
      ),
      bowling: boardFilter(
        stampTags(buildBowlingRows(snap.bowling, names), tags),
        includeExtras,
      ),
      turnout: boardFilter(
        stampTags(buildTurnoutRows(snap.turnout, names), tags),
        includeExtras,
      ),
      drops: boardFilter(
        stampTags(buildDropsRows(snap.drops, names), tags),
        includeExtras,
      ),
      records: boardFilter(
        stampTags(buildRecordRows(snap.records, names), tags),
        includeExtras,
      ),
    });
    const cur = rows(current);
    const prev = rows(previous);

    const seen = new Set(keys);
    let excludedCount = 0;
    for (const key of Array.from(seen)) {
      if (!isBoardRegular(tags.get(key) ?? [])) excludedCount += 1;
    }

    return {
      matchCount: current.matchCount,
      excludedCount,
      includeVisitorsAndJuniors: includeExtras,
      // The reader only trusts movement once there's a past to move from —
      // with no baseline every name would flag "new", which is just noise.
      weekly: {
        baselineMatches: previous.matchCount,
        newMatches: current.matchCount - previous.matchCount,
      },
      allRound: withMovement(cur.allRound, prev.allRound),
      batting: withMovement(cur.batting, prev.batting),
      bowling: withMovement(cur.bowling, prev.bowling),
      turnout: withMovement(cur.turnout, prev.turnout),
      // No weekly movement — drops back only the Butterfingers roast tile,
      // which is all-time, not a ranked board with its own ↑/↓ arrows.
      drops: cur.drops,
      records: cur.records,
    };
  },
});

/**
 * The window a season covers, exactly as the Leaders board reads it: from
 * startedAt, and frozen at endedAt once the season is complete so a finished
 * season never quietly picks up a later match. Null means "not this org's
 * season", which every caller turns into an empty answer.
 */
async function seasonWindow(
  ctx: QueryCtx,
  orgId: Id<"orgs">,
  seasonId: Id<"seasons">,
): Promise<{ afterTs: number; beforeTs: number } | null> {
  const season = await ctx.db.get(seasonId);
  if (!season || String(season.orgId) !== String(orgId)) return null;
  const now = Date.now();
  return {
    afterTs: season.startedAt,
    beforeTs: Math.min(now, season.endedAt ?? now),
  };
}

/**
 * A finished season's shelf, rebuilt from what that season stamped when it
 * closed. Same rule the season page and its wrap cards already follow: history
 * is frozen, and a match edited, abandoned or deleted after the season ended
 * must not rewrite who won. Only the twelve shelf kinds come back — the six
 * legacy caps are a Leaders idea and have no card here — in SHELF order,
 * with tone.
 */
async function stampedShelfAwards(
  ctx: QueryCtx,
  awards: SeasonAward[],
): Promise<ShelfAward[]> {
  const mine = awards.filter((a) => isShelfKind(a.kind));
  const names = await resolveNames(
    ctx,
    mine.map((a) => String(a.userId)),
  );
  const byKind = new Map(mine.map((a) => [String(a.kind), a]));
  const out: ShelfAward[] = [];
  for (const kind of SHELF_KINDS) {
    const a = byKind.get(kind);
    if (!a) continue;
    out.push({
      kind,
      userId: a.userId,
      displayName: names.get(String(a.userId)) ?? "Player",
      value: a.value,
      display: a.display,
      tone: awardTone(kind),
      // Always empty: the stamp records the winner, not the field. A frozen
      // season cannot recompute who tied without recomputing the season.
      tiedWith: [],
    });
  }
  return out;
}

/**
 * The trophy shelf: one winner per award, honours then roasts. Regulars only,
 * same population as the season awards, so the live shelf and the stamped
 * season can never name different people off the same cricket.
 *
 * Always a season. A trophy is rolling — it moves to whoever claims it next —
 * and an all-time shelf would just freeze the same names forever, so there is
 * no all-time shelf to ask for.
 */
export const shelf = query({
  args: {
    token: v.optional(v.string()),
    orgId: v.id("orgs"),
    seasonId: v.id("seasons"),
  },
  handler: async (ctx, args) => {
    try {
      await requireActiveMembership(ctx, args.token, args.orgId);
    } catch {
      return null;
    }

    const season = await ctx.db.get(args.seasonId);
    if (!season || String(season.orgId) !== String(args.orgId)) return null;

    // A closed season serves the stamp it took when it ended. Recomputing it
    // would let a match edited afterwards rewrite history, and Records would
    // then disagree with that season's own wrap cards. Only the live season
    // is computed fresh — it is still up for grabs.
    //
    // The one exception is a season stamped before the twelve shelf awards
    // existed: its stamp holds only the legacy caps, so the filter above finds
    // nothing and the shelf would come back as twelve empty slots. There is no
    // history to honour there, so it recomputes. A *partial* stamp is still
    // authoritative — one shelf kind is enough — because mixing stamped and
    // recomputed winners on one board would name two people off one season.
    if (season.status === "complete") {
      const stamped = await stampedShelfAwards(ctx, season.awards ?? []);
      if (stamped.length > 0) return { awards: stamped };
    }

    const w = await seasonWindow(ctx, args.orgId, args.seasonId);
    if (!w) return null;
    const board = await loadRegularsBoard(ctx, args.orgId, w);
    return { awards: awardsFromShelf(board.shelf) };
  },
});

export const playerStats = query({
  args: {
    token: v.optional(v.string()),
    orgId: v.id("orgs"),
    userId: v.id("users"),
    /** Omit for the career numbers — the default every profile shows. */
    seasonId: v.optional(v.id("seasons")),
  },
  handler: async (ctx, args) => {
    try {
      await requireActiveMembership(ctx, args.token, args.orgId);
    } catch {
      return null;
    }

    const player = await ctx.db.get(args.userId);
    if (!player) return null;

    let window: { afterTs?: number; beforeTs?: number } = {};
    if (args.seasonId) {
      const w = await seasonWindow(ctx, args.orgId, args.seasonId);
      if (!w) return null;
      window = w;
    }

    const { batting, bowling, focus } = await aggregateOrg(ctx, args.orgId, {
      ...window,
      focusPlayerId: args.userId,
    });
    const names = await resolveNames(ctx, [
      ...Array.from(batting.keys()),
      ...Array.from(bowling.keys()),
    ]);
    const labels = await tagsForUsers(ctx, args.orgId, [
      ...Array.from(batting.keys()),
      ...Array.from(bowling.keys()),
      String(args.userId),
    ]);
    const key = String(args.userId);
    const bat = batting.get(key);
    const bowl = bowling.get(key);
    const best = bowl ? bestFigures(bowl) : null;

    // Distinct innings they took part in, batting or bowling — a Test where
    // they came out twice and bowled twice is 4 innings, not the 1 match it
    // sits inside, and a specialist bowler's 0 batting innings never drags
    // this down since it's a union, not a sum.
    const inningsPlayed = new Set([
      ...Array.from(bat?.innings ?? []),
      ...Array.from(bowl?.innings ?? []),
    ]).size;

    // Rank against the default Leaders board (regulars only), so "#3 of 14"
    // cannot disagree with what the tab shows until someone flips Everyone.
    const battingRows = boardFilter(
      stampTags(buildBattingRows(batting, names), labels),
      false,
    );
    const bowlingRows = boardFilter(
      stampTags(buildBowlingRows(bowling, names), labels),
      false,
    );
    const rankOf = (
      rows: Array<{ userId: Id<"users">; qualified: boolean }>,
    ) => {
      const ranked = rows.filter((r) => r.qualified);
      const idx = ranked.findIndex((r) => String(r.userId) === key);
      return idx >= 0 ? { rank: idx + 1, of: ranked.length } : null;
    };

    const counts = (m: Map<string, number>) =>
      Array.from(m.entries())
        .map(([type, count]) => ({ type, count }))
        .sort((a, b) => b.count - a.count);

    // Four match-ups: for each situation this player can be in, the opponent
    // who gets the better of them and the one they get the better of. Both
    // sides of the same head-to-head tables, so the two always agree.
    const faced = Array.from(focus.byBowler.values()).filter((e) => e.balls > 0);
    const bowledAt = Array.from(focus.byBatter.values()).filter(
      (e) => e.balls > 0,
    );
    const enough = (list: Head2Head[]) =>
      list.filter((e) => e.balls >= NEMESIS_MIN_BALLS);
    const not = (list: Head2Head[], exclude: Head2Head | null) =>
      exclude ? list.filter((e) => e !== exclude) : list;
    const sr = (e: Head2Head) => (e.runs / e.balls) * 100;

    // Batting. Toughest is whoever takes the wicket most; failing that — a
    // batter whose dismissals are all run-outs has no bowler to their name —
    // whoever they score slowest against. Easiest is simply who they get after.
    const dismissers = faced.filter((e) => e.outs >= NEMESIS_MIN_OUTS);
    const batToughest = dismissers.length
      ? pickH2H(dismissers, (e) => e.outs)
      : pickH2H(enough(faced), sr, (a, b) => a < b);
    const batEasiest = pickH2H(not(enough(faced), batToughest), sr);

    // Bowling, mirrored: toughest is whoever scores most off them, easiest is
    // whoever they dismiss most — or keep quietest, if nobody qualifies.
    const bowlToughest = pickH2H(enough(bowledAt), (e) => e.runs);
    const victims = bowledAt.filter((e) => e.outs >= NEMESIS_MIN_OUTS);
    const bowlEasiest = victims.length
      ? pickH2H(not(victims, bowlToughest), (e) => e.outs)
      : pickH2H(not(enough(bowledAt), bowlToughest), sr, (a, b) => a < b);

    const fielderNemesis = pickH2H(
      Array.from(focus.byFielder.values()).filter(
        (e) => e.outs >= NEMESIS_MIN_OUTS,
      ),
      (e) => e.outs,
    );

    // One resolve covering the nemesis picks and every opponent in the full
    // per-bowler / per-batter tables (the picks are a subset of those lists,
    // plus the fielder nemesis which is not).
    const nemesisNames = await resolveNames(ctx, [
      ...faced.map((e) => String(e.userId)),
      ...bowledAt.map((e) => String(e.userId)),
      ...(fielderNemesis ? [String(fielderNemesis.userId)] : []),
    ]);
    const named = (e: Head2Head) => ({
      userId: e.userId,
      displayName: nemesisNames.get(String(e.userId)) ?? "Player",
      runs: e.runs,
      balls: e.balls,
      outs: e.outs,
    });

    // The full match-up tables behind the nemesis card: how this player fares
    // against every bowler they've faced, and every batter they've bowled to.
    // Most-faced opponents first — the rivalries with the deepest history.
    const matchupRow = (e: Head2Head) => ({
      userId: e.userId,
      displayName: nemesisNames.get(String(e.userId)) ?? "Player",
      runs: e.runs,
      balls: e.balls,
      outs: e.outs,
      fours: e.fours,
      sixes: e.sixes,
      dots: e.dots,
      strikeRate: e.balls > 0 ? (e.runs / e.balls) * 100 : 0,
    });
    const byEncounters = (
      a: { balls: number; runs: number },
      b: { balls: number; runs: number },
    ) => b.balls - a.balls || b.runs - a.runs;
    const vsBowlers = faced.map(matchupRow).sort(byEncounters);
    const vsBatters = bowledAt.map(matchupRow).sort(byEncounters);

    // Newest first — a profile is read for current form, not for history.
    const focusMatches = Array.from(focus.perMatch.values()).sort(
      (a, b) => b.match.createdAt - a.match.createdAt,
    );

    const sideLabel = async (m: Doc<"matches">, side: "A" | "B") => {
      const ids = side === "A" ? m.sideAPlayerIds : m.sideBPlayerIds;
      const captain = ids[0] ? await ctx.db.get(ids[0]) : null;
      return captainTeamLabel(
        side === "A" ? m.sideAName : m.sideBName,
        captain && "displayName" in captain
          ? (captain.displayName as string)
          : undefined,
      );
    };

    const log = await Promise.all(
      focusMatches.map(async (fm) => {
        const m = fm.match;
        const onA = m.sideAPlayerIds.some((id) => String(id) === key);
        const onB = m.sideBPlayerIds.some((id) => String(id) === key);
        // Common players turn out for both sides, so there is no "opponent"
        // and no win or loss to claim — say so rather than pick a side.
        const side = onA && !onB ? "A" : onB && !onA ? "B" : undefined;
        const work = fm.work;
        const args = work
          ? {
              onA,
              onB,
              winnerSide: m.winnerSide,
              pointsA: work.pointsA,
              pointsB: work.pointsB,
              teamA: work.teamA,
              teamB: work.teamB,
              sizeA: work.sizeA,
              sizeB: work.sizeB,
            }
          : null;
        const [labelA, labelB] = await Promise.all([
          sideLabel(m, "A"),
          sideLabel(m, "B"),
        ]);
        return {
          matchId: m._id,
          date: m.createdAt,
          format: m.ruleSnapshot.format,
          opponent:
            side === "A" ? labelB : side === "B" ? labelA : `${labelA} v ${labelB}`,
          bothSides: side === undefined,
          result: args
            ? matchResult(args)
            : side === undefined || m.winnerSide === undefined
              ? ("none" as const)
              : m.winnerSide === side
                ? ("won" as const)
                : ("lost" as const),
          contributionPct: args
            ? asPct(
                matchContribution({
                  onA,
                  onB,
                  pointsA: args.pointsA,
                  pointsB: args.pointsB,
                  teamA: args.teamA,
                  teamB: args.teamB,
                }),
              )
            : null,
          // Innings order within the match, so a Test reads "34 & 12*".
          bat: Array.from(fm.bat.values()),
          bowl: Array.from(fm.bowl.values()).map((s) => ({
            ...s,
            oversText: legalBallToOverText(s.legalBalls, 6),
          })),
        };
      }),
    );

    const scores = log
      .flatMap((r) => r.bat)
      .filter((b) => b.balls > 0 || b.out);

    let wins = 0;
    let decided = 0;
    const contribRows: Array<{ playerPoints: number; teamPoints: number }> = [];
    for (const fm of Array.from(focus.perMatch.values())) {
      const m = fm.match;
      const onA = m.sideAPlayerIds.some((id) => String(id) === key);
      const onB = m.sideBPlayerIds.some((id) => String(id) === key);
      const work = fm.work;
      if (!work) continue;
      if (m.winnerSide) {
        decided += 1;
        if (
          matchResult({
            onA,
            onB,
            winnerSide: m.winnerSide,
            pointsA: work.pointsA,
            pointsB: work.pointsB,
            teamA: work.teamA,
            teamB: work.teamB,
            sizeA: work.sizeA,
            sizeB: work.sizeB,
          }) === "won"
        ) {
          wins += 1;
        }
      }
      if (onA && onB) {
        contribRows.push({
          playerPoints: work.pointsA + work.pointsB,
          teamPoints: work.teamA + work.teamB,
        });
      } else if (onA) {
        contribRows.push({
          playerPoints: work.pointsA,
          teamPoints: work.teamA,
        });
      } else if (onB) {
        contribRows.push({
          playerPoints: work.pointsB,
          teamPoints: work.teamB,
        });
      }
    }

    return {
      userId: args.userId,
      displayName: player.displayName,
      isGuest: player.isGuest ?? false,
      playerTags: labels.get(key) ?? [],
      photoUrl: player.photoUrl,
      bio: player.bio,
      primaryRole: player.primaryRole,
      secondaryRole: player.secondaryRole,
      matchesPlayed: focus.perMatch.size,
      inningsPlayed,
      record: {
        wins,
        decided,
        winPct: decided > 0 ? (wins / decided) * 100 : null,
        contributionPct: asPct(careerContribution(contribRows)),
      },
      /**
       * Both sides of every match-up, in one shape so the card can render all
       * four cells identically: name, runs off balls, and how often it ended
       * in a wicket. Nothing for the reader to convert in their head.
       */
      matchups: {
        batting: {
          toughest: batToughest ? named(batToughest) : null,
          easiest: batEasiest ? named(batEasiest) : null,
        },
        bowling: {
          toughest: bowlToughest ? named(bowlToughest) : null,
          easiest: bowlEasiest ? named(bowlEasiest) : null,
        },
        // Who keeps ending it in the field — across every dismissal, so it is
        // reported on its own rather than folded into a bowler's tally.
        fielder: fielderNemesis
          ? {
              userId: fielderNemesis.userId,
              displayName:
                nemesisNames.get(String(fielderNemesis.userId)) ?? "Player",
              outs: fielderNemesis.outs,
            }
          : null,
      },
      // The full match-up tables — every bowler faced, every batter bowled to.
      // vsBowlers reads as batting (runs scored, strike rate); vsBatters reads
      // as bowling (runs conceded, wickets), so each sits under its own card.
      vsBowlers,
      vsBatters,
      batting: bat
        ? {
            runs: bat.runs,
            innings: bat.innings.size,
            balls: bat.balls,
            fours: bat.fours,
            sixes: bat.sixes,
            dots: bat.dots,
            notOuts: Math.max(0, bat.innings.size - bat.dismissals),
            bestScore: bat.bestScore,
            strikeRate: bat.balls > 0 ? (bat.runs / bat.balls) * 100 : 0,
            average: bat.dismissals > 0 ? bat.runs / bat.dismissals : bat.runs,
            /** Share of runs that came in fours and sixes. */
            boundaryRuns: bat.fours * 4 + bat.sixes * 6,
            thirties: scores.filter((s) => s.runs >= 30 && s.runs < 50).length,
            fifties: scores.filter((s) => s.runs >= 50).length,
            dismissalTypes: counts(focus.dismissalTypes),
            rank: rankOf(battingRows),
          }
        : null,
      bowling: bowl
        ? {
            wickets: bowl.wickets,
            oversText: legalBallToOverText(bowl.legalBalls, 6),
            legalBalls: bowl.legalBalls,
            runs: bowl.runs,
            dots: bowl.dots,
            innings: bowl.innings.size,
            economy:
              bowl.legalBalls > 0 ? bowl.runs / (bowl.legalBalls / 6) : 0,
            average: bowl.wickets > 0 ? bowl.runs / bowl.wickets : null,
            /** Balls per wicket — the wicket-taker vs container axis. */
            strikeRate:
              bowl.wickets > 0 ? bowl.legalBalls / bowl.wickets : null,
            best: best ? `${best.wickets}/${best.runs}` : null,
            wicketTypes: counts(focus.wicketTypes),
            rank: rankOf(bowlingRows),
          }
        : null,
      log,
    };
  },
});

