"use client";

import { useAuth } from "@/components/providers/AuthProvider";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { cn, errorMessage } from "@/lib/utils";
import { useMutation, useQuery } from "convex/react";
import { useState } from "react";

const ACTION =
  "flex min-h-11 shrink-0 items-center px-2 text-[13px] font-semibold text-muted active:text-ink";

/**
 * Admin-only: the community's grounds. The first one added is Home, and every
 * match already played counts as played there. Rename by tapping a ground;
 * Home moves with "Make Home"; a ground nobody uses any more is archived, not
 * deleted, because its matches still point at it.
 */
export function GroundsSettings() {
  const { token, activeOrgId } = useAuth();
  const grounds = useQuery(
    api.grounds.list,
    token && activeOrgId ? { token, orgId: activeOrgId } : "skip",
  );
  const add = useMutation(api.grounds.add);
  const update = useMutation(api.grounds.update);
  const setHome = useMutation(api.grounds.setHome);
  const setArchived = useMutation(api.grounds.setArchived);

  const [name, setName] = useState("");
  const [place, setPlace] = useState("");
  const [editing, setEditing] = useState<Id<"grounds"> | null>(null);
  const [editName, setEditName] = useState("");
  const [editPlace, setEditPlace] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(fn: () => Promise<unknown>, fallback: string) {
    if (busy) return false;
    setBusy(true);
    setError(null);
    try {
      await fn();
      return true;
    } catch (e) {
      setError(errorMessage(e, fallback));
      return false;
    } finally {
      setBusy(false);
    }
  }

  if (!token || !activeOrgId || !grounds) return null;

  return (
    <div className="space-y-3 border-t border-line bg-bg/40 px-4 py-4">
      {grounds.length === 0 ? (
        <p className="text-[13px] leading-relaxed text-muted">
          No grounds yet. The first one you add becomes Home, and every match
          so far counts as played there.
        </p>
      ) : (
        <div className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
          {grounds.map((g) => (
            <div key={g._id} className="px-3">
              <div className="flex min-h-12 items-center gap-1">
                <button
                  type="button"
                  onClick={() => {
                    setEditing(editing === g._id ? null : g._id);
                    setEditName(g.name);
                    setEditPlace(g.mapsUrl ?? g.area ?? "");
                  }}
                  className="min-w-0 flex-1 py-2 text-left"
                >
                  <span
                    className={cn(
                      "flex items-center gap-2 text-[15px] font-semibold",
                      g.archived ? "text-muted" : "text-ink",
                    )}
                  >
                    <span className="truncate">{g.name}</span>
                    {g.isHome ? (
                      <span className="shrink-0 rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-accent-deep">
                        Home
                      </span>
                    ) : null}
                  </span>
                  {g.area || g.mapsUrl || g.archived ? (
                    <span className="block truncate text-[13px] text-muted">
                      {g.archived ? "Archived" : (g.area ?? "Map link")}
                    </span>
                  ) : null}
                </button>
                {!g.isHome && !g.archived ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      void run(
                        () => setHome({ token, groundId: g._id }),
                        "Could not change Home",
                      )
                    }
                    className={ACTION}
                  >
                    Make Home
                  </button>
                ) : null}
                {!g.isHome ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      void run(
                        () =>
                          setArchived({
                            token,
                            groundId: g._id,
                            archived: !g.archived,
                          }),
                        "Could not change that ground",
                      )
                    }
                    className={ACTION}
                  >
                    {g.archived ? "Bring back" : "Archive"}
                  </button>
                ) : null}
              </div>
              {editing === g._id ? (
                <div className="space-y-2 pb-3">
                  <Input
                    aria-label="Ground name"
                    value={editName}
                    maxLength={30}
                    onChange={(e) => setEditName(e.target.value)}
                  />
                  <Input
                    aria-label="Area or map link"
                    placeholder="Area or map link (optional)"
                    value={editPlace}
                    onChange={(e) => setEditPlace(e.target.value)}
                  />
                  <Button
                    fullWidth
                    disabled={busy || !editName.trim()}
                    onClick={async () => {
                      const ok = await run(
                        () =>
                          update({
                            token,
                            groundId: g._id,
                            name: editName,
                            place: editPlace,
                          }),
                        "Could not save that ground",
                      );
                      if (ok) setEditing(null);
                    }}
                  >
                    Save
                  </Button>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}

      <div className="space-y-2">
        <Input
          aria-label="New ground name"
          placeholder={grounds.length === 0 ? "Home ground name" : "Another ground"}
          value={name}
          maxLength={30}
          onChange={(e) => setName(e.target.value)}
        />
        {name.trim() ? (
          <Input
            aria-label="Area or map link"
            placeholder="Area or map link (optional)"
            value={place}
            onChange={(e) => setPlace(e.target.value)}
          />
        ) : null}
        {error ? <p className="text-[13px] text-danger">{error}</p> : null}
        <Button
          variant="secondary"
          fullWidth
          disabled={busy || !name.trim()}
          onClick={async () => {
            const ok = await run(
              () =>
                add({
                  token,
                  orgId: activeOrgId,
                  name,
                  place: place || undefined,
                }),
              "Could not add that ground",
            );
            if (ok) {
              setName("");
              setPlace("");
            }
          }}
        >
          Add ground
        </Button>
      </div>
    </div>
  );
}
