"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useAuth } from "@/components/providers/AuthProvider";
import { AppHeader } from "@/components/shell/AppHeader";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Id } from "@/convex/_generated/dataModel";
import { shortDate } from "@/lib/dates";
import { errorMessage } from "@/lib/utils";

/**
 * The platform owner's queue: who wants a community, and the one button that
 * lets them have one.
 *
 * Approving does NOT create anything — it unlocks that phone number to create
 * a single community itself. The WhatsApp conversation happens in between,
 * which is the entire point of the gate, so every row leads with a wa.me link.
 */
export default function AccessRequestsPage() {
  const { token } = useAuth();
  const data = useQuery(api.access.listRequests, token ? { token } : "skip");
  const approve = useMutation(api.access.approveRequest);
  const dismiss = useMutation(api.access.dismissRequest);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const pending = data?.pending ?? [];
  const decided = data?.decided ?? [];

  async function decide(
    action: "approve" | "dismiss",
    requestId: Id<"accessRequests">,
  ) {
    if (!token) return;
    setBusyId(requestId);
    setError(null);
    try {
      if (action === "approve") await approve({ token, requestId });
      else await dismiss({ token, requestId });
    } catch (e) {
      setError(errorMessage(e, "Could not save that"));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <AppHeader title="Access requests" />
      <main className="mx-auto max-w-md space-y-4 px-5 py-5">
        {error ? (
          <p className="rounded-2xl border border-danger/20 bg-danger-soft px-4 py-2.5 text-[13px] text-danger">
            {error}
          </p>
        ) : null}

        {data === undefined ? (
          <div className="space-y-3">
            {[0, 1].map((i) => (
              <div key={i} className="h-32 animate-pulse rounded-2xl bg-line/60" />
            ))}
          </div>
        ) : pending.length === 0 && decided.length === 0 ? (
          <EmptyState
            title="Nobody waiting"
            body="Registrations from the landing page land here. You'll see a badge on Profile the moment one does."
          />
        ) : null}

        {pending.length > 0 ? (
          <section className="overflow-hidden rounded-2xl border border-accent/40 bg-surface shadow-card">
            <div className="flex items-center justify-between gap-3 border-b border-accent/20 bg-accent-soft px-4 py-3">
              <p className="text-[13px] font-semibold text-accent-deep">
                Waiting on you
              </p>
              <span className="tabular rounded-full bg-accent px-2.5 py-0.5 text-[11px] font-bold text-ink">
                {pending.length}
              </span>
            </div>

            <div className="space-y-3 p-4">
              {pending.map((r) => (
                <div
                  key={String(r.requestId)}
                  className="rounded-2xl border border-line bg-bg p-3.5"
                >
                  <p className="truncate text-[15px] font-semibold text-ink">
                    {r.name || "No name given"}
                  </p>
                  <p className="mt-0.5 text-[11px] text-muted">
                    {[r.groupType, r.groupSize].filter(Boolean).join(" · ") ||
                      "No details given"}
                  </p>
                  <a
                    href={`https://wa.me/${r.phone.replace(/\D/g, "")}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="tabular mt-2 inline-flex min-h-11 items-center text-[13px] font-semibold text-accent-deep underline-offset-4 hover:underline"
                  >
                    {r.phone} — message on WhatsApp
                  </a>
                  <p className="mt-0.5 text-[11px] text-faint">
                    Asked {shortDate(r.requestedAt)}
                  </p>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <Button
                      disabled={busyId === r.requestId}
                      onClick={() => void decide("approve", r.requestId)}
                    >
                      Approve
                    </Button>
                    <Button
                      variant="secondary"
                      disabled={busyId === r.requestId}
                      onClick={() => void decide("dismiss", r.requestId)}
                    >
                      Not now
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {decided.length > 0 ? (
          <section className="overflow-hidden rounded-2xl border border-line bg-surface">
            <div className="border-b border-line px-4 py-3">
              <p className="text-[13px] font-semibold text-ink">Already decided</p>
            </div>
            <div className="divide-y divide-line">
              {decided.map((r) => (
                <div key={String(r.requestId)} className="px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="min-w-0 flex-1 truncate text-[13px] font-medium text-ink">
                      {r.name || "No name given"}
                    </p>
                    <span
                      className={
                        r.status === "approved"
                          ? "shrink-0 rounded-full border border-accent/30 bg-accent-soft px-2.5 py-0.5 text-[11px] font-semibold text-accent-deep"
                          : "shrink-0 rounded-full border border-line px-2.5 py-0.5 text-[11px] font-semibold text-faint"
                      }
                    >
                      {r.status === "approved"
                        ? r.used
                          ? "Community created"
                          : "Approved — not set up yet"
                        : "Not now"}
                    </span>
                  </div>
                  <p className="tabular mt-0.5 text-[11px] text-faint">{r.phone}</p>
                  {r.status === "dismissed" ? (
                    <button
                      type="button"
                      disabled={busyId === r.requestId}
                      onClick={() => void decide("approve", r.requestId)}
                      className="mt-1.5 min-h-11 text-[11px] font-semibold text-accent-deep underline-offset-4 hover:underline disabled:opacity-50"
                    >
                      Changed my mind — approve
                    </button>
                  ) : null}
                </div>
              ))}
            </div>
          </section>
        ) : null}
      </main>
    </div>
  );
}
