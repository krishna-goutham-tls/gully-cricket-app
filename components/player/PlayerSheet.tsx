"use client";

import Link from "next/link";
import { useState } from "react";
import { useMutation } from "convex/react";
import { ChevronRight, Pencil, X } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { PlayerTag } from "@/lib/playerLabel";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { SwitchRow } from "@/components/ui/Switch";
import { errorMessage } from "@/lib/utils";

export type SheetPlayer = {
  userId: Id<"users">;
  displayName: string;
  playerTags: PlayerTag[];
  isAdmin: boolean;
  hasAccount: boolean;
};

/**
 * An admin's sheet for one player: Junior and Visitor tags, Admin, rename for
 * a guest, the profile and Remove. A junior or a visitor cannot be admin, and
 * a guest cannot be admin, because a guest cannot sign in.
 */
export function PlayerSheet({
  token,
  orgId,
  player,
  isSelf,
  isSandbox,
  onRemove,
  onClose,
}: {
  token: string;
  orgId: Id<"orgs">;
  player: SheetPlayer;
  isSelf: boolean;
  isSandbox: boolean;
  onRemove: () => void;
  onClose: () => void;
}) {
  const toggleTag = useMutation(api.players.togglePlayerTag);
  const setRoles = useMutation(api.orgs.setRoles);
  const renameGuest = useMutation(api.players.renameGuest);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(player.displayName);

  async function run(fn: () => Promise<unknown>) {
    if (busy) return false;
    setBusy(true);
    setError(null);
    try {
      await fn();
      return true;
    } catch (e) {
      setError(errorMessage(e, "Could not save"));
      return false;
    } finally {
      setBusy(false);
    }
  }

  const tagged = player.playerTags.length > 0;
  const canRename = !player.hasAccount && !isSandbox;
  // Admin is for a regular player who can sign in. The sandbox makes everyone
  // admin. Your own admin is not here, so one stray tap cannot lock you out.
  // An old guest who still holds admin shows it, so it can be taken off.
  const showAdmin = !isSandbox && !isSelf && (player.hasAccount || player.isAdmin);
  // Tags show unless the player is an admin. Old data can hold an admin with a
  // tag; it shows so the tag can come off.
  const showTags = isSandbox || !player.isAdmin || tagged;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 sm:items-center"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-label={player.displayName}
        className="w-full max-w-md rounded-t-2xl bg-surface pb-[calc(1rem+env(safe-area-inset-bottom))] shadow-lift sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-2 px-4 pt-4">
          {renaming ? (
            <div className="min-w-0 flex-1 space-y-2">
              <Input
                label="Guest name"
                value={name}
                maxLength={40}
                autoFocus
                onChange={(e) => setName(e.target.value)}
              />
              <div className="flex gap-2">
                <Button variant="secondary" className="flex-1" onClick={() => setRenaming(false)}>
                  Cancel
                </Button>
                <Button
                  className="flex-1"
                  disabled={busy || name.trim().length < 2}
                  onClick={async () => {
                    const ok = await run(() =>
                      renameGuest({ token, orgId, userId: player.userId, name }),
                    );
                    if (ok) setRenaming(false);
                  }}
                >
                  Save
                </Button>
              </div>
            </div>
          ) : (
            <h2 className="min-w-0 flex-1 break-words pt-2 text-[17px] font-semibold leading-snug text-ink">
              {player.displayName}
            </h2>
          )}
          {!renaming && canRename ? (
            <button
              type="button"
              aria-label="Rename guest"
              onClick={() => {
                setName(player.displayName);
                setRenaming(true);
              }}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-muted active:bg-ink/[0.04]"
            >
              <Pencil className="h-4 w-4" />
            </button>
          ) : null}
          {!renaming ? (
            <button
              type="button"
              aria-label="Close"
              onClick={onClose}
              className="-mr-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-muted active:bg-ink/[0.04]"
            >
              <X className="h-5 w-5" />
            </button>
          ) : null}
        </div>

        {error ? (
          <p className="mx-4 mt-3 rounded-2xl border border-danger/20 bg-danger-soft px-4 py-2.5 text-[13px] text-danger">
            {error}
          </p>
        ) : null}

        <div className="mt-3 border-y border-line">
          {!showTags ? null : (
            <>
              <SwitchRow
                label="Junior"
                checked={player.playerTags.includes("junior")}
                disabled={busy}
                onChange={() =>
                  void run(() => toggleTag({ token, orgId, userId: player.userId, tag: "junior" }))
                }
              />
              <SwitchRow
                label="Visitor"
                checked={player.playerTags.includes("visitor")}
                disabled={busy}
                onChange={() =>
                  void run(() => toggleTag({ token, orgId, userId: player.userId, tag: "visitor" }))
                }
              />
            </>
          )}
          {showAdmin ? (
            <SwitchRow
              label="Admin"
              line={tagged ? "Juniors and visitors cannot be admin" : undefined}
              checked={player.isAdmin}
              disabled={busy || (tagged && !player.isAdmin)}
              onChange={(on) =>
                void run(() =>
                  setRoles({
                    token,
                    orgId,
                    userId: player.userId,
                    roles: on ? ["admin", "player"] : ["player"],
                  }),
                )
              }
            />
          ) : null}
          <Link
            href={`/players/${player.userId}`}
            className="flex min-h-14 items-center justify-between border-t border-line px-4 text-[15px] font-semibold text-ink active:bg-bg"
          >
            Open profile
            <ChevronRight className="h-5 w-5 text-faint" />
          </Link>
        </div>

        {!isSelf && !isSandbox ? (
          <button
            type="button"
            onClick={onRemove}
            className="flex min-h-12 w-full items-center px-4 text-[15px] font-semibold text-danger active:bg-danger-soft"
          >
            Remove from community
          </button>
        ) : null}
      </div>
    </div>
  );
}
