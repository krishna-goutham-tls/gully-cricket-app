import { PublicPollView } from "@/components/public/PublicPollView";
import { fetchPublicPoll, pollDayTime, pollLine } from "@/lib/publicCard";
import type { Metadata } from "next";

/**
 * /p/[id] — a "Who's in?" poll for anyone with the link, no login. Read
 * only: members answer in the app. Not listed, not indexed. Metadata is
 * read fresh per request; the picture caches for a minute.
 */

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: { id: string };
}): Promise<Metadata> {
  const p = await fetchPublicPoll(params.id);
  const title = p ? `Who's in? ${pollDayTime(p)}` : "Who's in?";
  const description = p ? pollLine(p) : "A game on Gully Cricket";
  return {
    title,
    description,
    robots: { index: false, follow: false },
    openGraph: {
      type: "website",
      siteName: "Gully Cricket",
      url: `/p/${params.id}`,
      title,
      description,
    },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default function PublicPollPage({
  params,
}: {
  params: { id: string };
}) {
  return <PublicPollView pollId={params.id} />;
}
