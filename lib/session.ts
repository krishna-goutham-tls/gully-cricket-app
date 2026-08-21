"use client";

const TOKEN_KEY = "cricket_session_token";
const ORG_KEY = "cricket_active_org";
const AUTH_CACHE_KEY = "boundary_auth_cache";
const LAST_OVERS_KEY = "boundary_last_overs";
const LAST_PHONE_KEY = "boundary_last_phone";

/** Matches the server's session lifetime (convex/lib/session.ts). */
const SESSION_DAYS = 60;

/*
 * The session lives in two places on purpose.
 *
 * localStorage alone was a single point of failure: iOS evicts script-writable
 * storage, and a home-screen web app, Safari and an in-app browser each keep
 * their own jar — so a player who was signed in yesterday can land on the login
 * screen with a perfectly valid 60-day token still sitting on the server.
 * Cookies are subject to their own eviction rules, but not identical ones, so
 * writing both means one store surviving is enough. Whichever still has it
 * repopulates the other on the next boot.
 */
function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const prefix = `${name}=`;
  for (const part of document.cookie.split("; ")) {
    if (part.startsWith(prefix)) {
      return decodeURIComponent(part.slice(prefix.length)) || null;
    }
  }
  return null;
}

function writeCookie(name: string, value: string, days: number) {
  if (typeof document === "undefined") return;
  // Secure can't be set over plain http or the cookie is silently dropped,
  // which would break local development.
  const secure = location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${
    days * 24 * 60 * 60
  }; SameSite=Lax${secure}`;
}

function deleteCookie(name: string) {
  if (typeof document === "undefined") return;
  document.cookie = `${name}=; Path=/; Max-Age=0; SameSite=Lax`;
}

/** Best-effort — Safari private mode throws on write rather than no-op. */
function safeSet(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* quota or blocked — the cookie is the fallback */
  }
}

export function getSessionToken(): string | null {
  if (typeof window === "undefined") return null;
  const local = (() => {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  })();
  if (local) {
    // Refresh the cookie's 60-day window on every visit, and restore it if
    // this is the store that survived.
    writeCookie(TOKEN_KEY, local, SESSION_DAYS);
    return local;
  }
  const cookie = readCookie(TOKEN_KEY);
  if (cookie) {
    safeSet(TOKEN_KEY, cookie);
    return cookie;
  }
  return null;
}

export function setSessionToken(token: string) {
  safeSet(TOKEN_KEY, token);
  writeCookie(TOKEN_KEY, token, SESSION_DAYS);
}

export function clearSessionToken() {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* nothing to remove */
  }
  deleteCookie(TOKEN_KEY);
}

/**
 * The number they last signed in with. Kept in both stores for the same
 * reason as the token: if a sign-in is forced anyway, it should cost four PIN
 * taps rather than typing a phone number out again.
 */
export function getLastPhone(): string {
  if (typeof window === "undefined") return "";
  try {
    const local = localStorage.getItem(LAST_PHONE_KEY);
    if (local) return local;
  } catch {
    /* fall through to the cookie */
  }
  return readCookie(LAST_PHONE_KEY) ?? "";
}

export function setLastPhone(phone: string) {
  safeSet(LAST_PHONE_KEY, phone);
  writeCookie(LAST_PHONE_KEY, phone, SESSION_DAYS);
}

export function getActiveOrgId(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(ORG_KEY);
}

export function setActiveOrgId(orgId: string) {
  localStorage.setItem(ORG_KEY, orgId);
}

export function clearActiveOrgId() {
  localStorage.removeItem(ORG_KEY);
}

/**
 * Last known { user, memberships } snapshot for optimistic first paint.
 * The live bootstrap query reconciles it silently after connect.
 */
export function getAuthCache<T>(): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(AUTH_CACHE_KEY);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function setAuthCache(value: unknown) {
  try {
    localStorage.setItem(AUTH_CACHE_KEY, JSON.stringify(value));
  } catch {
    // storage full/blocked — cache is best-effort
  }
}

export function clearAuthCache() {
  localStorage.removeItem(AUTH_CACHE_KEY);
}

export function getLastOvers(): number {
  if (typeof window === "undefined") return 6;
  const raw = localStorage.getItem(LAST_OVERS_KEY);
  const n = raw ? parseInt(raw, 10) : NaN;
  return Number.isInteger(n) && n >= 1 && n <= 200 ? n : 6;
}

export function setLastOvers(overs: number) {
  localStorage.setItem(LAST_OVERS_KEY, String(overs));
}

const LAST_FORMAT_KEY = "boundary_last_format";

export function getLastFormat(): "limited" | "test" {
  if (typeof window === "undefined") return "limited";
  return localStorage.getItem(LAST_FORMAT_KEY) === "test" ? "test" : "limited";
}

export function setLastFormat(format: "limited" | "test") {
  localStorage.setItem(LAST_FORMAT_KEY, format);
}

const LAST_OPP_KEY = "boundary_last_overs_per_player";

/** ODI overs each player may bat & bowl. Even (2–20); common players get half. */
export function getLastOversPerPlayer(): number {
  if (typeof window === "undefined") return 2;
  const raw = localStorage.getItem(LAST_OPP_KEY);
  const n = raw ? parseInt(raw, 10) : NaN;
  return Number.isInteger(n) && n >= 2 && n <= 20 && n % 2 === 0 ? n : 2;
}

export function setLastOversPerPlayer(overs: number) {
  localStorage.setItem(LAST_OPP_KEY, String(overs));
}
