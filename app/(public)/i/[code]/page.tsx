import { InvitePage } from "@/components/public/InvitePage";
import { fetchInvite } from "@/lib/publicCard";
import type { Metadata } from "next";

/** /i/[code] — the invite link an admin sends on WhatsApp. Not indexed. */

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: { code: string };
}): Promise<Metadata> {
  const invite = await fetchInvite(params.code);
  const title = invite ? `Join ${invite.name}` : "Gully Cricket";
  const description = "Score, stats and banter for your gully cricket team";
  return {
    title,
    description,
    robots: { index: false, follow: false },
    openGraph: { type: "website", siteName: "Gully Cricket", title, description },
    twitter: { card: "summary", title, description },
  };
}

export default function InviteRoute({ params }: { params: { code: string } }) {
  return <InvitePage code={params.code} />;
}
