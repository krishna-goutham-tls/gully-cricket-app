"use client";

import { cn } from "@/lib/utils";
import { useConvexConnectionState } from "convex/react";
import { useEffect, useState } from "react";

/**
 * Tells the scorer why the pad is waiting on a weak signal. Driven by the
 * Convex client's own connection events — no polling. Hidden when connected
 * and nothing is slow. Convex queues mutations while the socket is down and
 * sends them in order once it is back, so "Offline" is a status, not an error.
 *
 * `sending` is true while a scoring tap is in flight; the chip only speaks up
 * once that has taken longer than a normal round trip.
 */
export function ConnectionChip({ sending }: { sending: boolean }) {
  const { isWebSocketConnected, hasEverConnected } = useConvexConnectionState();
  const disconnected = hasEverConnected && !isWebSocketConnected;

  // One-shot timers, cleared as soon as the condition goes away: a socket
  // that blips and reconnects inside a second never shows the chip.
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    if (!disconnected) {
      setOffline(false);
      return;
    }
    const t = setTimeout(() => setOffline(true), 1000);
    return () => clearTimeout(t);
  }, [disconnected]);

  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (!sending) {
      setSlow(false);
      return;
    }
    const t = setTimeout(() => setSlow(true), 1500);
    return () => clearTimeout(t);
  }, [sending]);

  const text = offline
    ? "Offline — balls will send when signal is back"
    : slow
      ? "Sending…"
      : null;

  return (
    <p
      role="status"
      aria-live="polite"
      className={cn(
        "flex min-w-0 items-center gap-1.5 text-[13px] font-semibold leading-tight",
        offline ? "text-accent-deep" : "text-muted",
      )}
    >
      {text ? (
        <>
          <span
            className={cn(
              "h-1.5 w-1.5 shrink-0 rounded-full",
              offline ? "bg-accent-deep" : "bg-muted",
            )}
          />
          {text}
        </>
      ) : null}
    </p>
  );
}
