"use client";

import { useAuth } from "@/components/providers/AuthProvider";
import { Logo } from "@/components/ui/Logo";
import { markFeedSeen } from "@/lib/feedSeen";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";

function NavLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex min-h-11 items-center rounded-xl px-2.5 text-[13px] font-semibold",
        active ? "text-ink" : "text-muted active:bg-ink/[0.04]",
      )}
    >
      {children}
    </Link>
  );
}

export function ReadingChrome({ children }: { children: React.ReactNode }) {
  const { token, user } = useAuth();
  const pathname = usePathname();
  const homeHref = token && user ? "/home" : "/";
  const onFeed = pathname === "/feed" || pathname.startsWith("/feed/");
  const onStories = pathname.startsWith("/match-stories");
  const onNotes = pathname.startsWith("/release-notes");

  useEffect(() => {
    markFeedSeen();
  }, []);

  return (
    <main className="full-bleed min-h-dvh bg-bg">
      <div className="mx-auto max-w-6xl px-5 pt-[calc(var(--safe-top)+1rem)]">
        <header className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
          <Link href={homeHref} className="flex min-h-11 min-w-0 items-center gap-2.5">
            <Logo size={32} />
            <span className="truncate font-bold tracking-tight text-ink">
              Gully Cricket
            </span>
          </Link>
          <nav className="flex shrink-0 items-center">
            <NavLink href="/feed" active={onFeed}>
              Feed
            </NavLink>
            <NavLink href="/match-stories" active={onStories}>
              Stories
            </NavLink>
            <NavLink href="/release-notes" active={onNotes}>
              Notes
            </NavLink>
            <NavLink href={homeHref} active={false}>
              Home
            </NavLink>
          </nav>
        </header>
      </div>

      <div className="mx-auto w-full max-w-[40rem] px-5 pb-[calc(2rem+env(safe-area-inset-bottom))] pt-10">
        {children}
      </div>
    </main>
  );
}
