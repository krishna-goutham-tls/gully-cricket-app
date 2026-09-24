import { OG_SIZE, ogImage } from "@/lib/og/card";
import { fetchPublicPoll, pollCountLine, pollDayTime } from "@/lib/publicCard";

export const runtime = "edge";
export const alt = "Who's in? on Gully Cricket";
export const size = OG_SIZE;
export const contentType = "image/png";

export default async function Image({ params }: { params: { id: string } }) {
  const p = await fetchPublicPoll(params.id);
  if (!p) {
    return ogImage({
      label: "WHO'S IN?",
      headline: "Gully Cricket",
      footer: "Score your match while you play",
    });
  }
  return ogImage({
    label: "WHO'S IN?",
    live: p.status === "open",
    corner: p.groundName ? `At ${p.groundName}` : undefined,
    kicker: p.note,
    headline: pollDayTime(p),
    highlight: pollCountLine(p),
    footer: p.groups.in.length
      ? `In: ${inNames(p.groups.in.map((r) => r.displayName))}`
      : `Asked by ${p.createdByName}`,
  });
}

/** First names that fit on one line of the card, then "+3". */
function inNames(names: string[]) {
  const first = names.map((n) => n.trim().split(/\s+/)[0] || n);
  const shown: string[] = [];
  for (const n of first) {
    if (shown.length > 0 && [...shown, n].join(", ").length > 40) break;
    shown.push(n);
  }
  const rest = first.length - shown.length;
  return `${shown.join(", ")}${rest > 0 ? ` +${rest}` : ""}`;
}
