"use client";

import { useAuth } from "@/components/providers/AuthProvider";
import { Logo } from "@/components/ui/Logo";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { usePathname } from "next/navigation";

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

export function ReadingNav() {
  const { token, user } = useAuth();
  const pathname = usePathname();
  const homeHref = token && user ? "/home" : "/";
  const onNotes = pathname.startsWith("/release-notes");
  const onRules = pathname.startsWith("/gully-rules");

  return (
    <header className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
      <Link href={homeHref} className="flex min-h-11 min-w-0 items-center gap-2.5">
        <Logo size={32} />
        <span className="truncate font-bold tracking-tight text-ink">
          Gully Cricket
        </span>
      </Link>
      <nav className="flex shrink-0 items-center">
        <NavLink href="/release-notes" active={onNotes}>
          Notes
        </NavLink>
        <NavLink href="/gully-rules" active={onRules}>
          Rules
        </NavLink>
        <NavLink href={homeHref} active={false}>
          Home
        </NavLink>
      </nav>
    </header>
  );
}
