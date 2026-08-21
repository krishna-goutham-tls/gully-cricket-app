"use client";

import { useAuth } from "@/components/providers/AuthProvider";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";

// "/" is the public landing page; app/page.tsx handles the signed-in bounce
// itself, so the gate must neither redirect strangers off it nor treat a
// signed-in visit as "on an open path, send to /home" (page.tsx already does).
// /privacy and /support are public policy pages (Apple requires both URLs
// live on the domain before an iOS app can ship).
const OPEN_PATHS = ["/", "/login", "/privacy", "/support", "/gully-rules"];

export function AppGate({ children }: { children: React.ReactNode }) {
  const { token, user, loading, activeMemberships } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!token || !user) {
      if (!OPEN_PATHS.includes(pathname)) router.replace("/login");
      return;
    }

    // A reset PIN is single-use — nothing else until they set their own
    if (user.mustChangePin) {
      if (pathname !== "/set-pin") router.replace("/set-pin");
      return;
    }
    if (pathname === "/set-pin") {
      router.replace("/home");
      return;
    }

    // Signed-in users bounce off the front door and login into the app —
    // but the policy pages stay readable for everyone, signed in or not.
    if (["/", "/login"].includes(pathname)) {
      if (activeMemberships.length > 0) router.replace("/home");
      else router.replace("/join");
      return;
    }
    if (OPEN_PATHS.includes(pathname)) return;

    // The access queue is the platform owner's, not a community's — it must
    // stay reachable even for an account with no community yet.
    const needsOrg = !["/join", "/org/new", "/profile", "/admin/requests"].includes(
      pathname,
    );
    if (activeMemberships.length === 0 && needsOrg) {
      router.replace("/join");
    }
  }, [
    loading,
    token,
    user,
    user?.mustChangePin,
    activeMemberships.length,
    pathname,
    router,
  ]);

  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-bg">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-line border-t-accent" />
      </div>
    );
  }

  return <>{children}</>;
}
