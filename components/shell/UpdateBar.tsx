"use client";

import { api } from "@/convex/_generated/api";
import { useQuery } from "convex/react";
import { RefreshCw } from "lucide-react";

const RUNNING = process.env.NEXT_PUBLIC_APP_VERSION ?? "";

/**
 * "Gully has an update" when a newer build is live. A saved home-screen app
 * can run an old build for days; this gets phones onto the new one, so old
 * server functions can go sooner. The live version arrives over the Convex
 * connection the app already holds, so nothing polls. The layout leaves the
 * bar out of full-screen flows, so nobody reloads mid-over.
 */
export function UpdateBar() {
  const live = useQuery(api.appVersion.live);
  const stale =
    process.env.NODE_ENV === "production" &&
    Boolean(RUNNING) &&
    Boolean(live) &&
    live !== RUNNING;

  if (!stale) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(5.75rem+env(safe-area-inset-bottom))] z-40 flex justify-center px-5">
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="pointer-events-auto flex min-h-12 w-full max-w-md items-center justify-between gap-3 rounded-2xl bg-ink px-4 text-bg shadow-lift active:opacity-90"
      >
        <span className="text-[15px] font-semibold">Gully has an update</span>
        <span className="flex items-center gap-1.5 text-[13px] font-semibold text-accent">
          <RefreshCw className="h-4 w-4" />
          Tap to reload
        </span>
      </button>
    </div>
  );
}
