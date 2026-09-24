import { PublicMatchView } from "@/components/public/PublicMatchView";
import { fetchPublicMatch, matchLine, matchTeams } from "@/lib/publicCard";
import type { Metadata } from "next";

/**
 * /m/[id] — the live score for anyone with the link, no login. Not listed,
 * not indexed. The page itself is live over Convex; the metadata below is
 * only what WhatsApp prints on the preview card. It is read fresh on every
 * request, so a re-share carries the newer score; the picture caches for a
 * minute (lib/og/card.tsx).
 */

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: { id: string };
}): Promise<Metadata> {
  const m = await fetchPublicMatch(params.id);
  const title = m ? matchTeams(m) : "Match";
  const description = m ? matchLine(m) : "Live score on Gully Cricket";
  return {
    title,
    description,
    robots: { index: false, follow: false },
    openGraph: {
      type: "website",
      siteName: "Gully Cricket",
      url: `/m/${params.id}`,
      title,
      description,
    },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default function PublicMatchPage({
  params,
}: {
  params: { id: string };
}) {
  return <PublicMatchView matchId={params.id} />;
}
