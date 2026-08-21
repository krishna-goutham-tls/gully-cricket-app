"use client";

import { AppHeader } from "@/components/shell/AppHeader";
import { useAuth } from "@/components/providers/AuthProvider";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Input } from "@/components/ui/Input";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { BarChart3, ChevronDown, ChevronRight } from "lucide-react";
import { cn, errorMessage } from "@/lib/utils";

const ROLES = ["batsman", "bowler", "all-rounder", "keeper"] as const;

export default function ProfilePage() {
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

  const initial = (user?.displayName || "P").slice(0, 1).toUpperCase();

  return (
    <div>
      <AppHeader title="Profile" />
      <main className="mx-auto max-w-md space-y-3 px-5 py-5">
        {/* The post-game tap: this page is how players reach their own numbers,
            so the stats doorway leads. */}
        {user?._id ? (
          <Link
            href={`/players/${user._id}`}
            className="flex min-h-12 items-center gap-3 rounded-3xl border border-line bg-surface px-4 py-3 active:bg-bg"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent-deep">
              <BarChart3 className="h-4 w-4" strokeWidth={2.2} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-semibold text-ink">
                My stats
              </span>
              <span className="block text-[12px] text-muted">
                Runs, wickets, form & match-ups
              </span>
            </span>
            <ChevronRight className="h-5 w-5 shrink-0 text-faint" />
          </Link>
        ) : null}

        {/* Everything else is a settings list — one card, thin rows, expand only
            what you actually came to change, so the page opens on one screen. */}
        <div className="overflow-hidden rounded-3xl border border-line bg-surface">
          <div className="flex items-center gap-3 px-4 py-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-accent-soft text-lg font-semibold text-accent-deep">
              {initial}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[16px] font-semibold text-ink">
                {user?.displayName || "Player"}
              </p>
              <p className="truncate text-[13px] text-muted">{user?.phone}</p>
            </div>
          </div>

          {/* Edit profile — collapsed by default (touched once, then rarely). */}
          <Row
            label="Edit profile"
            open={editOpen}
            onClick={() => setEditOpen((v) => !v)}
          />
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
              {error ? <p className="text-sm text-danger">{error}</p> : null}
              {message ? (
                <p className="text-sm text-accent-deep">{message}</p>
              ) : null}
              <Button fullWidth disabled={busy} onClick={() => void onSave()}>
                {busy ? "Saving…" : "Save"}
              </Button>
            </div>
          ) : null}

          {/* Change PIN — collapsed by default. */}
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
                onChange={(e) =>
                  setCurrentPin(e.target.value.replace(/\D/g, "").slice(0, 4))
                }
              />
              <Input
                label="New PIN"
                inputMode="numeric"
                maxLength={4}
                placeholder="••••"
                value={newPin}
                onChange={(e) =>
                  setNewPin(e.target.value.replace(/\D/g, "").slice(0, 4))
                }
              />
              {pinError ? <p className="text-sm text-danger">{pinError}</p> : null}
              <Button
                fullWidth
                disabled={
                  pinBusy || currentPin.length !== 4 || newPin.length !== 4
                }
                onClick={() => void onChangePin()}
              >
                {pinBusy ? "Saving…" : "Save PIN"}
              </Button>
            </div>
          ) : null}

          {/* Sandbox — a single toggle, not a card. */}
          <SandboxRow />
        </div>

        {/* Renders for nobody but the platform owner. */}
        <AccessRequestsRow />

        <Button variant="danger" fullWidth onClick={() => void onLogout()}>
          Sign out
        </Button>
      </main>
    </div>
  );
}

/** A thin settings row: label (+ optional hint), rotates a chevron when open. */
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
    <button
      type="button"
      onClick={onClick}
      aria-expanded={open}
      className="flex min-h-12 w-full items-center justify-between border-t border-line px-4 text-[15px] font-semibold text-ink active:bg-bg"
    >
      {label}
      <span className="flex items-center gap-2 text-[13px] text-muted">
        {hint ? <span>{hint}</span> : null}
        <ChevronDown
          className={cn(
            "h-4 w-4 text-faint transition-transform",
            open && "rotate-180",
          )}
        />
      </span>
    </button>
  );
}

/**
 * Sandbox entry/exit as one toggle row. The sandbox is a real org paired with
 * the live one, so switching mode is just switching org — every screen is
 * already scoped that way and follows along. The reset lives below the toggle,
 * shown only while you're inside.
 */
/**
 * Entry to the access-request queue. `amPlatformAdmin` is false for every
 * normal player, so this collapses to nothing — the row is not hidden with
 * CSS, it never renders.
 */
function AccessRequestsRow() {
  const { token } = useAuth();
  const isPlatformAdmin =
    useQuery(api.access.amPlatformAdmin, token ? { token } : "skip") ?? false;
  const waiting =
    useQuery(api.access.pendingCount, token ? { token } : "skip") ?? 0;

  if (!isPlatformAdmin) return null;

  return (
    <Link
      href="/admin/requests"
      className="flex min-h-14 items-center justify-between gap-3 rounded-3xl border border-line bg-surface px-4 py-3"
    >
      <div className="min-w-0">
        <p className="text-[15px] font-semibold text-ink">Access requests</p>
        <p className="mt-0.5 text-xs text-muted">
          {waiting > 0
            ? `${waiting} community${waiting === 1 ? "" : "s"} waiting on you`
            : "Nobody waiting"}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {waiting > 0 ? (
          <span className="tabular flex h-6 min-w-6 items-center justify-center rounded-full bg-danger px-1.5 text-xs font-bold text-bg">
            {waiting}
          </span>
        ) : null}
        <ChevronRight className="h-5 w-5 text-faint" />
      </div>
    </Link>
  );
}

function SandboxRow() {
  const { token, activeOrgId, activeOrg, isSandbox, selectOrg } = useAuth();
  const enterSandbox = useMutation(api.orgs.enterSandbox);
  const clearSandbox = useMutation(api.orgs.clearSandboxData);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [cleared, setCleared] = useState<number | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);

  if (!activeOrgId) return null;

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
      setErr(errorMessage(e, "Could not switch the sandbox"));
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
      setErr(errorMessage(e, "Could not clear the sandbox"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="border-t border-line">
      <div className="flex min-h-12 items-center gap-3 px-4 py-2.5">
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-medium text-ink">Sandbox mode</p>
          <p className="text-[12px] leading-snug text-muted">
            A practice space — matches here don&apos;t count towards stats.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={isSandbox}
          aria-label="Sandbox mode"
          disabled={busy}
          onClick={() => void toggle()}
          className={cn(
            "relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-60",
            isSandbox ? "bg-accent" : "bg-line",
          )}
        >
          <span
            className={cn(
              "absolute top-0.5 h-5 w-5 rounded-full bg-surface shadow transition-all",
              isSandbox ? "left-[22px]" : "left-0.5",
            )}
          />
        </button>
      </div>

      {isSandbox ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => setConfirmReset(true)}
          className="flex min-h-11 w-full items-center px-4 pb-3 text-[13px] font-semibold text-muted active:bg-bg active:text-ink"
        >
          {cleared === null
            ? "Clear sandbox now"
            : `Cleared ${cleared} match${cleared === 1 ? "" : "es"}`}
        </button>
      ) : null}

      {err ? <p className="px-4 pb-3 text-sm text-danger">{err}</p> : null}

      <ConfirmDialog
        open={confirmReset}
        title="Delete every sandbox match?"
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
