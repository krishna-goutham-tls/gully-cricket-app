"use client";

import { useAuth } from "@/components/providers/AuthProvider";
import { FlaskConical } from "lucide-react";
import { useState } from "react";

/**
 * Everything that marks the app as being in the test sandbox: a stripe across
 * the top and a frame around the whole screen.
 *
 * Deliberately loud, and present on every screen including the score pad —
 * scoring a real match while in the sandbox would quietly lose the whole match,
 * so this is the one place where a subtle indicator is the wrong call.
 *
 * The stripe also owns the top safe-area inset while shown; screens below it
 * pad with var(--safe-top), which the shell zeroes so they don't double up.
 */
export function SandboxChrome() {
  const { isSandbox, activeOrg, selectOrg } = useAuth();
  const [leaving, setLeaving] = useState(false);

  if (!isSandbox) return null;

  const backTo = activeOrg?.sandboxForOrgId;

  return (
    <>
      <div className="sticky top-0 z-40 bg-accent pt-[env(safe-area-inset-top)] text-ink">
        <div className="flex items-center gap-2 px-4 py-2">
          <FlaskConical className="h-4 w-4 shrink-0" />
          <p className="min-w-0 flex-1 text-[13px] font-semibold leading-tight">
            Sandbox
            <span className="ml-1.5 font-normal opacity-80">
              nothing here counts
            </span>
          </p>
          {backTo ? (
            <button
              type="button"
              disabled={leaving}
              onClick={async () => {
                setLeaving(true);
                try {
                  await selectOrg(backTo);
                } finally {
                  setLeaving(false);
                }
              }}
              className="shrink-0 rounded-full bg-ink/15 px-3 py-1 text-[12px] font-semibold active:bg-ink/25 disabled:opacity-50"
            >
              Exit
            </button>
          ) : null}
        </div>
      </div>

      {/*
        Frame around the viewport. Sits above the score sheets (z-50) so it
        stays visible with a picker open, and never eats taps.
      */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-[60] border-[3px] border-accent"
      />
    </>
  );
}
