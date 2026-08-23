import { getMatchStory, MATCH_STORIES } from "@/content/match-stories";
import { ReadingChrome } from "@/components/reading/ReadingChrome";
import { StoryCta } from "@/components/reading/StoryCta";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

export function generateStaticParams() {
  return MATCH_STORIES.map((story) => ({ slug: story.slug }));
}

export function generateMetadata({
  params,
}: {
  params: { slug: string };
}): Metadata {
  const story = getMatchStory(params.slug);
  if (!story) return { title: "Story" };
  return {
    title: story.title,
    description: story.paragraphs[0],
  };
}

export default function MatchStoryPage({
  params,
}: {
  params: { slug: string };
}) {
  const story = getMatchStory(params.slug);
  if (!story) notFound();

  return (
    <ReadingChrome>
      <article>
        <time
          dateTime={story.date}
          className="block text-3xl font-bold tracking-tight text-ink sm:text-4xl"
        >
          {story.title}
        </time>
        <div className="mt-6 space-y-5 text-base leading-relaxed text-muted">
          {story.paragraphs.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
        </div>
        <StoryCta />
      </article>
    </ReadingChrome>
  );
}
