"use client";

import { LandingPage } from "@/components/landing/LandingPage";
import { useAuth } from "@/components/providers/AuthProvider";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * The front door stays a traffic cop for anyone signed in — regulars tap the
 * icon and land in the app, same as ever. Only logged-out strangers see the
 * landing page.
 */
export default function RootPage() {
  const { token, user, loading, activeMemberships } = useAuth();
  const router = useRouter();
  const signedIn = !loading && !!token && !!user;

  useEffect(() => {
    if (!signedIn) return;
    if (activeMemberships.length > 0) router.replace("/home");
    else router.replace("/join");
  }, [signedIn, activeMemberships.length, router]);

  if (loading || signedIn) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-bg">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-line border-t-accent" />
      </div>
    );
  }

  return <LandingPage />;
}
