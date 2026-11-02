import { ConvexHttpClient } from "convex/browser";
import type { FunctionReturnType } from "convex/server";
import { api } from "@/convex/_generated/api";

/**
 * The words on a shared link's preview: page title, description and the
 * picture WhatsApp shows. Server side only — the crawler has no session and
 * no WebSocket, so this reads the public queries once over HTTP.
 */

export type PublicMatch = NonNullable<
  FunctionReturnType<typeof api.publicView.match>
>;

function client() {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  return url ? new ConvexHttpClient(url) : null;
}

/** Null for a missing, sandbox or mangled id — and if Convex is unreachable. */
export async function fetchPublicMatch(id: string): Promise<PublicMatch | null> {
  try {
    return (await client()?.query(api.publicView.match, { matchId: id })) ?? null;
  } catch {
    return null;
  }
}

/** Null for a stopped or mangled code. Only the community name comes back. */
export async function fetchInvite(code: string) {
  try {
    return (await client()?.query(api.orgs.inviteInfo, { code })) ?? null;
  } catch {
    return null;
  }
}

export function matchTeams(m: PublicMatch) {
  return `${m.sideA.name} vs ${m.sideB.name}`;
}

function sideName(m: PublicMatch, side: "A" | "B") {
  return side === "A" ? m.sideA.name : m.sideB.name;
}

/** "84/3" — or "120/5 & 80/2" for a side with two Test innings. */
export function sideTotals(m: PublicMatch, side: "A" | "B") {
  const rows = m.innings.filter((i) => i.battingSide === side);
  return rows.length
    ? rows.map((i) => `${i.totalRuns}/${i.wickets}`).join(" & ")
    : null;
}

/** "need 23 off 16" in a limited chase; "need 23" in a Test. */
export function chaseText(live: NonNullable<PublicMatch["live"]>) {
  if (live.target === undefined) return null;
  const need = Math.max(0, live.target - live.totalRuns);
  return live.ballsLeft !== undefined
    ? `need ${need} off ${live.ballsLeft}`
    : `need ${need}`;
}

/**
 * One line for where the match stands:
 *  - "Sonesta Tigers 84/3 · 9.2 ov — need 23 off 16"
 *  - "Sonesta Tigers won by 12 runs"
 */
export function matchLine(m: PublicMatch) {
  if (m.phase === "completed") {
    return (
      m.resultText ??
      (m.status === "abandoned" ? "Ended without a result" : "Result")
    );
  }
  if (m.live) {
    const chase = chaseText(m.live);
    return `${sideName(m, m.live.battingSide)} ${m.live.totalRuns}/${m.live.wickets} · ${m.live.oversText} ov${chase ? ` — ${chase}` : ""}`;
  }
  if (m.breakInfo) {
    return `Innings break · ${m.breakInfo.leadText}${
      m.breakInfo.target != null ? ` — target ${m.breakInfo.target}` : ""
    }`;
  }
  return "Not started yet";
}
