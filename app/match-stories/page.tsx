import {
  MATCH_STORIES_CLOSER,
  MATCH_STORIES_INTRO,
} from "@/content/match-stories";
import { STORY_FEED } from "@/content/feed";
import { FeedList } from "@/components/reading/FeedList";
import { ReadingChrome } from "@/components/reading/ReadingChrome";

export const metadata = {
  title: "Stories",
  description:
    "Sitting with a match after it is over — match write-ups from Gully Cricket.",
};

export default function MatchStoriesPage() {
  return (
    <ReadingChrome>
      <h1 className="text-4xl font-bold tracking-tight text-ink sm:text-5xl">
        Stories
      </h1>
      <div className="mt-5 space-y-4 text-base leading-relaxed text-muted">
        {MATCH_STORIES_INTRO.map((paragraph) => (
          <p key={paragraph}>{paragraph}</p>
        ))}
      </div>
      <FeedList items={STORY_FEED} />
      <p className="mt-10 text-base leading-relaxed text-muted">
        {MATCH_STORIES_CLOSER}
      </p>
    </ReadingChrome>
  );
}
