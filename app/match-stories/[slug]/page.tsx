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
  const first = story.blocks.find((b) => b.kind === "p");
  return {
    title: story.title,
    description: first?.kind === "p" ? first.text : story.title,
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
        <div className="mt-6 space-y-5">
          {story.blocks.map((block, i) =>
            block.kind === "p" ? (
              <p
                key={`p-${i}`}
                className="text-base leading-relaxed text-muted"
              >
                {block.text}
              </p>
            ) : (
              <section
                key={`card-${i}`}
                className="rounded-2xl border border-line bg-surface px-4 py-3.5"
              >
                <h2 className="text-[15px] font-semibold text-ink">
                  {block.heading}
                </h2>
                <dl className="mt-3 space-y-1.5">
                  {block.rows.map((row) => (
                    <div
                      key={row.label}
                      className="flex items-baseline justify-between gap-3"
                    >
                      <dt className="shrink-0 text-[13px] text-muted">
                        {row.label}
                      </dt>
                      <dd className="min-w-0 text-right text-[15px] font-semibold text-ink">
                        {row.value}
                      </dd>
                    </div>
                  ))}
                </dl>
                {block.potm ? (
                  <p className="mt-3 text-[15px] font-semibold text-ink">
                    {block.potm}
                  </p>
                ) : null}
                {block.facts ? (
                  <p className="mt-1 text-[13px] leading-relaxed text-muted">
                    {block.facts}
                  </p>
                ) : null}
              </section>
            ),
          )}
        </div>
        <StoryCta />
      </article>
    </ReadingChrome>
  );
}
