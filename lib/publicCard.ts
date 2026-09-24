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
export type PublicPoll = NonNullable<
  FunctionReturnType<typeof api.publicView.poll>
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

export async function fetchPublicPoll(id: string): Promise<PublicPoll | null> {
  try {
    return (await client()?.query(api.publicView.poll, { pollId: id })) ?? null;
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

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/**
 * "Sun 28 Sep · 7:00 am", from the day and time exactly as the asker typed
 * them. The server has no idea what time zone the ground is in, so this
 * never goes through a timestamp.
 */
export function pollDayTime(p: Pick<PublicPoll, "date" | "time">) {
  const [y, mo, d] = p.date.split("-").map(Number);
  const weekday = WEEKDAYS[new Date(Date.UTC(y, mo - 1, d)).getUTCDay()];
  const [hh, mm] = p.time.split(":").map(Number);
  const hour = hh % 12 === 0 ? 12 : hh % 12;
  const time = `${hour}:${String(mm).padStart(2, "0")} ${hh < 12 ? "am" : "pm"}`;
  return `${weekday} ${d} ${MONTHS[mo - 1]} · ${time}`;
}

/** "6 in, 2 maybe" — or the poll's state if it is no longer asking. */
export function pollCountLine(p: PublicPoll) {
  const counts = [
    `${p.counts.in} in`,
    p.counts.maybe ? `${p.counts.maybe} maybe` : null,
  ]
    .filter(Boolean)
    .join(", ");
  if (p.status === "cancelled") return "Called off";
  return p.status === "closed" ? `Closed — ${counts}` : counts;
}

/** "Sun 28 Sep · 7:00 am · Home ground — 6 in, 2 maybe". */
export function pollLine(p: PublicPoll) {
  return `${[pollDayTime(p), p.groundName].filter(Boolean).join(" · ")} — ${pollCountLine(p)}`;
}
