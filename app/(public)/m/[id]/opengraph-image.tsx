import { OG_SIZE, ogImage } from "@/lib/og/card";
import {
  chaseText,
  fetchPublicMatch,
  matchLine,
  matchTeams,
  sideTotals,
} from "@/lib/publicCard";

export const runtime = "edge";
export const alt = "Live score on Gully Cricket";
export const size = OG_SIZE;
export const contentType = "image/png";

const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export default async function Image({ params }: { params: { id: string } }) {
  const m = await fetchPublicMatch(params.id);
  if (!m) {
    return ogImage({
      label: "SCOREBOOK",
      headline: "Gully Cricket",
      footer: "Score your match while you play",
    });
  }

  const teams = matchTeams(m);
  const corner = m.groundName ? `At ${m.groundName}` : undefined;

  if (m.phase === "completed") {
    const a = sideTotals(m, "A");
    const b = sideTotals(m, "B");
    return ogImage({
      label: m.status === "abandoned" ? "ENDED" : "RESULT",
      corner,
      kicker: teams,
      headline: matchLine(m),
      footer:
        a || b
          ? `${m.sideA.name} ${a ?? "—"} · ${m.sideB.name} ${b ?? "—"}`
          : undefined,
    });
  }

  if (m.live) {
    const batting = m.live.battingSide === "A" ? m.sideA.name : m.sideB.name;
    const chase = chaseText(m.live);
    return ogImage({
      label: "LIVE",
      live: true,
      corner,
      kicker:
        m.inningsPerSide === 2
          ? `${batting} · innings ${m.live.inningsNo} of 4`
          : batting,
      headline: `${m.live.totalRuns}/${m.live.wickets}`,
      headlineAside: `${m.live.oversText} ov`,
      highlight: chase ? capital(chase) : undefined,
      footer: teams,
    });
  }

  return ogImage({
    label: "LIVE",
    live: true,
    corner,
    kicker: m.breakInfo ? "Innings break" : "Starting soon",
    headline: m.breakInfo ? m.breakInfo.leadText : teams,
    highlight:
      m.breakInfo?.target != null ? `Target ${m.breakInfo.target}` : undefined,
    footer: m.breakInfo ? teams : undefined,
  });
}
