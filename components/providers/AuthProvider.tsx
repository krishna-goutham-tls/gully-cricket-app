"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import {
  clearActiveOrgId,
  clearAuthCache,
  clearSessionToken,
  getActiveOrgId,
  getAuthCache,
  getSessionToken,
  setActiveOrgId,
  setAuthCache,
  setSessionToken,
} from "@/lib/session";
import { Id } from "@/convex/_generated/dataModel";

type User = {
  _id: Id<"users"> | string;
  phone?: string;
  displayName: string;
  photoUrl?: string;
  bio?: string;
  isGuest?: boolean;
  mustChangePin?: boolean;
  primaryRole?: "batsman" | "bowler" | "all-rounder" | "keeper";
  secondaryRole?: "batsman" | "bowler" | "all-rounder" | "keeper";
  preferredOrgId?: Id<"orgs"> | string;
  createdAt: number;
};

type Membership = {
  membershipId: Id<"orgMembers">;
  orgId: Id<"orgs">;
  orgName: string;
  location?: string;
  status: "pending" | "active" | "rejected" | "left" | "removed";
  roles: Array<"admin" | "umpire" | "player">;
  requestedAt: number;
  isSandbox?: boolean;
  sandboxForOrgId?: Id<"orgs">;
  /** Absent on auth caches written before this field existed. */
  featuredSeason?: {
    id: Id<"seasons">;
    name: string;
    status: "active" | "complete";
  } | null;
  seasonCount?: number;
};

type Bootstrap = { user: User; memberships: Membership[] } | null;

type AuthContextValue = {
  token: string | null;
  user: User | null | undefined;
  memberships: Membership[] | undefined;
  activeMemberships: Membership[];
  pendingMemberships: Membership[];
  activeOrgId: Id<"orgs"> | null;
  activeOrg: Membership | null;
  isAdmin: boolean;
  /** Active org is a throwaway sandbox — nothing scored here counts. */
  isSandbox: boolean;
  loading: boolean;
  setToken: (token: string) => void;
  logout: () => Promise<void>;
  selectOrg: (orgId: Id<"orgs">, opts?: { remember?: boolean }) => Promise<void>;
  refreshLocalOrg: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setTokenState] = useState<string | null>(null);
  const [activeOrgId, setActiveOrgState] = useState<Id<"orgs"> | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [cached, setCached] = useState<Bootstrap>(null);
  /** Org chosen by an explicit switch, before bootstrap has caught up. */
  const pendingOrgRef = useRef<Id<"orgs"> | null>(null);

  useEffect(() => {
    setTokenState(getSessionToken());
    const snap = getAuthCache<NonNullable<Bootstrap>>();
    setCached(snap);
    const stored = getActiveOrgId();
    if (stored) {
      const row = snap?.memberships.find((m) => m.orgId === stored);
      // Sandbox is a practice room. Refresh must land in the real community.
      if (!row?.isSandbox) setActiveOrgState(stored as Id<"orgs">);
    }
    setHydrated(true);
  }, []);

  // One combined round-trip: user + memberships
  const bootstrap = useQuery(
    api.auth.bootstrap,
    hydrated && token ? { token } : "skip",
  ) as Bootstrap | undefined;

  // Persist / clear the optimistic cache when the live result lands
  useEffect(() => {
    if (bootstrap === undefined) return;
    if (bootstrap === null) {
      clearAuthCache();
      setCached(null);
    } else {
      setAuthCache(bootstrap);
      setCached(bootstrap);
    }
  }, [bootstrap]);

  // Live result wins; cached snapshot bridges the gap for instant paint
  const resolved: Bootstrap | undefined =
    bootstrap !== undefined ? bootstrap : cached ?? undefined;

  const user = token
    ? resolved === undefined
      ? undefined
      : resolved?.user ?? null
    : null;
  const memberships = token ? resolved?.memberships : undefined;

  const signOutMut = useMutation(api.auth.signOut);
  const setPreferredOrg = useMutation(api.auth.setPreferredOrg);

  const activeMemberships = useMemo(
    () => (memberships ?? []).filter((m) => m.status === "active"),
    [memberships],
  );
  const pendingMemberships = useMemo(
    () => (memberships ?? []).filter((m) => m.status === "pending"),
    [memberships],
  );

  useEffect(() => {
    if (!memberships) return;
    const real = activeMemberships.filter((m) => !m.isSandbox);
    if (activeOrgId) {
      const stillActive = activeMemberships.find((m) => m.orgId === activeOrgId);
      if (stillActive) {
        if (pendingOrgRef.current === activeOrgId) {
          pendingOrgRef.current = null;
          return;
        }
        // Keep a real community. Kick a restored sandbox so Home is not empty.
        if (!stillActive.isSandbox) return;
      }
      if (pendingOrgRef.current === activeOrgId) return;
    }
    if (user?.preferredOrgId) {
      const preferred = real.find((m) => m.orgId === user.preferredOrgId);
      if (preferred) {
        setActiveOrgState(preferred.orgId);
        setActiveOrgId(preferred.orgId);
        return;
      }
    }
    if (real[0]) {
      setActiveOrgState(real[0].orgId);
      setActiveOrgId(real[0].orgId);
    } else if (activeMemberships[0]) {
      setActiveOrgState(activeMemberships[0].orgId);
      setActiveOrgId(activeMemberships[0].orgId);
    } else {
      setActiveOrgState(null);
      clearActiveOrgId();
    }
  }, [memberships, activeMemberships, activeOrgId, user?.preferredOrgId]);

  const setToken = useCallback((next: string) => {
    setSessionToken(next);
    setTokenState(next);
  }, []);

  const logout = useCallback(async () => {
    try {
      if (token) await signOutMut({ token });
    } finally {
      clearSessionToken();
      clearActiveOrgId();
      clearAuthCache();
      setCached(null);
      setTokenState(null);
      setActiveOrgState(null);
    }
  }, [signOutMut, token]);

  const selectOrg = useCallback(
    async (orgId: Id<"orgs">, opts?: { remember?: boolean }) => {
      if (!token) return;
      pendingOrgRef.current = orgId;
      setActiveOrgState(orgId);
      // Sandbox is a practice room. Do not persist it as the landing community.
      if (opts?.remember !== false) {
        setActiveOrgId(orgId);
        await setPreferredOrg({ token, orgId });
      }
    },
    [setPreferredOrg, token],
  );

  const refreshLocalOrg = useCallback(() => {
    const stored = getActiveOrgId();
    if (stored) setActiveOrgState(stored as Id<"orgs">);
  }, []);

  /**
   * The stored org id, but only once it's been confirmed against a real
   * membership.
   *
   * The id is restored from localStorage on hydrate, well before `bootstrap`
   * returns, and every screen feeds it straight into a query. If it belongs to
   * a *different Convex deployment* — the exact case of opening localhost
   * (dev) after using the live app (prod), where the same id string decodes to
   * a different table — the query doesn't fail soft, it throws
   * `ArgumentValidationError` and takes the page down before the reconciler
   * below ever gets to swap it out.
   *
   * Handing back `null` until the id is vouched for turns that crash into a
   * skipped query: consumers already guard with `activeOrgId ? {...} : "skip"`,
   * so they simply wait one beat and then load against the right org. Warm
   * paint is unaffected — the cached bootstrap carries the memberships, so a
   * legitimate id verifies on the same tick it's read.
   */
  const verifiedOrgId = useMemo(() => {
    if (!activeOrgId) return null;
    const mem = activeMemberships.find((m) => m.orgId === activeOrgId);
    if (mem) {
      // A leftover sandbox id in localStorage is not a real landing org.
      if (mem.isSandbox && pendingOrgRef.current !== activeOrgId) return null;
      return activeOrgId;
    }
    // A deliberate switch (entering the sandbox creates the membership) isn't
    // in the list until bootstrap refetches — trust it for that window.
    if (pendingOrgRef.current === activeOrgId) return activeOrgId;
    return null;
  }, [activeOrgId, activeMemberships]);

  const activeOrg =
    activeMemberships.find((m) => m.orgId === verifiedOrgId) ?? null;
  const isAdmin = activeOrg?.roles.includes("admin") ?? false;
  const isSandbox = activeOrg?.isSandbox ?? false;

  // Only block render on a true cold start: token present, no cache, live
  // result not yet in. Warm visits paint instantly from cache.
  const loading = !hydrated || (token !== null && resolved === undefined);

  const value: AuthContextValue = {
    token,
    user,
    memberships,
    activeMemberships,
    pendingMemberships,
    activeOrgId: verifiedOrgId,
    activeOrg,
    isAdmin,
    isSandbox,
    loading,
    setToken,
    logout,
    selectOrg,
    refreshLocalOrg,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
