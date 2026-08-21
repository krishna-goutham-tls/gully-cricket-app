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
    const stored = getActiveOrgId();
    if (stored) setActiveOrgState(stored as Id<"orgs">);
    setCached(getAuthCache<NonNullable<Bootstrap>>());
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
    if (activeOrgId) {
      const stillActive = activeMemberships.find((m) => m.orgId === activeOrgId);
      if (stillActive) {
        if (pendingOrgRef.current === activeOrgId) pendingOrgRef.current = null;
        return;
      }
      // An org we just switched into deliberately (entering the sandbox creates
      // the membership) won't be in this list until bootstrap refetches.
      // Without this the fallback below would yank us straight back out.
      if (pendingOrgRef.current === activeOrgId) return;
    }
    if (user?.preferredOrgId) {
      const preferred = activeMemberships.find((m) => m.orgId === user.preferredOrgId);
      if (preferred) {
        setActiveOrgState(preferred.orgId);
        setActiveOrgId(preferred.orgId);
        return;
      }
    }
    if (activeMemberships[0]) {
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
      setActiveOrgId(orgId);
      // Sandbox is deliberately not remembered as the preferred org —
      // opening the app on a match day must never land you in the sandbox.
      if (opts?.remember !== false) await setPreferredOrg({ token, orgId });
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
    if (activeMemberships.some((m) => m.orgId === activeOrgId))
      return activeOrgId;
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
