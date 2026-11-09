"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { ArrowLeft, ChevronDown, ChevronRight, X } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { FeatureKey } from "@/convex/lib/features";
import { GroundsSettings } from "@/components/ground/GroundsSettings";
import { InviteSheet } from "@/components/player/InviteSheet";
import { useAuth } from "@/components/providers/AuthProvider";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Input } from "@/components/ui/Input";
import { SwitchRow, SwitchTrack } from "@/components/ui/Switch";
import { cn, errorMessage } from "@/lib/utils";

const ROLES = ["batsman", "bowler", "all-rounder", "keeper"] as const;

const rowCls =
  "flex min-h-12 w-full items-center justify-between gap-3 border-t border-line px-4 text-left text-[15px] font-semibold text-ink first:border-t-0 active:bg-bg";

function GroupLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-1 pb-1.5 pt-3 text-[11px] font-semibold uppercase tracking-wide text-faint">
      {children}
    </p>
  );
}

/** A row that opens a panel under it. */
function Row({
  label,
  hint,
  open,
  onClick,
}: {
  label: string;
  hint?: string;
  open: boolean;
  onClick: () => void;
}) {
  return (
    <button type="button" onClick={onClick} aria-expanded={open} className={rowCls}>
      {label}
      <span className="flex items-center gap-2 text-[13px] font-normal text-muted">
        {hint ? <span>{hint}</span> : null}
        <ChevronDown
          className={cn("h-4 w-4 text-faint transition-transform", open && "rotate-180")}
        />
      </span>
    </button>
  );
}

/** A row that goes to another screen or opens a sheet. */
function LinkRow({
  label,
  value,
  href,
  onClick,
}: {
  label: string;
  value?: string;
  href?: string;
  onClick?: () => void;
}) {
  const inner = (
    <>
      <span className="min-w-0 flex-1">
        <span className={cn("block", value ? "text-[13px] font-normal text-muted" : "")}>
          {label}
        </span>
        {value ? (
          <span className="block break-words text-[15px] font-semibold text-ink">{value}</span>
        ) : null}
      </span>
      <ChevronRight className="h-5 w-5 shrink-0 text-faint" />
    </>
  );
  const cls = cn(rowCls, value && "min-h-14 py-3");
  return href ? (
    <Link href={href} className={cls}>
      {inner}
    </Link>
  ) : (
    <button type="button" onClick={onClick} className={cls}>
      {inner}
    </button>
  );
}

/**
 * Everything a person sets, on one screen. Every player sees their account.
 * Admins of a real community also see the community and its extra features.
 */
export default function SettingsPage() {
  const { isAdmin, isSandbox, isObserver, user, activeOrgId } = useAuth();
  const admin = isAdmin && !isSandbox && !isObserver;
  const back = user && activeOrgId ? `/players/${user._id}` : "/profile";

  return (
    <div className="bg-bg pb-6">
      <header className="sticky top-0 z-30 border-b border-line bg-bg/90 px-5 pb-3 pt-[calc(var(--safe-top)+0.75rem)] backdrop-blur-md">
        <div className="mx-auto flex max-w-md items-center gap-1">
          <Link
            href={back}
            aria-label="Back to profile"
            className="-ml-2 flex h-11 w-11 items-center justify-center rounded-lg text-muted active:bg-line/60"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <h1 className="min-w-0 flex-1 text-xl font-semibold leading-tight tracking-tight text-ink">
            Settings
          </h1>
        </div>
      </header>

      <main className="mx-auto max-w-md px-5 py-2">
        <AccessRequestsRow />
        <AccountGroup />
        {admin ? <AdminGroups /> : null}
      </main>
    </div>
  );
}

function AccountGroup() {
  const { token, user, logout } = useAuth();
  const updateProfile = useMutation(api.auth.updateProfile);
  const changePin = useMutation(api.auth.changePin);
  const router = useRouter();

  const [editOpen, setEditOpen] = useState(false);
  const [pinOpen, setPinOpen] = useState(false);
  const [currentPin, setCurrentPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [pinBusy, setPinBusy] = useState(false);
  const [pinError, setPinError] = useState<string | null>(null);
  const [pinDone, setPinDone] = useState(false);

  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [primaryRole, setPrimaryRole] = useState<(typeof ROLES)[number] | "">("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    setDisplayName(user.displayName ?? "");
    setBio(user.bio ?? "");
    setPrimaryRole(user.primaryRole ?? "");
  }, [user]);

  async function onSave() {
    if (!token) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await updateProfile({
        token,
        displayName,
        bio,
        primaryRole: primaryRole || undefined,
      });
      setMessage("Saved");
    } catch (e) {
      setError(errorMessage(e, "Could not save"));
    } finally {
      setBusy(false);
    }
  }

  async function onChangePin() {
    if (!token) return;
    setPinBusy(true);
    setPinError(null);
    try {
      await changePin({ token, currentPin, newPin });
      setPinDone(true);
      setPinOpen(false);
      setCurrentPin("");
      setNewPin("");
    } catch (e) {
      setPinError(errorMessage(e, "Could not change your PIN"));
    } finally {
      setPinBusy(false);
    }
  }

  async function onLogout() {
    await logout();
    router.replace("/login");
  }

  return (
    <>
      <GroupLabel>Your account</GroupLabel>
      <div className="overflow-hidden rounded-2xl border border-line bg-surface">
        <Row label="Name and bio" open={editOpen} onClick={() => setEditOpen((v) => !v)} />
        {editOpen ? (
          <div className="space-y-4 border-t border-line bg-bg/40 px-4 py-4">
            <Input
              label="Name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
            <Input
              label="Bio"
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="Optional"
            />
            <div>
              <p className="mb-2 text-[13px] font-medium text-muted">I mostly…</p>
              <div className="grid grid-cols-2 gap-2">
                {ROLES.map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setPrimaryRole(primaryRole === r ? "" : r)}
                    className={cn(
                      "min-h-11 rounded-2xl border px-3 py-3 text-[15px] font-semibold capitalize",
                      primaryRole === r
                        ? "border-accent bg-accent-soft text-accent-deep"
                        : "border-line text-muted",
                    )}
                  >
                    {r === "all-rounder"
                      ? "do both"
                      : r === "keeper"
                        ? "keep"
                        : r === "batsman"
                          ? "bat"
                          : "bowl"}
                  </button>
                ))}
              </div>
            </div>
            {error ? <p className="text-[13px] text-danger">{error}</p> : null}
            {message ? <p className="text-[13px] text-accent-deep">{message}</p> : null}
            <Button fullWidth disabled={busy} onClick={() => void onSave()}>
              {busy ? "Saving…" : "Save"}
            </Button>
          </div>
        ) : null}

        <Row
          label="Change PIN"
          hint={pinDone && !pinOpen ? "Updated" : undefined}
          open={pinOpen}
          onClick={() => {
            setPinDone(false);
            setPinError(null);
            setPinOpen((v) => !v);
            setCurrentPin("");
            setNewPin("");
          }}
        />
        {pinOpen ? (
          <div className="space-y-3 border-t border-line bg-bg/40 px-4 py-4">
            <Input
              label="Current PIN"
              inputMode="numeric"
              maxLength={4}
              placeholder="••••"
              value={currentPin}
              onChange={(e) => setCurrentPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
            />
            <Input
              label="New PIN"
              inputMode="numeric"
              maxLength={4}
              placeholder="••••"
              value={newPin}
              onChange={(e) => setNewPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
            />
            {pinError ? <p className="text-[13px] text-danger">{pinError}</p> : null}
            <Button
              fullWidth
              disabled={pinBusy || currentPin.length !== 4 || newPin.length !== 4}
              onClick={() => void onChangePin()}
            >
              {pinBusy ? "Saving…" : "Save PIN"}
            </Button>
          </div>
        ) : null}

        <PracticeRow />

        <LinkRow label="Ask for a feature or report a problem" href="/wishlist" />

        <button
          type="button"
          onClick={() => void onLogout()}
          className={cn(rowCls, "text-danger active:bg-danger-soft")}
        >
          Sign out
        </button>
      </div>
    </>
  );
}

function AdminGroups() {
  const { token, activeOrgId } = useAuth();
  const settings = useQuery(
    api.orgs.settings,
    token && activeOrgId ? { token, orgId: activeOrgId } : "skip",
  );
  const rename = useMutation(api.orgs.rename);
  const setFeature = useMutation(api.orgs.setFeature);
  const setTitle = useMutation(api.orgs.setJuniorBoardTitle);

  const [editName, setEditName] = useState(false);
  const [adminsOpen, setAdminsOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [groundsOpen, setGroundsOpen] = useState(false);
  const [name, setName] = useState("");
  const [title, setTitleDraft] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const savedTitle = settings?.juniorBoardTitle ?? "";
  useEffect(() => {
    setTitleDraft(savedTitle);
  }, [savedTitle]);

  async function run(key: string, fn: () => Promise<unknown>) {
    if (busy) return;
    setBusy(key);
    setError(null);
    try {
      await fn();
      return true;
    } catch (e) {
      setError(errorMessage(e, "Could not save"));
      return false;
    } finally {
      setBusy(null);
    }
  }

  function flip(key: FeatureKey, on: boolean) {
    if (!token || !activeOrgId) return;
    void run(key, () => setFeature({ token, orgId: activeOrgId, key, on }));
  }

  async function saveName() {
    if (!token || !activeOrgId) return;
    const ok = await run("name", () => rename({ token, orgId: activeOrgId, name }));
    if (ok) setEditName(false);
  }

  async function saveTitle() {
    if (!token || !activeOrgId) return;
    await run("title", () => setTitle({ token, orgId: activeOrgId, title }));
  }

  if (settings === undefined) {
    return <div className="mt-8 h-72 animate-pulse rounded-2xl bg-line/60" />;
  }
  if (!settings || !token || !activeOrgId) return null;

  const features = settings.features;
  const titleDirty = title.trim() !== savedTitle && title.trim().length > 0;

  return (
    <>
      {error ? (
        <p className="mt-3 rounded-2xl border border-danger/20 bg-danger-soft px-4 py-2.5 text-[13px] text-danger">
          {error}
        </p>
      ) : null}

      <GroupLabel>Community</GroupLabel>
      <div className="overflow-hidden rounded-2xl border border-line bg-surface">
        {editName ? (
          <div className="space-y-3 px-4 py-4">
            <Input
              label="Name"
              value={name}
              maxLength={40}
              autoFocus
              onChange={(e) => setName(e.target.value)}
            />
            <div className="flex gap-2">
              <Button variant="secondary" className="flex-1" onClick={() => setEditName(false)}>
                Cancel
              </Button>
              <Button
                className="flex-1"
                disabled={busy !== null || name.trim().length < 2}
                onClick={() => void saveName()}
              >
                {busy === "name" ? "Saving…" : "Save"}
              </Button>
            </div>
          </div>
        ) : (
          <LinkRow
            label="Name"
            value={settings.name}
            onClick={() => {
              setName(settings.name);
              setEditName(true);
            }}
          />
        )}
        <LinkRow
          label="Admins"
          value={settings.admins.join(", ")}
          onClick={() => setAdminsOpen(true)}
        />
        <LinkRow label="Invite link" onClick={() => setInviteOpen(true)} />
        <LinkRow label="Visitors" href="/community/visitors" />
        <SeasonsRow />
        <Row label="Grounds" open={groundsOpen} onClick={() => setGroundsOpen((v) => !v)} />
        {groundsOpen ? <GroundsSettings /> : null}
      </div>

      <GroupLabel>Extra features</GroupLabel>
      <div className="overflow-hidden rounded-2xl border border-line bg-surface">
        <SwitchRow
          label="Series"
          line="Fixed teams over several matches"
          checked={features.series}
          disabled={busy !== null}
          onChange={(on) => flip("series", on)}
        />
        <SwitchRow
          label="Test matches"
          line="Two innings each, against the clock"
          checked={features.testMatches}
          disabled={busy !== null}
          onChange={(on) => flip("testMatches", on)}
        />
        <SwitchRow
          label="Impact players"
          line="A Leaders tab of who adds the most per match"
          checked={features.impactPlayers}
          disabled={busy !== null}
          onChange={(on) => flip("impactPlayers", on)}
        />
        <SwitchRow
          label="The Roast"
          line="Joke awards for ducks, drops and Nemesis"
          checked={features.roast}
          disabled={busy !== null}
          onChange={(on) => flip("roast", on)}
        />
        {features.roast && features.juniorRule ? (
          <>
            <SwitchRow
              label="Junior board"
              line="A Roast board of points off juniors"
              checked={features.juniorBoard}
              disabled={busy !== null}
              onChange={(on) => flip("juniorBoard", on)}
            />
            {features.juniorBoard ? (
              <div className="flex items-end gap-2 px-4 pb-4">
                <div className="min-w-0 flex-1">
                  <Input
                    label="Board title"
                    value={title}
                    maxLength={settings.juniorBoardTitleMax}
                    onChange={(e) => setTitleDraft(e.target.value)}
                  />
                </div>
                {titleDirty ? (
                  <Button disabled={busy !== null} onClick={() => void saveTitle()}>
                    {busy === "title" ? "Saving…" : "Save"}
                  </Button>
                ) : null}
              </div>
            ) : null}
          </>
        ) : null}
      </div>

      {adminsOpen ? (
        <AdminsSheet token={token} orgId={activeOrgId} onClose={() => setAdminsOpen(false)} />
      ) : null}
      {inviteOpen ? (
        <InviteSheet
          token={token}
          orgId={activeOrgId}
          orgName={settings.name}
          onClose={() => setInviteOpen(false)}
        />
      ) : null}
    </>
  );
}

/**
 * Start or end a season. Ending one locks the caps and opens the season cards.
 * Admin only on the server too (`seasons.start`, `seasons.end`).
 */
function SeasonsRow() {
  const { token, activeOrgId, activeOrg } = useAuth();
  const router = useRouter();
  const startSeason = useMutation(api.seasons.start);
  const endSeason = useMutation(api.seasons.end);
  const [pending, setPending] = useState<"start" | "end" | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const featured =
    activeOrg && "featuredSeason" in activeOrg ? activeOrg.featuredSeason : undefined;
  const seasonCount = activeOrg?.seasonCount ?? 0;
  const current = featured?.status === "active" ? featured : null;
  const nextName = `Season-${String(seasonCount + 1).padStart(2, "0")}`;

  async function runPending() {
    if (!token || !activeOrgId || !pending) return;
    setBusy(true);
    setError(null);
    try {
      if (pending === "start") {
        await startSeason({ token, orgId: activeOrgId });
        setPending(null);
      } else {
        const seasonId = await endSeason({ token, orgId: activeOrgId });
        setPending(null);
        router.push(`/seasons/${String(seasonId)}/wrap`);
      }
    } catch (e) {
      setError(
        errorMessage(e, pending === "start" ? "Could not start the season" : "Could not end the season"),
      );
      setPending(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="border-t border-line px-4 py-3">
      <div className="flex min-h-11 items-center gap-3">
        <span className="min-w-0 flex-1">
          <span className="block text-[13px] text-muted">Seasons</span>
          <span className="block text-[15px] font-semibold text-ink">
            {current ? `${current.name} is on` : "No season on"}
          </span>
        </span>
        <Button
          variant="secondary"
          disabled={busy || featured === undefined}
          onClick={() => setPending(current ? "end" : "start")}
        >
          {current ? "End season" : "Start season"}
        </Button>
      </div>
      {seasonCount > 0 ? (
        <Link
          href="/seasons"
          className="mt-1 flex min-h-11 items-center justify-between text-[13px] font-semibold text-muted active:text-ink"
        >
          All seasons
          <ChevronRight className="h-4 w-4 text-faint" />
        </Link>
      ) : null}
      {error ? <p className="mt-2 text-[13px] text-danger">{error}</p> : null}

      <ConfirmDialog
        open={pending !== null}
        title={pending === "end" ? `End ${current?.name ?? "this season"}?` : `Start ${nextName}?`}
        description={
          pending === "end" ? "Caps lock in. Then the season cards." : "A fresh board. All-time stays."
        }
        confirmLabel={pending === "end" ? "End season" : "Start season"}
        busy={busy}
        onConfirm={() => void runPending()}
        onCancel={() => setPending(null)}
      />
    </div>
  );
}

/**
 * Practice mode is the sandbox: a paired community where matches count for
 * nothing. Every player can use it. Switching is just switching community,
 * so every screen follows.
 */
function PracticeRow() {
  const { token, activeOrgId, activeOrg, isSandbox, isObserver, selectOrg } = useAuth();
  const enterSandbox = useMutation(api.orgs.enterSandbox);
  const clearSandbox = useMutation(api.orgs.clearSandboxData);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [cleared, setCleared] = useState<number | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);

  if (!activeOrgId || isObserver) return null;

  async function toggle() {
    if (!token || !activeOrgId || busy) return;
    setErr(null);
    setBusy(true);
    try {
      if (isSandbox) {
        const back = activeOrg?.sandboxForOrgId;
        if (back) await selectOrg(back);
      } else {
        const res = await enterSandbox({ token, orgId: activeOrgId });
        // Never remembered as the preferred org — see AuthProvider.selectOrg.
        await selectOrg(res.orgId, { remember: false });
      }
    } catch (e) {
      setErr(errorMessage(e, "Could not switch practice mode"));
    } finally {
      setBusy(false);
    }
  }

  async function reset() {
    if (!token || !activeOrgId || busy) return;
    setConfirmReset(false);
    setErr(null);
    setBusy(true);
    try {
      const res = await clearSandbox({ token, orgId: activeOrgId });
      setCleared(res.matchesRemoved);
    } catch (e) {
      setErr(errorMessage(e, "Could not clear practice matches"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="border-t border-line first:border-t-0">
      <button
        type="button"
        role="switch"
        aria-checked={isSandbox}
        aria-label="Practice mode"
        disabled={busy}
        onClick={() => void toggle()}
        className="flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left active:bg-bg disabled:opacity-60"
      >
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-semibold text-ink">Practice mode</span>
          <span className="block text-[13px] leading-snug text-muted">
            Try scoring. Real numbers stay the same.
          </span>
        </span>
        <SwitchTrack checked={isSandbox} />
      </button>

      {isSandbox ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => setConfirmReset(true)}
          className="flex min-h-11 w-full items-center px-4 pb-3 text-[13px] font-semibold text-muted active:bg-bg active:text-ink"
        >
          {cleared === null
            ? "Clear practice matches"
            : `Cleared ${cleared} match${cleared === 1 ? "" : "es"}`}
        </button>
      ) : null}

      {err ? <p className="px-4 pb-3 text-[13px] text-danger">{err}</p> : null}

      <ConfirmDialog
        open={confirmReset}
        title="Delete every practice match?"
        description="Players are kept."
        confirmLabel="Delete"
        danger
        busy={busy}
        onConfirm={() => void reset()}
        onCancel={() => setConfirmReset(false)}
      />
    </div>
  );
}

/** The platform owner's All communities list. Renders nothing for everyone else. */
function AccessRequestsRow() {
  const { token } = useAuth();
  const isPlatformAdmin =
    useQuery(api.access.amPlatformAdmin, token ? { token } : "skip") ?? false;

  if (!isPlatformAdmin) return null;

  return (
    <Link
      href="/admin"
      className="mt-3 flex min-h-14 items-center justify-between gap-3 rounded-2xl border border-line bg-surface px-4 py-3 active:bg-bg"
    >
      <span className="text-[15px] font-semibold text-ink">All communities</span>
      <ChevronRight className="h-5 w-5 shrink-0 text-faint" />
    </Link>
  );
}

/**
 * Who runs the community. Only a regular player with an account can be made
 * admin, so juniors, visitors and guests are not offered.
 */
function AdminsSheet({
  token,
  orgId,
  onClose,
}: {
  token: string;
  orgId: Id<"orgs">;
  onClose: () => void;
}) {
  const { user } = useAuth();
  const players = useQuery(api.players.listOrgPlayers, { token, orgId });
  const setRoles = useMutation(api.orgs.setRoles);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const admins = (players ?? []).filter((p) => p.isAdmin);
  const eligible = (players ?? []).filter(
    (p) => !p.isAdmin && p.hasAccount && p.playerTags.length === 0,
  );

  async function change(userId: Id<"users">, admin: boolean) {
    setBusy(true);
    setError(null);
    try {
      await setRoles({ token, orgId, userId, roles: admin ? ["admin", "player"] : ["player"] });
      if (admin) setAdding(false);
    } catch (e) {
      setError(errorMessage(e, "Could not save"));
    } finally {
      setBusy(false);
    }
  }

  const sheetRow = "flex min-h-12 items-center gap-3 border-t border-line px-4 py-2 first:border-t-0";

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 sm:items-center"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-label="Admins"
        className="flex max-h-[85dvh] w-full max-w-md flex-col rounded-t-2xl bg-surface pb-[calc(1rem+env(safe-area-inset-bottom))] shadow-lift sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 px-4 pt-3">
          <h2 className="text-[17px] font-semibold text-ink">{adding ? "Add admin" : "Admins"}</h2>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="-mr-2 flex h-11 w-11 items-center justify-center rounded-xl text-muted active:bg-ink/[0.04]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        {error ? (
          <p className="mx-4 mt-2 rounded-2xl border border-danger/20 bg-danger-soft px-4 py-2.5 text-[13px] text-danger">
            {error}
          </p>
        ) : null}
        <div className="mt-2 min-h-0 flex-1 overflow-y-auto border-y border-line">
          {players === undefined ? (
            <div className="m-4 h-24 animate-pulse rounded-xl bg-line/60" />
          ) : adding ? (
            eligible.length === 0 ? (
              <p className="px-4 py-4 text-[13px] text-muted">No regular player with an account yet.</p>
            ) : (
              eligible.map((p) => (
                <button
                  key={String(p.userId)}
                  type="button"
                  disabled={busy}
                  onClick={() => void change(p.userId, true)}
                  className={`${sheetRow} w-full text-left active:bg-bg disabled:opacity-60`}
                >
                  <span className="min-w-0 flex-1 break-words text-[15px] font-semibold text-ink">
                    {p.displayName}
                  </span>
                  <span className="shrink-0 text-[13px] font-semibold text-accent-deep">Make admin</span>
                </button>
              ))
            )
          ) : (
            admins.map((p) => (
              <div key={String(p.userId)} className={sheetRow}>
                <span className="min-w-0 flex-1 break-words text-[15px] font-semibold text-ink">
                  {p.displayName}
                  {p.userId === user?._id ? <span className="font-normal text-muted"> (you)</span> : null}
                </span>
                {admins.length > 1 && p.userId !== user?._id ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void change(p.userId, false)}
                    className="min-h-11 shrink-0 px-2 text-[13px] font-semibold text-muted active:text-ink disabled:opacity-60"
                  >
                    Remove admin
                  </button>
                ) : null}
              </div>
            ))
          )}
        </div>
        <div className="px-4 pt-3">
          {adding ? (
            <Button variant="secondary" fullWidth onClick={() => setAdding(false)}>
              Back
            </Button>
          ) : (
            <Button fullWidth onClick={() => setAdding(true)}>
              Add admin
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
