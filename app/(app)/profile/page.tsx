"use client";

import { AppHeader } from "@/components/shell/AppHeader";
import { useAuth } from "@/components/providers/AuthProvider";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import Link from "next/link";
import { BarChart3, ChevronRight, Settings } from "lucide-react";

export default function ProfilePage() {
  const { user } = useAuth();
  const initial = (user?.displayName || "P").slice(0, 1).toUpperCase();

  return (
    <div>
      <AppHeader title="Profile" />
      <main className="mx-auto max-w-md space-y-3 px-5 py-5">
        <div className="flex items-center gap-3 px-1">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-accent-soft text-lg font-semibold text-accent-deep">
            {initial}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[15px] font-semibold text-ink">
              {user?.displayName || "Player"}
            </p>
            <p className="truncate text-[13px] text-muted">{user?.phone}</p>
          </div>
        </div>

        {/* The post-game tap: this page is how players reach their own numbers,
            so the stats doorway leads. */}
        {user?._id ? (
          <Link
            href={`/players/${user._id}`}
            className="flex min-h-12 items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3 active:bg-bg"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent-deep">
              <BarChart3 className="h-4 w-4" strokeWidth={2.2} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-semibold text-ink">
                My stats
              </span>
              <span className="block text-[13px] text-muted">
                Runs, wickets, form & match-ups
              </span>
            </span>
            <ChevronRight className="h-5 w-5 shrink-0 text-faint" />
          </Link>
        ) : null}

        <Link
          href="/settings"
          className="flex min-h-12 items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3 active:bg-bg"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent-deep">
            <Settings className="h-4 w-4" strokeWidth={2.2} />
          </span>
          <span className="min-w-0 flex-1 text-[15px] font-semibold text-ink">
            Settings
          </span>
          <ChevronRight className="h-5 w-5 shrink-0 text-faint" />
        </Link>

        {/* Renders for nobody but the platform owner. */}
        <AccessRequestsRow />
      </main>
    </div>
  );
}

/**
 * Entry to the access-request queue. `amPlatformAdmin` is false for every
 * normal player, so this renders nothing for them.
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
      className="flex min-h-14 items-center justify-between gap-3 rounded-2xl border border-line bg-surface px-4 py-3"
    >
      <div className="min-w-0">
        <p className="text-[15px] font-semibold text-ink">Access requests</p>
        <p className="mt-0.5 text-[11px] text-muted">
          {waiting > 0
            ? `${waiting} community${waiting === 1 ? "" : "s"} waiting on you`
            : "Nobody waiting"}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {waiting > 0 ? (
          <span className="tabular flex h-6 min-w-6 items-center justify-center rounded-full bg-danger px-1.5 text-[11px] font-bold text-bg">
            {waiting}
          </span>
        ) : null}
        <ChevronRight className="h-5 w-5 text-faint" />
      </div>
    </Link>
  );
}
