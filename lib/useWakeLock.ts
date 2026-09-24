"use client";

import { useEffect } from "react";

/**
 * Keeps the phone screen on while `active` — the scorer's phone sits in a
 * pocket between balls and a dimmed screen costs a tap to wake. The browser
 * drops the lock whenever the tab is hidden, so it is taken again on return.
 * Browsers without the Wake Lock API get nothing, silently.
 */
export function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active) return;
    if (typeof navigator === "undefined" || !("wakeLock" in navigator)) return;

    let lock: WakeLockSentinel | null = null;
    let requesting = false;
    let stopped = false;

    async function acquire() {
      if (stopped || lock || requesting) return;
      if (document.visibilityState !== "visible") return;
      requesting = true;
      try {
        const next = await navigator.wakeLock.request("screen");
        if (stopped) {
          void next.release().catch(() => {});
          return;
        }
        lock = next;
        next.addEventListener("release", () => {
          if (lock === next) lock = null;
        });
      } catch {
        // Denied (battery saver, no user gesture yet) — nothing to do.
      } finally {
        requesting = false;
      }
    }

    function onVisibility() {
      if (document.visibilityState === "visible") void acquire();
    }

    void acquire();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stopped = true;
      document.removeEventListener("visibilitychange", onVisibility);
      if (lock) void lock.release().catch(() => {});
      lock = null;
    };
  }, [active]);
}
