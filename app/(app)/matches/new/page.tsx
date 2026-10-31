"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { useAuth } from "@/components/providers/AuthProvider";
import { CoinToss } from "@/components/match/CoinToss";
import { PlayerMultiSelect } from "@/components/match/PlayerMultiSelect";
import { SideChoice, type SideValue } from "@/components/match/SideChoice";
import { usePlayableGrounds } from "@/components/ground/GroundChips";
import {
  DEFAULT_TEST_MINUTES,
  MAX_TEST_MINUTES,
  MIN_TEST_MINUTES,
} from "@/convex/lib/clock";
import {
  getLastDurationMinutes,
  getLastFormat,
  getLastOvers,
  getLastOversPerPlayer,
  setLastDurationMinutes,
  setLastFormat,
  setLastOvers,
  setLastOversPerPlayer,
} from "@/lib/session";
import { balanceTeams } from "@/lib/autoTeams";
import { cn, errorMessage } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { NumberField } from "@/components/ui/NumberField";
import { TruncText } from "@/components/ui/TruncText";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  ChevronDown,
  Crown,
  History,
  Minus,
  Plus,
  X,
} from "lucide-react";

type Step = "who" | "teams" | "start";
type Side = "A" | "B";

function firstName(full: string) {
  return full.trim().split(/\s+/)[0] ?? full;
}

function whenLabel(ts: number) {
  const d = new Date(ts);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const time = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  return sameDay
    ? `today ${time}`
    : d.toLocaleDateString([], { month: "short", day: "numeric" });
}

// useSearchParams needs a Suspense boundary to prerender.
export default function NewMatchPage() {
  return (
    <Suspense fallback={<div className="min-h-dvh bg-bg" />}>
      <NewMatchFlow />
    </Suspense>
  );
}

function NewMatchFlow() {
  const { token, activeOrgId } = useAuth();
  const router = useRouter();
  const pollId = useSearchParams().get("poll") as Id<"polls"> | null;
  const pool = useQuery(
    api.players.listOrgPlayers,
    token && activeOrgId ? { token, orgId: activeOrgId } : "skip",
  );
  // Started from "Who's in?": the In list arrives already ticked and the
  // poll's ground already set. Nothing else about the flow changes.
  const poll = useQuery(
    api.polls.get,
    token && pollId ? { token, pollId } : "skip",
  );
  const grounds = usePlayableGrounds();
  const [groundId, setGroundId] = useState<Id<"grounds"> | null>(null);
  const chosenGround =
    grounds.find((g) => g._id === groundId) ??
    grounds.find((g) => g.isHome) ??
    null;
  const recentMatches = useQuery(
    api.matches.list,
    token && activeOrgId ? { token, orgId: activeOrgId } : "skip",
  );
  // A friendly starts from the last friendly: a tournament match has its own
  // teams, and an abandoned match may be a mistake.
  const lastMatchId = recentMatches?.find(
    (m) => m.status !== "abandoned" && !m.tournamentId,
  )?._id;
  const lastMatch = useQuery(
    api.matches.get,
    token && lastMatchId ? { token, matchId: lastMatchId } : "skip",
  );
  // Player level for the team split — the same all-round board the Players
  // tab ranks on, so the teams it builds match what everyone can already see.
  const board = useQuery(
    api.stats.leaderboard,
    token && activeOrgId
      ? { token, orgId: activeOrgId, includeVisitorsAndJuniors: true }
      : "skip",
  );
  const createMatch = useMutation(api.matches.create);
  const setBattingFirst = useMutation(api.scoring.setBattingFirst);
  const startInnings = useMutation(api.scoring.startInnings);
  const addGuest = useMutation(api.players.addGuest);

  const [step, setStep] = useState<Step>("who");
  const [available, setAvailable] = useState<string[]>([]);
  const [nameA, setNameA] = useState("");
  const [nameB, setNameB] = useState("");
  const [teamA, setTeamA] = useState<string[]>([]);
  const [teamB, setTeamB] = useState<string[]>([]);
  const [common, setCommon] = useState<string[]>([]);
  // Rows keep this order while the scorer moves players, so a row never jumps
  // from under a thumb.
  const [rowOrder, setRowOrder] = useState<string[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [tossOpen, setTossOpen] = useState(false);
  const [battingSide, setBattingSide] = useState<Side | null>(null);
  const [striker, setStriker] = useState<string | null>(null);
  const [nonStriker, setNonStriker] = useState<string | null>(null);
  const [bowler, setBowler] = useState<string | null>(null);
  const [openPick, setOpenPick] = useState<"striker" | "non" | "bowler" | null>(
    null,
  );
  const [format, setFormat] = useState<"limited" | "test">(() =>
    getLastFormat(),
  );
  const [overs, setOvers] = useState(() => getLastOvers(getLastFormat()));
  const [oversPerPlayer, setOversPerPlayer] = useState(() =>
    getLastOversPerPlayer(),
  );
  const [durationMinutes, setDurationMinutes] = useState(() =>
    getLastDurationMinutes(),
  );
  const [battingMode, setBattingMode] = useState<"double" | "single">("double");
  // Gully default: the last batter bats on alone. Off = proper cricket.
  const [lastBatsmanAlone, setLastBatsmanAlone] = useState(true);
  const [busy, setBusy] = useState(false);
  const [guestBusy, setGuestBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const players = useMemo(() => pool ?? [], [pool]);

  // The community's last match sets the defaults, so every phone starts the
  // same. The values saved on this phone only cover a community's first match.
  const defaultsApplied = useRef(false);
  useEffect(() => {
    if (defaultsApplied.current || !lastMatch) return;
    defaultsApplied.current = true;
    setFormat(lastMatch.format);
    setOvers(lastMatch.overs);
    if (
      lastMatch.format === "limited" &&
      lastMatch.oversPerPlayer >= 2 &&
      lastMatch.oversPerPlayer <= 20 &&
      lastMatch.oversPerPlayer % 2 === 0
    ) {
      setOversPerPlayer(lastMatch.oversPerPlayer);
    }
    setBattingMode(lastMatch.battingMode);
    if (lastMatch.lastBatsmanAlone !== undefined) {
      setLastBatsmanAlone(lastMatch.lastBatsmanAlone);
    }
    if (lastMatch.format === "test") {
      const mins = lastMatch.clock
        ? Math.round(lastMatch.clock.durationMs / 60000)
        : DEFAULT_TEST_MINUTES;
      setDurationMinutes(
        Number.isInteger(mins) &&
          mins >= MIN_TEST_MINUTES &&
          mins <= MAX_TEST_MINUTES
          ? mins
          : DEFAULT_TEST_MINUTES,
      );
    }
  }, [lastMatch]);

  // Applied once: after that the scorer owns the list, and a late answer on
  // the poll must not tick someone they just unticked.
  const pollApplied = useRef(false);
  useEffect(() => {
    if (pollApplied.current || !poll || !pool) return;
    pollApplied.current = true;
    const here = new Set(pool.map((p) => String(p.userId)));
    setAvailable(
      poll.groups.in
        .map((p) => String(p.userId))
        .filter((id) => here.has(id)),
    );
    if (poll.groundId) setGroundId(poll.groundId);
  }, [poll, pool]);
  const nameOf = useMemo(() => {
    const m = new Map(players.map((p) => [String(p.userId), p.displayName]));
    return (id: string) => m.get(id) ?? "Player";
  }, [players]);

  const levelOf = useMemo(() => {
    const points = new Map(
      (board?.allRound ?? []).map((r) => [String(r.userId), r.points]),
    );
    return (id: string) => ({
      points: points.get(id) ?? 0,
      displayName: nameOf(id),
    });
  }, [board, nameOf]);
  // Undefined = the board is still loading. Forming teams then would rank
  // everyone at zero and split the field alphabetically, which looks balanced
  // and isn't — so the button waits.
  const levelsReady = board !== undefined;

  const countA = teamA.length + common.length;
  const countB = teamB.length + common.length;
  // Everyone on Both would be one team playing itself.
  const ready = countA >= 2 && countB >= 2 && teamA.length + teamB.length > 0;

  // ── Step history ──
  // The steps are useState on one route, so a system back gesture would unmount
  // the page and wipe the draft. Each step forward pushes a history entry and
  // popstate walks the flow back instead of leaving it.
  const depthRef = useRef(0);
  const leavingRef = useRef(false);
  const stepAt = useRef(0);
  // Back and forward skip the buttons, so each step entry re-checks the teams.
  const reconcileRef = useRef<() => boolean>(() => true);

  useEffect(() => {
    // A reload keeps the browser's entries for this flow but not the draft.
    depthRef.current =
      (window.history.state as { boundaryDepth?: number } | null)
        ?.boundaryDepth ?? 0;
    const onPop = (e: PopStateEvent) => {
      if (leavingRef.current) return;
      const state = e.state as {
        boundaryStep?: Step;
        boundaryDepth?: number;
      } | null;
      depthRef.current = state?.boundaryDepth ?? 0;
      const next = state?.boundaryStep ?? "who";
      setTossOpen(false);
      setStep(next !== "who" && !reconcileRef.current() ? "who" : next);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  function enterStep(next: Step) {
    stepAt.current = Date.now();
    depthRef.current += 1;
    // Keep Next's own history state on the entry — only add our step marker.
    window.history.pushState(
      {
        ...window.history.state,
        boundaryStep: next,
        boundaryDepth: depthRef.current,
      },
      "",
    );
    setStep(next);
  }

  function goBack() {
    if (step !== "who") window.history.back();
  }

  /** Drop our step entries so back from the score pad leaves the create flow. */
  async function dropStepEntries() {
    if (depthRef.current === 0) return;
    const depth = depthRef.current;
    depthRef.current = 0;
    leavingRef.current = true;
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => finish(), 300);
      function finish() {
        window.removeEventListener("popstate", finish);
        clearTimeout(timer);
        resolve();
      }
      window.addEventListener("popstate", finish);
      window.history.go(-depth);
    });
  }

  // Openers must stay on the teams as they are now, whichever way the scorer
  // came back to this screen.
  useEffect(() => {
    if (!battingSide) return;
    const batting = rosterOf(battingSide);
    const bowling = rosterOf(battingSide === "A" ? "B" : "A");
    const valid =
      !!striker &&
      batting.includes(striker) &&
      (solo ? true : !!nonStriker && batting.includes(nonStriker)) &&
      !!bowler &&
      bowling.includes(bowler) &&
      bowler !== striker &&
      bowler !== nonStriker;
    if (!valid) fillOpeners(battingSide);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamA, teamB, common, battingSide, battingMode]);

  function toggleAvailable(userId: string) {
    setAvailable((list) =>
      list.includes(userId)
        ? list.filter((id) => id !== userId)
        : [...list, userId],
    );
  }

  async function handleAddGuest(name: string, phone: string) {
    if (!token || !activeOrgId) return;
    setGuestBusy(true);
    setError(null);
    try {
      const res = await addGuest({
        token,
        orgId: activeOrgId,
        name,
        phone: phone || undefined,
      });
      setAvailable((list) =>
        list.includes(res.userId) ? list : [...list, res.userId],
      );
    } catch (e) {
      setError(errorMessage(e, "Could not add guest"));
    } finally {
      setGuestBusy(false);
    }
  }

  function autoTeamName(captainId: string | undefined) {
    return captainId ? `Team ${firstName(nameOf(captainId))}`.slice(0, 30) : "";
  }

  /**
   * Index 0 of a side is its captain — the backend derives the team name from
   * them. So every roster change goes through here, which keeps an untouched
   * name following the captain and leaves a typed-in name alone.
   */
  function applyTeam(side: Side, next: string[]) {
    const prev = side === "A" ? teamA : teamB;
    const name = side === "A" ? nameA : nameB;
    const setTeam = side === "A" ? setTeamA : setTeamB;
    const setName = side === "A" ? setNameA : setNameB;
    setTeam(next);
    if (!name || name === autoTeamName(prev[0])) setName(autoTeamName(next[0]));
  }

  /**
   * Teams open already split by rank. Coming back after a change keeps every
   * move the scorer made: someone who left drops out, and someone new joins the
   * smaller team.
   */
  function reconcileTeams(): boolean {
    if (available.length === 0) return false;
    const here = new Set(available);
    const keptA = teamA.filter((id) => here.has(id));
    const keptB = teamB.filter((id) => here.has(id));
    const keptCommon = common.filter((id) => here.has(id));
    const placed = new Set([...keptA, ...keptB, ...keptCommon]);
    let nextA = keptA;
    let nextB = keptB;
    let nextCommon = keptCommon;
    if (placed.size === 0) {
      const split = balanceTeams(available, levelOf);
      nextA = split.teamA;
      nextB = split.teamB;
      nextCommon = split.common;
    } else {
      const newcomers = available.filter((id) => !placed.has(id));
      for (const id of newcomers) {
        if (nextA.length <= nextB.length) nextA = [...nextA, id];
        else nextB = [...nextB, id];
      }
      // The odd player plays both, the same as on a fresh split.
      const last = newcomers[newcomers.length - 1];
      if (last && nextCommon.length === 0 && available.length % 2 === 1) {
        nextA = nextA.filter((id) => id !== last);
        nextB = nextB.filter((id) => id !== last);
        nextCommon = [last];
      }
    }
    applyTeam("A", nextA);
    applyTeam("B", nextB);
    setCommon(nextCommon);
    setRowOrder([...nextA, ...nextCommon, ...nextB]);
    return true;
  }
  reconcileRef.current = reconcileTeams;

  /** One tap, one step: a double tap must not fall through to the next screen. */
  const tooSoon = () => Date.now() - stepAt.current < 400;

  function goToTeams() {
    if (tooSoon()) return;
    if (reconcileTeams()) enterStep("teams");
  }

  function sideOf(id: string): SideValue {
    if (common.includes(id)) return "both";
    if (teamA.includes(id)) return "A";
    if (teamB.includes(id)) return "B";
    return null;
  }

  function moveTo(id: string, next: Exclude<SideValue, null>) {
    applyTeam(
      "A",
      next === "A"
        ? [...teamA.filter((x) => x !== id), id]
        : teamA.filter((x) => x !== id),
    );
    applyTeam(
      "B",
      next === "B"
        ? [...teamB.filter((x) => x !== id), id]
        : teamB.filter((x) => x !== id),
    );
    setCommon((l) =>
      next === "both" ? [...l.filter((x) => x !== id), id] : l.filter((x) => x !== id),
    );
  }

  function makeCaptain(id: string) {
    if (teamA.includes(id)) applyTeam("A", [id, ...teamA.filter((x) => x !== id)]);
    if (teamB.includes(id)) applyTeam("B", [id, ...teamB.filter((x) => x !== id)]);
  }

  function enterStart() {
    if (tooSoon()) return;
    setOpenPick(null);
    enterStep("start");
  }

  const solo = battingMode === "single";
  const rosterOf = (side: Side) =>
    side === "A" ? [...teamA, ...common] : [...teamB, ...common];

  /** Openers filled in, so a scorer only touches them to change them. */
  function pickBattingSide(side: Side) {
    if (side === battingSide) return;
    fillOpeners(side);
  }

  function fillOpeners(side: Side) {
    const batting = rosterOf(side);
    const first = batting[0] ?? null;
    const second = solo ? null : (batting[1] ?? null);
    setBattingSide(side);
    setStriker(first);
    setNonStriker(second);
    setBowler(
      rosterOf(side === "A" ? "B" : "A").find(
        (id) => id !== first && id !== second,
      ) ?? null,
    );
    setOpenPick(null);
  }

  function reuseLastTeams() {
    if (!lastMatch || !pool || tooSoon()) return;
    // Someone who has left the community cannot play again.
    const inCommunity = new Set(pool.map((p) => String(p.userId)));
    const sideA = lastMatch.sideAPlayers
      .map((p) => String(p.userId))
      .filter((id) => inCommunity.has(id));
    const sideB = lastMatch.sideBPlayers
      .map((p) => String(p.userId))
      .filter((id) => inCommunity.has(id));
    const inBoth = sideA.filter((id) => sideB.includes(id));
    const restA = sideA.filter((id) => !inBoth.includes(id));
    const restB = sideB.filter((id) => !inBoth.includes(id));
    // onStart submits sideAPlayerIds = [...teamA, ...common], so a captain who
    // is now a common player only stays index-0 for a side whose exclusive
    // roster (restA/restB) is empty — sort them to the front of common so
    // that case (and only that case) preserves the old captain.
    const captainA = sideA[0];
    const captainB = sideB[0];
    const orderedCommon = [...inBoth].sort((a, b) => {
      const rank = (id: string) =>
        (restA.length === 0 && id === captainA) ||
        (restB.length === 0 && id === captainB)
          ? 0
          : 1;
      return rank(a) - rank(b);
    });
    setCommon(orderedCommon);
    setTeamA(restA);
    setTeamB(restB);
    setAvailable(Array.from(new Set([...sideA, ...sideB])));
    setRowOrder([...restA, ...orderedCommon, ...restB]);
    // A name that was only ever the captain's is left blank so it follows a new
    // captain (the backend re-derives it); a typed-in name carries over as-is.
    // If it comes back blank, seed it from whoever actually leads the reused
    // roster now (captain if their side kept them, else the new index 0) so
    // the two side cards aren't both unlabeled "Team A" / "Team B".
    const carry = (
      stored: string,
      captain: { displayName: string } | undefined,
    ) => {
      const derived = captain
        ? `Team ${firstName(captain.displayName)}`.slice(0, 30)
        : "";
      return stored === derived ? "" : stored;
    };
    const nextCaptainA = restA[0] ?? orderedCommon[0];
    const nextCaptainB = restB[0] ?? orderedCommon[0];
    setNameA(
      carry(lastMatch.sideAName, lastMatch.sideAPlayers[0]) ||
        autoTeamName(nextCaptainA),
    );
    setNameB(
      carry(lastMatch.sideBName, lastMatch.sideBPlayers[0]) ||
        autoTeamName(nextCaptainB),
    );
    enterStart();
  }

  async function onStart() {
    if (!token || !activeOrgId || !battingSide || !striker || !bowler) return;
    setBusy(true);
    setError(null);
    try {
      const res = await createMatch({
        token,
        orgId: activeOrgId,
        sideAName: nameA || undefined,
        sideBName: nameB || undefined,
        sideAPlayerIds: [...teamA, ...common] as Id<"users">[],
        sideBPlayerIds: [...teamB, ...common] as Id<"users">[],
        overs: Math.min(200, Math.max(1, overs)),
        battingMode,
        format,
        oversPerPlayer: format === "limited" ? oversPerPlayer : undefined,
        lastBatsmanAlone,
        durationMinutes:
          format === "test"
            ? Math.min(
                MAX_TEST_MINUTES,
                Math.max(MIN_TEST_MINUTES, durationMinutes),
              )
            : undefined,
        ...(chosenGround ? { groundId: chosenGround._id } : {}),
        ...(poll && poll.status !== "cancelled" ? { pollId: poll._id } : {}),
      });
      setLastOvers(Math.min(200, Math.max(1, overs)), format);
      setLastFormat(format);
      if (format === "limited") setLastOversPerPlayer(oversPerPlayer);
      if (format === "test")
        setLastDurationMinutes(
          Math.min(
            MAX_TEST_MINUTES,
            Math.max(MIN_TEST_MINUTES, durationMinutes),
          ),
        );
      // The match exists now. If either call fails, the score page asks for what
      // is still missing, so nothing is lost.
      try {
        await setBattingFirst({ token, matchId: res.matchId, side: battingSide });
        await startInnings({
          token,
          matchId: res.matchId,
          strikerId: striker as Id<"users">,
          nonStrikerId: solo ? undefined : (nonStriker as Id<"users">),
          openingBowlerId: bowler as Id<"users">,
        });
      } catch {
        // Handled by the score page.
      }
      await dropStepEntries();
      router.replace(`/matches/${res.matchId}/score`);
    } catch (e) {
      leavingRef.current = false;
      setError(errorMessage(e, "Could not start match"));
      setBusy(false);
    }
  }

  const header = (
    <header className="sticky top-0 z-30 flex items-center gap-2 border-b border-line bg-bg/95 px-5 pb-3 pt-[calc(var(--safe-top)+1rem)] backdrop-blur">
      {step === "who" ? (
        <Link
          href="/home"
          aria-label="Back"
          className="-ml-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-muted active:bg-ink/[0.04]"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
      ) : (
        <button
          type="button"
          aria-label="Back"
          onClick={goBack}
          className="-ml-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-muted active:bg-ink/[0.04]"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
      )}
      <h1 className="text-xl font-semibold tracking-tight text-ink">
        {step === "who" ? "Who’s here?" : step === "teams" ? "Teams" : "Start"}
      </h1>
    </header>
  );

  const errorBanner = error ? (
    <p className="rounded-2xl border border-danger/20 bg-danger-soft px-4 py-3 text-[13px] text-danger">
      {error}
    </p>
  ) : null;

  const footer = (button: React.ReactNode) => (
    <div className="safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 px-5 pt-3 backdrop-blur">
      <div className="mx-auto max-w-md pb-3">{button}</div>
    </div>
  );

  // ── Screen 1: who's here ──
  if (step === "who") {
    const enough = available.length >= 4;
    return (
      <div className="flex min-h-dvh flex-col bg-bg">
        {header}
        <main className="mx-auto w-full max-w-md flex-1 space-y-4 px-5 py-4 pb-32">
          {lastMatch && pool ? (
            <button
              type="button"
              onClick={reuseLastTeams}
              className="flex w-full items-center gap-3 rounded-2xl border border-accent/40 bg-accent-soft px-4 py-3.5 text-left active:scale-[0.98]"
            >
              <History className="h-5 w-5 shrink-0 text-accent-deep" />
              <span className="min-w-0">
                <span className="block text-[15px] font-semibold text-accent-deep">
                  Reuse last teams
                </span>
                <span className="block truncate text-[13px] text-muted">
                  {lastMatch.sideAName} vs {lastMatch.sideBName} ·{" "}
                  {whenLabel(lastMatch.createdAt)}
                </span>
              </span>
            </button>
          ) : null}

          <section className="rounded-2xl border border-line bg-surface p-4">
            <PlayerMultiSelect
              players={players}
              selectedIds={available}
              otherSideIds={[]}
              onToggle={toggleAvailable}
              onAddGuest={handleAddGuest}
              addingGuest={guestBusy}
            />
          </section>
          {errorBanner}
        </main>
        {footer(
          <Button
            type="button"
            fullWidth
            size="lg"
            disabled={!enough || !levelsReady}
            onClick={goToTeams}
          >
            {!enough
              ? "Pick at least 4"
              : levelsReady
                ? `Next · ${available.length} playing`
                : "Loading…"}
          </Button>,
        )}
      </div>
    );
  }

  // ── Screen 2: teams, already split ──
  if (step === "teams") {
    const captainA = teamA[0] ?? common[0];
    const captainB = teamB[0] ?? common[0];
    const rows = [
      ...rowOrder,
      ...available.filter((id) => !rowOrder.includes(id)),
    ].filter((id) => sideOf(id) !== null);
    return (
      <div className="flex min-h-dvh flex-col bg-bg">
        {header}
        <main className="mx-auto w-full max-w-md flex-1 space-y-3 px-5 py-4 pb-32">
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                { side: "A", name: nameA, setName: setNameA, count: countA },
                { side: "B", name: nameB, setName: setNameB, count: countB },
              ] as const
            ).map(({ side, name, setName, count }) => (
              <label
                key={side}
                className="flex min-h-11 min-w-0 items-center gap-2 rounded-2xl border border-line bg-surface px-3"
              >
                <span className="shrink-0 text-[13px] font-semibold text-accent-deep">
                  {side}
                </span>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={`Team ${side}`}
                  maxLength={30}
                  aria-label={`Team ${side} name`}
                  autoCapitalize="words"
                  enterKeyHint="done"
                  className="min-w-0 flex-1 bg-transparent py-2 text-[16px] font-semibold text-ink outline-none placeholder:text-faint"
                />
                <span className="tabular shrink-0 text-[13px] font-semibold text-muted">
                  {count}
                </span>
              </label>
            ))}
          </div>

          <section className="divide-y divide-line rounded-2xl border border-line bg-surface">
            {rows.map((id) => {
              const isCaptain = id === captainA || id === captainB;
              const canLead = !common.includes(id);
              return (
                <div key={id} className="flex items-center gap-2 px-3 py-1.5">
                  <button
                    type="button"
                    disabled={!canLead}
                    aria-label={
                      isCaptain
                        ? `${nameOf(id)}, captain`
                        : `Make ${nameOf(id)} captain`
                    }
                    onClick={() => makeCaptain(id)}
                    className="flex min-h-12 min-w-0 flex-1 items-center gap-1.5 text-left"
                  >
                    <TruncText
                      lines={2}
                      className="text-[15px] font-semibold text-ink"
                    >
                      {nameOf(id)}
                    </TruncText>
                    {isCaptain ? (
                      <Crown
                        aria-hidden
                        className="h-4 w-4 shrink-0 text-accent-deep"
                      />
                    ) : null}
                  </button>
                  <SideChoice
                    name={nameOf(id)}
                    value={sideOf(id)}
                    onChange={(next) => moveTo(id, next)}
                  />
                </div>
              );
            })}
          </section>
          {errorBanner}
        </main>
        {footer(
          <Button
            type="button"
            fullWidth
            size="lg"
            disabled={!ready}
            onClick={enterStart}
          >
            {ready ? `Next · ${countA} v ${countB}` : "Each team needs 2"}
          </Button>,
        )}
      </div>
    );
  }

  // ── Screen 3: start ──
  const shownA = nameA || "Team A";
  const shownB = nameB || "Team B";
  if (tossOpen) {
    return (
      <div className="relative">
        <button
          type="button"
          aria-label="Close toss"
          onClick={() => setTossOpen(false)}
          className="fixed right-3 top-[calc(var(--safe-top)+0.75rem)] z-50 flex h-11 w-11 items-center justify-center rounded-xl bg-surface text-muted shadow-card"
        >
          <X className="h-5 w-5" />
        </button>
        <CoinToss
          sideA={{ name: shownA }}
          sideB={{ name: shownB }}
          busy={false}
          error={null}
          onPickBatting={(side) => {
            pickBattingSide(side);
            setTossOpen(false);
          }}
        />
      </div>
    );
  }

  const settingsLine = [
    format === "test" ? "Test" : "ODI",
    `${overs} overs`,
    format === "test"
      ? `${durationMinutes} min`
      : `${oversPerPlayer} overs each`,
    solo ? "1 batter" : "2 batters",
    !solo && lastBatsmanAlone ? "Last man" : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const battingIds = battingSide ? rosterOf(battingSide) : [];
  const bowlingIds = battingSide
    ? rosterOf(battingSide === "A" ? "B" : "A").filter(
        (id) => id !== striker && id !== nonStriker,
      )
    : [];
  const canStart =
    ready && !!battingSide && !!striker && !!bowler && (solo || !!nonStriker);

  function chooseOpener(kind: "striker" | "non" | "bowler", id: string) {
    if (kind === "bowler") setBowler(id);
    else {
      const current = kind === "striker" ? striker : nonStriker;
      const other = kind === "striker" ? nonStriker : striker;
      // Picking the other opener swaps the two.
      if (id === other) {
        setStriker(kind === "striker" ? id : current);
        setNonStriker(kind === "striker" ? current : id);
      } else if (kind === "striker") setStriker(id);
      else setNonStriker(id);
      if (bowler === id) {
        const nextBowler = rosterOf(battingSide === "A" ? "B" : "A").find(
          (x) => x !== id && x !== other,
        );
        setBowler(nextBowler ?? null);
      }
    }
    setOpenPick(null);
  }

  const openerRows = (
    [
      {
        kind: "striker",
        label: solo ? "Batter" : "Striker",
        value: striker,
        options: battingIds,
      },
      ...(solo
        ? []
        : [
            {
              kind: "non",
              label: "Non-striker",
              value: nonStriker,
              options: battingIds,
            },
          ]),
      {
        kind: "bowler",
        label: "Bowler",
        value: bowler,
        options: bowlingIds,
      },
    ] as Array<{
      kind: "striker" | "non" | "bowler";
      label: string;
      value: string | null;
      options: string[];
    }>
  );

  return (
    <div className="flex min-h-dvh flex-col bg-bg">
      {header}
      <main className="mx-auto w-full max-w-md flex-1 space-y-3 px-5 py-4 pb-32">
        <section className="divide-y divide-line rounded-2xl border border-line bg-surface">
          <button
            type="button"
            onClick={goToTeams}
            className="flex min-h-11 w-full items-center gap-2 px-4 py-2.5 text-left"
          >
            <span className="min-w-0 flex-1 truncate text-[15px] font-semibold text-ink">
              {shownA} v {shownB}
            </span>
            <span className="shrink-0 text-[13px] font-semibold text-muted">
              Change
            </span>
          </button>
          <div>
            <button
              type="button"
              aria-expanded={settingsOpen}
              onClick={() => {
                // The scorer's own changes win over defaults that load late.
                defaultsApplied.current = true;
                setSettingsOpen((v) => !v);
              }}
              className="flex min-h-11 w-full items-center gap-2 px-4 py-2.5 text-left"
            >
              <span className="min-w-0 flex-1 text-[13px] text-muted">
                {settingsLine}
              </span>
              <span className="shrink-0 text-[13px] font-semibold text-muted">
                {settingsOpen ? "Done" : "Change"}
              </span>
            </button>
            {settingsOpen ? (
              <div className="space-y-3 px-4 pb-4 pt-1">
                <SettingRow label="Format">
                  <Choice
                    options={[
                      { value: "limited", label: "ODI" },
                      { value: "test", label: "Test" },
                    ]}
                    value={format}
                    onChange={(v) => {
                      setFormat(v);
                      setOvers(getLastOvers(v));
                    }}
                  />
                </SettingRow>
                <SettingRow label="Overs">
                  <NumberField
                    aria-label="Overs per innings"
                    value={overs}
                    min={1}
                    max={200}
                    onChange={setOvers}
                  />
                </SettingRow>
                {format === "test" ? (
                  <SettingRow label="Minutes">
                    <NumberField
                      aria-label="Match time in minutes"
                      value={durationMinutes}
                      min={MIN_TEST_MINUTES}
                      max={MAX_TEST_MINUTES}
                      onChange={setDurationMinutes}
                    />
                  </SettingRow>
                ) : (
                  <SettingRow label="Overs each">
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        aria-label="Fewer overs each"
                        onClick={() =>
                          setOversPerPlayer((o) => Math.max(2, o - 2))
                        }
                        className="flex h-11 w-11 items-center justify-center rounded-xl border border-line text-muted active:bg-bg"
                      >
                        <Minus className="h-4 w-4" />
                      </button>
                      <span className="tabular w-8 text-center text-[15px] font-semibold text-ink">
                        {oversPerPlayer}
                      </span>
                      <button
                        type="button"
                        aria-label="More overs each"
                        onClick={() =>
                          setOversPerPlayer((o) => Math.min(20, o + 2))
                        }
                        className="flex h-11 w-11 items-center justify-center rounded-xl border border-line text-muted active:bg-bg"
                      >
                        <Plus className="h-4 w-4" />
                      </button>
                    </div>
                  </SettingRow>
                )}
                <SettingRow label="Batters">
                  <Choice
                    options={[
                      { value: "double", label: "Two" },
                      { value: "single", label: "One" },
                    ]}
                    value={battingMode}
                    onChange={setBattingMode}
                  />
                </SettingRow>
                {!solo ? (
                  <SettingRow label="Last man">
                    <Choice
                      options={[
                        { value: "yes", label: "Yes" },
                        { value: "no", label: "No" },
                      ]}
                      value={lastBatsmanAlone ? "yes" : "no"}
                      onChange={(v) => setLastBatsmanAlone(v === "yes")}
                    />
                  </SettingRow>
                ) : null}
                {grounds.length >= 2 && chosenGround ? (
                  <div className="flex flex-wrap gap-2">
                    {grounds.map((g) => (
                      <button
                        key={g._id}
                        type="button"
                        aria-pressed={g._id === chosenGround._id}
                        onClick={() => setGroundId(g._id)}
                        className={cn(
                          "min-h-11 rounded-lg border px-3 text-[13px] font-semibold",
                          g._id === chosenGround._id
                            ? "border-accent bg-accent-soft text-accent-deep"
                            : "border-line text-muted active:bg-bg",
                        )}
                      >
                        {g.name}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </section>

        <section className="rounded-2xl border border-line bg-surface p-4">
          <div className="mb-2.5 flex items-center justify-between gap-2">
            <p className="text-[15px] font-semibold text-ink">Who bats first?</p>
            <button
              type="button"
              onClick={() => setTossOpen(true)}
              className="-my-2 min-h-11 px-2 text-[13px] font-semibold text-muted underline underline-offset-4"
            >
              Toss
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                { side: "A", name: shownA },
                { side: "B", name: shownB },
              ] as const
            ).map(({ side, name }) => (
              <button
                key={side}
                type="button"
                aria-pressed={battingSide === side}
                onClick={() => pickBattingSide(side)}
                className={cn(
                  "min-h-12 min-w-0 truncate rounded-xl border px-3 text-[15px] font-semibold active:scale-[0.98]",
                  battingSide === side
                    ? "border-ink bg-ink text-bg"
                    : "border-line text-ink",
                )}
              >
                {name}
              </button>
            ))}
          </div>
        </section>

        {battingSide ? (
          <section className="divide-y divide-line rounded-2xl border border-line bg-surface">
            {openerRows.map((row) => (
              <div key={row.kind}>
                <button
                  type="button"
                  aria-expanded={openPick === row.kind}
                  onClick={() =>
                    setOpenPick(openPick === row.kind ? null : row.kind)
                  }
                  className="flex min-h-11 w-full items-center gap-2 px-4 py-2 text-left"
                >
                  <span className="w-24 shrink-0 text-[13px] text-muted">
                    {row.label}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[15px] font-semibold text-ink">
                    {row.value ? nameOf(row.value) : "—"}
                  </span>
                  <ChevronDown
                    aria-hidden
                    className={cn(
                      "h-4 w-4 shrink-0 text-faint transition-transform",
                      openPick === row.kind && "rotate-180",
                    )}
                  />
                </button>
                {openPick === row.kind ? (
                  <div className="flex flex-wrap gap-2 px-4 pb-3">
                    {row.options.map((id) => (
                      <button
                        key={id}
                        type="button"
                        aria-pressed={id === row.value}
                        onClick={() => chooseOpener(row.kind, id)}
                        className={cn(
                          "min-h-11 rounded-lg border px-4 text-[13px] font-semibold",
                          id === row.value
                            ? "border-ink bg-ink text-bg"
                            : "border-line text-ink active:bg-bg",
                        )}
                      >
                        {nameOf(id)}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
          </section>
        ) : null}
        {errorBanner}
      </main>
      {footer(
        <Button
          type="button"
          fullWidth
          size="lg"
          disabled={!canStart || busy}
          onClick={() => void onStart()}
        >
          {busy
            ? "Starting…"
            : !ready
              ? "Each team needs 2"
              : battingSide && !bowler
              ? "No bowler left on the other team"
              : "Start scoring"}
        </Button>,
      )}
    </div>
  );
}

function SettingRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <p className="text-[15px] font-semibold text-ink">{label}</p>
      {children}
    </div>
  );
}

function Choice<T extends string>({
  options,
  value,
  onChange,
}: {
  options: Array<{ value: T; label: string }>;
  value: T;
  onChange: (next: T) => void;
}) {
  return (
    <div className="flex rounded-xl border border-line p-1">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          aria-pressed={value === opt.value}
          onClick={() => onChange(opt.value)}
          className={
            value === opt.value
              ? "min-h-11 rounded-lg bg-ink px-4 text-[13px] font-semibold text-bg"
              : "min-h-11 rounded-lg px-4 text-[13px] font-semibold text-muted"
          }
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
