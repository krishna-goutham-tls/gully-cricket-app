import { v } from "convex/values";
import { query } from "./_generated/server";
import { Id } from "./_generated/dataModel";
import { legalBallToOverText, type WicketType } from "./lib/scoring";
import {
  basePoints,
  battingMilestoneBonus,
  bowlingHaulBonus,
  POINTS_RECEIPT,
} from "./lib/points";
import { loadMatchAccess, sideLabel, sidePlayers } from "./scoring";

type Side = "A" | "B";

/**
 * The Match Story — everything on this page is derived from the ball log at
 * read time, so it exists retroactively for every completed match and never
 * asks the scorer for anything new. Badges, the lead worm, the turning point
 * and nemesis counts are all deterministic replays of data already recorded.
 */

/** One delivery on the story timeline (retire markers are skipped). */
type StoryBall = {
  /** 1-based innings index, chronological. */
  inn: number;
  side: Side;
  over: number;
  ballInOver: number;
  runsBat: number;
  extrasRuns: number;
  wicketType?: WicketType;
  outName?: string;
  strikerName: string;
  bowlerName: string;
  fielderName?: string;
  /** Batting-first side's cumulative runs minus the other side's. */
  lead: number;
  at: number;
  /** Batter milestone crossed on this ball. */
  milestone?: "fifty" | "hundred";
  /**
   * All-time count (this org, completed matches, chronological) of this
   * bowler dismissing this batter, attached only from the 3rd time on —
   * the "that's the Nth time he's got you" moment.
   */
  nemesisCount?: number;
};

type Badge = {
  key: string;
  name: string;
  playerName: string;
  /** One line under the player's name. */
  stat: string;
  /** The working behind the award — every badge shows its receipt. */
  receipt: string;
  kind: "shine" | "roast";
};

type PlayerAgg = {
  id: Id<"users">;
  name: string;
  runs: number;
  ballsFaced: number;
  sixes: number;
  dots: number;
  /** Innings in which this player was dismissed first ball for 0. */
  goldenDucks: number;
  wickets: number;
  runsConceded: number;
  ballsBowled: number;
  /** Wides + no-balls bowled (count of deliveries, not runs). */
  illegalBalls: number;
  catches: number;
  /** Final score of each innings batted — milestone bonuses are per innings. */
  inningsScores: number[];
};

function ordinalWord(n: number) {
  return n === 1 ? "1st" : n === 2 ? "2nd" : n === 3 ? "3rd" : `${n}th`;
}

export const matchStory = query({
  args: {
    token: v.optional(v.string()),
    matchId: v.id("matches"),
  },
  handler: async (ctx, args) => {
    const access = await loadMatchAccess(ctx, args.token, args.matchId);
    if (!access) return null;
    const { match } = access;
    if (match.status !== "completed") return null;
    const rules = match.ruleSnapshot;

    const inningsList = (
      await ctx.db
        .query("innings")
        .withIndex("by_match", (q) => q.eq("matchId", match._id))
        .collect()
    ).sort((a, b) => a.inningsNo - b.inningsNo);
    if (inningsList.length === 0) return null;

    const ballsByInnings = await Promise.all(
      inningsList.map(async (inn) =>
        (
          await ctx.db
            .query("balls")
            .withIndex("by_innings", (q) => q.eq("inningsId", inn._id))
            .collect()
        ).sort((a, b) => a.sequence - b.sequence),
      ),
    );

    // Resolve every involved name once.
    const nameCache = new Map<string, string>();
    const nameOf = async (id: Id<"users">) => {
      const key = String(id);
      const hit = nameCache.get(key);
      if (hit !== undefined) return hit;
      const u = await ctx.db.get(id);
      const name =
        u && "displayName" in u ? (u.displayName as string) : "Player";
      nameCache.set(key, name);
      return name;
    };

    // ---- Nemesis: chronological bowler→victim ordinals across the org ----
    // Same on-demand ball-log scan stats.ts already does for leaderboards;
    // org scale keeps this cheap, and it stays org-scoped (sandbox orgs are
    // their own orgs, so they never leak in).
    const orgMatches = await ctx.db
      .query("matches")
      .withIndex("by_org_status", (q) =>
        q.eq("orgId", match.orgId).eq("status", "completed"),
      )
      .collect();
    const wicketEvents: Array<{
      at: number;
      ballId: Id<"balls">;
      bowlerId: Id<"users">;
      outId: Id<"users">;
    }> = [];
    for (const m of orgMatches) {
      const mBalls = await ctx.db
        .query("balls")
        .withIndex("by_match", (q) => q.eq("matchId", m._id))
        .collect();
      for (const b of mBalls) {
        if (
          b.isWicket &&
          !b.isRetire &&
          b.playerOutId &&
          b.wicketType !== "runout"
        ) {
          wicketEvents.push({
            at: b.createdAt,
            ballId: b._id,
            bowlerId: b.bowlerId,
            outId: b.playerOutId,
          });
        }
      }
    }
    wicketEvents.sort((a, b) => a.at - b.at);
    const pairRunning = new Map<string, number>();
    const nemesisByBall = new Map<string, number>();
    for (const e of wicketEvents) {
      const key = `${e.bowlerId}>${e.outId}`;
      const n = (pairRunning.get(key) ?? 0) + 1;
      pairRunning.set(key, n);
      nemesisByBall.set(String(e.ballId), n);
    }

    // ---- Replay this match into a timeline + per-player aggregates ----
    const agg = new Map<string, PlayerAgg>();
    const touch = async (id: Id<"users">): Promise<PlayerAgg> => {
      const key = String(id);
      let a = agg.get(key);
      if (!a) {
        a = {
          id,
          name: await nameOf(id),
          runs: 0,
          ballsFaced: 0,
          sixes: 0,
          dots: 0,
          goldenDucks: 0,
          wickets: 0,
          runsConceded: 0,
          ballsBowled: 0,
          illegalBalls: 0,
          catches: 0,
          inningsScores: [],
        };
        agg.set(key, a);
      }
      return a;
    };

    const battingFirst: Side = inningsList[0].battingSide;
    let firstRuns = 0;
    let secondRuns = 0;
    const timeline: StoryBall[] = [];
    // Per innings: balls each batter faced + their runs, for golden ducks
    // and milestones.
    let totalSixes = 0;
    const overRuns = new Map<string, { runs: number; bowlerId: Id<"users"> }>();

    for (let idx = 0; idx < inningsList.length; idx++) {
      const inn = inningsList[idx];
      const innFaced = new Map<string, number>();
      const innRuns = new Map<string, number>();
      for (const b of ballsByInnings[idx]) {
        if (b.isRetire) continue;
        const total = b.runsBat + b.extrasRuns;
        if (inn.battingSide === battingFirst) firstRuns += total;
        else secondRuns += total;

        const striker = await touch(b.strikerId);
        const bowler = await touch(b.bowlerId);

        // Batter facing: legal balls and no-balls count, wides don't —
        // mirrors the scorecard so figures can never disagree.
        const faced = b.isLegal || b.extrasType === "noball";
        if (faced) {
          striker.ballsFaced += 1;
          innFaced.set(
            String(b.strikerId),
            (innFaced.get(String(b.strikerId)) ?? 0) + 1,
          );
        }
        striker.runs += b.runsBat;
        if (b.runsBat === 6) {
          striker.sixes += 1;
          totalSixes += 1;
        }
        if (faced && b.runsBat === 0 && b.extrasRuns === 0) striker.dots += 1;
        const before = innRuns.get(String(b.strikerId)) ?? 0;
        const after = before + b.runsBat;
        innRuns.set(String(b.strikerId), after);

        bowler.runsConceded += total;
        if (b.isLegal) bowler.ballsBowled += 1;
        if (b.extrasType === "wide" || b.extrasType === "noball") {
          bowler.illegalBalls += 1;
        }
        const overKey = `${idx}:${b.overNumber}`;
        const over = overRuns.get(overKey) ?? { runs: 0, bowlerId: b.bowlerId };
        over.runs += total;
        overRuns.set(overKey, over);

        let outName: string | undefined;
        let fielderName: string | undefined;
        if (b.isWicket && b.playerOutId) {
          outName = await nameOf(b.playerOutId);
          if (b.wicketType !== "runout") bowler.wickets += 1;
          if (b.fielderId) {
            fielderName = await nameOf(b.fielderId);
            if (b.wicketType === "caught") {
              (await touch(b.fielderId)).catches += 1;
            }
          }
          // Golden duck: dismissed facing their first delivery, no runs.
          if (
            b.playerOutId === b.strikerId &&
            faced &&
            innFaced.get(String(b.strikerId)) === 1 &&
            after === 0
          ) {
            striker.goldenDucks += 1;
          }
        }

        const milestone =
          before < 50 && after >= 50
            ? ("fifty" as const)
            : before < 100 && after >= 100
              ? ("hundred" as const)
              : undefined;

        timeline.push({
          inn: idx + 1,
          side: inn.battingSide,
          over: b.overNumber,
          ballInOver: b.ballInOver,
          runsBat: b.runsBat,
          extrasRuns: b.extrasRuns,
          wicketType: b.isWicket ? b.wicketType : undefined,
          outName,
          strikerName: striker.name,
          bowlerName: bowler.name,
          fielderName,
          lead: firstRuns - secondRuns,
          at: b.createdAt,
          milestone,
          nemesisCount:
            b.isWicket && (nemesisByBall.get(String(b._id)) ?? 0) >= 3
              ? nemesisByBall.get(String(b._id))
              : undefined,
        });
      }
      // Bank each batter's final score this innings — milestone bonuses are
      // per innings, so a Test's 30 & 80 earns two, never one 110.
      for (const [key, score] of Array.from(innRuns.entries())) {
        const a = agg.get(key);
        if (a) a.inningsScores.push(score);
      }
    }
    if (timeline.length === 0) return null;

    // ---- Badges: deterministic pool, max 4 shown, one per player, ----
    // ---- at most 2 roasts. Thresholds keep them earned, not filler. ----
    const players = Array.from(agg.values());
    const oversOf = (a: PlayerAgg) => a.ballsBowled / rules.ballsPerOver;
    const byDesc = <T,>(xs: T[], score: (x: T) => number) =>
      [...xs].sort((a, b) => score(b) - score(a));

    const potmPoints = (a: PlayerAgg) =>
      basePoints(a.runs, a.wickets, a.catches) +
      a.inningsScores.reduce((sum, s) => sum + battingMilestoneBonus(s), 0) +
      // One match here by construction, so match wickets = a.wickets.
      bowlingHaulBonus(a.wickets);
    const potm = byDesc(players, potmPoints)[0];

    // The successful chase's top scorer — only when the match was won
    // batting second (a wickets-margin result).
    const lastInn = inningsList[inningsList.length - 1];
    const chaseWon =
      match.winnerSide !== undefined && match.winnerSide === lastInn.battingSide;
    const chaserIds = new Set(
      ballsByInnings[inningsList.length - 1].map((b) => String(b.strikerId)),
    );

    const candidates: Array<Badge & { playerId: string }> = [];
    const push = (
      key: string,
      kind: Badge["kind"],
      name: string,
      a: PlayerAgg,
      stat: string,
      receipt: string,
    ) =>
      candidates.push({
        key,
        kind,
        name,
        playerId: String(a.id),
        playerName: a.name,
        stat,
        receipt,
      });

    if (potm) {
      const runner = byDesc(players, potmPoints)[1];
      push(
        "potm",
        "shine",
        "Player of the Match",
        potm,
        [
          potm.runs > 0 ? `${potm.runs} run${potm.runs === 1 ? "" : "s"}` : null,
          potm.wickets > 0 ? `${potm.wickets} wkts` : null,
          potm.catches > 0 ? `${potm.catches} catches` : null,
        ]
          .filter(Boolean)
          .join(" · ") || "all-round",
        `${potmPoints(potm)} points — ${POINTS_RECEIPT}.` +
          (runner
            ? ` Next best: ${runner.name}, ${potmPoints(runner)}.`
            : ""),
      );
    }
    if (chaseWon) {
      const chasers = players.filter((p) => chaserIds.has(String(p.id)));
      const finisher = byDesc(chasers, (a) => a.runs)[0];
      if (finisher && finisher.runs > 0) {
        push(
          "finisher",
          "shine",
          "The Finisher",
          finisher,
          `top-scored the winning chase`,
          `${finisher.runs} off ${finisher.ballsFaced} with the match on the line.`,
        );
      }
    }
    {
      const wall = byDesc(players, (a) => a.ballsFaced)[0];
      if (wall && wall.ballsFaced >= 10) {
        push(
          "wall",
          "shine",
          "The Wall",
          wall,
          `${wall.runs} off ${wall.ballsFaced} · faced the most`,
          `Nobody survived more deliveries — ${wall.ballsFaced} balls faced.`,
        );
      }
    }
    {
      const six = byDesc(players, (a) => a.sixes)[0];
      if (six && six.sixes >= 2) {
        push(
          "sixmachine",
          "shine",
          "Six Machine",
          six,
          `${six.sixes} sixes`,
          `${six.sixes} of the match's ${totalSixes} sixes came off this bat.`,
        );
      }
    }
    {
      const hands = byDesc(players, (a) => a.catches)[0];
      if (hands && hands.catches >= 2) {
        push(
          "safehands",
          "shine",
          "Safe Hands",
          hands,
          `${hands.catches} catches`,
          `Held ${hands.catches} — nothing hit the ground nearby.`,
        );
      }
    }
    {
      const bowlers = players.filter((a) => a.ballsBowled >= 12);
      const miser = [...bowlers].sort(
        (a, b) => a.runsConceded / oversOf(a) - b.runsConceded / oversOf(b),
      )[0];
      if (miser) {
        const econ = miser.runsConceded / oversOf(miser);
        push(
          "miser",
          "shine",
          "The Miser",
          miser,
          `economy ${econ.toFixed(1)}`,
          `${miser.runsConceded} runs off ${legalBallToOverText(miser.ballsBowled, rules.ballsPerOver)} overs — tightest spell of the match.`,
        );
      }
    }
    // Roasts
    {
      const duck = byDesc(players, (a) => a.goldenDucks)[0];
      if (duck && duck.goldenDucks >= 1) {
        push(
          "goldenduck",
          "roast",
          duck.goldenDucks > 1
            ? `Golden Duck ×${duck.goldenDucks}`
            : "Golden Duck",
          duck,
          duck.goldenDucks > 1
            ? `first ball, ${duck.goldenDucks} innings`
            : "out first ball",
          duck.goldenDucks > 1
            ? `Out first ball in ${duck.goldenDucks} separate innings. Goes on the trophy shelf forever.`
            : "Faced one ball, walked back. It happens to the best.",
        );
      }
    }
    {
      const overs = Array.from(overRuns.values());
      const biggest = byDesc(overs, (o) => o.runs)[0];
      if (biggest && biggest.runs >= 14) {
        // Tie-break by total runs conceded, so serial offenders own it.
        const worst = byDesc(
          overs.filter((o) => o.runs === biggest.runs),
          (o) => agg.get(String(o.bowlerId))?.runsConceded ?? 0,
        )[0];
        const atm = agg.get(String(worst.bowlerId));
        if (atm) {
          push(
            "atm",
            "roast",
            "The ATM",
            atm,
            `a ${biggest.runs}-run over`,
            `Paid out ${biggest.runs} in a single over — ${atm.runsConceded} conceded in all.`,
          );
        }
      }
    }
    {
      const spray = byDesc(players, (a) => a.illegalBalls)[0];
      if (spray && spray.illegalBalls >= 4) {
        push(
          "spraycan",
          "roast",
          "Spray Can",
          spray,
          `${spray.illegalBalls} wides & no-balls`,
          `${spray.illegalBalls} deliveries the batter never had to play.`,
        );
      }
    }
    {
      const anchors = players.filter((a) => a.ballsFaced >= 6);
      const statue = byDesc(anchors, (a) => a.dots / a.ballsFaced)[0];
      if (statue && statue.dots / statue.ballsFaced >= 0.6) {
        push(
          "statue",
          "roast",
          "The Statue",
          statue,
          `${Math.round((statue.dots / statue.ballsFaced) * 100)}% dot balls`,
          `${statue.dots} of ${statue.ballsFaced} balls went nowhere. Rock solid. Too solid.`,
        );
      }
    }

    const badges: Badge[] = [];
    const used = new Set<string>();
    let roasts = 0;
    for (const c of candidates) {
      if (badges.length >= 4) break;
      if (used.has(c.playerId)) continue;
      if (c.kind === "roast" && roasts >= 2) continue;
      used.add(c.playerId);
      if (c.kind === "roast") roasts += 1;
      badges.push({
        key: c.key,
        name: c.name,
        playerName: c.playerName,
        stat: c.stat,
        receipt: c.receipt,
        kind: c.kind,
      });
    }

    // ---- Turning point: latest cluster of 2+ wickets within 6 balls; ----
    // ---- fall back to the biggest over of the match.                 ----
    const wicketIdx = timeline
      .map((b, i) => (b.wicketType ? i : -1))
      .filter((i) => i >= 0);
    let turningPoint: {
      title: string;
      text: string;
      meta: string;
      ballIndex: number;
    } | null = null;
    for (let k = wicketIdx.length - 1; k > 0; k--) {
      const a = wicketIdx[k - 1];
      const b = wicketIdx[k];
      if (b - a <= 5 && timeline[a].inn === timeline[b].inn) {
        const first = timeline[a];
        const last = timeline[b];
        turningPoint = {
          title: `${ordinalWord(timeline[b].inn)} innings`,
          text: `Two wickets in ${b - a + 1} balls — ${first.outName} and ${last.outName} gone in a blink.`,
          meta: `Detected: wicket cluster · overs ${first.over}.${first.ballInOver}–${last.over}.${last.ballInOver}`,
          ballIndex: b,
        };
        break;
      }
    }
    if (!turningPoint) {
      let bigIdx = 0;
      let bigRuns = -1;
      // Recover the biggest over's last ball index from the timeline itself.
      const seen = new Map<string, { runs: number; lastIdx: number }>();
      timeline.forEach((b, i) => {
        const key = `${b.inn}:${b.over}`;
        const o = seen.get(key) ?? { runs: 0, lastIdx: i };
        o.runs += b.runsBat + b.extrasRuns;
        o.lastIdx = i;
        seen.set(key, o);
        if (o.runs > bigRuns) {
          bigRuns = o.runs;
          bigIdx = o.lastIdx;
        }
      });
      const b = timeline[bigIdx];
      turningPoint = {
        title: `${ordinalWord(b.inn)} innings`,
        text: `A ${bigRuns}-run over off ${b.bowlerName} blew the match open.`,
        meta: `Detected: biggest over of the match · over ${b.over + 1}`,
        ballIndex: bigIdx,
      };
    }

    // ---- Headline numbers ----
    const oversAll = Array.from(overRuns.values());
    const biggestOver = oversAll.length
      ? Math.max(...oversAll.map((o) => o.runs))
      : 0;
    const biggestOverCount = oversAll.filter(
      (o) => o.runs === biggestOver,
    ).length;
    const bestBowler = byDesc(
      players.filter((a) => a.ballsBowled > 0),
      (a) => a.wickets * 1000 - a.runsConceded,
    )[0];

    const innings = await Promise.all(
      inningsList.map(async (inn, idx) => ({
        inningsNo: inn.inningsNo,
        battingSide: inn.battingSide,
        battingTeamName: await sideLabel(ctx, match, inn.battingSide),
        runs: inn.totalRuns,
        wickets: inn.wickets,
        oversText: legalBallToOverText(inn.legalBalls, rules.ballsPerOver),
        firstBallIndex: timeline.findIndex((b) => b.inn === idx + 1),
      })),
    );

    const startedAt = timeline[0].at;
    const endedAt = timeline[timeline.length - 1].at;

    return {
      matchId: match._id,
      resultText: match.resultText,
      winnerSide: match.winnerSide,
      format: rules.format,
      battingFirst,
      sideAName: await sideLabel(ctx, match, "A"),
      sideBName: await sideLabel(ctx, match, "B"),
      startedAt,
      endedAt,
      durationMin: Math.max(1, Math.round((endedAt - startedAt) / 60000)),
      totalBalls: timeline.length,
      totalWickets: wicketIdx.length,
      innings,
      timeline,
      badges,
      turningPoint,
      numbers: {
        biggestOver,
        biggestOverCount,
        sixes: totalSixes,
        bestFigures: bestBowler
          ? `${bestBowler.wickets}/${bestBowler.runsConceded}`
          : "—",
        bestFiguresName: bestBowler?.name,
      },
    };
  },
});
