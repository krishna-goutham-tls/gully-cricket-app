"use client";

import { AppHeader } from "@/components/shell/AppHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Input } from "@/components/ui/Input";
import { WhatsAppIcon } from "@/components/ui/WhatsAppIcon";
import { InviteSheet } from "@/components/player/InviteSheet";
import { useAuth } from "@/components/providers/AuthProvider";
import { api } from "@/convex/_generated/api";
import { useMutation, useQuery } from "convex/react";
import { Id } from "@/convex/_generated/dataModel";
import { errorMessage } from "@/lib/utils";
import { PlayerSheet } from "@/components/player/PlayerSheet";
import { PLAYER_TAG_COPY } from "@/lib/playerLabel";
import Link from "next/link";
import { useMemo, useState } from "react";
import { ChevronRight, Plus, X } from "lucide-react";

const NEW_TAG_MS = 7 * 24 * 60 * 60 * 1000;

export default function PlayersPage() {
  const { token, activeOrgId, activeOrg, isAdmin, isSandbox, user } = useAuth();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [removing, setRemoving] = useState<{
    userId: Id<"users">;
    displayName: string;
  } | null>(null);
  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useState<Id<"users"> | null>(null);
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
  const approveMember = useMutation(api.orgs.approveMember);
  const rejectMember = useMutation(api.orgs.rejectMember);
  const approvePinReset = useMutation(api.auth.approvePinReset);
  const rejectPinReset = useMutation(api.auth.rejectPinReset);
  const removeMember = useMutation(api.orgs.removeMember);

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
      if (r.runs > 0) put(String(r.userId), `${r.runs} run${r.runs === 1 ? "" : "s"}`);
    }
    for (const r of board.bowling) {
      if (r.wickets > 0) put(String(r.userId), `${r.wickets} wkt${r.wickets === 1 ? "" : "s"}`);
    }
    return map;
  }, [board]);
  // Approved resets linger until the temp PIN is used — they are shown for
  // reference but nothing is waiting on the admin, so they don't count.
  const waitingCount =
    joinRequests.length + resets.filter((r) => r.status === "pending").length;

  // The sheet reads the live row, so a tag change shows at once.
  const openPlayer = (players ?? []).find((p) => p.userId === openId) ?? null;

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

  async function confirmRemove() {
    if (!token || !activeOrgId || !removing) return;
    setBusy(true);
    setError(null);
    try {
      await removeMember({ token, orgId: activeOrgId, userId: removing.userId });
    } catch (e) {
      setError(errorMessage(e, "Could not remove that player"));
    } finally {
      setRemoving(null);
      setBusy(false);
    }
  }

  function openGuestForm(prefill: string) {
    setGuestName(prefill);
    setGuestOpen(true);
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
                      : "Temporary PIN · not signed in yet"}
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
                      <p className="text-[11px] text-accent-deep">
                        Give {r.displayName} this one-time PIN
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

        {isAdmin && !isSandbox ? (
          <Button type="button" fullWidth onClick={() => setInviteOpen(true)}>
            <WhatsAppIcon className="h-5 w-5" />
            Invite players
          </Button>
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
              placeholder="Phone (optional)"
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
                ? "Add them as a guest."
                : "Add the people you play with."
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
            </p>
            <div className="overflow-hidden rounded-2xl border border-line bg-surface">
              {filtered.map((p) => {
                const isNew =
                  isAdmin && !!p.joinedByLinkAt && Date.now() - p.joinedByLinkAt < NEW_TAG_MS;
                const words = [
                  ...(p.isAdmin ? ["Admin"] : []),
                  ...p.playerTags.map((t) => PLAYER_TAG_COPY[t]),
                ];
                const body = (
                  <>
                    <span className="min-w-0 flex-1">
                      <span className="line-clamp-2 break-words text-[15px] font-semibold leading-snug text-ink">
                        {p.displayName}
                      </span>
                      <span className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-1.5 text-[13px] text-muted">
                        {isNew ? (
                          <span className="font-semibold text-accent-deep">New</span>
                        ) : null}
                        {words.length > 0 ? (
                          <span className="font-semibold text-ink/70">{words.join(" · ")}</span>
                        ) : isAdmin ? (
                          <span className="rounded-md border border-line px-1.5 text-[11px] font-semibold leading-5 text-muted">
                            + Tag
                          </span>
                        ) : null}
                        <span className="tabular min-w-0 truncate">
                          {summary.get(String(p.userId)) ?? "Yet to play"}
                        </span>
                      </span>
                    </span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-faint" />
                  </>
                );
                const rowCls =
                  "flex min-h-14 w-full items-center gap-3 border-b border-line/60 px-4 py-2.5 text-left last:border-b-0 active:bg-bg";
                return isAdmin ? (
                  <button
                    key={String(p.userId)}
                    type="button"
                    onClick={() => setOpenId(p.userId)}
                    className={rowCls}
                  >
                    {body}
                  </button>
                ) : (
                  <Link key={String(p.userId)} href={`/players/${p.userId}`} className={rowCls}>
                    {body}
                  </Link>
                );
              })}
            </div>
          </>
        )}
      </main>

      {inviteOpen && token && activeOrgId && activeOrg ? (
        <InviteSheet
          token={token}
          orgId={activeOrgId}
          orgName={activeOrg.orgName}
          onClose={() => setInviteOpen(false)}
        />
      ) : null}

      {openPlayer && isAdmin && token && activeOrgId ? (
        <PlayerSheet
          token={token}
          orgId={activeOrgId}
          player={openPlayer}
          isSelf={openPlayer.userId === user?._id}
          isSandbox={isSandbox}
          onRemove={() => {
            setRemoving({ userId: openPlayer.userId, displayName: openPlayer.displayName });
            setOpenId(null);
          }}
          onClose={() => setOpenId(null)}
        />
      ) : null}

      <ConfirmDialog
        open={removing !== null}
        title={`Remove ${removing?.displayName ?? ""} from community?`}
        description="Their stats stay."
        confirmLabel="Remove"
        danger
        busy={busy}
        onConfirm={() => void confirmRemove()}
        onCancel={() => setRemoving(null)}
      />
    </div>
  );
}
