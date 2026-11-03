"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { useAuth } from "@/components/providers/AuthProvider";
import { AppHeader } from "@/components/shell/AppHeader";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { TruncText } from "@/components/ui/TruncText";
import { WhatsAppIcon } from "@/components/ui/WhatsAppIcon";
import { shortDate } from "@/lib/dates";
import { errorMessage } from "@/lib/utils";

/**
 * The platform owner's page. New communities, newest first, so Krishna can
 * message each new admin and close a junk one. Close hides it from its
 * members and the landing counter; nothing is deleted.
 */
export default function AdminPage() {
  const { token } = useAuth();
  const isPlatformAdmin = useQuery(api.access.amPlatformAdmin, token ? { token } : "skip");
  const rows = useQuery(api.admin.newCommunities, token ? { token } : "skip");
  // Old phones can still send access requests. Only this page counts them.
  const oldRequests = useQuery(api.access.pendingCount, token ? { token } : "skip") ?? 0;
  const setClosed = useMutation(api.admin.setClosed);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function toggle(orgId: Id<"orgs">, closed: boolean) {
    if (!token) return;
    setBusyId(orgId);
    setError(null);
    try {
      await setClosed({ token, orgId, closed });
    } catch (e) {
      setError(errorMessage(e, "Could not save that"));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <AppHeader title="New communities" subtitle={null} />
      <main className="mx-auto max-w-md space-y-4 px-5 py-5">
        {error ? (
          <p className="rounded-2xl border border-danger/20 bg-danger-soft px-4 py-2.5 text-[13px] text-danger">
            {error}
          </p>
        ) : null}

        {rows === undefined || isPlatformAdmin === undefined ? (
          <div className="space-y-3">
            {[0, 1].map((i) => (
              <div key={i} className="h-28 animate-pulse rounded-2xl bg-line/60" />
            ))}
          </div>
        ) : !isPlatformAdmin ? (
          <EmptyState title="Nothing here" />
        ) : rows.length === 0 ? (
          <EmptyState title="No communities yet" />
        ) : (
          <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
            {rows.map((r) => (
              <div
                key={String(r.orgId)}
                data-testid="new-community"
                className="border-b border-line/60 px-4 py-3.5 last:border-b-0"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <TruncText
                      lines={2}
                      className="text-[15px] font-semibold leading-tight text-ink"
                    >
                      {r.name}
                    </TruncText>
                    <p className="tabular mt-0.5 text-[13px] text-muted">
                      {shortDate(r.createdAt)} · {r.matches}{" "}
                      {r.matches === 1 ? "match" : "matches"}
                      {r.closed ? " · Closed" : ""}
                    </p>
                  </div>
                  <Button
                    variant={r.closed ? "secondary" : "danger"}
                    className="shrink-0 px-4"
                    disabled={busyId === r.orgId}
                    onClick={() => void toggle(r.orgId, !r.closed)}
                  >
                    {r.closed ? "Open again" : "Close"}
                  </Button>
                </div>
                {r.adminPhone ? (
                  <a
                    href={`https://wa.me/${r.adminPhone.replace(/\D/g, "")}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="tabular mt-1 inline-flex min-h-11 items-center gap-2 text-[13px] font-semibold text-accent-deep underline-offset-4 hover:underline"
                  >
                    <WhatsAppIcon className="h-4 w-4" />
                    {r.adminName ? `${r.adminName} · ` : ""}
                    {r.adminPhone}
                  </a>
                ) : null}
              </div>
            ))}
          </div>
        )}

        {isPlatformAdmin ? (
          <Link
            href="/admin/requests"
            className="flex min-h-12 items-center justify-between gap-3 rounded-2xl border border-line bg-surface px-4 py-3 active:bg-bg"
          >
            <span className="text-[15px] font-semibold text-ink">Old access requests</span>
            {oldRequests > 0 ? (
              <span className="tabular ml-auto rounded-full bg-ink px-2 py-0.5 text-[12px] font-semibold text-bg">
                {oldRequests}
              </span>
            ) : null}
            <ChevronRight className="h-5 w-5 shrink-0 text-faint" />
          </Link>
        ) : null}
      </main>
    </div>
  );
}
