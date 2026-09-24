"use client";

import { useAuth } from "@/components/providers/AuthProvider";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { CoinToss } from "@/components/match/CoinToss";
import { ConnectionChip } from "@/components/match/ConnectionChip";
import {
  TestClockLine,
  TestClockOverlays,
  TestClockProvider,
  TestClockStatus,
} from "@/components/match/TestClock";
import { EmptyState } from "@/components/ui/EmptyState";
import { TruncText } from "@/components/ui/TruncText";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { buzzBall } from "@/lib/haptics";
import { matchBoardLabel, matchBoardLine } from "@/lib/matchBoard";
import { useWakeLock } from "@/lib/useWakeLock";
import { cn, errorMessage } from "@/lib/utils";
import { useMutation, useQuery } from "convex/react";
import { ArrowLeft, Eye, Undo2, Users } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

type Sheet =
  | null
  | { kind: "extra"; type: "bye" | "legbye" | "noball" }
  | { kind: "wicket" }
  | { kind: "bowler" }
  | { kind: "batsman" }
  | { kind: "retire" }
  | { kind: "squad" }
  | { kind: "drop" };

const WICKET_TYPES = [
  { id: "bowled", label: "Bowled" },
  { id: "caught", label: "Caught" },
  { id: "lbw", label: "LBW" },
  { id: "runout", label: "Run out" },
  { id: "stumped", label: "Stumped" },
  { id: "hitwicket", label: "Hit wicket" },
  { id: "other", label: "Other" },
] as const;

type BallChip = {
  _id: string;
  runsBat: number;
  extrasType?: string;
  extrasRuns: number;
  isWicket: boolean;
  isLegal: boolean;
  isRetire?: boolean;
};

/** A tapped ball the server has not confirmed yet. */
type PendingBall = Omit<BallChip, "_id">;

function ballLabel(b: {
  runsBat: number;
  extrasType?: string;
  extrasRuns: number;
  isWicket: boolean;
  isRetire?: boolean;
}) {
  if (b.isRetire) return "R";
  if (b.isWicket) return "W";
  if (b.extrasType === "wide") return "Wd";
  if (b.extrasType === "noball")
    return b.runsBat > 0 ? `Nb${b.runsBat}` : "Nb";
  if (b.extrasType === "bye") return `B${b.extrasRuns}`;
  if (b.extrasType === "legbye") return `Lb${b.extrasRuns}`;
  // A dot ball is still a scored delivery — showing the digit keeps every
  // chip in the over reading as "runs off this ball", dot included.
  return String(b.runsBat);
}

function chipClass(b: BallChip) {
  if (b.isRetire) return "bg-white/15 text-bg/70";
  if (b.isWicket) return "bg-danger text-white";
  // Wides/no-balls don't consume a slot — amber so the eye reads "extra ball"
  if (b.extrasType === "wide" || b.extrasType === "noball")
    return "bg-accent/30 text-accent";
  if (b.extrasType) return "bg-white/15 text-bg/80";
  if (b.runsBat >= 4) return "bg-accent text-ink";
  return "bg-white/10 text-bg";
}

/** The over in progress: filled chips plus grey placeholders for balls left. */
function OverTracker({
  current,
  prev,
  ballsPerOver,
  pending,
}: {
  current: BallChip[];
  prev: BallChip[];
  ballsPerOver: number;
  /** Shown outlined until the server's copy of the ball replaces it. */
  pending: PendingBall | null;
}) {
  const legalSoFar =
    current.filter((b) => b.isLegal).length + (pending?.isLegal ? 1 : 0);
  const placeholders = Math.max(0, ballsPerOver - legalSoFar);
  return (
    <div className="mt-4 flex flex-col items-center gap-1.5">
      {prev.length > 0 ? (
        <div className="flex flex-wrap justify-center gap-1 opacity-40">
          {prev.map((b) => (
            <span
              key={b._id}
              className={cn(
                "tabular flex h-6 min-w-6 items-center justify-center rounded-full px-1.5 text-[11px] font-semibold",
                chipClass(b),
              )}
            >
              {ballLabel(b)}
            </span>
          ))}
        </div>
      ) : null}
      <div className="flex flex-wrap justify-center gap-1.5">
        {current.map((b) => (
          <span
            key={b._id}
            className={cn(
              "tabular flex h-7 min-w-7 items-center justify-center rounded-full px-2 text-[11px] font-semibold",
              chipClass(b),
            )}
          >
            {ballLabel(b)}
          </span>
        ))}
        {pending ? (
          <span
            aria-label="Sending"
            className="tabular flex h-7 min-w-7 items-center justify-center rounded-full border border-dashed border-bg/70 px-2 text-[11px] font-semibold text-bg/70"
          >
            {ballLabel(pending)}
          </span>
        ) : null}
        {Array.from({ length: placeholders }, (_, i) => (
          <span
            key={`slot-${i}`}
            className="flex h-7 w-7 items-center justify-center rounded-full border border-white/20"
          >
            <span className="h-1 w-1 rounded-full bg-white/25" />
          </span>
        ))}
      </div>
    </div>
  );
}

export default function ScorePage() {
  const params = useParams();
  const matchId = params.id as Id<"matches">;
  const router = useRouter();
  const { token, activeOrgId, user, isObserver } = useAuth();
  const state = useQuery(
    api.scoring.liveState,
    token ? { token, matchId } : "skip",
  );
  const setPlayerSides = useMutation(api.matches.setPlayerSides);
  const addGuest = useMutation(api.players.addGuest);
  const recordBall = useMutation(api.scoring.recordBall);
  const undoLastBall = useMutation(api.scoring.undoLastBall);
  const setBowler = useMutation(api.scoring.setBowler);
  const setNextBatsman = useMutation(api.scoring.setNextBatsman);
  const retireBatsman = useMutation(api.scoring.retireBatsman);
  const tagDrop = useMutation(api.scoring.tagDrop);
  const endInnings = useMutation(api.scoring.endInnings);
  const setBattingFirst = useMutation(api.scoring.setBattingFirst);
  const startInnings = useMutation(api.scoring.startInnings);
  const pauseClock = useMutation(api.scoring.pauseClock);
  const resumeClock = useMutation(api.scoring.resumeClock);
  const keepPlayingAfterTime = useMutation(api.scoring.keepPlayingAfterTime);
  const endMatchNow = useMutation(api.scoring.endMatchNow);

  const [sheet, setSheet] = useState<Sheet>(null);
  const [wicketType, setWicketType] = useState<string>("bowled");
  const [playerOutId, setPlayerOutId] = useState<string | null>(null);
  const [fielderId, setFielderId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // State lags a render behind; the ref stops a double-tap in the same frame
  // from sending two balls against one server state.
  const inFlight = useRef(false);
  const [pendingBall, setPendingBall] = useState<PendingBall | null>(null);
  const [pulse, setPulse] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pickStriker, setPickStriker] = useState<string | null>(null);
  const [pickNon, setPickNon] = useState<string | null>(null);
  const [pickBowler, setPickBowler] = useState<string | null>(null);
  const [pickSide, setPickSide] = useState<"A" | "B" | null>(null);
  const [retireTarget, setRetireTarget] = useState<string | null>(null);
  const [dropId, setDropId] = useState<string | null>(null);
  const [squadBusyId, setSquadBusyId] = useState<string | null>(null);
  // userId pins the message under the row it came from; null = the guest box.
  const [squadError, setSquadError] = useState<{
    userId: string | null;
    message: string;
  } | null>(null);
  const [guestName, setGuestName] = useState("");
  const [guestBusy, setGuestBusy] = useState(false);
  const [confirmEndInnings, setConfirmEndInnings] = useState(false);
  // Absent-player guard: someone not in either squad who lands on the pad
  // (deep link, "Continue scoring" from the match card, a stale bookmark)
  // gets steered to the spectator view by default — any org member is still
  // allowed to score, so this is a one-tap override, never a hard block.
  const [spectatorOverride, setSpectatorOverride] = useState(false);

  useEffect(() => {
    if (!isObserver) return;
    if (state === undefined || state === null) return;
    if (state.status === "live") {
      router.replace(`/matches/${matchId}/watch`);
    } else {
      router.replace(`/matches/${matchId}`);
    }
  }, [isObserver, state, matchId, router]);

  // Keep the scorer's screen awake for the whole live match, breaks included.
  useWakeLock(state?.status === "live" && !isObserver);

  // Subscribed to only while the squad sheet is open — the scoring screen is
  // the hot path and doesn't otherwise need the org pool.
  const pool = useQuery(
    api.players.listOrgPlayers,
    token && activeOrgId && sheet?.kind === "squad"
      ? { token, orgId: activeOrgId }
      : "skip",
  );

  /**
   * One scoring action at a time. The pad stays locked until the server
   * answers, because the next ball depends on what this one did (over done,
   * new batter, innings over). A ball shows as a pending chip straight away;
   * Convex holds the mutation while offline and sends it once signal returns,
   * and the promise resolves only after the live state includes the ball, so
   * the pending chip hands over to the real one without a gap.
   */
  async function tap(
    label: string,
    fn: () => Promise<unknown>,
    ball?: PendingBall,
  ) {
    if (!token || inFlight.current) return;
    inFlight.current = true;
    setError(null);
    setBusy(true);
    setPulse(label);
    if (ball) {
      setPendingBall(ball);
      buzzBall(
        ball.isWicket ? "wicket" : ball.runsBat >= 4 ? "boundary" : "ball",
      );
    }
    try {
      await fn();
    } catch (e) {
      setError(errorMessage(e, "That didn’t register — try again"));
    } finally {
      inFlight.current = false;
      setBusy(false);
      setPendingBall(null);
      setTimeout(() => setPulse(null), 180);
    }
  }

  function openSquad() {
    setSquadError(null);
    setSheet({ kind: "squad" });
  }

  /**
   * One call does every squad move: adding a late arrival to a side or both,
   * releasing a common player to a single side, or (empty `sides`) taking
   * someone who has not played back out of the match.
   */
  async function assignSides(userId: string, sides: Array<"A" | "B">) {
    if (!token || squadBusyId) return;
    setSquadError(null);
    setSquadBusyId(userId);
    try {
      await setPlayerSides({
        token,
        matchId,
        userId: userId as Id<"users">,
        sides,
      });
    } catch (e) {
      setSquadError({
        userId,
        message: errorMessage(e, "Could not update the squads"),
      });
    } finally {
      setSquadBusyId(null);
    }
  }

  async function addGuestPlayer() {
    const name = guestName.trim();
    if (!token || !activeOrgId || name.length < 2 || guestBusy) return;
    setSquadError(null);
    setGuestBusy(true);
    try {
      await addGuest({ token, orgId: activeOrgId, name });
      setGuestName("");
    } catch (e) {
      setSquadError({
        userId: null,
        message: errorMessage(e, "Could not add that player"),
      });
    } finally {
      setGuestBusy(false);
    }
  }

  async function sendRuns(runs: number) {
    if (!token) return;
    await tap(
      String(runs),
      () => recordBall({ token, matchId, runsBat: runs, extrasRuns: 0 }),
      { runsBat: runs, extrasRuns: 0, isWicket: false, isLegal: true },
    );
  }

  async function sendExtra(type: "wide") {
    if (!token) return;
    await tap(
      type,
      () =>
        recordBall({
          token,
          matchId,
          runsBat: 0,
          extrasType: type,
          extrasRuns: 1,
        }),
      {
        runsBat: 0,
        extrasType: type,
        extrasRuns: 1,
        isWicket: false,
        isLegal: false,
      },
    );
  }

  // Sheets close on the tap, not on the server's answer, so the pending chip
  // is in view on a slow signal.
  async function sendNoBall(runsBat: number) {
    if (!token) return;
    setSheet(null);
    await tap(
      "noball",
      () =>
        recordBall({
          token,
          matchId,
          runsBat,
          extrasType: "noball",
          extrasRuns: 1,
        }),
      {
        runsBat,
        extrasType: "noball",
        extrasRuns: 1,
        isWicket: false,
        isLegal: false,
      },
    );
  }

  async function sendByeLb(type: "bye" | "legbye", runs: number) {
    if (!token) return;
    setSheet(null);
    await tap(
      type,
      () =>
        recordBall({
          token,
          matchId,
          runsBat: 0,
          extrasType: type,
          extrasRuns: runs,
        }),
      {
        runsBat: 0,
        extrasType: type,
        extrasRuns: runs,
        isWicket: false,
        isLegal: true,
      },
    );
  }

  async function sendWicket() {
    if (!token || !playerOutId) return;
    const needsFielder =
      wicketType === "caught" ||
      wicketType === "runout" ||
      wicketType === "stumped";
    setSheet(null);
    await tap(
      "W",
      () =>
        recordBall({
          token,
          matchId,
          runsBat: 0,
          extrasRuns: 0,
          isWicket: true,
          wicketType: wicketType as
            | "bowled"
            | "caught"
            | "lbw"
            | "runout"
            | "stumped"
            | "hitwicket"
            | "other",
          playerOutId: playerOutId as Id<"users">,
          fielderId:
            needsFielder && fielderId ? (fielderId as Id<"users">) : undefined,
        }),
      { runsBat: 0, extrasRuns: 0, isWicket: true, isLegal: true },
    );
    setPlayerOutId(null);
    setFielderId(null);
  }

  if (state === undefined) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-bg">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-line border-t-accent" />
      </div>
    );
  }
  if (state === null) {
    return (
      <div className="px-5 py-8">
        <EmptyState title="Match not found" />
      </div>
    );
  }

  const viewerInSquad = !!(
    user &&
    (state.sideA.players.some((p) => String(p.userId) === String(user._id)) ||
      state.sideB.players.some((p) => String(p.userId) === String(user._id)))
  );

  // Gully cricket lets any active org member score, so this never blocks —
  // it just defaults an absent player to the calm read-only view instead of
  // dropping them straight onto a live pad they have no reason to be on.
  if (
    state.status === "live" &&
    !viewerInSquad &&
    !spectatorOverride
  ) {
    return (
      <div className="flex min-h-dvh flex-col bg-bg px-5 pb-[calc(2rem+env(safe-area-inset-bottom))] pt-[calc(var(--safe-top)+1rem)]">
        <Link
          href="/home"
          className="-ml-3 flex h-11 w-11 items-center justify-center rounded-xl text-muted active:bg-ink/[0.04]"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="flex flex-1 flex-col justify-center text-center">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-faint">
            Live now
          </p>
          <h1 className="mt-2 text-2xl font-semibold text-ink">
            {state.sideA.name} vs {state.sideB.name}
          </h1>
          <p className="mt-2 text-[13px] text-muted">
            You&apos;re not in today&apos;s squad — watch along instead.
          </p>
          <Link
            href={`/matches/${matchId}/watch`}
            className="mt-8 flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-ink text-[15px] font-semibold text-bg shadow-card active:scale-[0.98]"
          >
            <Eye className="h-5 w-5" strokeWidth={2.4} />
            Watch live
          </Link>
          {state.canScore ? (
            <button
              type="button"
              onClick={() => setSpectatorOverride(true)}
              className="mt-4 min-h-11 text-[13px] font-medium text-muted underline underline-offset-4"
            >
              I&apos;m scoring instead
            </button>
          ) : null}
        </div>
      </div>
    );
  }

  // ── Who bats first ──
  if (state.phase === "need_batting_side") {
    return (
      <CoinToss
        sideA={state.sideA}
        sideB={state.sideB}
        busy={busy}
        error={error}
        onPickBatting={(side) =>
          tap("side", async () => {
            if (!token) return;
            await setBattingFirst({ token, matchId, side });
          })
        }
      />
    );
  }

  const solo = state.ruleSnapshot.battingModeDefault === "single";

  // ── Openers (any innings) ──
  if (state.phase === "need_openers" || state.phase === "innings_break") {
    const isBreak = state.phase === "innings_break";
    const bi = state.breakInfo;
    const battingSide: "A" | "B" = isBreak
      ? bi?.canChooseSide && pickSide
        ? pickSide
        : (bi?.defaultBattingSide ?? "A")
      : (state.battingFirst ?? "A");
    const batting = battingSide === "A" ? state.sideA : state.sideB;
    const bowling = battingSide === "A" ? state.sideB : state.sideA;
    const target = isBreak ? (bi?.target ?? null) : null;
    const isFollowOn = isBreak && bi?.followOnSide === battingSide;
    const ready = pickStriker && (solo || pickNon) && pickBowler;

    return (
      <TestClockProvider
        clock={state.clock}
        role="scorer"
        matchId={matchId}
        onPause={
          token ? () => pauseClock({ token, matchId }) : undefined
        }
        onResume={
          token ? () => resumeClock({ token, matchId }) : undefined
        }
        onKeepPlaying={
          token
            ? () => keepPlayingAfterTime({ token, matchId })
            : undefined
        }
        onEndMatch={
          token
            ? () =>
                tap("end", async () => {
                  await endMatchNow({ token, matchId });
                })
            : undefined
        }
      >
      <div className="min-h-dvh bg-bg px-5 pb-[calc(2rem+env(safe-area-inset-bottom))] pt-[calc(var(--safe-top)+1rem)]">
        <Link
          href="/home"
          className="-ml-3 flex h-11 w-11 items-center justify-center rounded-xl text-muted active:bg-ink/[0.04]"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-ink">
          {isBreak
            ? target !== null
              ? `Target ${target}`
              : (bi?.leadText ?? "Innings break")
            : `${batting.name} bat first`}
        </h1>
        <p className="mt-1.5 text-[13px] text-muted">
          {isBreak
            ? `${batting.name} bat${isFollowOn ? " again — follow-on" : ""} — pick ${
                solo ? "the first batter" : "the openers"
              }.`
            : solo
              ? "One batter at a time — pick who opens and who bowls."
              : "Pick the openers and opening bowler."}
        </p>
        <TestClockLine tone="paper" />
        <TestClockStatus />
        {error ? <p className="mt-4 text-[13px] text-danger">{error}</p> : null}
        <div className="mt-6 space-y-4">
          {isBreak && bi?.canChooseSide && bi.followOnSide ? (
            <div className="rounded-2xl border border-line bg-surface p-4">
              <p className="text-[13px] font-medium text-muted">
                Who bats innings 3?
              </p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {(
                  [
                    { side: bi.defaultBattingSide, note: "normal order" },
                    { side: bi.followOnSide, note: "follow on" },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.side}
                    type="button"
                    onClick={() => {
                      setPickSide(opt.side);
                      setPickStriker(null);
                      setPickNon(null);
                      setPickBowler(null);
                    }}
                    className={cn(
                      "min-h-11 rounded-2xl border px-3 py-3 text-left text-[15px] font-medium active:scale-[0.98]",
                      battingSide === opt.side
                        ? "border-accent bg-accent-soft text-accent-deep"
                        : "border-line text-ink",
                    )}
                  >
                    {opt.side === "A" ? state.sideA.name : state.sideB.name}
                    <span className="block text-[11px] font-normal text-faint">
                      {opt.note}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          <Picker
            label={solo ? "Opening batter" : "Striker"}
            players={batting.players}
            selected={pickStriker}
            disabledIds={pickNon ? [pickNon] : []}
            onSelect={setPickStriker}
          />
          {solo ? null : (
            <Picker
              label="Non-striker"
              players={batting.players}
              selected={pickNon}
              disabledIds={pickStriker ? [pickStriker] : []}
              onSelect={setPickNon}
            />
          )}
          <Picker
            label="Opening bowler"
            players={bowling.players.filter(
              (p) =>
                String(p.userId) !== pickStriker &&
                String(p.userId) !== pickNon,
            )}
            selected={pickBowler}
            disabledIds={[]}
            onSelect={setPickBowler}
          />
          <Button
            fullWidth
            disabled={busy || !ready || !token}
            onClick={() =>
              tap("start", async () => {
                if (!token || !pickStriker || !pickBowler) return;
                if (!solo && !pickNon) return;
                await startInnings({
                  token,
                  matchId,
                  strikerId: pickStriker as Id<"users">,
                  nonStrikerId: solo ? undefined : (pickNon as Id<"users">),
                  openingBowlerId: pickBowler as Id<"users">,
                  battingSide:
                    isBreak && bi?.canChooseSide ? battingSide : undefined,
                });
                setPickStriker(null);
                setPickNon(null);
                setPickBowler(null);
                setPickSide(null);
              })
            }
          >
            {isBreak
              ? `Start innings ${bi?.nextInningsNo ?? 2}`
              : "Start scoring"}
          </Button>
          {isBreak && token ? (
            <Button
              variant="ghost"
              fullWidth
              disabled={busy}
              onClick={() =>
                tap("undo", async () => {
                  await undoLastBall({ token, matchId });
                })
              }
            >
              Undo last ball
            </Button>
          ) : null}
        </div>
        <TestClockOverlays />
      </div>
      </TestClockProvider>
    );
  }

  if (state.status === "completed" || state.status === "abandoned") {
    return (
      <div className="flex min-h-dvh flex-col bg-bg px-5 pb-[calc(2rem+env(safe-area-inset-bottom))] pt-[calc(var(--safe-top)+1rem)]">
        <div className="flex flex-1 flex-col justify-center text-center">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-faint">
            {state.status === "abandoned" ? "Abandoned" : "Match complete"}
          </p>
          <h1 className="mt-3 text-2xl font-semibold text-ink">
            {state.resultText ?? `${state.sideA.name} vs ${state.sideB.name}`}
          </h1>
          {state.status === "completed" && token ? (
            <Button
              variant="ghost"
              fullWidth
              className="mt-8"
              disabled={busy}
              onClick={() =>
                tap("undo", async () => {
                  await undoLastBall({ token, matchId });
                })
              }
            >
              Undo last ball
            </Button>
          ) : null}
          <Button
            fullWidth
            className={state.status === "completed" ? "mt-3" : "mt-8"}
            onClick={() => router.push(`/matches/${matchId}`)}
          >
            View scorecard
          </Button>
          <Button
            variant="ghost"
            fullWidth
            className="mt-2"
            onClick={() => router.push("/home")}
          >
            Home
          </Button>
        </div>
      </div>
    );
  }

  const live = state.live;
  if (!live) {
    return (
      <div className="px-5 py-8">
        <EmptyState title="Waiting for live state" />
      </div>
    );
  }

  const lastMan =
    !solo &&
    (state.ruleSnapshot.lastBatsmanAlone ?? true) &&
    !!live.striker &&
    !live.nonStriker;
  const oneBatter = solo || lastMan;

  const battingName =
    live.battingSide === "A" ? state.sideA.name : state.sideB.name;
  const fieldingPlayers =
    live.battingSide === "A" ? state.sideB.players : state.sideA.players;
  // Gully cricket: when a side is short, batting-side players often field or
  // keep for the bowling side. So the fielder picker offers everyone in the
  // match (both sides, common players deduped), minus whoever physically
  // cannot be fielding right now — the two batters at the crease and the
  // batter being given out on this ball. Bowling-side players come first
  // (styled as before); batting-side helpers are appended and gold-marked.
  const battingPlayers =
    live.battingSide === "A" ? state.sideA.players : state.sideB.players;
  const fielderCandidates = (() => {
    const excluded = new Set(
      [live.striker?.userId, live.nonStriker?.userId, playerOutId]
        .filter(Boolean)
        .map(String),
    );
    const seen = new Set<string>();
    const bowlingSide = fieldingPlayers
      .filter((p) => !excluded.has(String(p.userId)))
      .map((p) => {
        seen.add(String(p.userId));
        return { ...p, fromBattingSide: false };
      });
    const battingSideHelpers = battingPlayers
      .filter((p) => {
        const id = String(p.userId);
        return !excluded.has(id) && !seen.has(id);
      })
      .map((p) => {
        seen.add(String(p.userId));
        return { ...p, fromBattingSide: true };
      });
    return [...bowlingSide, ...battingSideHelpers];
  })();
  // Who could have dropped the last ball: same "both sides can field" logic
  // as the caught-fielder picker above, minus the batters currently at the
  // crease (they can't be fielding their own delivery).
  const dropCandidates = (() => {
    const excluded = new Set(
      [live.striker?.userId, live.nonStriker?.userId].filter(Boolean).map(String),
    );
    const seen = new Set<string>();
    const bowlingSide = fieldingPlayers
      .filter((p) => !excluded.has(String(p.userId)))
      .map((p) => {
        seen.add(String(p.userId));
        return { ...p, fromBattingSide: false };
      });
    const battingSideHelpers = battingPlayers
      .filter((p) => {
        const id = String(p.userId);
        return !excluded.has(id) && !seen.has(id);
      })
      .map((p) => {
        seen.add(String(p.userId));
        return { ...p, fromBattingSide: true };
      });
    return [...bowlingSide, ...battingSideHelpers];
  })();
  const locked = live.needBowler || live.needBatsman || live.needRetire || busy;
  const canChangeBowler =
    !live.needBowler &&
    !!live.bowler &&
    live.currentOverBalls.filter((b) => !b.isRetire).length === 0;

  const isTest = state.ruleSnapshot.inningsPerSide === 2;
  const aggBat = state.innings
    .filter((i) => i.battingSide === live.battingSide)
    .reduce((s, i) => s + i.totalRuns, 0);
  const aggOther = state.innings
    .filter((i) => i.battingSide !== live.battingSide)
    .reduce((s, i) => s + i.totalRuns, 0);
  const declareMode = isTest && aggBat > aggOther;
  const board = live.battingSide
    ? matchBoardLine({
        inningsPerSide: state.ruleSnapshot.inningsPerSide ?? 1,
        innings: state.innings,
        live: {
          battingSide: live.battingSide,
          totalRuns: live.totalRuns,
          inningsNo: live.inningsNo,
          currentInningsId: live.currentInningsId,
          target: live.target,
        },
      })
    : null;
  const isFollowOnInnings =
    isTest &&
    live.inningsNo === 3 &&
    state.innings.find((i) => i.inningsNo === 2)?.battingSide ===
      live.battingSide;

  // A bowler needed part-way through an over means the bowler went in to bat
  // (common players are in both squads) — not the usual end-of-over change.
  const ballsLeftInOver =
    state.ruleSnapshot.ballsPerOver - live.ballsThisOver;
  const midOverBowlerChange = live.needBowler && live.ballsThisOver > 0;

  const needsFielder =
    wicketType === "caught" ||
    wicketType === "runout" ||
    wicketType === "stumped";
  const fielderRequired = wicketType === "caught" || wicketType === "stumped";

  // Empty picker = a dead end (both pickers are undismissable), so undo is the
  // only way back. The last logged event decides how we name it.
  const lastLogged = live.lastBalls[live.lastBalls.length - 1];
  const lastWasRetire = lastLogged?.isRetire ?? false;
  // Listed-but-locked batters (quota spent, no spare balls) are not a way out,
  // so the dead end is measured in batters who can actually be tapped.
  const noBatterToFollow = !state.availableBatsmen.some((p) => p.selectable);
  // Same dead end on the bowling side: every eligible bowler can be excluded
  // at once (the last bowler, plus any common player currently batting).
  const noBowlerToFollow = state.availableBowlers.length === 0;

  // Squad sheet: everyone in the match first (in the order they were drafted),
  // then the rest of the org pool as "not playing" so late arrivals are one tap.
  const squadRows = (() => {
    const sidesOf = new Map<string, Array<"A" | "B">>();
    const order: Array<{ userId: string; displayName: string }> = [];
    for (const [side, info] of [
      ["A", state.sideA],
      ["B", state.sideB],
    ] as const) {
      for (const p of info.players) {
        const id = String(p.userId);
        const existing = sidesOf.get(id);
        if (existing) {
          existing.push(side);
        } else {
          sidesOf.set(id, [side]);
          order.push({ userId: id, displayName: p.displayName });
        }
      }
    }
    const rows = order.map((p) => ({ ...p, sides: sidesOf.get(p.userId)! }));
    const bench = (pool ?? [])
      .filter((p) => !sidesOf.has(String(p.userId)))
      .map((p) => ({
        userId: String(p.userId),
        displayName: p.displayName,
        sides: [] as Array<"A" | "B">,
      }));
    return [...rows, ...bench];
  })();

  // Auto-open pickers
  const activeSheet: Sheet =
    sheet ??
    (live.needBatsman
      ? { kind: "batsman" }
      : live.needBowler
        ? { kind: "bowler" }
        : live.needRetire
          ? { kind: "retire" }
          : null);
  const retireForced = !sheet && live.needRetire;
  const retiree =
    activeSheet?.kind === "retire"
      ? retireForced
        ? live.striker
        : [live.striker, live.nonStriker].find(
            (p) => p && String(p.userId) === retireTarget,
          ) ?? live.striker
      : null;

  return (
    <TestClockProvider
      clock={state.clock}
      role="scorer"
      matchId={matchId}
      onPause={
        token
          ? () => pauseClock({ token, matchId })
          : undefined
      }
      onResume={
        token
          ? () => resumeClock({ token, matchId })
          : undefined
      }
      onKeepPlaying={
        token
          ? () => keepPlayingAfterTime({ token, matchId })
          : undefined
      }
      onEndMatch={
        token
          ? () =>
              tap("end", async () => {
                await endMatchNow({ token, matchId });
              })
          : undefined
      }
      suppressTimeUp={confirmEndInnings}
    >
    <div className="flex min-h-dvh flex-col bg-bg">
      <header className="bg-ink px-4 pb-5 pt-[calc(var(--safe-top)+1rem)] text-bg">
        <div className="flex items-center justify-between">
          {/* Negative margins keep the 44px hit areas from growing the header. */}
          <Link
            href="/home"
            className="-my-1 -ml-3 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-bg/70 active:bg-white/10 hover:bg-white/10"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <p className="min-w-0 truncate px-1 text-[13px] font-medium text-bg/70">
            Innings {live.inningsNo}
            {isTest ? " of 4" : ""} · {battingName}
            {isFollowOnInnings ? " · follow-on" : ""}
          </p>
          <div className="flex shrink-0 items-center gap-0.5">
            {/* Late arrivals are the norm — squads stay editable mid-match.
                Labelled, not a bare icon: nobody guessed what it did. */}
            <button
              type="button"
              onClick={openSquad}
              className="-my-1 inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-[11px] font-semibold uppercase tracking-wide text-bg/70 active:bg-white/10 hover:bg-white/10"
            >
              <Users className="h-4 w-4" />
              Players
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => setConfirmEndInnings(true)}
              className="-my-1 -mr-1 inline-flex min-h-11 items-center rounded-lg px-2 text-[11px] font-semibold uppercase tracking-wide text-bg/70 active:bg-white/10 hover:bg-white/10"
            >
              {declareMode ? "Declare" : "End"}
            </button>
          </div>
        </div>
        <TestClockLine />

        <div className="mt-1 text-center">
          {/* Score and overs sit side by side, both big — the two things a
              scorer glances at mid-over shouldn't need separate looks. Overs
              used to be a small caption below the score; now it's a stat in
              its own right, the same "big number, small label" pattern used
              everywhere else in the app. */}
          <div className="flex items-end justify-center gap-4">
            <p
              className={cn(
                "tabular text-[4.25rem] font-semibold leading-none tracking-tight transition",
                pulse ? "scale-[1.03] text-accent" : "text-bg",
              )}
            >
              {live.totalRuns}
              <span className="text-bg/70">/</span>
              {live.wickets}
            </p>
            <div className="pb-1 text-left">
              <p className="tabular text-[2.25rem] font-semibold leading-none text-bg">
                {live.oversText}
              </p>
              <p className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-bg/70">
                Overs
              </p>
            </div>
          </div>
          {live.runRate > 0 || live.potBalls > 0 ? (
            <p className="tabular mt-2 text-[13px] text-bg/70">
              {live.runRate > 0 ? `RR ${live.runRate.toFixed(1)}` : null}
              {/* Spare balls left behind by batters out inside their quota —
                  the thing that decides whether anyone has to retire. */}
              {live.potBalls > 0 ? (
                <span className="font-semibold text-accent">
                  {live.runRate > 0 ? " · " : ""}
                  {live.potBalls} spare
                </span>
              ) : null}
            </p>
          ) : null}
          {board?.kind === "target" ? (
            <p className="tabular mt-1.5 inline-block rounded-full bg-accent/15 px-3 py-1 text-[13px] font-medium text-accent">
              {matchBoardLabel(board)}
              {!isTest && live.requiredRunRate != null
                ? ` · ${live.requiredRunRate.toFixed(1)}/ov`
                : ""}
            </p>
          ) : board ? (
            <p className="tabular mt-1.5 inline-block rounded-full bg-white/10 px-3 py-1 text-[13px] font-medium text-bg/70">
              {matchBoardLabel(board)}
            </p>
          ) : null}
        </div>

        <div
          className={cn(
            "mt-4 grid gap-2 text-center text-[11px]",
            oneBatter ? "grid-cols-2" : "grid-cols-3",
          )}
        >
          {/* Gold fill marks who is facing — readable at a glance mid-over */}
          <div className="rounded-2xl bg-accent/20 px-2 py-2 ring-1 ring-accent/60">
            <p className="font-semibold uppercase tracking-wide text-accent">
              {lastMan ? "Last man" : solo ? "Batting" : "On strike"}
            </p>
            <p
              className="mt-0.5 line-clamp-2 text-[15px] font-semibold text-bg [overflow-wrap:anywhere]"
              title={live.striker?.displayName ?? undefined}
            >
              {live.striker?.displayName ?? "—"}
              {oneBatter ? null : <span className="text-accent">*</span>}
            </p>
            {live.figures.striker ? (
              <p className="tabular mt-0.5 text-[13px] text-bg/70">
                {live.figures.striker.runs}({live.figures.striker.balls})
                {live.strikerQuota &&
                live.strikerQuota.faced >= live.strikerQuota.cap ? (
                  <span className="font-semibold text-accent">
                    {" "}
                    · {live.strikerQuota.faced}/{live.strikerQuota.cap}
                  </span>
                ) : null}
              </p>
            ) : null}
          </div>
          {oneBatter ? null : (
            <div className="rounded-2xl bg-white/[0.05] px-2 py-2">
              <p className="font-semibold uppercase tracking-wide text-bg/70">
                Non-striker
              </p>
              <p
                className="mt-0.5 line-clamp-2 text-[15px] font-semibold text-bg/70 [overflow-wrap:anywhere]"
                title={live.nonStriker?.displayName ?? undefined}
              >
                {live.nonStriker?.displayName ?? "—"}
              </p>
              {live.figures.nonStriker ? (
                <p className="tabular mt-0.5 text-[13px] text-bg/70">
                  {live.figures.nonStriker.runs}({live.figures.nonStriker.balls})
                  {live.nonStrikerQuota &&
                  live.nonStrikerQuota.faced >= live.nonStrikerQuota.cap ? (
                    <span className="font-semibold text-accent">
                      {" "}
                      · {live.nonStrikerQuota.faced}/{live.nonStrikerQuota.cap}
                    </span>
                  ) : null}
                </p>
              ) : null}
            </div>
          )}
          <div className="rounded-2xl bg-white/[0.05] px-2 py-2">
            <p className="font-semibold uppercase tracking-wide text-bg/70">
              Bowling
            </p>
            <p
              className="mt-0.5 line-clamp-2 text-[15px] font-semibold text-bg [overflow-wrap:anywhere]"
              title={live.bowler?.displayName ?? undefined}
            >
              {live.bowler?.displayName ?? "—"}
            </p>
            {live.figures.bowler ? (
              <p className="tabular mt-0.5 text-[13px] text-bg/70">
                {live.figures.bowler.wickets}-{live.figures.bowler.runs}
              </p>
            ) : null}
            {canChangeBowler ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => setSheet({ kind: "bowler" })}
                className="mt-1 min-h-11 w-full text-[13px] font-semibold text-accent"
              >
                Change
              </button>
            ) : null}
          </div>
        </div>

        <OverTracker
          current={live.currentOverBalls}
          prev={live.prevOverBalls}
          ballsPerOver={state.ruleSnapshot.ballsPerOver}
          pending={pendingBall}
        />
      </header>
      <TestClockStatus />

      {error ? (
        <div className="mx-4 mt-3 rounded-2xl border border-danger/20 bg-danger-soft px-4 py-2.5 text-[13px] text-danger">
          {error}
        </div>
      ) : null}

      <div className="flex flex-1 flex-col justify-end px-3 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-3">
        <div className="mb-1 flex min-h-11 items-center justify-between gap-3">
          <ConnectionChip sending={busy} />
          <button
            type="button"
            disabled={live.needBowler || live.needBatsman || busy}
            onClick={() => {
              setRetireTarget(live.striker ? String(live.striker.userId) : null);
              setSheet({ kind: "retire" });
            }}
            className="-mr-1 inline-flex min-h-11 shrink-0 items-center rounded-xl px-3 text-[13px] font-semibold text-muted disabled:opacity-30"
          >
            Retire batter
          </button>
        </div>
        <div className="grid grid-cols-4 gap-2">
          {[0, 1, 2, 3, 4, 5, 6].map((n) => (
            <PadKey
              key={n}
              label={String(n)}
              emphasis={n === 4 || n === 6}
              disabled={locked}
              active={pulse === String(n)}
              onClick={() => sendRuns(n)}
            />
          ))}
          <PadKey
            label="WD"
            small
            disabled={locked}
            active={pulse === "wide"}
            onClick={() => sendExtra("wide")}
          />
          <PadKey
            label="NB"
            small
            disabled={locked}
            active={pulse === "noball"}
            onClick={() => setSheet({ kind: "extra", type: "noball" })}
          />
          <PadKey
            label="BYE"
            small
            disabled={locked}
            onClick={() => setSheet({ kind: "extra", type: "bye" })}
          />
          <PadKey
            label="LB"
            small
            disabled={locked}
            onClick={() => setSheet({ kind: "extra", type: "legbye" })}
          />
          {/* Annotates the ball you just scored, like every other key on the
              pad describes what already happened. Nobody can call a drop
              before it happens, so there is nothing to arm ahead. */}
          <PadKey
            label={state.lastBallDrop ? "CD ✓" : "CD"}
            small
            emphasis
            armed={!!state.lastBallDrop}
            disabled={busy || live.lastBalls.length === 0}
            onClick={() => {
              setDropId(
                state.lastBallDrop ? String(state.lastBallDrop.byId) : null,
              );
              setSheet({ kind: "drop" });
            }}
          />
          <PadKey
            label="OUT"
            danger
            disabled={locked}
            active={pulse === "W"}
            className="col-span-2"
            onClick={() => {
              setWicketType("bowled");
              setFielderId(null);
              setPlayerOutId(live.striker ? String(live.striker.userId) : null);
              setSheet({ kind: "wicket" });
            }}
          />
          <PadKey
            label={<Undo2 className="h-5 w-5" />}
            disabled={busy || live.lastBalls.length === 0}
            active={pulse === "undo"}
            className="col-span-2"
            onClick={() =>
              tap("undo", async () => {
                if (!token) return;
                await undoLastBall({ token, matchId });
              })
            }
          />
        </div>
      </div>

      {activeSheet ? (
        <div className="fixed inset-0 z-50 flex items-end bg-ink/30">
          <div className="max-h-[80dvh] w-full overflow-y-auto rounded-t-3xl bg-surface p-5 shadow-2xl safe-bottom">
            {activeSheet.kind === "extra" ? (
              <>
                <p className="text-[15px] font-semibold text-ink">
                  {activeSheet.type === "noball"
                    ? "No-ball"
                    : activeSheet.type === "bye"
                      ? "Byes"
                      : "Leg byes"}
                </p>
                {activeSheet.type === "noball" ? (
                  <p className="mt-1 text-[13px] text-muted">
                    The no-ball is +1. This is what they hit.
                  </p>
                ) : null}
                <div
                  className={cn(
                    "mt-4 grid gap-2",
                    activeSheet.type === "noball"
                      ? "grid-cols-3"
                      : "grid-cols-4",
                  )}
                >
                  {(activeSheet.type === "noball"
                    ? [0, 1, 2, 3, 4, 6]
                    : [1, 2, 3, 4]
                  ).map((n) => (
                    <PadKey
                      key={n}
                      label={String(n)}
                      emphasis={
                        activeSheet.type === "noball" && (n === 4 || n === 6)
                      }
                      onClick={() =>
                        activeSheet.type === "noball"
                          ? sendNoBall(n)
                          : sendByeLb(activeSheet.type, n)
                      }
                    />
                  ))}
                </div>
                <Button
                  fullWidth
                  variant="ghost"
                  className="mt-4"
                  onClick={() => setSheet(null)}
                >
                  Cancel
                </Button>
              </>
            ) : null}

            {activeSheet.kind === "wicket" ? (
              <>
                <p className="text-[15px] font-semibold text-danger">Wicket</p>
                <p className="mt-3 text-[13px] font-medium text-muted">How out?</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {WICKET_TYPES.map((w) => (
                    <button
                      key={w.id}
                      type="button"
                      onClick={() => {
                        setWicketType(w.id);
                        setFielderId(null);
                      }}
                      className={cn(
                        "inline-flex min-h-11 items-center rounded-full border px-4 text-[13px] font-medium",
                        wicketType === w.id
                          ? "border-danger bg-danger-soft text-danger"
                          : "border-line text-muted",
                      )}
                    >
                      {w.label}
                    </button>
                  ))}
                </div>
                <p className="mt-4 text-[13px] font-medium text-muted">Who is out?</p>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  {[live.striker, live.nonStriker].filter(Boolean).map((p) =>
                    p ? (
                      <button
                        key={p.userId}
                        type="button"
                        onClick={() => setPlayerOutId(String(p.userId))}
                        className={cn(
                          "min-h-11 rounded-2xl border px-3 py-3 text-[15px] font-medium active:scale-[0.98]",
                          playerOutId === String(p.userId)
                            ? "border-danger bg-danger-soft text-danger"
                            : "border-line text-ink",
                        )}
                      >
                        {p.displayName}
                        {!solo && live.striker && p.userId === live.striker.userId
                          ? " ·  on strike"
                          : ""}
                      </button>
                    ) : null,
                  )}
                </div>
                {needsFielder ? (
                  <>
                    <p className="mt-4 text-[13px] font-medium text-muted">
                      {wicketType === "stumped"
                        ? "Keeper"
                        : wicketType === "caught"
                          ? "Caught by"
                          : "Run out by"}
                      {fielderRequired ? "" : " (optional)"}
                    </p>
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      {fielderCandidates.map((p) => {
                        const selected = fielderId === String(p.userId);
                        return (
                          <button
                            key={p.userId}
                            type="button"
                            onClick={() => setFielderId(String(p.userId))}
                            className={cn(
                              "min-h-11 rounded-2xl border px-3 py-3 text-[15px] font-medium active:scale-[0.98]",
                              selected
                                ? "border-accent bg-accent-soft text-accent-deep"
                                : p.fromBattingSide
                                  ? "border-accent/40 bg-accent-soft text-accent-deep"
                                  : "border-line text-ink",
                            )}
                          >
                            {p.displayName}
                            {p.fromBattingSide ? (
                              <span className="ml-1.5 text-[11px] font-normal opacity-80">
                                bats
                              </span>
                            ) : null}
                          </button>
                        );
                      })}
                    </div>
                  </>
                ) : null}
                <div className="mt-5 grid grid-cols-2 gap-2">
                  <Button variant="ghost" onClick={() => setSheet(null)}>
                    Cancel
                  </Button>
                  <Button
                    variant="danger"
                    disabled={
                      !playerOutId || busy || (fielderRequired && !fielderId)
                    }
                    onClick={sendWicket}
                  >
                    Confirm out
                  </Button>
                </div>
              </>
            ) : null}

            {activeSheet.kind === "bowler" ? (
              <>
                <p className="text-[15px] font-semibold text-ink">
                  {midOverBowlerChange ? "Who finishes the over?" : "Next bowler"}
                </p>
                <p className="mt-1 text-[13px] text-muted">
                  {midOverBowlerChange
                    ? `The bowler has gone in to bat — someone else bowls the remaining ${ballsLeftInOver} ball${ballsLeftInOver === 1 ? "" : "s"}.`
                    : "Over done — same bowler can’t bowl again."}
                </p>
                {noBowlerToFollow ? null : (
                  <div className="mt-4 grid grid-cols-2 gap-2">
                    {state.availableBowlers.map((p) => (
                      <button
                        key={p.userId}
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          tap("bowl", async () => {
                            if (!token) return;
                            await setBowler({ token, matchId, bowlerId: p.userId });
                            setSheet(null);
                          })
                        }
                        className="min-h-11 rounded-2xl border border-line px-3 py-3.5 text-left text-[15px] font-medium text-ink active:scale-[0.98] active:border-accent active:bg-accent-soft"
                      >
                        {p.displayName}
                        <span className="tabular block text-[11px] font-normal text-faint">
                          {p.oversText} ov bowled
                        </span>
                      </button>
                    ))}
                  </div>
                )}
                {noBowlerToFollow ? (
                  <div className="mt-4 rounded-2xl border border-line bg-bg p-4">
                    <p className="text-[15px] font-semibold text-ink">
                      Nobody left to bowl
                    </p>
                    <p className="mt-1 text-[13px] text-muted">
                      Everyone eligible either just bowled that over or is
                      currently batting. Add a player, or undo the last ball
                      to carry on.
                    </p>
                    <Button fullWidth className="mt-3" onClick={openSquad}>
                      Add a player
                    </Button>
                    <Button
                      fullWidth
                      variant="secondary"
                      className="mt-2"
                      disabled={busy || live.lastBalls.length === 0}
                      onClick={() =>
                        tap("undo", async () => {
                          if (!token) return;
                          await undoLastBall({ token, matchId });
                        })
                      }
                    >
                      Undo last ball
                    </Button>
                  </div>
                ) : null}
                {noBowlerToFollow ? null : (
                  <SquadEscapeHatch onOpen={openSquad} />
                )}
                {!live.needBowler ? (
                  <Button
                    variant="ghost"
                    fullWidth
                    className="mt-3"
                    onClick={() => setSheet(null)}
                  >
                    Cancel
                  </Button>
                ) : null}
              </>
            ) : null}

            {activeSheet.kind === "batsman" ? (
              <>
                <p className="text-[15px] font-semibold text-ink">Next batsman</p>
                {live.potBalls > 0 ? (
                  <p className="mt-1 text-[13px] text-muted">
                    {live.potBalls} spare {live.potBalls === 1 ? "ball" : "balls"}{" "}
                    left by batters out early — anyone can bat them, even after
                    their own quota.
                  </p>
                ) : null}
                {noBatterToFollow ? null : (
                  <div className="mt-4 grid grid-cols-2 gap-2">
                    {state.availableBatsmen.map((p) => (
                      <button
                        key={p.userId}
                        type="button"
                        disabled={busy || !p.selectable}
                        onClick={() =>
                          tap("bat", async () => {
                            if (!token) return;
                            await setNextBatsman({
                              token,
                              matchId,
                              batsmanId: p.userId,
                            });
                            setSheet(null);
                          })
                        }
                        className={cn(
                          "min-h-11 rounded-2xl border px-3 py-3.5 text-left text-[15px] font-medium active:scale-[0.98]",
                          // Not selectable = own quota spent and no spare balls.
                          // Shown anyway so the squad reads whole, but visibly
                          // out of play rather than a tap that gets bounced.
                          !p.selectable
                            ? "border-line/60 bg-bg text-faint"
                            : cn(
                                "text-ink active:border-accent active:bg-accent-soft",
                                // Dashed + paper fill marks a returning retiree,
                                // so solid white cards read as the default pick.
                                p.retired
                                  ? "border-dashed border-line bg-bg"
                                  : "border-line bg-surface",
                              ),
                        )}
                      >
                        {p.displayName}
                        {!p.selectable ? (
                          <span className="tabular block text-[11px] font-normal text-faint">
                            Quota done · {p.runs}({p.balls})
                          </span>
                        ) : p.atCap ? (
                          <span className="tabular block text-[11px] font-semibold text-accent-deep">
                            Spare balls · {p.runs}({p.balls})
                          </span>
                        ) : p.retired ? (
                          <span className="tabular block text-[11px] font-semibold text-accent-deep">
                            Resume · {p.runs}({p.balls})
                          </span>
                        ) : (
                          <span className="tabular block text-[11px] font-normal text-faint">
                            {p.balls > 0 ? `${p.runs}(${p.balls})` : "Yet to bat"}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
                {noBatterToFollow ? (
                  <div className="mt-4 rounded-2xl border border-line bg-bg p-4">
                    <p className="text-[15px] font-semibold text-ink">
                      Nobody left to come in
                    </p>
                    <p className="mt-1 text-[13px] text-muted">
                      {lastWasRetire
                        ? "Everyone else is out or already at the crease. Add a player, or undo the retirement to put them back in."
                        : "Everyone else is out or already at the crease. Add a player, or undo the last ball to carry on."}
                    </p>
                    <Button fullWidth className="mt-3" onClick={openSquad}>
                      Add a player
                    </Button>
                    <Button
                      fullWidth
                      variant="secondary"
                      className="mt-2"
                      disabled={busy || live.lastBalls.length === 0}
                      onClick={() =>
                        tap("undo", async () => {
                          if (!token) return;
                          await undoLastBall({ token, matchId });
                        })
                      }
                    >
                      {lastWasRetire ? "Undo the retirement" : "Undo last ball"}
                    </Button>
                  </div>
                ) : null}
                {noBatterToFollow ? null : (
                  <SquadEscapeHatch onOpen={openSquad} />
                )}
              </>
            ) : null}

            {activeSheet.kind === "retire" ? (
              <>
                <p className="text-[15px] font-semibold text-ink">
                  Retire batter
                </p>
                <p className="mt-1 text-[13px] text-muted">
                  {retireForced && live.strikerQuota
                    ? `${live.striker?.displayName ?? "Striker"} has batted their ${
                        live.strikerQuota.cap
                      } balls and there are no spare balls left — next batter comes in.`
                    : "Retired not out — no wicket. They keep their score and can be sent back in whenever the side needs them."}
                </p>
                {!retireForced && live.potBalls > 0 ? (
                  <p className="mt-2 rounded-2xl border border-accent/25 bg-accent-soft px-3 py-2.5 text-[13px] text-accent-deep">
                    {live.potBalls} spare{" "}
                    {live.potBalls === 1 ? "ball" : "balls"} in hand — no need to
                    retire yet if you want to keep this batter on.
                  </p>
                ) : null}
                {noBatterToFollow ? (
                  <p className="mt-3 rounded-2xl border border-danger/20 bg-danger-soft px-3 py-2.5 text-[13px] text-danger">
                    Nobody is left to come in. Retire now and the innings stops
                    until you add a player or undo.
                  </p>
                ) : null}
                {!retireForced ? (
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    {[live.striker, live.nonStriker].filter(Boolean).map((p) =>
                      p ? (
                        <button
                          key={p.userId}
                          type="button"
                          onClick={() => setRetireTarget(String(p.userId))}
                          className={cn(
                            "min-h-11 rounded-2xl border px-3 py-3 text-[15px] font-medium active:scale-[0.98]",
                            retireTarget === String(p.userId)
                              ? "border-accent bg-accent-soft text-accent-deep"
                              : "border-line text-ink",
                          )}
                        >
                          {p.displayName}
                        </button>
                      ) : null,
                    )}
                  </div>
                ) : null}
                <div className="mt-5 grid grid-cols-2 gap-2">
                  {!retireForced ? (
                    <Button variant="ghost" onClick={() => setSheet(null)}>
                      Cancel
                    </Button>
                  ) : (
                    <Button
                      variant="ghost"
                      disabled={busy}
                      onClick={() =>
                        tap("undo", async () => {
                          if (!token) return;
                          await undoLastBall({ token, matchId });
                        })
                      }
                    >
                      Undo last ball
                    </Button>
                  )}
                  <Button
                    disabled={busy || !retiree}
                    onClick={() =>
                      tap("retire", async () => {
                        if (!token || !retiree) return;
                        await retireBatsman({
                          token,
                          matchId,
                          batsmanId: retiree.userId,
                        });
                        setSheet(null);
                        setRetireTarget(null);
                      })
                    }
                  >
                    Retire
                  </Button>
                </div>
              </>
            ) : null}

            {activeSheet.kind === "drop" ? (
              <>
                <p className="text-[15px] font-semibold text-ink">
                  {state.lastBallDrop
                    ? `${state.lastBallDrop.byName} dropped it`
                    : "Who dropped it?"}
                </p>
                <p className="mt-1 text-[13px] text-muted">
                  {state.lastBallDrop
                    ? "Tap someone else to correct it, or remove it below."
                    : "Goes on the ball you just scored — doesn’t change the score."}
                </p>
                <div className="mt-4 grid grid-cols-2 gap-2">
                  {dropCandidates.map((p) => {
                    const selected = dropId === String(p.userId);
                    return (
                      <button
                        key={p.userId}
                        type="button"
                        onClick={() => {
                          setSheet(null);
                          void tap("CD", async () => {
                            if (!token) return;
                            await tagDrop({
                              token,
                              matchId,
                              droppedById: p.userId as Id<"users">,
                            });
                          });
                        }}
                        className={cn(
                          "min-h-11 rounded-2xl border px-3 py-3 text-[15px] font-medium active:scale-[0.98]",
                          selected
                            ? "border-accent bg-accent-soft text-accent-deep"
                            : p.fromBattingSide
                              ? "border-accent/40 bg-accent-soft text-accent-deep"
                              : "border-line text-ink",
                        )}
                      >
                        {p.displayName}
                        {p.fromBattingSide ? (
                          <span className="ml-1.5 text-[11px] font-normal opacity-80">
                            bats
                          </span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
                <div className="mt-5 grid grid-cols-2 gap-2">
                  {state.lastBallDrop ? (
                    <Button
                      variant="ghost"
                      onClick={() => {
                        setSheet(null);
                        setDropId(null);
                        void tap("CD", async () => {
                          if (!token) return;
                          await tagDrop({ token, matchId, clear: true });
                        });
                      }}
                    >
                      Remove drop
                    </Button>
                  ) : null}
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setDropId(null);
                      setSheet(null);
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </>
            ) : null}

            {activeSheet.kind === "squad" ? (
              <>
                <p className="text-[15px] font-semibold text-ink">Players</p>
                <p className="mt-1 text-[13px] text-muted">
                  Someone turned up late? Add them to a side. Anyone who
                  hasn&apos;t batted, bowled or fielded yet can be moved or
                  removed.
                </p>

                {(
                  [
                    {
                      key: "in",
                      label: "In this match",
                      rows: squadRows.filter((r) => r.sides.length > 0),
                    },
                    {
                      key: "out",
                      label: "Not playing",
                      rows: squadRows.filter((r) => r.sides.length === 0),
                    },
                  ] as const
                ).map((group) =>
                  group.rows.length === 0 ? null : (
                    <div key={group.key} className="mt-4">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-faint">
                        {group.label}
                      </p>
                      <div className="mt-2 space-y-2">
                        {group.rows.map((row) => (
                          <SquadRow
                            key={row.userId}
                            name={row.displayName}
                            sides={row.sides}
                            nameA={state.sideA.name}
                            nameB={state.sideB.name}
                            // Index 0 of a side is its captain; the server
                            // refuses to take them off it, so don't offer it.
                            captainOf={
                              [
                                String(state.sideA.players[0]?.userId) ===
                                row.userId
                                  ? "A"
                                  : null,
                                String(state.sideB.players[0]?.userId) ===
                                row.userId
                                  ? "B"
                                  : null,
                              ].filter(Boolean) as Array<"A" | "B">
                            }
                            disabled={squadBusyId !== null}
                            error={
                              squadError?.userId === row.userId
                                ? squadError.message
                                : null
                            }
                            onAssign={(sides) => assignSides(row.userId, sides)}
                          />
                        ))}
                      </div>
                    </div>
                  ),
                )}

                <div className="mt-4 flex gap-2">
                  <input
                    value={guestName}
                    onChange={(e) => setGuestName(e.target.value)}
                    placeholder="Add a guest by name"
                    className="min-h-12 min-w-0 flex-1 rounded-2xl border border-line bg-bg px-3 text-[16px] text-ink outline-none placeholder:text-muted focus:border-ink"
                  />
                  <Button
                    variant="ghost"
                    disabled={guestBusy || guestName.trim().length < 2}
                    onClick={addGuestPlayer}
                  >
                    Add
                  </Button>
                </div>

                {squadError && squadError.userId === null ? (
                  <p className="mt-3 text-[13px] text-danger">
                    {squadError.message}
                  </p>
                ) : null}

                <Button
                  fullWidth
                  variant="ghost"
                  className="mt-4"
                  onClick={() => setSheet(null)}
                >
                  Done
                </Button>
              </>
            ) : null}
          </div>
        </div>
      ) : null}

      <ConfirmDialog
        open={confirmEndInnings}
        title={declareMode ? "Declare the innings now?" : "End innings now?"}
        confirmLabel={declareMode ? "Declare" : "End innings"}
        busy={busy}
        onConfirm={() => {
          setConfirmEndInnings(false);
          tap("end", async () => {
            if (!token) return;
            await endInnings({ token, matchId });
          });
        }}
        onCancel={() => setConfirmEndInnings(false)}
      />
      <TestClockOverlays />
    </div>
    </TestClockProvider>
  );
}

/**
 * The bowler and batsman pickers are deliberately undismissable — scoring can't
 * continue without a pick. But "we've run out of players" is exactly when a
 * late arrival gets added, so those sheets need a way through to the squads.
 * Closing the squad sheet drops back here with the new player in the list.
 */
function SquadEscapeHatch({ onOpen }: { onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="mt-4 min-h-11 w-full rounded-xl py-2 text-[13px] font-medium text-muted underline underline-offset-4"
    >
      Someone else here? Add a player
    </button>
  );
}

/**
 * One player in the squad sheet: which side they are on, then only the moves
 * that change something, each named for what it does.
 */
function SquadRow({
  name,
  sides,
  nameA,
  nameB,
  captainOf,
  disabled,
  error,
  onAssign,
}: {
  name: string;
  sides: Array<"A" | "B">;
  nameA: string;
  nameB: string;
  captainOf: Array<"A" | "B">;
  disabled: boolean;
  error: string | null;
  onAssign: (sides: Array<"A" | "B">) => void;
}) {
  const onA = sides.includes("A");
  const onB = sides.includes("B");
  const canLeaveA = !captainOf.includes("A");
  const canLeaveB = !captainOf.includes("B");
  const nameOf = (s: "A" | "B") => (s === "A" ? nameA : nameB);

  const where =
    onA && onB
      ? "Plays for both sides"
      : onA || onB
        ? `Plays for ${nameOf(onA ? "A" : "B")}`
        : "Not playing";

  type Move = {
    key: string;
    label: string;
    sides: Array<"A" | "B">;
    danger?: boolean;
  };
  const moves: Move[] = [];
  if (!onA && !onB) {
    moves.push(
      { key: "A", label: `Add to ${nameA}`, sides: ["A"] },
      { key: "B", label: `Add to ${nameB}`, sides: ["B"] },
      { key: "AB", label: "Both sides", sides: ["A", "B"] },
    );
  } else if (onA && onB) {
    if (canLeaveB) moves.push({ key: "A", label: `Only ${nameA}`, sides: ["A"] });
    if (canLeaveA) moves.push({ key: "B", label: `Only ${nameB}`, sides: ["B"] });
    if (canLeaveA && canLeaveB)
      moves.push({ key: "none", label: "Remove", sides: [], danger: true });
  } else {
    const here: "A" | "B" = onA ? "A" : "B";
    const other: "A" | "B" = onA ? "B" : "A";
    const canLeave = here === "A" ? canLeaveA : canLeaveB;
    moves.push({ key: "AB", label: "Both sides", sides: ["A", "B"] });
    if (canLeave) {
      moves.push(
        { key: other, label: `Move to ${nameOf(other)}`, sides: [other] },
        { key: "none", label: "Remove", sides: [], danger: true },
      );
    }
  }

  return (
    <div className="rounded-2xl border border-line p-3">
      <TruncText lines={2} className="text-[15px] font-semibold text-ink">
        {name}
      </TruncText>
      <p
        className={cn(
          "mt-0.5 line-clamp-2 text-[13px] [overflow-wrap:anywhere]",
          onA || onB ? "font-semibold text-accent-deep" : "text-muted",
        )}
      >
        {where}
        {captainOf.length > 0 ? " · captain" : ""}
      </p>
      {moves.length > 0 ? (
        <div className="mt-2 grid grid-cols-3 gap-1.5">
          {moves.map((m) => (
            <button
              key={m.key}
              type="button"
              disabled={disabled}
              title={m.label}
              onClick={() => onAssign(m.sides)}
              className={cn(
                "min-h-11 rounded-xl border px-2 py-2 text-[13px] font-semibold active:scale-[0.98] active:bg-bg disabled:cursor-not-allowed disabled:opacity-40",
                m.danger
                  ? "border-danger/20 text-danger"
                  : "border-line text-ink",
              )}
            >
              <span className="line-clamp-2 [overflow-wrap:anywhere]">
                {m.label}
              </span>
            </button>
          ))}
        </div>
      ) : null}
      {error ? <p className="mt-2 text-[13px] text-danger">{error}</p> : null}
    </div>
  );
}

function PadKey({
  label,
  onClick,
  disabled,
  emphasis,
  danger,
  small,
  active,
  armed,
  className,
}: {
  label: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  emphasis?: boolean;
  danger?: boolean;
  small?: boolean;
  active?: boolean;
  // Distinct from `active` (a brief tap pulse): a persistent pending state —
  // used for CD once a culprit is picked, until the next ball consumes it.
  armed?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex min-h-16 items-center justify-center rounded-2xl border font-semibold shadow-card transition active:scale-[0.96] disabled:opacity-30 disabled:shadow-none",
        danger
          ? "border-danger/25 bg-danger-soft text-danger"
          : armed
            ? "border-accent bg-accent text-ink ring-2 ring-accent"
            : emphasis
              ? "border-accent/45 bg-accent-soft text-accent-deep"
              : "border-line bg-surface text-ink",
        small ? "text-[15px]" : "text-[22px]",
        active && "scale-[0.96] ring-2 ring-accent",
        className,
      )}
    >
      {label}
    </button>
  );
}

function Picker({
  label,
  players,
  selected,
  disabledIds,
  onSelect,
}: {
  label: string;
  players: Array<{ userId: Id<"users">; displayName: string }>;
  selected: string | null;
  disabledIds: string[];
  onSelect: (id: string) => void;
}) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-4">
      <p className="text-[13px] font-medium text-muted">{label}</p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        {players.map((p) => {
          const id = String(p.userId);
          return (
            <button
              key={id}
              type="button"
              disabled={disabledIds.includes(id)}
              onClick={() => onSelect(id)}
              className={cn(
                "min-h-11 rounded-2xl border px-3 py-3 text-left text-[15px] font-medium active:scale-[0.98] disabled:opacity-30",
                selected === id
                  ? "border-accent bg-accent-soft text-accent-deep"
                  : "border-line text-ink",
              )}
            >
              {p.displayName}
            </button>
          );
        })}
      </div>
    </div>
  );
}
