"use client";

import { RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";

const RUNNING = process.env.NEXT_PUBLIC_APP_VERSION ?? "";
const EVERY_MS = 15 * 60 * 1000;

/**
 * "Gully has an update" when a newer build is live. A saved home-screen app
 * can run an old build for days; this gets phones onto the new one, so old
 * server functions can go sooner. It checks when the app comes back to the
 * front and every 15 minutes. The layout leaves it out of full-screen flows,
 * so nobody reloads mid-over.
 */
export function UpdateBar() {
  const [stale, setStale] = useState(false);

  useEffect(() => {
    if (!RUNNING || process.env.NODE_ENV !== "production") return;
    let stop = false;
    const check = async (always = false) => {
      if (!always && document.visibilityState === "hidden") return;
      try {
        const res = await fetch(`/api/version?t=${Date.now()}`, { cache: "no-store" });
        if (!res.ok) return;
        const { v } = (await res.json()) as { v?: string };
        if (!stop && v && v !== RUNNING) setStale(true);
      } catch {
        /* offline at the ground: try again later */
      }
    };
    const onShow = () => void check();
    void check(true);
    const timer = window.setInterval(onShow, EVERY_MS);
    document.addEventListener("visibilitychange", onShow);
    return () => {
      stop = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onShow);
    };
  }, []);

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
