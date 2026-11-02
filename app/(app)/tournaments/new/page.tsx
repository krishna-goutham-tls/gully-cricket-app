"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import {
  DEFAULT_TEST_MINUTES,
  MAX_TEST_MINUTES,
  MIN_TEST_MINUTES,
} from "@/convex/lib/clock";
import { useAuth } from "@/components/providers/AuthProvider";
import { PlayerMultiSelect } from "@/components/match/PlayerMultiSelect";
import { PlayerSideRow } from "@/components/match/PlayerSideRow";
import { Choice, SettingRow, Stepper } from "@/components/match/SettingRow";
import { type SideValue } from "@/components/match/SideChoice";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { NumberField } from "@/components/ui/NumberField";
import { balanceTeams } from "@/lib/autoTeams";
import { errorMessage } from "@/lib/utils";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, History } from "lucide-react";

type Step = "who" | "teams";

function firstName(full: string) {
  return full.trim().split(/\s+/)[0] ?? full;
}

export default function NewTournamentPage() {
  const { token, activeOrgId, features, featuresLive } = useAuth();
  const testsOn = features.testMatches;
  const router = useRouter();
  const pool = useQuery(
    api.players.listOrgPlayers,
    token && activeOrgId ? { token, orgId: activeOrgId } : "skip",
  );
  // The same all-round board match setup splits teams on.
  const board = useQuery(
    api.stats.leaderboard,
    token && activeOrgId
      ? { token, orgId: activeOrgId, includeVisitorsAndJuniors: true }
      : "skip",
  );
  const recentMatches = useQuery(
    api.matches.list,
    token && activeOrgId && testsOn ? { token, orgId: activeOrgId } : "skip",
  );
  const pastSeries = useQuery(
    api.tournaments.list,
    token && activeOrgId ? { token, orgId: activeOrgId } : "skip",
  );
  const lastSeriesId = pastSeries?.[0]?._id;
  const lastSeries = useQuery(
    api.tournaments.get,
    token && lastSeriesId ? { token, tournamentId: lastSeriesId } : "skip",
  );
  const createTournament = useMutation(api.tournaments.create);
  const addGuest = useMutation(api.players.addGuest);

  const [step, setStep] = useState<Step>("who");
  const [available, setAvailable] = useState<string[]>([]);
  const [name, setName] = useState("");
  const [format, setFormat] = useState<"limited" | "test">("limited");
  // Test matches off: no format choice, every series is limited overs. On: the
  // series starts in the format of the community's last match, Test when there
  // is none. Waits for the live switches, since a cached one can read Test
  // matches as off when it is on. A tap on the format wins.
  const formatPicked = useRef(false);
  useEffect(() => {
    if (!featuresLive) return;
    if (!testsOn) {
      setFormat("limited");
      return;
    }
    if (formatPicked.current || recentMatches === undefined) return;
    formatPicked.current = true;
    const last = recentMatches.find((m) => m.status !== "abandoned");
    setFormat(last?.format === "limited" ? "limited" : "test");
  }, [featuresLive, testsOn, recentMatches]);
  const [durationMinutes, setDurationMinutes] = useState(DEFAULT_TEST_MINUTES);
  const [overs, setOvers] = useState(20);
  const [oversPerPlayer, setOversPerPlayer] = useState(2);
  const [battingMode, setBattingMode] = useState<"double" | "single">("double");
  const [matchCount, setMatchCount] = useState(5);
  const [settingsOpen, setSettingsOpen] = useState(false);
  // A typed team name, or null to follow the captain ("Team Ravi").
  const [typedA, setTypedA] = useState<string | null>(null);
  const [typedB, setTypedB] = useState<string | null>(null);
  // Index 0 of a team is its captain, as in match setup.
  const [teamA, setTeamA] = useState<string[]>([]);
  const [teamB, setTeamB] = useState<string[]>([]);
  const [common, setCommon] = useState<string[]>([]);
  // Rows keep this order while players move, so a row never jumps from under
  // a thumb.
  const [rowOrder, setRowOrder] = useState<string[]>([]);
  const [guestBusy, setGuestBusy] = useState(false);
  const [busy, setBusy] = useState(false);
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
    return (id: string) => ({ points: points.get(id) ?? 0, displayName: nameOf(id) });
  }, [board, nameOf]);
  // The board must be here first, or everyone ranks at zero and splits by name.
  const levelsReady = board !== undefined;

  // ── Step history ──
  // Both steps live on one route, so a system back gesture would leave the page
  // and wipe the draft. Teams pushes a history entry; back returns to Who.
  const pushed = useRef(false);
  const leaving = useRef(false);
  const stepAt = useRef(0);
  useEffect(() => {
    const onPop = () => {
      if (leaving.current) return;
      pushed.current = false;
      setStep("who");
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  function enterTeams() {
    stepAt.current = Date.now();
    if (!pushed.current) {
      window.history.pushState({ ...window.history.state, seriesStep: "teams" }, "");
      pushed.current = true;
    }
    setStep("teams");
  }

  /** Drop the Teams entry, so back from the new series leaves this flow. */
  async function dropStepEntry() {
    if (!pushed.current) return;
    pushed.current = false;
    leaving.current = true;
    await new Promise<void>((resolve) => {
      const timer = setTimeout(finish, 300);
      function finish() {
        window.removeEventListener("popstate", finish);
        clearTimeout(timer);
        resolve();
      }
      window.addEventListener("popstate", finish);
      window.history.back();
    });
  }

  /** One tap, one step: a double tap must not fall through to the next screen. */
  const tooSoon = () => Date.now() - stepAt.current < 400;

  function toggleAvailable(userId: string) {
    setAvailable((l) =>
      l.includes(userId) ? l.filter((id) => id !== userId) : [...l, userId],
    );
  }

  async function handleAddGuest(guest: string, phone: string) {
    if (!token || !activeOrgId) return;
    setGuestBusy(true);
    setError(null);
    try {
      const res = await addGuest({
        token,
        orgId: activeOrgId,
        name: guest,
        phone: phone || undefined,
      });
      setAvailable((l) => (l.includes(res.userId) ? l : [...l, res.userId]));
    } catch (e) {
      setError(errorMessage(e, "Could not add that player"));
    } finally {
      setGuestBusy(false);
    }
  }

  /**
   * Teams open already split by rank. Coming back after a change keeps every
   * move: someone who left drops out, someone new joins the smaller team.
   */
  function goToTeams() {
    if (tooSoon() || available.length === 0) return;
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
    setTeamA(nextA);
    setTeamB(nextB);
    setCommon(nextCommon);
    setRowOrder([...nextA, ...nextCommon, ...nextB]);
    enterTeams();
  }

  /** The last series' squads and settings, straight to Teams. */
  function reuseLastSeries() {
    if (!lastSeries || !pool || tooSoon()) return;
    // Someone who has left the community cannot play again.
    const inCommunity = new Set(pool.map((p) => String(p.userId)));
    const sideA = lastSeries.sideA.map((p) => String(p.userId)).filter((id) => inCommunity.has(id));
    const sideB = lastSeries.sideB.map((p) => String(p.userId)).filter((id) => inCommunity.has(id));
    const inBoth = sideA.filter((id) => sideB.includes(id));
    const restA = sideA.filter((id) => !inBoth.includes(id));
    const restB = sideB.filter((id) => !inBoth.includes(id));
    setTeamA(restA);
    setTeamB(restB);
    setCommon(inBoth);
    setRowOrder([...restA, ...inBoth, ...restB]);
    setAvailable(Array.from(new Set([...sideA, ...sideB])));
    // A name that only ever named the captain follows the new captain.
    const carry = (stored: string, captain: { displayName: string } | undefined) =>
      captain && stored === `Team ${firstName(captain.displayName)}` ? null : stored;
    setTypedA(carry(lastSeries.sideAName, lastSeries.sideA[0]));
    setTypedB(carry(lastSeries.sideBName, lastSeries.sideB[0]));
    if (lastSeries.format === "limited" || testsOn) {
      formatPicked.current = true;
      setFormat(lastSeries.format);
    }
    setOvers(lastSeries.oversPerInnings);
    if (lastSeries.oversPerPlayer) setOversPerPlayer(lastSeries.oversPerPlayer);
    setBattingMode(lastSeries.battingMode ?? "double");
    if (lastSeries.matchDurationMinutes) setDurationMinutes(lastSeries.matchDurationMinutes);
    setMatchCount(lastSeries.matchCount);
    enterTeams();
  }

  function sideOf(id: string): SideValue {
    if (common.includes(id)) return "both";
    if (teamA.includes(id)) return "A";
    if (teamB.includes(id)) return "B";
    return null;
  }

  // Updates read the latest lists, never the ones from the last render.
  function moveTo(id: string, next: SideValue) {
    const place = (side: SideValue) => (l: string[]) =>
      next === side ? [...l.filter((x) => x !== id), id] : l.filter((x) => x !== id);
    setTeamA(place("A"));
    setTeamB(place("B"));
    setCommon(place("both"));
    setRowOrder((l) => (l.includes(id) ? l : [...l, id]));
    setAvailable((l) =>
      next === null ? l.filter((x) => x !== id) : l.includes(id) ? l : [...l, id],
    );
  }

  function makeCaptain(id: string) {
    const lead = (l: string[]) => (l.includes(id) ? [id, ...l.filter((x) => x !== id)] : l);
    setTeamA(lead);
    setTeamB(lead);
  }

  const countA = teamA.length + common.length;
  const countB = teamB.length + common.length;
  // Everyone on Both would be one team playing itself.
  const squadsOk = countA >= 2 && countB >= 2 && teamA.length + teamB.length > 0;
  const nameOk = name.trim().length >= 2;
  const ready = squadsOk && nameOk;
  const captainA = teamA[0] ?? common[0];
  const captainB = teamB[0] ?? common[0];
  const autoName = (id: string | undefined) =>
    id ? `Team ${firstName(nameOf(id))}`.slice(0, 30) : "";
  const shownA = typedA ?? autoName(captainA);
  const shownB = typedB ?? autoName(captainB);

  async function onCreate() {
    if (!token || !activeOrgId || !ready) return;
    setBusy(true);
    setError(null);
    try {
      const squadA = [...teamA, ...common];
      const squadB = [...teamB, ...common];
      const res = await createTournament({
        token,
        orgId: activeOrgId,
        name: name.trim(),
        format,
        oversPerInnings: Math.min(200, Math.max(1, overs)),
        oversPerPlayer: format === "limited" ? oversPerPlayer : undefined,
        battingMode,
        matchDurationMinutes:
          format === "test"
            ? Math.min(
                MAX_TEST_MINUTES,
                Math.max(MIN_TEST_MINUTES, durationMinutes),
              )
            : undefined,
        sideAName: shownA.trim() || autoName(squadA[0]) || "Team A",
        sideBName: shownB.trim() || autoName(squadB[0]) || "Team B",
        sideASquadIds: squadA as Id<"users">[],
        sideBSquadIds: squadB as Id<"users">[],
        matchCount,
      });
      await dropStepEntry();
      router.replace(`/tournaments/${res.tournamentId}`);
    } catch (e) {
      leaving.current = false;
      setError(errorMessage(e, "Could not create the series"));
      setBusy(false);
    }
  }

  const header = (
    <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-line bg-bg/95 px-5 pb-3 pt-[calc(var(--safe-top)+1rem)] backdrop-blur">
      {step === "who" ? (
        <Link
          href="/tournaments"
          className="-ml-2 flex h-11 w-11 items-center justify-center rounded-xl text-muted active:bg-ink/[0.04]"
          aria-label="Back to series"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
      ) : (
        <button
          type="button"
          aria-label="Back"
          onClick={() => window.history.back()}
          className="-ml-2 flex h-11 w-11 items-center justify-center rounded-xl text-muted active:bg-ink/[0.04]"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
      )}
      <h1 className="text-xl font-semibold tracking-tight text-ink">
        {step === "who" ? "Who’s in this series?" : "Teams"}
      </h1>
    </header>
  );

  const errorBanner = error ? (
    <p className="rounded-2xl border border-danger/20 bg-danger-soft px-4 py-2.5 text-[13px] text-danger">
      {error}
    </p>
  ) : null;

  /* .safe-bottom sets padding-bottom, so the visual gap lives on the inner
     wrapper — a py-* utility here would be overridden. */
  const footer = (button: React.ReactNode) => (
    <div className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 px-5 pt-3 backdrop-blur">
      <div className="mx-auto max-w-md pb-3">{button}</div>
    </div>
  );

  // ── Step 1: who's in ──
  if (step === "who") {
    const enough = available.length >= 4;
    return (
      <div className="flex min-h-dvh flex-col bg-bg">
        {header}
        <main className="mx-auto w-full max-w-md flex-1 space-y-4 px-5 py-4 pb-36">
          {lastSeries && pool ? (
            <button
              type="button"
              onClick={reuseLastSeries}
              className="flex w-full items-center gap-3 rounded-2xl border border-accent/40 bg-accent-soft px-4 py-3.5 text-left active:scale-[0.98]"
            >
              <History className="h-5 w-5 shrink-0 text-accent-deep" />
              <span className="min-w-0">
                <span className="block text-[15px] font-semibold text-accent-deep">
                  Reuse last series
                </span>
                <span className="block truncate text-[13px] text-muted">
                  {lastSeries.sideAName} vs {lastSeries.sideBName}
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

  // ── Step 2: teams, already split ──
  const placed = [
    ...rowOrder,
    ...[...teamA, ...common, ...teamB].filter((id) => !rowOrder.includes(id)),
  ].filter((id) => sideOf(id) !== null);
  const notPlaying = players
    .map((p) => String(p.userId))
    .filter((id) => sideOf(id) === null);

  const solo = battingMode === "single";
  const settingsLine = [
    testsOn ? (format === "test" ? "Test" : "ODI") : null,
    `${overs} overs`,
    format === "test" ? `${durationMinutes} min` : `${oversPerPlayer} overs each`,
    solo ? "1 batter" : "2 batters",
    `${matchCount} match${matchCount === 1 ? "" : "es"}`,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="flex min-h-dvh flex-col bg-bg">
      {header}
      <main className="mx-auto w-full max-w-md flex-1 space-y-3 px-5 py-4 pb-36">
        {errorBanner}

        <Input
          aria-label="Series name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
          }}
          autoCapitalize="words"
          enterKeyHint="done"
          maxLength={40}
          placeholder="Series name"
        />

        <div className="grid grid-cols-2 gap-2">
          {(
            [
              { side: "A", value: shownA, setValue: setTypedA, count: countA },
              { side: "B", value: shownB, setValue: setTypedB, count: countB },
            ] as const
          ).map(({ side, value, setValue, count }) => (
            <label
              key={side}
              className="flex min-h-11 min-w-0 items-center gap-2 rounded-2xl border border-line bg-surface px-3"
            >
              <span className="shrink-0 text-[13px] font-semibold text-accent-deep">
                {side}
              </span>
              <input
                value={value}
                onChange={(e) => setValue(e.target.value)}
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

        {placed.length > 0 ? (
          <section className="divide-y divide-line rounded-2xl border border-line bg-surface px-3">
            {placed.map((id) => (
              <PlayerSideRow
                key={id}
                className="py-1.5"
                name={nameOf(id)}
                value={sideOf(id)}
                onChange={(next) => moveTo(id, next)}
                captain={id === captainA || id === captainB}
                canLead={!common.includes(id)}
                onMakeCaptain={() => makeCaptain(id)}
                onRemove={() => moveTo(id, null)}
                removeLabel={`Take ${nameOf(id)} out of the series`}
              />
            ))}
          </section>
        ) : null}

        <section className="rounded-2xl border border-line bg-surface">
          <button
            type="button"
            aria-expanded={settingsOpen}
            onClick={() => setSettingsOpen((v) => !v)}
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
              {testsOn ? (
                <SettingRow label="Format">
                  <Choice
                    options={[
                      { value: "limited", label: "ODI" },
                      { value: "test", label: "Test" },
                    ]}
                    value={format}
                    onChange={(v) => {
                      formatPicked.current = true;
                      setFormat(v);
                    }}
                  />
                </SettingRow>
              ) : null}
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
                  <Stepper
                    value={oversPerPlayer}
                    decLabel="Fewer overs each"
                    incLabel="More overs each"
                    onDec={() => setOversPerPlayer((o) => Math.max(2, o - 2))}
                    onInc={() => setOversPerPlayer((o) => Math.min(20, o + 2))}
                  />
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
              <SettingRow label="Matches">
                <Stepper
                  value={matchCount}
                  decLabel="Fewer matches"
                  incLabel="More matches"
                  onDec={() => setMatchCount((n) => Math.max(1, n - 1))}
                  onInc={() => setMatchCount((n) => Math.min(50, n + 1))}
                />
              </SettingRow>
            </div>
          ) : null}
        </section>

        {notPlaying.length > 0 ? (
          <section>
            <p className="px-1 pb-1 text-[11px] font-semibold uppercase tracking-wide text-faint">
              Not playing
            </p>
            <div className="divide-y divide-line rounded-2xl border border-line bg-surface px-3">
              {notPlaying.map((id) => (
                <PlayerSideRow
                  key={id}
                  className="py-1.5"
                  name={nameOf(id)}
                  value={null}
                  onChange={(next) => moveTo(id, next)}
                />
              ))}
            </div>
          </section>
        ) : null}
      </main>

      {footer(
        <Button
          type="button"
          fullWidth
          size="lg"
          disabled={!ready || busy}
          onClick={() => void onCreate()}
        >
          {busy
            ? "Creating…"
            : !squadsOk
              ? "Each team needs 2"
              : !nameOk
                ? "Name the series"
                : `Create · ${countA} v ${countB}`}
        </Button>,
      )}
    </div>
  );
}
