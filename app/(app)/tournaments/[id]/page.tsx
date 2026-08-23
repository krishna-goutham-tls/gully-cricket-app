"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { useAuth } from "@/components/providers/AuthProvider";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Input";
import {
  cn,
  errorMessage,
  TOURNAMENT_STATUS_LABEL as STATUS_LABEL,
} from "@/lib/utils";
import { dayLabel } from "@/lib/dates";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Check,
  ChevronDown,
  Star,
  Trash2,
  Trophy,
  UserPlus,
} from "lucide-react";

type SquadPlayer = {
  userId: string;
  displayName: string;
  isGuest: boolean;
  isCore: boolean;
};

type DeclareTarget = "A" | "B" | "draw";

export default function TournamentDetailPage() {
  const params = useParams();
  const tournamentId = params.id as Id<"tournaments">;
  const router = useRouter();
  const { token, isAdmin } = useAuth();

  const t = useQuery(
    api.tournaments.get,
    token ? { token, tournamentId } : "skip",
  );
  const orgPlayers = useQuery(
    api.players.listOrgPlayers,
    token && t ? { token, orgId: t.orgId } : "skip",
  );
  const linkable = useQuery(
    api.tournaments.linkableMatches,
    token && isAdmin && t ? { token, tournamentId } : "skip",
  );
  const startMatch = useMutation(api.tournaments.startMatch);
  const linkMatch = useMutation(api.tournaments.linkMatch);
  const setStatus = useMutation(api.tournaments.setStatus);
  const setWinner = useMutation(api.tournaments.setWinner);
  const reopen = useMutation(api.tournaments.reopen);
  const removeTournament = useMutation(api.tournaments.remove);
  const renameTeams = useMutation(api.tournaments.renameTeams);

  const [panelOpen, setPanelOpen] = useState(false);
  const [presentA, setPresentA] = useState<Set<string>>(new Set());
  const [presentB, setPresentB] = useState<Set<string>>(new Set());
  const [warn, setWarn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Kept separate from `error`: the Admin card sits below the full match
  // list, well off-screen from the page-top banner `error` renders into, so
  // a failed declare/pause/reopen needs its own slot right next to the
  // buttons that triggered it.
  const [adminError, setAdminError] = useState<string | null>(null);
  const [declareOpen, setDeclareOpen] = useState(false);
  const [declareTarget, setDeclareTarget] = useState<DeclareTarget | null>(null);
  const [reopenOpen, setReopenOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [renA, setRenA] = useState("");
  const [renB, setRenB] = useState("");
  const [renBusy, setRenBusy] = useState(false);
  const [binOpen, setBinOpen] = useState(false);
  const [binId, setBinId] = useState<Id<"matches"> | null>(null);

  const missingCore = useMemo(() => {
    if (!t) return [] as string[];
    const miss: string[] = [];
    for (const p of t.sideA)
      if (p.isCore && !presentA.has(p.userId)) miss.push(p.displayName);
    for (const p of t.sideB)
      if (p.isCore && !presentB.has(p.userId)) miss.push(p.displayName);
    return miss;
  }, [t, presentA, presentB]);

  if (t === undefined) {
    return (
      <main className="mx-auto max-w-md px-5 py-6">
        <div className="h-40 animate-pulse rounded-3xl bg-ink/[0.04]" />
      </main>
    );
  }
  if (t === null) {
    return (
      <main className="mx-auto max-w-md px-5 py-6">
        <EmptyState title="Tournament not found" body="It may have been removed." />
        <Link href="/tournaments" className="mt-4 block text-center text-sm text-accent-deep">
          Back to tournaments
        </Link>
      </main>
    );
  }

  /**
   * Cores are expected every match; challengers float in and out. Defaulting to
   * cores means the scorer adds today's challengers rather than remembering to
   * remove every absentee. Cores are optional, though — a side can legitimately
   * have none starred, so fall back to its full squad rather than opening the
   * panel with that side empty (and confirmStart erroring on "at least 2").
   */
  function pickCore() {
    if (!t) return;
    const coreA = t.sideA.filter((p) => p.isCore);
    const coreB = t.sideB.filter((p) => p.isCore);
    setPresentA(
      new Set((coreA.length ? coreA : t.sideA).map((p) => p.userId)),
    );
    setPresentB(
      new Set((coreB.length ? coreB : t.sideB).map((p) => p.userId)),
    );
    setWarn(false);
  }

  function pickAll() {
    if (!t) return;
    setPresentA(new Set(t.sideA.map((p) => p.userId)));
    setPresentB(new Set(t.sideB.map((p) => p.userId)));
    setWarn(false);
  }

  function pickLast() {
    if (!t?.lastLineup) return;
    setPresentA(new Set(t.lastLineup.sideAPlayerIds.map(String)));
    setPresentB(new Set(t.lastLineup.sideBPlayerIds.map(String)));
    setWarn(false);
  }

  function openPanel() {
    if (!t) return;
    // Prefer "same as last match" — it's the closest guess at who's actually
    // here today — and fall back to cores when there's no history yet.
    if (t.lastLineup) pickLast();
    else pickCore();
    setError(null);
    setPanelOpen(true);
  }

  function toggle(side: "A" | "B", id: string) {
    const [set, setter] = side === "A" ? [presentA, setPresentA] : [presentB, setPresentB];
    const n = new Set(set as Set<string>);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    (setter as (s: Set<string>) => void)(n);
    setWarn(false);
  }

  async function confirmStart() {
    if (!token) return;
    if (presentA.size < 2 || presentB.size < 2) {
      setError("Each side needs at least 2 players today.");
      return;
    }
    if (missingCore.length > 0 && !warn) {
      setWarn(true);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await startMatch({
        token,
        tournamentId,
        sideAPlayerIds: Array.from(presentA) as Id<"users">[],
        sideBPlayerIds: Array.from(presentB) as Id<"users">[],
      });
      router.replace(`/matches/${res.matchId}/score`);
    } catch (e) {
      setError(errorMessage(e, "Could not start the match"));
      setBusy(false);
    }
  }

  function openRename() {
    if (!t) return;
    setRenA(t.sideAName);
    setRenB(t.sideBName);
    setAdminError(null);
    setRenameOpen(true);
  }

  async function confirmRename() {
    if (!token) return;
    setRenBusy(true);
    setAdminError(null);
    try {
      await renameTeams({ token, tournamentId, sideAName: renA, sideBName: renB });
      setRenameOpen(false);
    } catch (e) {
      setAdminError(errorMessage(e, "Could not rename the teams"));
    } finally {
      setRenBusy(false);
    }
  }

  async function confirmBin() {
    if (!token || !binId) return;
    setConfirmBusy(true);
    setAdminError(null);
    try {
      await linkMatch({ token, tournamentId, matchId: binId });
      setBinId(null);
      setBinOpen(false);
    } catch (e) {
      setAdminError(errorMessage(e, "Could not add that match"));
      setBinId(null);
    } finally {
      setConfirmBusy(false);
    }
  }

  async function changeStatus(status: "active" | "paused") {
    if (!token) return;
    setAdminError(null);
    try {
      await setStatus({ token, tournamentId, status });
    } catch (e) {
      setAdminError(errorMessage(e, "Could not update the tournament"));
    }
  }

  async function confirmDeclare() {
    if (!token || !declareTarget) return;
    setConfirmBusy(true);
    setAdminError(null);
    try {
      await setWinner({
        token,
        tournamentId,
        winnerSide: declareTarget === "draw" ? undefined : declareTarget,
      });
      setDeclareTarget(null);
      setDeclareOpen(false);
    } catch (e) {
      setAdminError(errorMessage(e, "Could not declare the winner"));
      setDeclareTarget(null);
    } finally {
      setConfirmBusy(false);
    }
  }

  async function confirmReopen() {
    if (!token) return;
    setConfirmBusy(true);
    setAdminError(null);
    try {
      await reopen({ token, tournamentId });
      setReopenOpen(false);
    } catch (e) {
      setAdminError(errorMessage(e, "Could not reopen the tournament"));
      setReopenOpen(false);
    } finally {
      setConfirmBusy(false);
    }
  }

  async function confirmDelete() {
    if (!token) return;
    setConfirmBusy(true);
    setAdminError(null);
    try {
      await removeTournament({ token, tournamentId });
      router.replace("/tournaments");
    } catch (e) {
      setAdminError(errorMessage(e, "Could not delete the tournament"));
      setDeleteOpen(false);
      setConfirmBusy(false);
    }
  }

  const s = t.standings;
  const ranLong = s.played > t.matchCount;
  // Deleting keeps everything that was scored and only drops fixtures nobody
  // ever opened — the copy below has to say so, or "delete" reads as
  // "wipe five matches of stats".
  const hasLiveMatch = t.matches.some((m) => m.status === "live");
  const scoredCount = t.matches.filter((m) => m.status !== "scheduled").length;
  const unplayedCount = t.matches.length - scoredCount;
  const deleteDescription = [
    scoredCount > 0
      ? `The ${scoredCount} match${scoredCount === 1 ? "" : "es"} already played stay${scoredCount === 1 ? "s" : ""} in your history and leaderboards — ${scoredCount === 1 ? "it" : "they"} just stop${scoredCount === 1 ? "s" : ""} counting toward a series.`
      : "Nothing has been scored in this series, so no match data is lost.",
    unplayedCount > 0
      ? `${unplayedCount} fixture${unplayedCount === 1 ? "" : "s"} that never started ${unplayedCount === 1 ? "is" : "are"} removed.`
      : null,
    "The tournament itself can't be brought back.",
  ]
    .filter(Boolean)
    .join(" ");
  const declareName =
    declareTarget === "A"
      ? t.sideAName
      : declareTarget === "B"
        ? t.sideBName
        : null;

  // A player can be lent from one side's squad to the other to even up numbers
  // when someone is absent. Borrowable = the other squad minus anyone already
  // in this side's own squad (common players are already listed there), so no
  // name shows up twice within one side.
  const sideAIds = new Set(t.sideA.map((p) => p.userId));
  const sideBIds = new Set(t.sideB.map((p) => p.userId));
  const borrowForA = t.sideB.filter((p) => !sideAIds.has(p.userId));
  const borrowForB = t.sideA.filter((p) => !sideBIds.has(p.userId));
  const rosterIds = new Set<string>([
    ...Array.from(sideAIds),
    ...Array.from(sideBIds),
  ]);
  const walkOns: SquadPlayer[] = (orgPlayers ?? [])
    .filter((p) => !rosterIds.has(p.userId))
    .map((p) => ({
      userId: p.userId,
      displayName: p.displayName,
      isGuest: p.isGuest,
      isCore: false,
    }));
  const binTarget = binId
    ? (linkable ?? []).find((m) => m._id === binId) ?? null
    : null;

  return (
    <div>
      <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-line bg-bg/95 px-5 pb-3 pt-[calc(var(--safe-top)+1rem)] backdrop-blur">
        <Link
          href="/tournaments"
          className="-ml-2 flex h-11 w-11 items-center justify-center rounded-xl text-muted active:bg-ink/[0.04]"
          aria-label="Back to tournaments"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <span className="flex min-w-0 items-center gap-1.5">
          <Trophy className="h-4 w-4 shrink-0 text-muted" />
          <h1 className="truncate text-xl font-semibold tracking-tight text-ink">
            {t.name}
          </h1>
        </span>
      </header>

      <main className="mx-auto max-w-md space-y-4 px-5 py-5">
        {error ? (
          <p className="rounded-2xl border border-danger/20 bg-danger-soft px-4 py-2.5 text-sm text-danger">
            {error}
          </p>
        ) : null}

        <div className="rounded-3xl border border-line bg-surface p-4">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">
              {t.format === "limited" ? "ODI series" : "Test series"}
            </p>
            <span
              className={cn(
                "rounded-full px-2.5 py-1 text-xs font-bold uppercase tracking-wide",
                t.status === "active"
                  ? "bg-accent-soft text-accent-deep"
                  : "bg-ink/[0.06] text-muted",
              )}
            >
              {STATUS_LABEL[t.status] ?? t.status}
            </span>
          </div>
          <div className="mt-3 flex items-center justify-between gap-2 tabular">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-ink">{t.sideAName}</p>
              <p className="text-3xl font-semibold text-ink">{s.winsA}</p>
            </div>
            <span className="text-muted">—</span>
            <div className="min-w-0 flex-1 text-right">
              <p className="truncate text-sm font-medium text-ink">{t.sideBName}</p>
              <p className="text-3xl font-semibold text-ink">{s.winsB}</p>
            </div>
          </div>
          {s.overrun && t.status !== "complete" ? (
            <p className="mt-2.5 rounded-xl border border-accent/30 bg-accent-soft px-3 py-2 text-xs font-medium leading-relaxed text-accent-deep">
              {ranLong
                ? `${s.played} match${s.played === 1 ? "" : "es"} played — ${t.matchCount} ${t.matchCount === 1 ? "was" : "were"} planned. Extra matches still count.`
                : `All ${t.matchCount} planned match${t.matchCount === 1 ? "" : "es"} ${t.matchCount === 1 ? "is" : "are"} done.`}
              {" An admin can declare the series whenever you're ready."}
            </p>
          ) : t.status !== "complete" ? (
            <p className="mt-2 text-xs text-muted">
              {s.played} of {t.matchCount} match{t.matchCount === 1 ? "" : "es"} played · {s.remaining} to go
            </p>
          ) : null}
          {t.winnerText ? (
            <p className="mt-2 rounded-xl bg-accent-soft px-3 py-2 text-sm font-semibold text-accent-deep">
              {t.winnerText}
            </p>
          ) : null}
        </div>

        {t.status === "active" ? (
          <Button fullWidth size="lg" onClick={openPanel}>
            Start match
          </Button>
        ) : t.status === "paused" && isAdmin ? (
          <Button fullWidth size="lg" onClick={() => changeStatus("active")}>
            Resume tournament
          </Button>
        ) : t.status === "paused" ? (
          <p className="rounded-2xl border border-line bg-surface px-4 py-3 text-[13px] text-muted">
            Paused — an admin can resume the series.
          </p>
        ) : null}

        {/* Matches */}
        <div>
          <p className="px-1 pb-2 text-xs font-semibold uppercase tracking-[0.12em] text-muted">
            Matches
          </p>
          {t.matches.length === 0 ? (
            <EmptyState
              title="No matches yet"
              body="Start the first one."
            />
          ) : (
            <div className="space-y-2">
              {t.matches.map((m, i) => {
                const href =
                  m.status === "live" || m.status === "scheduled"
                    ? `/matches/${m._id}/score`
                    : `/matches/${m._id}`;
                return (
                  <Link
                    key={m._id}
                    href={href}
                    className="block rounded-2xl border border-line bg-surface p-3.5 active:opacity-70"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium text-ink">
                        Match {i + 1}
                      </span>
                      {m.status === "live" ? (
                        <span className="flex items-center gap-1.5 rounded-full bg-accent-soft px-2 py-0.5 text-xs font-bold uppercase text-accent-deep">
                          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />
                          Live
                        </span>
                      ) : (
                        <span className="text-xs font-medium uppercase tracking-wide text-muted">
                          {m.status === "completed"
                            ? "Done"
                            : m.status === "abandoned"
                              ? "Abandoned"
                              : "Not started"}
                        </span>
                      )}
                    </div>
                    <p className="tabular mt-1 text-[13px] text-muted">
                      {m.status === "live" && m.live
                        ? `${m.live.totalRuns}/${m.live.wickets} · ${m.live.oversText} ov`
                        : m.resultText ?? "Tap to continue"}
                    </p>
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        {/* Admin controls */}
        {isAdmin ? (
          <div className="rounded-3xl border border-line bg-surface p-4">
            <p className="text-[13px] font-semibold text-ink">Admin</p>
            {adminError ? (
              <p className="mt-2 rounded-xl border border-danger/20 bg-danger-soft px-3 py-2 text-xs text-danger">
                {adminError}
              </p>
            ) : null}
            {t.status === "complete" ? (
              <>
                <p className="mt-1 text-xs leading-relaxed text-muted">
                  This series is closed. Reopen it if the result was declared by
                  mistake.
                </p>
                <div className="mt-3">
                  <Button variant="secondary" onClick={() => setReopenOpen(true)}>
                    Reopen series
                  </Button>
                </div>
              </>
            ) : (
              <>
                <div className="mt-3 flex flex-wrap gap-2">
                  {t.status === "active" ? (
                    <Button variant="secondary" onClick={() => changeStatus("paused")}>
                      Pause
                    </Button>
                  ) : null}
                  <Button variant="secondary" onClick={() => setDeclareOpen((v) => !v)}>
                    Declare winner
                  </Button>
                </div>
                {declareOpen ? (
                  <div className="mt-3 space-y-2">
                    <p className="text-xs leading-relaxed text-muted">
                      {s.leaderSide
                        ? `${s.leaderSide === "A" ? t.sideAName : t.sideBName} lead ${Math.max(s.winsA, s.winsB)}–${Math.min(s.winsA, s.winsB)}.`
                        : "Series is level."}{" "}
                      Declaring ends the series — you&apos;ll be asked to confirm.
                    </p>
                    <div className="grid gap-2">
                      <Button
                        variant="secondary"
                        onClick={() => setDeclareTarget("A")}
                      >
                        <span className="min-w-0 truncate">
                          {t.sideAName} win
                        </span>
                      </Button>
                      <Button
                        variant="secondary"
                        onClick={() => setDeclareTarget("B")}
                      >
                        <span className="min-w-0 truncate">
                          {t.sideBName} win
                        </span>
                      </Button>
                      <Button
                        variant="ghost"
                        onClick={() => setDeclareTarget("draw")}
                      >
                        Series drawn
                      </Button>
                    </div>
                  </div>
                ) : null}
              </>
            )}

            <div className="mt-4 border-t border-line pt-3">
              {renameOpen ? (
                <div className="space-y-2">
                  <p className="text-[13px] font-semibold text-ink">
                    Rename teams
                  </p>
                  <p className="text-xs leading-relaxed text-muted">
                    Fixes a mislabelled side. Matches already played keep their
                    old name; new matches use the new one.
                  </p>
                  <Input
                    value={renA}
                    onChange={(e) => setRenA(e.target.value)}
                    maxLength={40}
                    label="Team A name"
                  />
                  <Input
                    value={renB}
                    onChange={(e) => setRenB(e.target.value)}
                    maxLength={40}
                    label="Team B name"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <Button variant="ghost" onClick={() => setRenameOpen(false)}>
                      Cancel
                    </Button>
                    <Button disabled={renBusy} onClick={() => void confirmRename()}>
                      {renBusy ? "Saving…" : "Save names"}
                    </Button>
                  </div>
                </div>
              ) : (
                <Button variant="secondary" fullWidth onClick={openRename}>
                  Rename teams
                </Button>
              )}
            </div>

            <div className="mt-4 border-t border-line pt-3">
              {t.status !== "complete" ? (
                binOpen ? (
                  <div className="space-y-2">
                    <p className="text-[13px] font-semibold text-ink">
                      Add a played match
                    </p>
                    <p className="text-xs leading-relaxed text-muted">
                      Bins a completed match onto this series. Walk-ons stay
                      on the scorecard. Side A must still be {t.sideAName}.
                    </p>
                    {(linkable ?? []).length === 0 ? (
                      <p className="text-xs text-muted">
                        No matching friendlies to add.
                      </p>
                    ) : (
                      <div className="space-y-1.5">
                        {(linkable ?? []).map((m) => (
                          <button
                            key={m._id}
                            type="button"
                            onClick={() => setBinId(m._id)}
                            className="flex min-h-12 w-full flex-col items-start justify-center rounded-xl border border-line px-3 py-2 text-left active:bg-bg"
                          >
                            <span className="text-[13px] font-semibold text-ink">
                              {m.resultText ?? `${m.sideAName} vs ${m.sideBName}`}
                            </span>
                            <span className="text-xs text-muted">
                              {dayLabel(m.createdAt)}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                    <Button variant="ghost" onClick={() => setBinOpen(false)}>
                      Cancel
                    </Button>
                  </div>
                ) : (
                  <Button
                    variant="secondary"
                    fullWidth
                    onClick={() => {
                      setAdminError(null);
                      setBinOpen(true);
                    }}
                  >
                    Add a played match
                  </Button>
                )
              ) : null}
            </div>

            <div className="mt-4 border-t border-line pt-3">
              <Button
                variant="danger"
                fullWidth
                disabled={hasLiveMatch}
                onClick={() => setDeleteOpen(true)}
              >
                <Trash2 className="h-4 w-4" />
                Delete tournament
              </Button>
              <p className="mt-2 text-xs leading-relaxed text-muted">
                {hasLiveMatch
                  ? "A match is being scored right now. Finish or abandon it before deleting the series."
                  : "Matches already played are kept — they stop counting toward a series."}
              </p>
            </div>
          </div>
        ) : null}
      </main>

      {/* Start-match panel */}
      {panelOpen ? (
        <div className="fixed inset-0 z-50 flex items-end bg-black/30">
          <div className="safe-bottom flex max-h-[88dvh] w-full flex-col rounded-t-3xl bg-surface shadow-2xl">
            <div className="shrink-0 px-5 pt-5">
              <p className="text-[15px] font-semibold text-ink">
                Who&apos;s playing today?
              </p>
              <p className="mt-1 text-xs leading-relaxed text-muted">
                Core players are pre-selected. Tap to add today&apos;s
                challengers or drop anyone who didn&apos;t turn up. Walk-ons
                who aren&apos;t on either squad can join. Short on players?
                Borrow one from the other team.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <QuickPick label="Core only" onClick={pickCore} />
                {t.lastLineup ? (
                  <QuickPick label="Same as last match" onClick={pickLast} />
                ) : null}
                <QuickPick label="Whole squad" onClick={pickAll} />
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-2">
              <SquadPicker
                title={t.sideAName}
                players={t.sideA}
                borrowFrom={t.sideBName}
                borrowable={borrowForA}
                walkable={walkOns}
                present={presentA}
                onToggle={(id) => toggle("A", id)}
              />
              <SquadPicker
                title={t.sideBName}
                players={t.sideB}
                borrowFrom={t.sideAName}
                borrowable={borrowForB}
                walkable={walkOns}
                present={presentB}
                onToggle={(id) => toggle("B", id)}
              />
            </div>

            {/* Footer is pinned so the core warning can never scroll away from
                the button whose meaning it changes. */}
            <div className="shrink-0 border-t border-line px-5 pb-4 pt-3">
              {warn && missingCore.length > 0 ? (
                <p className="mb-3 rounded-xl border border-accent/30 bg-accent-soft px-3 py-2.5 text-[13px] leading-relaxed text-accent-deep">
                  Core missing: {missingCore.join(", ")}. Play anyway?
                </p>
              ) : null}
              {error ? (
                <p className="mb-3 text-sm text-danger">{error}</p>
              ) : null}
              <div className="grid grid-cols-2 gap-2">
                <Button variant="ghost" onClick={() => setPanelOpen(false)}>
                  Cancel
                </Button>
                <Button disabled={busy} onClick={confirmStart}>
                  {busy
                    ? "Starting…"
                    : warn && missingCore.length > 0
                      ? "Play anyway"
                      : "Start match"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <ConfirmDialog
        open={declareTarget !== null}
        title={
          declareTarget === "draw"
            ? "End the series in a draw?"
            : `${declareName} win the series?`
        }
        description={`This closes ${t.name} at ${s.winsA}–${s.winsB} after ${s.played} match${s.played === 1 ? "" : "es"}. No more matches can be started, and only an admin can reopen it.`}
        confirmLabel={declareTarget === "draw" ? "End in a draw" : "Declare"}
        busy={confirmBusy}
        onConfirm={() => void confirmDeclare()}
        onCancel={() => setDeclareTarget(null)}
      />

      <ConfirmDialog
        open={deleteOpen}
        title={`Delete ${t.name}?`}
        description={deleteDescription}
        confirmLabel="Delete"
        danger
        busy={confirmBusy}
        onConfirm={() => void confirmDelete()}
        onCancel={() => setDeleteOpen(false)}
      />

      <ConfirmDialog
        open={binId !== null}
        title="Add this match to the series?"
        description={
          binTarget
            ? `${binTarget.resultText ?? `${binTarget.sideAName} vs ${binTarget.sideBName}`} will count toward ${t.name}. You can still declare the winner after.`
            : "This match will count toward the series."
        }
        confirmLabel="Add to series"
        busy={confirmBusy}
        onConfirm={() => void confirmBin()}
        onCancel={() => setBinId(null)}
      />

      <ConfirmDialog
        open={reopenOpen}
        title="Reopen this series?"
        description="The declared result is cleared and the series returns paused — hit Resume when you're ready to play more matches."
        confirmLabel="Reopen"
        busy={confirmBusy}
        onConfirm={() => void confirmReopen()}
        onCancel={() => setReopenOpen(false)}
      />
    </div>
  );
}

function QuickPick({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="min-h-11 rounded-xl border border-line bg-bg px-4 text-xs font-semibold text-ink active:scale-95 active:border-accent"
    >
      {label}
    </button>
  );
}

function SquadPicker({
  title,
  players,
  borrowFrom,
  borrowable,
  walkable,
  present,
  onToggle,
}: {
  title: string;
  players: SquadPlayer[];
  borrowFrom: string;
  borrowable: SquadPlayer[];
  walkable: SquadPlayer[];
  present: Set<string>;
  onToggle: (id: string) => void;
}) {
  const [showBorrow, setShowBorrow] = useState(false);
  const [showWalk, setShowWalk] = useState(false);
  const cores = players.filter((p) => p.isCore);
  const challengers = players.filter((p) => !p.isCore);
  const ownIn = players.filter((p) => present.has(p.userId)).length;
  const borrowedIn = borrowable.filter((p) => present.has(p.userId)).length;
  const walkIn = walkable.filter((p) => present.has(p.userId)).length;

  return (
    <div className="mt-4">
      <div className="flex items-baseline justify-between gap-2">
        <p className="min-w-0 truncate text-[13px] font-semibold text-ink">
          {title}
        </p>
        <span className="tabular shrink-0 text-xs font-semibold text-muted">
          {ownIn} of {players.length} in
          {borrowedIn > 0 ? ` · +${borrowedIn} borrowed` : ""}
          {walkIn > 0 ? ` · +${walkIn} walk-on` : ""}
        </span>
      </div>

      {cores.length > 0 ? (
        <>
          <p className="mt-2.5 text-xs font-semibold uppercase tracking-wide text-muted">
            Core · expected every match
          </p>
          <div className="mt-1.5 space-y-1.5">
            {cores.map((p) => (
              <PlayerRow
                key={p.userId}
                player={p}
                on={present.has(p.userId)}
                onToggle={() => onToggle(p.userId)}
              />
            ))}
          </div>
        </>
      ) : null}

      {challengers.length > 0 ? (
        <>
          <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-muted">
            Challengers
          </p>
          <div className="mt-1.5 space-y-1.5">
            {challengers.map((p) => (
              <PlayerRow
                key={p.userId}
                player={p}
                on={present.has(p.userId)}
                onToggle={() => onToggle(p.userId)}
              />
            ))}
          </div>
        </>
      ) : null}

      {/* Borrow a player from the other squad to balance numbers. Collapsed by
          default since it's the exception; the header's "+N borrowed" count
          keeps any picks visible even while this stays shut. */}
      {borrowable.length > 0 ? (
        <>
          <button
            type="button"
            onClick={() => setShowBorrow((v) => !v)}
            aria-expanded={showBorrow}
            className="mt-3 flex min-h-11 w-full items-center gap-1.5 rounded-xl border border-dashed border-line px-3 text-xs font-semibold text-muted active:border-accent"
          >
            <UserPlus className="h-3.5 w-3.5 shrink-0" />
            <span className="min-w-0 truncate">
              Borrow from {borrowFrom}
              {borrowedIn > 0 ? ` · ${borrowedIn} in` : ""}
            </span>
            <ChevronDown
              className={cn(
                "ml-auto h-4 w-4 shrink-0 transition-transform",
                showBorrow && "rotate-180",
              )}
            />
          </button>
          {showBorrow ? (
            <div className="mt-1.5 space-y-1.5">
              {borrowable.map((p) => (
                <PlayerRow
                  key={p.userId}
                  player={p}
                  on={present.has(p.userId)}
                  onToggle={() => onToggle(p.userId)}
                />
              ))}
            </div>
          ) : null}
        </>
      ) : null}

      {walkable.length > 0 ? (
        <>
          <button
            type="button"
            onClick={() => setShowWalk((v) => !v)}
            aria-expanded={showWalk}
            className="mt-3 flex min-h-11 w-full items-center gap-1.5 rounded-xl border border-dashed border-line px-3 text-xs font-semibold text-muted active:border-accent"
          >
            <UserPlus className="h-3.5 w-3.5 shrink-0" />
            <span className="min-w-0 truncate">
              Walk-on
              {walkIn > 0 ? ` · ${walkIn} in` : ""}
            </span>
            <ChevronDown
              className={cn(
                "ml-auto h-4 w-4 shrink-0 transition-transform",
                showWalk && "rotate-180",
              )}
            />
          </button>
          {showWalk ? (
            <div className="mt-1.5 space-y-1.5">
              {walkable.map((p) => (
                <PlayerRow
                  key={p.userId}
                  player={p}
                  on={present.has(p.userId)}
                  onToggle={() => onToggle(p.userId)}
                />
              ))}
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

function PlayerRow({
  player,
  on,
  onToggle,
}: {
  player: SquadPlayer;
  on: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={on}
      className={cn(
        "flex min-h-11 w-full items-center justify-between gap-2 rounded-xl border px-3 py-2 text-left text-sm transition",
        on
          ? "border-accent bg-accent-soft text-accent-deep"
          : "border-line text-muted",
      )}
    >
      <span className="flex min-w-0 items-center gap-1.5">
        {player.isCore ? (
          <Star className="h-3.5 w-3.5 shrink-0 text-accent" fill="currentColor" />
        ) : null}
        <span className="truncate font-medium">{player.displayName}</span>
      </span>
      {on ? <Check className="h-4 w-4 shrink-0" /> : null}
    </button>
  );
}
