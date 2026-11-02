"use client";

import Link from "next/link";
import { useAuth } from "@/components/providers/AuthProvider";
import { AppHeader } from "@/components/shell/AppHeader";
import { EmptyState } from "@/components/ui/EmptyState";

/**
 * Every series page, including old links people shared. When an admin turns
 * Series off, the pages show one line instead. Nothing is deleted, so turning
 * it on again shows every series as it was.
 */
export default function TournamentsLayout({ children }: { children: React.ReactNode }) {
  const { features, isAdmin, isSandbox } = useAuth();
  if (features.series) return <>{children}</>;

  return (
    <div>
      <AppHeader title="Series" />
      <main className="mx-auto max-w-md px-5 py-6">
        <EmptyState
          title="Series is off"
          action={
            isAdmin && !isSandbox ? (
              <Link
                href="/community"
                className="inline-flex items-center rounded-xl bg-ink px-5 text-[15px] font-semibold text-bg"
              >
                Open Community
              </Link>
            ) : undefined
          }
        />
      </main>
    </div>
  );
}
