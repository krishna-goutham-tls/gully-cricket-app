"use client";

import { useAuth } from "@/components/providers/AuthProvider";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";

// "/" is the public landing page; app/page.tsx handles the signed-in bounce
// itself, so the gate must neither redirect strangers off it nor treat a
// signed-in visit as "on an open path, send to /home" (page.tsx already does).
// /privacy and /support are public policy pages (Apple requires both URLs
// live on the domain before an iOS app can ship).
// /gully-rules, /feed, /match-stories, /release-notes are public reading pages
// — nested slugs stay open too. Only "/" and "/login" bounce signed-in users.
const OPEN_PATHS = [
  "/",
  "/login",
  "/privacy",
  "/support",
  "/gully-rules",
  "/feed",
  "/match-stories",
  "/release-notes",
];

function isOpenPath(pathname: string) {
  return OPEN_PATHS.some((path) => {
    if (path === "/") return pathname === "/";
    return pathname === path || pathname.startsWith(`${path}/`);
  });
}

export function AppGate({ children }: { children: React.ReactNode }) {
  const { token, user, loading, activeMemberships } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!token || !user) {
      if (!isOpenPath(pathname)) router.replace("/login");
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
    // but the policy and reading pages stay readable for everyone.
    if (["/", "/login"].includes(pathname)) {
      if (activeMemberships.length > 0) router.replace("/home");
      else router.replace("/join");
      return;
    }
    if (isOpenPath(pathname)) return;

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
