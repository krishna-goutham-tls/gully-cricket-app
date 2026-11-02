"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { ArrowLeft, ChevronRight } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { FeatureKey } from "@/convex/lib/features";
import { useAuth } from "@/components/providers/AuthProvider";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Input";
import { SwitchTrack } from "@/components/ui/Switch";
import { errorMessage } from "@/lib/utils";

/**
 * The admin's settings for the community. A switch changes what players see,
 * never a number, so an admin can flip it any time.
 */
export default function CommunityPage() {
  const { token, activeOrgId, isSandbox } = useAuth();
  const settings = useQuery(
    api.orgs.settings,
    token && activeOrgId && !isSandbox ? { token, orgId: activeOrgId } : "skip",
  );
  const rename = useMutation(api.orgs.rename);
  const setFeature = useMutation(api.orgs.setFeature);
  const setTitle = useMutation(api.orgs.setJuniorBoardTitle);

  const [editName, setEditName] = useState(false);
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

  const features = settings?.features;
  const titleDirty = title.trim() !== savedTitle && title.trim().length > 0;

  return (
    <div className="bg-bg pb-6">
      <header className="sticky top-0 z-30 border-b border-line bg-bg/90 px-5 pb-3 pt-[calc(var(--safe-top)+0.75rem)] backdrop-blur-md">
        <div className="mx-auto flex max-w-md items-center gap-1">
          <Link
            href="/profile"
            aria-label="Back to profile"
            className="-ml-2 flex h-11 w-11 items-center justify-center rounded-lg text-muted active:bg-line/60"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <h1 className="min-w-0 flex-1 text-xl font-semibold leading-tight tracking-tight text-ink">
            Community
          </h1>
        </div>
      </header>

      <main className="mx-auto max-w-md space-y-3 px-5 py-5">
        {settings === undefined && !isSandbox ? (
          <div className="h-72 animate-pulse rounded-2xl bg-line/60" />
        ) : !settings || !features ? (
          <EmptyState title="Admins only" />
        ) : (
          <>
            {error ? (
              <p className="rounded-2xl border border-danger/20 bg-danger-soft px-4 py-2.5 text-[13px] text-danger">
                {error}
              </p>
            ) : null}

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
                    <Button
                      variant="secondary"
                      className="flex-1"
                      onClick={() => setEditName(false)}
                    >
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
                <button
                  type="button"
                  onClick={() => {
                    setName(settings.name);
                    setEditName(true);
                  }}
                  className="flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left active:bg-bg"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] text-muted">Name</span>
                    <span className="block truncate text-[15px] font-semibold text-ink">
                      {settings.name}
                    </span>
                  </span>
                  <ChevronRight className="h-5 w-5 shrink-0 text-faint" />
                </button>
              )}

              <Link
                href="/players"
                className="flex min-h-14 items-center gap-3 border-t border-line px-4 py-3 active:bg-bg"
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] text-muted">Admins</span>
                  <span className="block truncate text-[15px] font-semibold text-ink">
                    {settings.admins.join(", ")}
                  </span>
                </span>
                <ChevronRight className="h-5 w-5 shrink-0 text-faint" />
              </Link>
            </div>

            <div className="overflow-hidden rounded-2xl border border-line bg-surface">
              <SwitchRow
                label="Series"
                line="Hides the Series tab"
                checked={features.series}
                disabled={busy !== null}
                onChange={(on) => flip("series", on)}
              />
              <SwitchRow
                label="The Roast"
                line="Most ducks, Butterfingers, Nemesis"
                checked={features.roast}
                disabled={busy !== null}
                onChange={(on) => flip("roast", on)}
              />
              {features.roast ? (
                <>
                  <SwitchRow
                    label="Junior board"
                    line="Points off juniors"
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
                        <Button
                          disabled={busy !== null}
                          onClick={() => void saveTitle()}
                        >
                          {busy === "title" ? "Saving…" : "Save"}
                        </Button>
                      ) : null}
                    </div>
                  ) : null}
                </>
              ) : null}
            </div>
          </>
        )}
      </main>
    </div>
  );
}

/** The whole row is the switch, so the tap target is the full row. */
function SwitchRow({
  label,
  line,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  line: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (on: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="flex min-h-14 w-full items-center gap-3 border-t border-line px-4 py-3 text-left first:border-t-0 active:bg-bg disabled:opacity-60"
    >
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-semibold text-ink">{label}</span>
        <span className="block text-[13px] leading-snug text-muted">{line}</span>
      </span>
      <SwitchTrack checked={checked} />
    </button>
  );
}
