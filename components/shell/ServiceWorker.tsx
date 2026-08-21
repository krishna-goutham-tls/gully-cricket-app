"use client";

import { useEffect } from "react";

/**
 * Registers the service worker in production only — a worker sitting in front
 * of the dev server would fight hot reload for no benefit.
 *
 * Registration is deferred to `load` so it never competes with the first paint
 * for bandwidth, and every failure is swallowed: a browser that refuses to
 * register (private mode, unsupported, blocked) should get the app exactly as
 * it works today, not an error.
 */
export function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
      return;
    }
    const register = () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        /* app works fine without it */
      });
    };
    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });
  }, []);

  return null;
}
