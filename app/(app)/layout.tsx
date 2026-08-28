"use client";

import { useAuth } from "@/components/providers/AuthProvider";
import { BottomNav } from "@/components/shell/BottomNav";
import { SandboxChrome } from "@/components/shell/SandboxChrome";
import { cn } from "@/lib/utils";
import { usePathname } from "next/navigation";

const HIDE_NAV = ["/join", "/org/new", "/login", "/set-pin"];

function hideNav(pathname: string) {
  if (HIDE_NAV.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return true;
  }
  // Full-screen flows
  if (/^\/matches\/[^/]+\/score$/.test(pathname)) return true;
  if (pathname === "/matches/new") return true;
  if (pathname === "/tournaments/new") return true;
  if (pathname === "/hero") return true;
  if (/^\/seasons\/[^/]+\/wrap$/.test(pathname)) return true;
  return false;
}

export default function AppSectionLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { isSandbox } = useAuth();
  const showNav = !hideNav(pathname);

  return (
    <div className="min-h-dvh">
      <SandboxChrome />
      {/* With the stripe up top it owns the notch, so screens below stop
          paying the top inset themselves and don't double up. */}
      <div
        className={cn(
          showNav && "pb-[calc(5.5rem+env(safe-area-inset-bottom))]",
          isSandbox && "safe-top-owned",
        )}
      >
        {children}
      </div>
      {showNav ? <BottomNav /> : null}
    </div>
  );
}
