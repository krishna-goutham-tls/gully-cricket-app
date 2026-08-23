import { NOTE_FEED, STORY_FEED } from "@/content/feed";
import { FeedList } from "@/components/reading/FeedList";
import { ReadingChrome } from "@/components/reading/ReadingChrome";
import type { ReactNode } from "react";

export const metadata = {
  title: "Feed",
  description: "Match stories and app notes from Gully Cricket.",
};

function Section({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="mt-10">
      <h2 className="text-[11px] font-semibold uppercase tracking-wide text-faint">
        {title}
      </h2>
      {children}
    </section>
  );
}

export default function FeedPage() {
  return (
    <ReadingChrome>
      <h1 className="text-4xl font-bold tracking-tight text-ink sm:text-5xl">
        Feed
      </h1>
      <Section title="Stories">
        <FeedList items={STORY_FEED} />
      </Section>
      <Section title="Notes">
        <FeedList items={NOTE_FEED} />
      </Section>
    </ReadingChrome>
  );
}
