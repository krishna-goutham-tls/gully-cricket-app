"use client";

import { useAuth } from "@/components/providers/AuthProvider";
import { AppHeader } from "@/components/shell/AppHeader";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";

/**
 * The Profile tab is your own player page. Old links and bookmarks to
 * /profile land there. Someone with no community yet has no player page, so
 * they get the way to Settings (and Sign out) instead.
 */
export default function ProfilePage() {
  const { user, activeOrgId } = useAuth();
  const router = useRouter();
  const target = user && activeOrgId ? `/players/${user._id}` : null;

  useEffect(() => {
    if (target) router.replace(target);
  }, [target, router]);

  if (target || !user) {
    return (
      <div className="flex items-center justify-center bg-bg py-24">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-line border-t-accent" />
      </div>
    );
  }

  return (
    <div>
      <AppHeader title="Profile" />
      <main className="mx-auto max-w-md px-5 py-5">
        <Link
          href="/settings"
          className="flex min-h-12 items-center justify-between rounded-2xl border border-line bg-surface px-4 py-3 text-[15px] font-semibold text-ink active:bg-bg"
        >
          Settings
          <ChevronRight className="h-5 w-5 shrink-0 text-faint" />
        </Link>
      </main>
    </div>
  );
}
