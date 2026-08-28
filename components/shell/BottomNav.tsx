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

// Trophy belongs to tournaments everywhere else in the app, so Leaders takes
// the chart. "Series" over "Tournaments": the long label cannot fit five
// 44px+ items at 375px without dropping below 12px type.
// `badge` names which count rides on the item. Access requests hang off
// Profile rather than a sixth nav item: five 44px+ targets already fill the
// row at 375px, and only the platform owner would ever see the sixth.
const items: Array<{
  href: string;
  label: string;
  icon: LucideIcon;
  badge?: "members" | "access";
}> = [
  { href: "/home", label: "Home", icon: Home },
  { href: "/tournaments", label: "Series", icon: Trophy },
  { href: "/leaderboard", label: "Leaders", icon: BarChart3 },
  { href: "/players", label: "Players", icon: Users, badge: "members" },
  { href: "/profile", label: "Profile", icon: UserRound, badge: "access" },
];

export function BottomNav() {
  const pathname = usePathname();
  const { token, activeOrgId } = useAuth();
  // Runs on every screen: two indexed reads, and zeroes for non-admins.
  const pending = useQuery(
    api.players.pendingApprovals,
    token && activeOrgId ? { token, orgId: activeOrgId } : "skip",
  );
  const waiting = pending?.total ?? 0;
  // Returns 0 for everyone who isn't the platform owner, so this is one cheap
  // indexed read rather than a permission check on the client.
  const accessWaiting =
    useQuery(api.access.pendingCount, token ? { token } : "skip") ?? 0;

  return (
    <nav className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 backdrop-blur-md">
      <div className="mx-auto flex max-w-md items-stretch justify-around px-1 pb-1 pt-1.5">
        {items.map((item) => {
          const active =
            pathname === item.href || pathname.startsWith(`${item.href}/`);
          const Icon = item.icon;
          const count =
            item.badge === "members"
              ? waiting
              : item.badge === "access"
                ? accessWaiting
                : 0;
          return (
            <Link
              key={item.href}
              href={item.href}
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
