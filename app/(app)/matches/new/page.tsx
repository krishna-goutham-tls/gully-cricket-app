"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { useAuth } from "@/components/providers/AuthProvider";
import { PlayerMultiSelect } from "@/components/match/PlayerMultiSelect";
import {
  getLastFormat,
  getLastOvers,
  getLastOversPerPlayer,
  setLastFormat,
  setLastOvers,
  setLastOversPerPlayer,
} from "@/lib/session";
import { balanceTeams } from "@/lib/autoTeams";
import { cn, errorMessage } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Crown,
  History,
  Minus,
  Plus,
  Scale,
  Users,
} from "lucide-react";

type Step = "who" | "draft";
type Side = "A" | "B";
type DraftTarget = Side | "common";

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

export default function NewMatchPage() {
  const { token, activeOrgId } = useAuth();
  const router = useRouter();
  const pool = useQuery(
    api.players.listOrgPlayers,
    token && activeOrgId ? { token, orgId: activeOrgId } : "skip",
  );
  const recentMatches = useQuery(
    api.matches.list,
    token && activeOrgId ? { token, orgId: activeOrgId } : "skip",
  );
  const lastMatchId = recentMatches?.[0]?._id;
  const lastMatch = useQuery(
    api.matches.get,
    token && lastMatchId ? { token, matchId: lastMatchId } : "skip",
  );
  // Player level for "Auto form teams" — the same all-round board the Players
  // tab ranks on, so the teams it builds match what everyone can already see.
  const board = useQuery(
    api.stats.leaderboard,
    token && activeOrgId
      ? { token, orgId: activeOrgId, includeVisitorsAndJuniors: true }
      : "skip",
  );
  const createMatch = useMutation(api.matches.create);
  const addGuest = useMutation(api.players.addGuest);

  const [step, setStep] = useState<Step>("who");
  const [available, setAvailable] = useState<string[]>([]);
  const [nameA, setNameA] = useState("");
  const [nameB, setNameB] = useState("");
  const [teamA, setTeamA] = useState<string[]>([]);
  const [teamB, setTeamB] = useState<string[]>([]);
  const [common, setCommon] = useState<string[]>([]);
  const [activeTarget, setActiveTarget] = useState<DraftTarget>("A");
  const [overs, setOvers] = useState(() => getLastOvers());
  const [oversPerPlayer, setOversPerPlayer] = useState(() =>
    getLastOversPerPlayer(),
  );
  const [format, setFormat] = useState<"limited" | "test">(() =>
    getLastFormat(),
  );
  const [battingMode, setBattingMode] = useState<"double" | "single">("double");
  // Gully default: the last batter bats on alone. Off = proper cricket.
  const [lastBatsmanAlone, setLastBatsmanAlone] = useState(true);
  const [busy, setBusy] = useState(false);
  const [guestBusy, setGuestBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const players = useMemo(() => pool ?? [], [pool]);
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
  const hasForm = (board?.matchCount ?? 0) > 0;

  const assigned = new Set([...teamA, ...teamB, ...common]);
  const draftPool = available.filter((id) => !assigned.has(id));
  const countA = teamA.length + common.length;
  const countB = teamB.length + common.length;
  const ready = countA >= 2 && countB >= 2;

  // ── Step history ──
  // The steps are useState on one route, so a system back gesture would unmount
  // the page and wipe the draft. Each step forward pushes a history entry and
  // popstate walks the flow back instead of leaving it.
  const pushedRef = useRef(false);
  const leavingRef = useRef(false);

  useEffect(() => {
    const onPop = (e: PopStateEvent) => {
      if (leavingRef.current) return;
      const state = e.state as { boundaryStep?: Step } | null;
      const next = state?.boundaryStep === "draft" ? "draft" : "who";
      pushedRef.current = next === "draft";
      setStep(next);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  function enterDraft() {
    // Keep Next's own history state on the entry — only add our step marker.
    window.history.pushState(
      { ...window.history.state, boundaryStep: "draft" },
      "",
    );
    pushedRef.current = true;
    setStep("draft");
  }

  function goBack() {
    if (step === "draft") window.history.back();
  }

  /** Drop our step entry so back from the score pad leaves the create flow. */
  async function dropStepEntry() {
    if (!pushedRef.current) return;
    pushedRef.current = false;
    leavingRef.current = true;
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => finish(), 300);
      function finish() {
        window.removeEventListener("popstate", finish);
        clearTimeout(timer);
        resolve();
      }
      window.addEventListener("popstate", finish);
      window.history.back();
    });
  }

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

  function goToDraft() {
    // A player dropped on the availability step must not linger in a roster
    // built on an earlier pass through the draft.
    const here = new Set(available);
    applyTeam(
      "A",
      teamA.filter((id) => here.has(id)),
    );
    applyTeam(
      "B",
      teamB.filter((id) => here.has(id)),
    );
    setCommon((l) => l.filter((id) => here.has(id)));
    enterDraft();
  }

  /**
   * Build both sides from the leaderboard and drop the scorer on the draft
   * screen. It fills the same state a hand draft would, so nothing is locked
   * in — every player can still be moved, and the odd one out can be handed to
   * a side instead of playing for both.
   */
  function autoFormTeams({ enter }: { enter: boolean }) {
    const { teamA: a, teamB: b, common: c } = balanceTeams(available, levelOf);
    applyTeam("A", a);
    applyTeam("B", b);
    setCommon(c);
    setActiveTarget("A");
    if (enter) enterDraft();
  }

  function assign(userId: string) {
    // The highlighted target is sticky — uneven sides are the norm in gully
    // cricket, so it stays put until the scorer picks another card.
    if (activeTarget === "A") applyTeam("A", [...teamA, userId]);
    else if (activeTarget === "B") applyTeam("B", [...teamB, userId]);
    else setCommon((l) => [...l, userId]);
  }

  function unassign(userId: string) {
    if (teamA.includes(userId)) {
      applyTeam(
        "A",
        teamA.filter((id) => id !== userId),
      );
    }
    if (teamB.includes(userId)) {
      applyTeam(
        "B",
        teamB.filter((id) => id !== userId),
      );
    }
    setCommon((l) => l.filter((id) => id !== userId));
  }

  function makeCaptain(side: Side, userId: string) {
    const team = side === "A" ? teamA : teamB;
    applyTeam(side, [userId, ...team.filter((id) => id !== userId)]);
  }

  function reuseLastTeams() {
    if (!lastMatch) return;
    const sideA = lastMatch.sideAPlayers.map((p) => String(p.userId));
    const sideB = lastMatch.sideBPlayers.map((p) => String(p.userId));
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
    setFormat(lastMatch.format);
    setOvers(lastMatch.overs);
    setOversPerPlayer(lastMatch.oversPerPlayer);
    setBattingMode(lastMatch.battingMode);
    setActiveTarget("A");
    enterDraft();
  }

  async function onStart() {
    if (!token || !activeOrgId) return;
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
        overs,
        battingMode,
        format,
        oversPerPlayer: format === "limited" ? oversPerPlayer : undefined,
        lastBatsmanAlone,
      });
      setLastOvers(overs);
      setLastFormat(format);
      if (format === "limited") setLastOversPerPlayer(oversPerPlayer);
      await dropStepEntry();
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
          className="-ml-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-muted active:bg-ink/[0.04]"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
      ) : (
        <button
          type="button"
          onClick={goBack}
          className="-ml-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-muted active:bg-ink/[0.04]"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
      )}
      <h1 className="text-xl font-semibold tracking-tight text-ink">
        {step === "who" ? "Who’s playing today?" : "Build the teams"}
      </h1>
    </header>
  );

  const errorBanner = error ? (
    <p className="rounded-2xl border border-danger/20 bg-danger-soft px-4 py-3 text-sm text-danger">
      {error}
    </p>
  ) : null;

  // ── Step 1: availability ──
  if (step === "who") {
    return (
      <div className="flex min-h-dvh flex-col bg-bg">
        {header}
        <main className="mx-auto w-full max-w-md flex-1 space-y-4 px-5 py-4 pb-32">
          {lastMatch ? (
            <button
              type="button"
              onClick={reuseLastTeams}
              className="flex w-full items-center gap-3 rounded-3xl border border-accent/40 bg-accent-soft px-4 py-3.5 text-left active:scale-[0.98]"
            >
              <History className="h-5 w-5 shrink-0 text-accent-deep" />
              <span className="min-w-0">
                <span className="block text-[15px] font-semibold text-accent-deep">
                  Reuse last teams
                </span>
                <span className="block truncate text-[13px] text-muted">
                  {lastMatch.sideAName} vs {lastMatch.sideBName} ·{" "}
                  {whenLabel(lastMatch.createdAt)} — tap to edit &amp; go
                </span>
              </span>
            </button>
          ) : null}

          <section className="rounded-3xl border border-line bg-surface p-4">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-[15px] font-medium text-ink">
                Tap everyone who’s here
              </p>
              <span className="tabular shrink-0 rounded-full bg-bg px-2.5 py-1 text-xs font-semibold text-muted">
                {available.length}
              </span>
            </div>
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
        <div className="safe-bottom fixed inset-x-0 bottom-0 border-t border-line bg-surface/95 px-5 pt-3 backdrop-blur">
          <div className="mx-auto max-w-md space-y-2 pb-3">
            <Button
              type="button"
              variant="secondary"
              fullWidth
              disabled={available.length < 4 || !levelsReady}
              onClick={() => autoFormTeams({ enter: true })}
            >
              <Scale className="h-4 w-4 shrink-0 text-accent-deep" />
              <span className="min-w-0 text-left">
                <span className="block text-[15px] font-semibold text-ink">
                  Auto form teams
                </span>
                <span className="block truncate text-[13px] font-normal text-muted">
                  {!levelsReady
                    ? "Reading the leaderboard…"
                    : hasForm
                      ? "Balanced by leaderboard rank"
                      : "No stats yet — splits evenly"}
                </span>
              </span>
            </Button>
            <Button
              type="button"
              fullWidth
              size="lg"
              disabled={available.length < 4}
              onClick={goToDraft}
            >
              {available.length < 4
                ? "Pick at least 4 players"
                : `Next — build the teams (${available.length} playing)`}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ── Step 2: draft + rules ──
  return (
    <div className="flex min-h-dvh flex-col bg-bg">
      {header}
      <main className="mx-auto w-full max-w-md flex-1 space-y-4 px-5 py-4 pb-32">
        {draftPool.length > 0 ? (
          <p className="text-sm text-muted">
            Tap a player to add them to the highlighted team.
          </p>
        ) : null}
        <button
          type="button"
          disabled={available.length < 4 || !levelsReady}
          onClick={() => autoFormTeams({ enter: false })}
          className="flex min-h-11 w-full items-center gap-2 rounded-2xl border border-line bg-surface px-4 text-left transition active:scale-[0.98] disabled:opacity-40"
        >
          <Scale className="h-4 w-4 shrink-0 text-accent-deep" />
          <span className="min-w-0">
            <span className="text-[14px] font-semibold text-ink">
              Auto form teams
            </span>
            <span className="ml-1.5 text-[12px] text-muted">
              {!levelsReady
                ? "reading the leaderboard…"
                : hasForm
                  ? "· redraws both sides by rank"
                  : "· no stats yet, splits evenly"}
            </span>
          </span>
        </button>

        <p className="text-sm text-muted">
          First player on a side is its captain — tap{" "}
          <Crown className="inline h-3.5 w-3.5 align-text-bottom text-faint" />{" "}
          to change.
        </p>

        <div className="grid grid-cols-2 gap-2">
          {(
            [
              {
                side: "A" as const,
                name: nameA,
                setName: setNameA,
                team: teamA,
                count: countA,
              },
              {
                side: "B" as const,
                name: nameB,
                setName: setNameB,
                team: teamB,
                count: countB,
              },
            ]
          ).map(({ side, name, setName, team, count }) => (
            <section
              key={side}
              onClick={() => setActiveTarget(side)}
              className={cn(
                "rounded-3xl border bg-surface p-3 transition",
                activeTarget === side
                  ? "border-accent ring-2 ring-accent/40"
                  : "border-line",
              )}
            >
              <div className="mb-2 flex min-h-11 items-center justify-between gap-1">
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={`Team ${side}`}
                  maxLength={30}
                  autoCapitalize="words"
                  enterKeyHint="done"
                  className="min-w-0 flex-1 bg-transparent py-2 text-[15px] font-semibold text-ink outline-none placeholder:text-faint"
                />
                <span className="tabular shrink-0 rounded-full bg-bg px-2 py-0.5 text-xs font-semibold text-muted">
                  {count}
                </span>
              </div>
              <div className="space-y-1">
                {count === 0 ? (
                  <p className="px-2.5 py-2 text-xs text-faint">
                    Tap players to add
                  </p>
                ) : null}
                {team.map((id, idx) => (
                  <div
                    key={id}
                    className="flex items-center rounded-xl bg-bg pl-2.5"
                  >
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        unassign(id);
                      }}
                      className="min-h-11 min-w-0 flex-1 truncate py-2 pr-1 text-left text-[13px] font-medium text-ink"
                    >
                      {nameOf(id)}
                    </button>
                    {idx === 0 ? (
                      <span className="flex h-11 w-11 shrink-0 items-center justify-center text-xs font-bold text-accent-deep">
                        C
                      </span>
                    ) : (
                      <button
                        type="button"
                        aria-label={`Make ${nameOf(id)} captain`}
                        onClick={(e) => {
                          e.stopPropagation();
                          makeCaptain(side, id);
                        }}
                        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-faint active:text-accent-deep"
                      >
                        <Crown className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                ))}
                {common.map((id) => (
                  <button
                    key={id}
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      unassign(id);
                    }}
                    className="flex min-h-11 w-full items-center justify-between gap-1 rounded-xl bg-accent-soft px-2.5 py-2 text-left text-[13px] font-medium text-accent-deep"
                  >
                    <span className="truncate">{nameOf(id)}</span>
                    <span className="shrink-0 rounded-full bg-accent px-1.5 py-0.5 text-xs font-bold text-ink">
                      both
                    </span>
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>

        <button
          type="button"
          onClick={() => setActiveTarget("common")}
          className={cn(
            "flex w-full items-center gap-2.5 rounded-3xl border px-4 py-3 text-left transition",
            activeTarget === "common"
              ? "border-accent bg-accent-soft ring-2 ring-accent/40"
              : "border-dashed border-line bg-surface",
          )}
        >
          <Users className="h-4 w-4 shrink-0 text-accent-deep" />
          <span className="min-w-0">
            <span className="block text-[14px] font-semibold text-ink">
              Plays both sides
            </span>
            <span className="block text-[12px] text-muted">
              Odd numbers? Add the common player here — they join both teams.
            </span>
          </span>
        </button>

        {draftPool.length > 0 ? (
          <section className="rounded-3xl border border-line bg-surface p-4">
            <p className="mb-2.5 text-[13px] font-medium text-muted">
              Still to pick ({draftPool.length})
            </p>
            <div className="flex flex-wrap gap-2">
              {draftPool.map((id) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => assign(id)}
                  className="flex min-h-11 items-center rounded-full border border-line bg-bg px-4 text-[13px] font-medium text-ink active:scale-95 active:border-accent"
                >
                  {nameOf(id)}
                </button>
              ))}
            </div>
          </section>
        ) : null}

        <div className="rounded-3xl border border-line bg-surface p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[15px] font-medium text-ink">Format</p>
            <div className="flex rounded-2xl border border-line p-1">
              {(
                [
                  { id: "limited", label: "ODI" },
                  { id: "test", label: "Test" },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setFormat(opt.id)}
                  className={
                    format === opt.id
                      ? "min-h-11 rounded-xl bg-ink px-4 text-[13px] font-semibold text-bg"
                      : "min-h-11 rounded-xl px-4 text-[13px] font-semibold text-muted"
                  }
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
          <p className="mt-2 text-[13px] leading-relaxed text-muted">
            {format === "limited"
              ? `${oversPerPlayer} over${oversPerPlayer === 1 ? "" : "s"} each to bat & bowl · common players ${oversPerPlayer / 2} a side.`
              : "Two innings a side — follow-on and all. No over quotas."}
          </p>
        </div>

        <div className="flex items-center justify-between gap-3 rounded-3xl border border-line bg-surface p-4">
          <p className="text-[15px] font-medium text-ink">Overs per innings</p>
          <input
            type="number"
            inputMode="numeric"
            enterKeyHint="done"
            min={1}
            max={200}
            step={1}
            value={overs}
            onChange={(e) => {
              const n = parseInt(e.target.value, 10);
              if (e.target.value === "") {
                setOvers(1);
                return;
              }
              if (!Number.isInteger(n)) return;
              setOvers(Math.min(200, Math.max(1, n)));
            }}
            className="tabular h-11 w-20 rounded-xl border border-line bg-bg px-3 text-center text-lg font-semibold text-ink outline-none focus:border-ink"
          />
        </div>

        {format === "limited" ? (
          <div className="rounded-3xl border border-line bg-surface p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[15px] font-medium text-ink">
                  Overs per player
                </p>
                <p className="mt-0.5 text-xs text-muted">
                  Bat &amp; bowl cap · common players get half.
                </p>
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  aria-label="Fewer overs per player"
                  onClick={() => setOversPerPlayer((o) => Math.max(2, o - 2))}
                  className="flex h-11 w-11 items-center justify-center rounded-xl border border-line text-muted active:bg-bg"
                >
                  <Minus className="h-4 w-4" />
                </button>
                <span className="tabular w-8 text-center text-lg font-semibold text-ink">
                  {oversPerPlayer}
                </span>
                <button
                  type="button"
                  aria-label="More overs per player"
                  onClick={() => setOversPerPlayer((o) => Math.min(20, o + 2))}
                  className="flex h-11 w-11 items-center justify-center rounded-xl border border-line text-muted active:bg-bg"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        ) : null}

        <div className="rounded-3xl border border-line bg-surface p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[15px] font-medium text-ink">Batters at a time</p>
            <div className="flex rounded-2xl border border-line p-1">
              {(
                [
                  { mode: "double", label: "Two" },
                  { mode: "single", label: "One" },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.mode}
                  type="button"
                  onClick={() => setBattingMode(opt.mode)}
                  className={
                    battingMode === opt.mode
                      ? "min-h-11 rounded-xl bg-ink px-4 text-[13px] font-semibold text-bg"
                      : "min-h-11 rounded-xl px-4 text-[13px] font-semibold text-muted"
                  }
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
          {battingMode === "single" ? (
            <p className="mt-2 text-[13px] leading-relaxed text-muted">
              One batter at the crease — no non-striker, batters come in one by
              one and everyone gets to bat.
            </p>
          ) : null}
        </div>

        {/* Only meaningful with two batters — single mode is last-man by
            definition, so the toggle hides rather than lying. */}
        {battingMode === "double" ? (
          <div className="rounded-3xl border border-line bg-surface p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-[15px] font-medium text-ink">
                Last man stands
              </p>
              <div className="flex rounded-2xl border border-line p-1">
                {(
                  [
                    { value: true, label: "Yes" },
                    { value: false, label: "No" },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.label}
                    type="button"
                    onClick={() => setLastBatsmanAlone(opt.value)}
                    className={
                      lastBatsmanAlone === opt.value
                        ? "min-h-11 rounded-xl bg-ink px-4 text-[13px] font-semibold text-bg"
                        : "min-h-11 rounded-xl px-4 text-[13px] font-semibold text-muted"
                    }
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
            <p className="mt-2 text-[13px] leading-relaxed text-muted">
              {lastBatsmanAlone
                ? "The last batter carries on alone until he's out."
                : "Proper cricket — the innings ends when one batter is left."}
            </p>
          </div>
        ) : null}

        {errorBanner}
      </main>

      <div className="safe-bottom fixed inset-x-0 bottom-0 border-t border-line bg-surface/95 px-5 pt-3 backdrop-blur">
        <div className="mx-auto max-w-md pb-3">
          <Button
            type="button"
            fullWidth
            size="lg"
            disabled={!ready || busy}
            onClick={() => void onStart()}
          >
            {busy
              ? "Starting…"
              : ready
                ? `Start match — ${countA} v ${countB}`
                : "Each team needs at least 2"}
          </Button>
        </div>
      </div>
    </div>
  );
}
