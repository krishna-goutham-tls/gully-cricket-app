"use client";

import { AppHeader } from "@/components/shell/AppHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useAuth } from "@/components/providers/AuthProvider";
import { api } from "@/convex/_generated/api";
import { useMutation, useQuery } from "convex/react";
import { Id } from "@/convex/_generated/dataModel";
import { errorMessage } from "@/lib/utils";
import {
  PlayerTagEditor,
  PlayerTagList,
} from "@/components/player/LabelTag";
import type { PlayerTag } from "@/lib/playerLabel";
import Link from "next/link";
import { useMemo, useState } from "react";
import { ChevronRight, Plus, X } from "lucide-react";

function initials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

export default function PlayersPage() {
  const { token, activeOrgId, isAdmin } = useAuth();
  const [search, setSearch] = useState("");
  const [guestOpen, setGuestOpen] = useState(false);
  const [guestName, setGuestName] = useState("");
  const [guestPhone, setGuestPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const players = useQuery(
    api.players.listOrgPlayers,
    token && activeOrgId ? { token, orgId: activeOrgId } : "skip",
  );
  // The directory's job is to get you into a profile, so each row carries the
  // one line that tells you who this player is to the team.
  const board = useQuery(
    api.stats.leaderboard,
    token && activeOrgId
      ? { token, orgId: activeOrgId, includeVisitorsAndJuniors: true }
      : "skip",
  );
  const pending = useQuery(
    api.orgs.listPending,
    isAdmin && token && activeOrgId ? { token, orgId: activeOrgId } : "skip",
  );
  const pinResets = useQuery(
    api.auth.listPinResets,
    isAdmin && token && activeOrgId ? { token, orgId: activeOrgId } : "skip",
  );
  const addGuest = useMutation(api.players.addGuest);
  const togglePlayerTag = useMutation(api.players.togglePlayerTag);
  const [tagBusyId, setTagBusyId] = useState<string | null>(null);
  const approveMember = useMutation(api.orgs.approveMember);
  const rejectMember = useMutation(api.orgs.rejectMember);
  const approvePinReset = useMutation(api.auth.approvePinReset);
  const rejectPinReset = useMutation(api.auth.rejectPinReset);

  const joinRequests = useMemo(
    () => (pending ?? []).filter((r): r is NonNullable<typeof r> => !!r),
    [pending],
  );
  const resets = useMemo(() => pinResets ?? [], [pinResets]);

  /** userId → "412 runs · 18 wkts", empty for anyone yet to play. */
  const summary = useMemo(() => {
    const map = new Map<string, string>();
    if (!board) return map;
    const put = (id: string, part: string) =>
      map.set(id, map.has(id) ? `${map.get(id)} · ${part}` : part);
    for (const r of board.batting) {
      if (r.runs > 0) put(String(r.userId), `${r.runs} runs`);
    }
    for (const r of board.bowling) {
      if (r.wickets > 0) put(String(r.userId), `${r.wickets} wkts`);
    }
    return map;
  }, [board]);
  // Approved resets linger until the temp PIN is used — they are shown for
  // reference but nothing is waiting on the admin, so they don't count.
  const waitingCount =
    joinRequests.length + resets.filter((r) => r.status === "pending").length;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return players ?? [];
    return (players ?? []).filter((p) =>
      p.displayName.toLowerCase().includes(q),
    );
  }, [players, search]);

  async function decide(
    action: "approve" | "reject",
    membershipId: Id<"orgMembers">,
  ) {
    if (!token) return;
    setError(null);
    try {
      if (action === "approve") await approveMember({ token, membershipId });
      else await rejectMember({ token, membershipId });
    } catch (e) {
      setError(errorMessage(e, `Could not ${action} that request`));
    }
  }

  async function decidePinReset(
    action: "approve" | "reject",
    resetId: Id<"pinResets">,
  ) {
    if (!token) return;
    setError(null);
    try {
      if (action === "approve") await approvePinReset({ token, resetId });
      else await rejectPinReset({ token, resetId });
    } catch (e) {
      setError(errorMessage(e, "Could not update that PIN reset"));
    }
  }

  async function submitGuest() {
    if (!token || !activeOrgId) return;
    setBusy(true);
    setError(null);
    try {
      await addGuest({
        token,
        orgId: activeOrgId,
        name: guestName,
        phone: guestPhone.trim() || undefined,
      });
      setGuestName("");
      setGuestPhone("");
      setGuestOpen(false);
      setSearch("");
    } catch (e) {
      setError(errorMessage(e, "Could not add guest"));
    } finally {
      setBusy(false);
    }
  }

  function openGuestForm(prefill: string) {
    setGuestName(prefill);
    setGuestOpen(true);
  }

  async function onToggleTag(userId: Id<"users">, tag: PlayerTag) {
    if (!token || !activeOrgId) return;
    setTagBusyId(String(userId));
    setError(null);
    try {
      await togglePlayerTag({
        token,
        orgId: activeOrgId,
        userId,
        tag,
      });
    } catch (e) {
      setError(errorMessage(e, "Could not update that tag"));
    } finally {
      setTagBusyId(null);
    }
  }

  return (
    <div>
      <AppHeader title="Players" />
      <main className="mx-auto max-w-md space-y-4 px-5 py-5">
        {error ? (
          <p className="rounded-2xl border border-danger/20 bg-danger-soft px-4 py-2.5 text-[13px] text-danger">
            {error}
          </p>
        ) : null}

        {isAdmin && (joinRequests.length > 0 || resets.length > 0) ? (
          <section className="overflow-hidden rounded-2xl border border-accent/40 bg-surface shadow-card">
            <div className="flex items-center justify-between gap-3 border-b border-accent/20 bg-accent-soft px-4 py-3">
              <p className="text-[13px] font-semibold text-accent-deep">
                {waitingCount > 0 ? "Waiting on you" : "Handed out already"}
              </p>
              {waitingCount > 0 ? (
                <span className="tabular rounded-full bg-accent px-2.5 py-0.5 text-[11px] font-bold text-ink">
                  {waitingCount}
                </span>
              ) : null}
            </div>

            <div className="space-y-3 p-4">
              {joinRequests.map((req) => (
                <div
                  key={String(req.membershipId)}
                  className="rounded-2xl border border-line bg-bg p-3.5"
                >
                  <p className="truncate text-[15px] font-semibold text-ink">
                    {req.displayName}
                  </p>
                  <p className="mt-0.5 text-[11px] text-muted">
                    Wants to join · {req.phoneMasked}
                  </p>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => void decide("approve", req.membershipId)}
                      className="min-h-11 rounded-xl bg-ink text-[15px] font-semibold text-bg active:scale-[0.98]"
                    >
                      Approve
                    </button>
                    <button
                      type="button"
                      onClick={() => void decide("reject", req.membershipId)}
                      className="min-h-11 rounded-xl border border-line bg-surface text-[15px] font-semibold text-muted active:scale-[0.98]"
                    >
                      Not now
                    </button>
                  </div>
                </div>
              ))}

              {resets.map((r) => (
                <div
                  key={String(r.resetId)}
                  className="rounded-2xl border border-line bg-bg p-3.5"
                >
                  <p className="truncate text-[15px] font-semibold text-ink">
                    {r.displayName}
                  </p>
                  <p className="mt-0.5 text-[11px] text-muted">
                    {r.status === "pending"
                      ? "Forgot their PIN"
                      : "Has a temporary PIN — waiting to sign in"}
                  </p>
                  {r.status === "pending" ? (
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => void decidePinReset("approve", r.resetId)}
                        className="min-h-11 rounded-xl bg-ink text-[15px] font-semibold text-bg active:scale-[0.98]"
                      >
                        Reset PIN
                      </button>
                      <button
                        type="button"
                        onClick={() => void decidePinReset("reject", r.resetId)}
                        className="min-h-11 rounded-xl border border-line bg-surface text-[15px] font-semibold text-muted active:scale-[0.98]"
                      >
                        Ignore
                      </button>
                    </div>
                  ) : null}
                  {r.tempPin ? (
                    <div className="mt-3 rounded-xl bg-accent-soft px-3.5 py-3">
                      <p className="text-[11px] leading-relaxed text-accent-deep">
                        Give {r.displayName} this temporary PIN — they’ll set
                        their own after signing in.
                      </p>
                      <p className="tabular mt-1.5 text-2xl font-semibold tracking-[0.3em] text-ink">
                        {r.tempPin}
                      </p>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </section>
        ) : null}

        <div className="flex gap-2">
          <div className="relative w-full">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search players"
              className="min-h-12 w-full rounded-xl border border-line bg-surface pl-4 pr-12 text-[16px] text-ink outline-none placeholder:text-faint focus:border-accent"
            />
            {search ? (
              <button
                type="button"
                aria-label="Clear search"
                onClick={() => setSearch("")}
                className="absolute right-0 top-0 flex h-12 w-12 items-center justify-center rounded-xl text-muted active:bg-ink/[0.04]"
              >
                <X className="h-4 w-4" />
              </button>
            ) : null}
          </div>
          <Button
            type="button"
            variant="secondary"
            onClick={() => setGuestOpen((v) => !v)}
            className="shrink-0 text-accent-deep"
          >
            <Plus className="h-4 w-4" />
            Guest
          </Button>
        </div>

        {guestOpen ? (
          <div className="space-y-2 rounded-2xl border border-line bg-surface p-4">
            <Input
              value={guestName}
              onChange={(e) => setGuestName(e.target.value)}
              placeholder="Guest name"
              autoFocus
              className="bg-bg"
            />
            <Input
              value={guestPhone}
              onChange={(e) => setGuestPhone(e.target.value)}
              placeholder="Phone (optional — lets them claim stats later)"
              inputMode="tel"
              className="bg-bg"
            />
            <Button
              type="button"
              fullWidth
              disabled={busy || guestName.trim().length < 2}
              onClick={() => void submitGuest()}
            >
              {busy ? "Adding…" : "Add guest player"}
            </Button>
          </div>
        ) : null}

        {players === undefined ? (
          <div className="space-y-2">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-14 animate-pulse rounded-2xl bg-line/60" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            title={search.trim() ? "Nobody by that name" : "No players yet"}
            body={
              search.trim()
                ? "They may not be in the pool yet. Add them as a guest and they can claim their stats later."
                : "Add the players you turn up with. Anyone without the app goes in as a guest."
            }
            action={
              <Button
                type="button"
                onClick={() => openGuestForm(search.trim())}
              >
                <Plus className="h-4 w-4" />
                {search.trim() ? `Add ${search.trim()}` : "Add a guest player"}
              </Button>
            }
          />
        ) : (
          <>
            <p className="px-1 text-[11px] font-medium text-muted">
              {search.trim()
                ? `${filtered.length} of ${(players ?? []).length} players`
                : `${filtered.length} player${filtered.length === 1 ? "" : "s"}`}
              {isAdmin ? " · tap Visitor or Junior to tag" : ""}
            </p>
            <div className="overflow-hidden rounded-2xl border border-line bg-surface">
              {filtered.map((p) => (
                <div
                  key={String(p.userId)}
                  className="flex min-h-12 items-center gap-3 border-b border-line/60 px-3.5 py-2.5 last:border-b-0"
                >
                  <Link
                    href={`/players/${p.userId}`}
                    className="flex min-w-0 flex-1 items-center gap-3 active:opacity-70"
                  >
                    {/* Same face as the Records screen's holder chip — the two
                        directories read as one system. */}
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-ink/[0.05] text-[13px] font-bold text-muted">
                      {initials(p.displayName)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex min-w-0 items-center gap-2">
                        <span
                          className="truncate text-[15px] font-semibold text-ink"
                          title={p.displayName}
                        >
                          {p.displayName}
                        </span>
                        {p.isAdmin ? (
                          <span className="shrink-0 rounded-full bg-ink/[0.06] px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-muted">
                            Admin
                          </span>
                        ) : null}
                      </span>
                      <span className="tabular mt-0.5 block truncate text-[13px] text-muted">
                        {summary.get(String(p.userId)) ?? "Yet to play"}
                      </span>
                    </span>
                  </Link>
                  {isAdmin ? (
                    <PlayerTagEditor
                      tags={p.playerTags}
                      busy={tagBusyId === String(p.userId)}
                      onToggle={(tag) => void onToggleTag(p.userId, tag)}
                    />
                  ) : (
                    <PlayerTagList tags={p.playerTags} />
                  )}
                  <Link
                    href={`/players/${p.userId}`}
                    aria-label={`Open ${p.displayName}`}
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-faint active:bg-ink/[0.04]"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Link>
                </div>
              ))}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
