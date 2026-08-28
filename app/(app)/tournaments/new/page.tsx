"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { useAuth } from "@/components/providers/AuthProvider";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { cn, errorMessage } from "@/lib/utils";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Crown, Minus, Plus, Star, Users, X } from "lucide-react";

type DraftTarget = "A" | "B" | "common";

export default function NewTournamentPage() {
  const { token, activeOrgId } = useAuth();
  const router = useRouter();
  const pool = useQuery(
    api.players.listOrgPlayers,
    token && activeOrgId ? { token, orgId: activeOrgId } : "skip",
  );
  const createTournament = useMutation(api.tournaments.create);
  const addGuest = useMutation(api.players.addGuest);

  const [name, setName] = useState("");
  const [format, setFormat] = useState<"limited" | "test">("test");
  const [overs, setOvers] = useState(20);
  const [oversPerPlayer, setOversPerPlayer] = useState(2);
  const [battingMode, setBattingMode] = useState<"double" | "single">("double");
  const [matchCount, setMatchCount] = useState(5);
  const [nameA, setNameA] = useState("");
  const [nameB, setNameB] = useState("");
  const [teamA, setTeamA] = useState<string[]>([]);
  const [teamB, setTeamB] = useState<string[]>([]);
  const [common, setCommon] = useState<string[]>([]);
  const [coreA, setCoreA] = useState<Set<string>>(new Set());
  const [coreB, setCoreB] = useState<Set<string>>(new Set());
  // Chosen captain per side. Null = fall back to the first player picked, which
  // is what drives the auto team name; a crown lets the scorer override that.
  const [captainA, setCaptainA] = useState<string | null>(null);
  const [captainB, setCaptainB] = useState<string | null>(null);
  const [activeTarget, setActiveTarget] = useState<DraftTarget>("A");
  const [guestName, setGuestName] = useState("");
  const [guestBusy, setGuestBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const players = useMemo(() => pool ?? [], [pool]);
  const nameOf = useMemo(() => {
    const m = new Map(players.map((p) => [String(p.userId), p.displayName]));
    return (id: string) => m.get(id) ?? "Player";
  }, [players]);

  const assigned = useMemo(
    () => new Set([...teamA, ...teamB, ...common]),
    [teamA, teamB, common],
  );
  const draftPool = players
    .map((p) => String(p.userId))
    .filter((id) => !assigned.has(id));
  const squadA = useMemo(() => [...teamA, ...common], [teamA, common]);
  const squadB = useMemo(() => [...teamB, ...common], [teamB, common]);
  // The effective captain is the chosen one if still on the side, else the
  // first player picked. This id is placed at index 0 of the squad on create
  // (index 0 is the captain everywhere downstream) and names the team.
  const capA = useMemo(
    () => (captainA && squadA.includes(captainA) ? captainA : squadA[0]),
    [captainA, squadA],
  );
  const capB = useMemo(
    () => (captainB && squadB.includes(captainB) ? captainB : squadB[0]),
    [captainB, squadB],
  );
  const ready =
    name.trim().length >= 2 && squadA.length >= 2 && squadB.length >= 2;

  /** Target stays put: squads are rarely built by alternating picks. */
  function assign(userId: string) {
    if (activeTarget === "A") setTeamA((l) => [...l, userId]);
    else if (activeTarget === "B") setTeamB((l) => [...l, userId]);
    else setCommon((l) => [...l, userId]);
  }

  function unassign(userId: string) {
    setTeamA((l) => l.filter((id) => id !== userId));
    setTeamB((l) => l.filter((id) => id !== userId));
    setCommon((l) => l.filter((id) => id !== userId));
    setCoreA((s) => {
      const n = new Set(s);
      n.delete(userId);
      return n;
    });
    setCoreB((s) => {
      const n = new Set(s);
      n.delete(userId);
      return n;
    });
  }

  function toggleCore(side: "A" | "B", id: string) {
    const setter = side === "A" ? setCoreA : setCoreB;
    setter((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  async function handleAddGuest() {
    const n = guestName.trim();
    if (!token || !activeOrgId || n.length < 2 || guestBusy) return;
    setGuestBusy(true);
    setError(null);
    try {
      await addGuest({ token, orgId: activeOrgId, name: n });
      setGuestName("");
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
      // Put each side's captain at index 0 — that's the captain slot the rest
      // of the app reads, and the default team name follows it.
      const orderedA = capA ? [capA, ...squadA.filter((id) => id !== capA)] : squadA;
      const orderedB = capB ? [capB, ...squadB.filter((id) => id !== capB)] : squadB;
      const res = await createTournament({
        token,
        orgId: activeOrgId,
        name: name.trim(),
        format,
        oversPerInnings: overs,
        oversPerPlayer: format === "limited" ? oversPerPlayer : undefined,
        battingMode,
        sideAName: nameA.trim() || `Team ${nameOf(capA)}`,
        sideBName: nameB.trim() || `Team ${nameOf(capB)}`,
        sideASquadIds: orderedA as Id<"users">[],
        sideACoreIds: Array.from(coreA).filter((id) =>
          squadA.includes(id),
        ) as Id<"users">[],
        sideBSquadIds: orderedB as Id<"users">[],
        sideBCoreIds: Array.from(coreB).filter((id) =>
          squadB.includes(id),
        ) as Id<"users">[],
        matchCount,
      });
      router.replace(`/tournaments/${res.tournamentId}`);
    } catch (e) {
      setError(errorMessage(e, "Could not create the series"));
      setBusy(false);
    }
  }

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

      <main className="mx-auto w-full max-w-md flex-1 space-y-4 px-5 py-4 pb-32">
        {error ? (
          <p className="rounded-2xl border border-danger/20 bg-danger-soft px-4 py-2.5 text-[13px] text-danger">
            {error}
          </p>
        ) : null}

        <div className="rounded-2xl border border-line bg-surface p-4">
          <Input
            label="Series name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
            }}
            autoCapitalize="words"
            placeholder="Gully Series"
          />
        </div>

        <div className="rounded-2xl border border-line bg-surface p-4">
          <div className="flex items-center justify-between">
            <p className="text-[15px] font-medium text-ink">Format</p>
            <div className="flex rounded-2xl border border-line p-1">
              {(
                [
                  { id: "test", label: "Test" },
                  { id: "limited", label: "ODI" },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setFormat(opt.id)}
                  aria-pressed={format === opt.id}
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
              ? `Every match is ODI — ${oversPerPlayer} over${oversPerPlayer === 1 ? "" : "s"} per player, common players get half.`
              : "Every match is Test — two innings a side, follow-on, no over quotas."}
          </p>
        </div>

        <div className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-surface p-4">
          <p className="text-[15px] font-medium text-ink">Overs per innings</p>
          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={200}
            step={1}
            value={overs}
            onChange={(e) => {
              if (e.target.value === "") {
                setOvers(1);
                return;
              }
              const n = parseInt(e.target.value, 10);
              if (!Number.isInteger(n)) return;
              setOvers(Math.min(200, Math.max(1, n)));
            }}
            className="tabular h-11 w-20 rounded-xl border border-line bg-bg px-3 text-center text-lg font-semibold text-ink outline-none focus:border-ink"
          />
        </div>

        {format === "limited" ? (
          <Stepper
            label="Overs per player"
            hint="Bat & bowl cap · common players get half."
            value={oversPerPlayer}
            onDec={() => setOversPerPlayer((o) => Math.max(2, o - 2))}
            onInc={() => setOversPerPlayer((o) => Math.min(20, o + 2))}
          />
        ) : null}

        <div className="rounded-2xl border border-line bg-surface p-4">
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
                  aria-pressed={battingMode === opt.mode}
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
        </div>

        <Stepper
          label="Matches in series"
          value={matchCount}
          onDec={() => setMatchCount((n) => Math.max(1, n - 1))}
          onInc={() => setMatchCount((n) => Math.min(50, n + 1))}
        />

        {/* Team-first squad draft */}
        <section className="space-y-3">
          <div>
            <p className="text-[15px] font-semibold text-ink">Squads</p>
            <p className="mt-0.5 text-[11px] leading-relaxed text-muted">
              Pick a team below, then tap players to add them — the team stays
              selected until you change it.
            </p>
            <p className="mt-1 text-[11px] leading-relaxed text-muted">
              Mark a player <span className="font-semibold text-ink">Core</span>{" "}
              if they&apos;re expected every match. Everyone else is a
              challenger who floats in and out — missing core only warns, never
              blocks.
            </p>
            <p className="mt-1 text-[11px] leading-relaxed text-muted">
              The <span className="font-semibold text-ink">crown</span> sets each
              side&apos;s captain — it names the team unless you type a name
              above. You can change it here or later.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2">
            {(
              [
                {
                  side: "A" as const,
                  name: nameA,
                  setName: setNameA,
                  team: teamA,
                  count: squadA.length,
                  core: coreA,
                  cap: capA,
                  setCap: setCaptainA,
                },
                {
                  side: "B" as const,
                  name: nameB,
                  setName: setNameB,
                  team: teamB,
                  count: squadB.length,
                  core: coreB,
                  cap: capB,
                  setCap: setCaptainB,
                },
              ]
            ).map(({ side, name: teamName, setName, team, count, core, cap, setCap }) => (
              <section
                key={side}
                className={cn(
                  "rounded-2xl border bg-surface p-3 transition",
                  activeTarget === side
                    ? "border-accent ring-2 ring-accent/40"
                    : "border-line",
                )}
              >
                <div className="mb-2 flex items-center justify-between gap-1">
                  <input
                    value={teamName}
                    onChange={(e) => setName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") e.currentTarget.blur();
                    }}
                    autoCapitalize="words"
                    aria-label={`Team ${side} name`}
                    placeholder={`Team ${side}`}
                    maxLength={30}
                    className="min-w-0 flex-1 bg-transparent text-[15px] font-semibold text-ink outline-none placeholder:text-faint"
                  />
                  <span className="tabular shrink-0 rounded-full bg-bg px-2 py-0.5 text-[11px] font-semibold text-muted">
                    {count}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTarget(side)}
                  aria-pressed={activeTarget === side}
                  className={cn(
                    "mb-2 flex min-h-11 w-full items-center justify-center rounded-xl border px-2 text-[11px] font-semibold transition",
                    activeTarget === side
                      ? "border-accent bg-accent-soft text-accent-deep"
                      : "border-line text-muted",
                  )}
                >
                  {activeTarget === side ? "Adding here" : "Add here"}
                </button>
                <div className="space-y-1">
                  {team.map((id) => (
                    <PlayerChip
                      key={id}
                      name={nameOf(id)}
                      core={core.has(id)}
                      captain={cap === id}
                      onToggleCore={() => toggleCore(side, id)}
                      onSetCaptain={() => setCap(id)}
                      onRemove={() => unassign(id)}
                    />
                  ))}
                  {common.map((id) => (
                    <PlayerChip
                      key={`common-${id}`}
                      name={nameOf(id)}
                      both
                      core={core.has(id)}
                      captain={cap === id}
                      onToggleCore={() => toggleCore(side, id)}
                      onSetCaptain={() => setCap(id)}
                      onRemove={() => unassign(id)}
                    />
                  ))}
                  {team.length === 0 && common.length === 0 ? (
                    <p className="px-1 py-3 text-center text-[11px] text-muted">
                      Empty
                    </p>
                  ) : null}
                </div>
              </section>
            ))}
          </div>

          <button
            type="button"
            onClick={() => setActiveTarget("common")}
            aria-pressed={activeTarget === "common"}
            className={cn(
              "flex min-h-11 w-full items-center gap-2.5 rounded-2xl border px-4 py-3 text-left transition",
              activeTarget === "common"
                ? "border-accent bg-accent-soft ring-2 ring-accent/40"
                : "border-dashed border-line bg-surface",
            )}
          >
            <Users className="h-4 w-4 shrink-0 text-accent-deep" />
            <span className="min-w-0">
              <span className="block text-[15px] font-semibold text-ink">
                {activeTarget === "common"
                  ? "Adding to both sides"
                  : "Plays both sides"}
              </span>
              <span className="block text-[11px] text-muted">
                Common players join both squads.
              </span>
            </span>
            {common.length > 0 ? (
              <span className="tabular ml-auto shrink-0 rounded-full bg-bg px-2 py-0.5 text-[11px] font-semibold text-muted">
                {common.length}
              </span>
            ) : null}
          </button>

          {draftPool.length > 0 ? (
            <div className="rounded-2xl border border-line bg-surface p-4">
              <p className="mb-2.5 text-[13px] font-medium text-muted">
                Still to pick ({draftPool.length})
              </p>
              <div className="flex flex-wrap gap-2">
                {draftPool.map((id) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => assign(id)}
                    className="min-h-11 rounded-full border border-line bg-bg px-3.5 py-2.5 text-[13px] font-medium text-ink active:scale-95 active:border-accent"
                  >
                    {nameOf(id)}
                  </button>
                ))}
              </div>
            </div>
          ) : assigned.size > 0 ? (
            <p className="text-center text-[11px] text-muted">
              All players assigned
            </p>
          ) : null}

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
              aria-label="Add a guest by name"
              placeholder="Add a guest by name"
              className="min-h-12 min-w-0 flex-1 rounded-2xl border border-line bg-surface px-3 text-[16px] text-ink outline-none placeholder:text-faint focus:border-ink"
            />
            <Button
              variant="ghost"
              disabled={guestBusy || guestName.trim().length < 2}
              onClick={handleAddGuest}
            >
              Add
            </Button>
          </div>
        </section>
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
              : ready
                ? `Create — ${squadA.length} v ${squadB.length}`
                : "Each squad needs at least 2"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function PlayerChip({
  name,
  both,
  core,
  captain,
  onToggleCore,
  onSetCaptain,
  onRemove,
}: {
  name: string;
  both?: boolean;
  core: boolean;
  captain: boolean;
  onToggleCore: () => void;
  onSetCaptain: () => void;
  onRemove: () => void;
}) {
  return (
    <div
      className={cn(
        "w-full rounded-xl px-2 py-1.5",
        both ? "bg-accent-soft" : "bg-bg",
      )}
    >
      <div className="flex items-center gap-1">
        <span
          className={cn(
            "min-w-0 flex-1 truncate text-[13px] font-medium",
            both ? "text-accent-deep" : "text-ink",
          )}
        >
          {name}
        </span>
        {captain ? (
          <span className="flex shrink-0 items-center gap-0.5 rounded-full bg-ink px-1.5 py-0.5 text-[11px] font-bold leading-tight text-bg">
            <Crown className="h-3 w-3" fill="currentColor" />C
          </span>
        ) : null}
        {both ? (
          <span className="shrink-0 rounded-full bg-accent px-1.5 py-0.5 text-[11px] font-bold leading-tight text-ink">
            both
          </span>
        ) : null}
      </div>
      <div className="mt-1 flex items-center gap-1">
        <button
          type="button"
          onClick={onSetCaptain}
          aria-pressed={captain}
          aria-label={`Make ${name} captain`}
          className={cn(
            "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border transition",
            captain
              ? "border-ink bg-ink text-bg"
              : "border-line bg-surface text-muted",
          )}
        >
          <Crown className="h-3.5 w-3.5" fill={captain ? "currentColor" : "none"} />
        </button>
        <button
          type="button"
          onClick={onToggleCore}
          aria-pressed={core}
          className={cn(
            "flex min-h-11 min-w-0 flex-1 items-center justify-center gap-1 rounded-xl border text-[13px] font-semibold transition",
            core
              ? "border-accent bg-accent-soft text-accent-deep"
              : "border-line bg-surface text-muted",
          )}
        >
          <Star
            className="h-3.5 w-3.5 shrink-0"
            fill={core ? "currentColor" : "none"}
          />
          Core
        </button>
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${name}`}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-line bg-surface text-muted active:bg-bg"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function Stepper({
  label,
  hint,
  value,
  onDec,
  onInc,
}: {
  label: string;
  hint?: string;
  value: number;
  onDec: () => void;
  onInc: () => void;
}) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[15px] font-medium text-ink">{label}</p>
          {hint ? <p className="mt-0.5 text-[11px] text-muted">{hint}</p> : null}
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onDec}
            aria-label={`Decrease ${label}`}
            className="flex h-11 w-11 items-center justify-center rounded-xl border border-line text-muted active:bg-bg"
          >
            <Minus className="h-4 w-4" />
          </button>
          <span className="tabular w-8 text-center text-lg font-semibold text-ink">
            {value}
          </span>
          <button
            type="button"
            onClick={onInc}
            aria-label={`Increase ${label}`}
            className="flex h-11 w-11 items-center justify-center rounded-xl border border-line text-muted active:bg-bg"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
