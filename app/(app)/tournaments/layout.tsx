"use client";

import { useAuth } from "@/components/providers/AuthProvider";
import { AppHeader } from "@/components/shell/AppHeader";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";

/**
 * Every series page, including old links people shared. When an admin turns
 * Series off, the pages show one line instead. Nothing is deleted, so turning
 * it on again shows every series as it was. `/tournaments/new` has no bottom
 * nav, so the way out is a button here.
 */
export default function TournamentsLayout({ children }: { children: React.ReactNode }) {
  const { features, isAdmin, isSandbox } = useAuth();
  if (features.series) return <>{children}</>;

  const admin = isAdmin && !isSandbox;
  return (
    <div>
      <AppHeader title="Series" />
      <main className="mx-auto max-w-md px-5 py-6">
        <EmptyState
          title="Series is off"
          action={
            <Button href={admin ? "/settings" : "/home"}>
              {admin ? "Open Settings" : "Go to Home"}
            </Button>
          }
        />
      </main>
    </div>
  );
}
