import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Convex reports a thrown error as a multi-line envelope:
 *   [CONVEX M(auth:signIn)] [Request ID: …] Server Error
 *   Uncaught Error: Incorrect PIN
 *       at handler (../convex/auth.ts:173:4)
 * Pull out just the sentence we wrote, so people never see the wrapper.
 */
export function errorMessage(err: unknown, fallback = "Something went wrong"): string {
  const raw =
    err instanceof Error ? err.message : typeof err === "string" ? err : "";
  if (!raw.trim()) return fallback;

  const thrown = raw.match(/Uncaught\s+\w*Error:\s*(.+)/);
  const line = (thrown?.[1] ?? raw.split("\n")[0])
    .replace(/\[CONVEX[^\]]*\]/g, "")
    .replace(/\[Request ID:[^\]]*\]/g, "")
    .replace(/\bServer Error\b/gi, "")
    .replace(/\s+at\s+\S+\s*\(.*$/, "")
    .replace(/\bCalled by client\b/gi, "")
    .trim();

  return line.length > 0 && line.length <= 160 ? line : fallback;
}

/**
 * Sanitize phone paste/input for India-first UX.
 * "+91 99160 24894" / "91-99160-24894" → "9916024894"
 */
export function sanitizePhoneInput(input: string): string {
  let digits = input.replace(/\D/g, "");
  if (digits.startsWith("91") && digits.length >= 12) {
    digits = digits.slice(2);
  }
  if (digits.startsWith("0") && digits.length === 11) {
    digits = digits.slice(1);
  }
  return digits.slice(0, 15);
}

/** Shared between the tournaments list and detail screens — one enum, one casing. */
export const TOURNAMENT_STATUS_LABEL: Record<string, string> = {
  active: "Active",
  paused: "Paused",
  complete: "Complete",
};
