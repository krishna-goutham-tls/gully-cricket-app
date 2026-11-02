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
import { ArrowLeft } from "lucide-react";

type Side = "A" | "B";

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
  const createTournament = useMutation(api.tournaments.create);
  const addGuest = useMutation(api.players.addGuest);

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
  const [nameA, setNameA] = useState("");
  const [nameB, setNameB] = useState("");
  // Index 0 of a team is its captain, as in match setup.
  const [teamA, setTeamA] = useState<string[]>([]);
  const [teamB, setTeamB] = useState<string[]>([]);
  const [common, setCommon] = useState<string[]>([]);
  // Rows keep this order while players move, so a row never jumps from under
  // a thumb.
  const [rowOrder, setRowOrder] = useState<string[]>([]);
  const [split, setSplit] = useState(false);
  const [guestName, setGuestName] = useState("");
  const [guestBusy, setGuestBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const players = useMemo(() => pool ?? [], [pool]);
  const nameOf = useMemo(() => {
    const m = new Map(players.map((p) => [String(p.userId), p.displayName]));
    return (id: string) => m.get(id) ?? "Player";
  }, [players]);

  function autoTeamName(captainId: string | undefined) {
    return captainId ? `Team ${firstName(nameOf(captainId))}`.slice(0, 30) : "";
  }

  /** Every roster change goes through here, so an untouched name follows the captain. */
  function applyTeam(side: Side, next: string[]) {
    const prev = side === "A" ? teamA : teamB;
    const teamName = side === "A" ? nameA : nameB;
    const setTeam = side === "A" ? setTeamA : setTeamB;
    const setTeamName = side === "A" ? setNameA : setNameB;
    setTeam(next);
    if (!teamName || teamName === autoTeamName(prev[0])) {
      setTeamName(autoTeamName(next[0]));
    }
  }

  // Squads open already split by rank, the same split match setup makes. The
  // board must be here first, or everyone ranks at zero and splits by name.
  useEffect(() => {
    if (split || pool === undefined || board === undefined) return;
    const points = new Map(
      (board?.allRound ?? []).map((r) => [String(r.userId), r.points]),
    );
    const names = new Map(pool.map((p) => [String(p.userId), p.displayName]));
    const next = balanceTeams(
      pool.map((p) => String(p.userId)),
      (id) => ({ points: points.get(id) ?? 0, displayName: names.get(id) ?? "" }),
    );
    const auto = (id: string | undefined) =>
      id ? `Team ${firstName(names.get(id) ?? "")}`.slice(0, 30) : "";
    setTeamA(next.teamA);
    setTeamB(next.teamB);
    setCommon(next.common);
    setNameA(auto(next.teamA[0]));
    setNameB(auto(next.teamB[0]));
    setRowOrder([...next.teamA, ...next.common, ...next.teamB]);
    setSplit(true);
  }, [split, pool, board]);

  const countA = teamA.length + common.length;
  const countB = teamB.length + common.length;
  // Everyone on Both would be one team playing itself.
  const squadsOk = countA >= 2 && countB >= 2 && teamA.length + teamB.length > 0;
  const nameOk = name.trim().length >= 2;
  const ready = split && squadsOk && nameOk;

  function sideOf(id: string): SideValue {
    if (common.includes(id)) return "both";
    if (teamA.includes(id)) return "A";
    if (teamB.includes(id)) return "B";
    return null;
  }

  function moveTo(id: string, next: SideValue) {
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
    setRowOrder((l) => (l.includes(id) ? l : [...l, id]));
  }

  function makeCaptain(id: string) {
    if (teamA.includes(id)) applyTeam("A", [id, ...teamA.filter((x) => x !== id)]);
    if (teamB.includes(id)) applyTeam("B", [id, ...teamB.filter((x) => x !== id)]);
  }

  async function handleAddGuest() {
    const n = guestName.trim();
    if (!token || !activeOrgId || n.length < 2 || guestBusy) return;
    setGuestBusy(true);
    setError(null);
    try {
      const res = await addGuest({ token, orgId: activeOrgId, name: n });
      setGuestName("");
      // A new name joins the smaller team; one tap moves them.
      if (sideOf(res.userId) === null) moveTo(res.userId, countA <= countB ? "A" : "B");
    } catch (e) {
      setError(errorMessage(e, "Could not add that player"));
    } finally {
      setGuestBusy(false);
    }
  }

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
        sideAName: nameA.trim() || autoTeamName(squadA[0]) || "Team A",
        sideBName: nameB.trim() || autoTeamName(squadB[0]) || "Team B",
        sideASquadIds: squadA as Id<"users">[],
        sideBSquadIds: squadB as Id<"users">[],
        matchCount,
      });
      router.replace(`/tournaments/${res.tournamentId}`);
    } catch (e) {
      setError(errorMessage(e, "Could not create the series"));
      setBusy(false);
    }
  }

  const captainA = teamA[0] ?? common[0];
  const captainB = teamB[0] ?? common[0];
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
      <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-line bg-bg/95 px-5 pb-3 pt-[calc(var(--safe-top)+1rem)] backdrop-blur">
        <Link
          href="/tournaments"
          className="-ml-2 flex h-11 w-11 items-center justify-center rounded-xl text-muted active:bg-ink/[0.04]"
          aria-label="Back to series"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-xl font-semibold tracking-tight text-ink">
          New series
        </h1>
      </header>

      <main className="mx-auto w-full max-w-md flex-1 space-y-3 px-5 py-4 pb-36">
        {error ? (
          <p className="rounded-2xl border border-danger/20 bg-danger-soft px-4 py-2.5 text-[13px] text-danger">
            {error}
          </p>
        ) : null}

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
              { side: "A", value: nameA, setValue: setNameA, count: countA },
              { side: "B", value: nameB, setValue: setNameB, count: countB },
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

        {!split ? (
          <div className="h-40 animate-pulse rounded-2xl bg-ink/[0.04]" />
        ) : placed.length > 0 ? (
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

        <div className="flex gap-2">
          <input
            value={guestName}
            onChange={(e) => setGuestName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void handleAddGuest();
              }
            }}
            autoCapitalize="words"
            enterKeyHint="done"
            aria-label="Add a name"
            placeholder="Add a name"
            className="min-h-12 min-w-0 flex-1 rounded-xl border border-line bg-surface px-3 text-[16px] text-ink outline-none placeholder:text-faint focus:border-accent"
          />
          <Button
            variant="secondary"
            disabled={!split || guestBusy || guestName.trim().length < 2}
            onClick={() => void handleAddGuest()}
          >
            {guestBusy ? "Adding…" : "Add"}
          </Button>
        </div>

        {split && notPlaying.length > 0 ? (
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

      {/* .safe-bottom sets padding-bottom, so the visual gap lives on the inner
          wrapper — a py-* utility here would be overridden. */}
      <div className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 px-5 pt-3 backdrop-blur">
        <div className="mx-auto max-w-md pb-3">
          <Button
            type="button"
            fullWidth
            size="lg"
            disabled={!ready || busy}
            onClick={() => void onCreate()}
          >
            {busy
              ? "Creating…"
              : !split
                ? "Loading…"
                : !squadsOk
                  ? "Each team needs 2"
                  : !nameOk
                    ? "Name the series"
                    : `Create · ${countA} v ${countB}`}
          </Button>
        </div>
      </div>
    </div>
  );
}
