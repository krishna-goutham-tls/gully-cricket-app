"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Home,
  Trophy,
  Users,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useAuth } from "@/components/providers/AuthProvider";
import { cn } from "@/lib/utils";

// Four tabs for every community: Home, Leaders, Players, Profile. Series shows
// only when an admin turns it on in Settings.
// Trophy belongs to tournaments everywhere else in the app, so Leaders takes
// the chart. "Series" over "Tournaments": the long label cannot fit five
// 44px+ items at 375px without dropping below 12px type.
// `badge` names which count rides on the item: members waiting on Players.
const items: Array<{
  href: string;
  label: string;
  icon: LucideIcon;
  badge?: "members";
}> = [
  { href: "/home", label: "Home", icon: Home },
  { href: "/tournaments", label: "Series", icon: Trophy },
  { href: "/leaderboard", label: "Leaders", icon: BarChart3 },
  { href: "/players", label: "Players", icon: Users, badge: "members" },
  { href: "/profile", label: "Profile", icon: UserRound },
];

export function BottomNav() {
  const pathname = usePathname();
  const { token, activeOrgId, features, user } = useAuth();
  // Profile is your own player page; /profile sends you there too.
  const ownPage = user ? `/players/${user._id}` : null;
  // Runs on every screen: two indexed reads, and zeroes for non-admins.
  const pending = useQuery(
    api.players.pendingApprovals,
    token && activeOrgId ? { token, orgId: activeOrgId } : "skip",
  );
  const waiting = pending?.total ?? 0;

  return (
    <nav className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 backdrop-blur-md">
      <div className="mx-auto flex max-w-md items-stretch justify-around px-1 pb-1 pt-1.5">
        {items
          .filter((item) => item.href !== "/tournaments" || features.series)
          .map((item) => {
          const isProfile = item.href === "/profile";
          const onOwnPage = ownPage !== null && pathname === ownPage;
          // Settings opens from Profile, so Profile stays lit there.
          const active = isProfile
            ? onOwnPage ||
              ["/profile", "/settings"].some(
                (href) => pathname === href || pathname.startsWith(`${href}/`),
              )
            : !(onOwnPage && item.href === "/players") &&
              (pathname === item.href || pathname.startsWith(`${item.href}/`));
          const href = isProfile && ownPage ? ownPage : item.href;
          const Icon = item.icon;
          const count = item.badge === "members" ? waiting : 0;
          return (
            <Link
              key={item.href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "relative flex min-h-14 flex-1 flex-col items-center justify-center gap-1 rounded-lg px-1 text-[11px] font-semibold transition-colors",
                active ? "text-ink" : "text-faint",
              )}
            >
              {active ? (
                <span className="absolute inset-x-3 top-0 h-0.5 rounded-full bg-accent" />
              ) : null}
              <span className="relative">
                <Icon className="h-5 w-5" strokeWidth={active ? 2.4 : 1.9} />
                {count > 0 ? (
                  <span
                    aria-label={`${count} waiting for approval`}
                    className="tabular absolute -right-3 -top-2 flex h-5 min-w-5 items-center justify-center rounded-full bg-danger px-1 text-[11px] font-semibold leading-none text-bg"
                  >
                    {count > 9 ? "9+" : count}
                  </span>
                ) : null}
              </span>
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
