"use client";

import { useAuth } from "@/components/providers/AuthProvider";
import { Logo } from "@/components/ui/Logo";
import { Check, ChevronDown } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export function AppHeader({
  title,
  subtitle,
  trailing,
  below,
}: {
  title?: string;
  /** Replaces the org-name subtitle. Pass a node for a control (Leaders scope). */
  subtitle?: ReactNode;
  trailing?: ReactNode;
  /** Sits in the sticky header under the title row (discipline tabs). */
  below?: ReactNode;
}) {
  const { activeOrg, activeMemberships, selectOrg } = useAuth();
  const [open, setOpen] = useState(false);
  const switcherRef = useRef<HTMLDivElement>(null);
  const multiOrg = activeMemberships.length > 1;
  const orgSubtitle =
    subtitle === undefined && title && activeOrg?.orgName ? (
      <p
        className="truncate text-[13px] font-semibold text-muted"
        title={activeOrg.orgName}
      >
        {activeOrg.orgName}
      </p>
    ) : null;

  // A `fixed inset-0` click-catcher would resolve against this header's own
  // box (backdrop-blur-md establishes a containing block for fixed
  // descendants), not the viewport, so taps elsewhere on the page would
  // never reach it and the menu would stay stuck open. A document listener
  // has no such scoping problem.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (!switcherRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-bg/90 px-5 pt-[calc(var(--safe-top)+1rem)] backdrop-blur-md">
      <div className={cn("mx-auto max-w-md", below ? "pb-3" : "pb-4")}>
        <div className="flex items-center justify-between gap-3">
          <div className="flex h-11 min-w-0 flex-1 items-center gap-2.5">
            <Logo size={30} />
            <h1
              className="min-w-0 truncate text-xl font-semibold tracking-tight text-ink"
              title={title ?? activeOrg?.orgName ?? "Gully"}
            >
              {title ?? activeOrg?.orgName ?? "Gully"}
            </h1>
            {subtitle !== undefined || orgSubtitle ? (
              <>
                <span className="h-4 w-px shrink-0 bg-line" aria-hidden />
                <div
                  className={
                    subtitle !== undefined ? "shrink-0" : "min-w-0"
                  }
                >
                  {subtitle !== undefined ? subtitle : orgSubtitle}
                </div>
              </>
            ) : null}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {trailing}
            {multiOrg ? (
              <div ref={switcherRef} className="relative shrink-0">
                <button
                  type="button"
                  aria-label="Switch community"
                  aria-expanded={open}
                  onClick={() => setOpen((v) => !v)}
                  className="flex h-11 w-11 items-center justify-center rounded-lg border border-line bg-surface text-muted active:bg-bg"
                >
                  <ChevronDown className="h-5 w-5" />
                </button>
                {open ? (
                  <div className="absolute right-0 z-10 mt-2 w-56 overflow-hidden rounded-xl border border-line bg-surface shadow-lift">
                    {activeMemberships.map((m) => (
                      <button
                        key={m.orgId}
                        type="button"
                        onClick={async () => {
                          setOpen(false);
                          await selectOrg(m.orgId);
                        }}
                        className={cn(
                          "flex min-h-11 w-full items-center justify-between gap-2 px-4 py-3 text-left text-[15px] text-ink active:bg-bg",
                          m.orgId === activeOrg?.orgId &&
                            "font-semibold text-accent-deep",
                        )}
                      >
                        <span className="truncate">{m.orgName}</span>
                        {m.orgId === activeOrg?.orgId ? (
                          <Check className="h-4 w-4 shrink-0" />
                        ) : null}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
        {below ? <div className="pt-3">{below}</div> : null}
      </div>
    </header>
  );
}
