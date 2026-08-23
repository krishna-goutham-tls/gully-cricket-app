import { FEED } from "@/content/feed";
import { FeedList } from "@/components/reading/FeedList";
import { ReadingChrome } from "@/components/reading/ReadingChrome";

export const metadata = {
  title: "Feed",
  description:
    "Match stories and app notes from Gully Cricket, newest first.",
};

export default function FeedPage() {
  return (
    <ReadingChrome>
      <h1 className="text-4xl font-bold tracking-tight text-ink sm:text-5xl">
        Feed
      </h1>
      <FeedList items={FEED} />
    </ReadingChrome>
  );
}
