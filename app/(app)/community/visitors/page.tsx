"use client";

import Link from "next/link";
import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { ArrowLeft } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { useAuth } from "@/components/providers/AuthProvider";
import { EmptyState } from "@/components/ui/EmptyState";
import { SwitchRow } from "@/components/ui/Switch";
import { errorMessage } from "@/lib/utils";
import { juniorRuleChangeMailto } from "@/lib/juniorRule";

/**
 * Visitors and juniors, one level below Settings. Most communities
 * have neither. Showing visitors on Leaders is a switch; the junior rule moves
 * numbers, so it is not: Change emails Krishna.
 */
export default function VisitorsPage() {
  const { token, activeOrgId, isSandbox } = useAuth();
  const settings = useQuery(
    api.orgs.settings,
    token && activeOrgId && !isSandbox ? { token, orgId: activeOrgId } : "skip",
  );
  const setFeature = useMutation(api.orgs.setFeature);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function flip(on: boolean) {
    if (!token || !activeOrgId || busy) return;
    setBusy(true);
    setError(null);
    try {
      await setFeature({ token, orgId: activeOrgId, key: "visitorsOnLeaders", on });
    } catch (e) {
      setError(errorMessage(e, "Could not save"));
    } finally {
      setBusy(false);
    }
  }

  const features = settings?.features;

  return (
    <div className="bg-bg pb-6">
      <header className="sticky top-0 z-30 border-b border-line bg-bg/90 px-5 pb-3 pt-[calc(var(--safe-top)+0.75rem)] backdrop-blur-md">
        <div className="mx-auto flex max-w-md items-center gap-1">
          <Link
            href="/settings"
            aria-label="Back to Settings"
            className="-ml-2 flex h-11 w-11 items-center justify-center rounded-lg text-muted active:bg-line/60"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <h1 className="min-w-0 flex-1 text-xl font-semibold leading-tight tracking-tight text-ink">
            Visitors
          </h1>
        </div>
      </header>

      <main className="mx-auto max-w-md space-y-3 px-5 py-5">
        {settings === undefined && !isSandbox ? (
          <div className="h-40 animate-pulse rounded-2xl bg-line/60" />
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
              <SwitchRow
                label="Show visitors on Leaders"
                checked={features.visitorsOnLeaders}
                disabled={busy}
                onChange={(on) => void flip(on)}
              />
              <div className="border-t border-line px-4 pb-1 pt-3">
                <span className="block text-[15px] font-semibold text-ink">Juniors</span>
                <span className="block text-[13px] leading-snug text-muted">
                  {features.juniorRule
                    ? "Seniors get no points off a Junior. The scorecard shows everything."
                    : "Seniors get points off a Junior too."}
                </span>
                <a
                  href={juniorRuleChangeMailto(settings.name, features.juniorRule)}
                  className="inline-flex min-h-11 items-center text-[13px] font-semibold text-accent-deep active:opacity-70"
                >
                  Change
                </a>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
