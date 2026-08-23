import { MATCH_STORIES, type MatchStory } from "./match-stories";
import { RELEASE_NOTES, type ReleaseNote } from "./release-notes";

export type FeedKind = "story" | "note";

export type FeedItem = {
  kind: FeedKind;
  slug: string;
  date: string;
  title: string;
  href: string;
  preview: string;
};

function firstSentence(text: string): string {
  const match = text.match(/^.+?[.]/);
  return (match ? match[0] : text).trim();
}

function storyItem(story: MatchStory): FeedItem {
  return {
    kind: "story",
    slug: story.slug,
    date: story.date,
    title: story.title,
    href: `/match-stories/${story.slug}`,
    preview: firstSentence(story.paragraphs[0] ?? ""),
  };
}

function noteItem(note: ReleaseNote): FeedItem {
  return {
    kind: "note",
    slug: note.slug,
    date: note.date,
    title: note.title,
    href: `/release-notes/${note.slug}`,
    preview: firstSentence(note.paragraphs[0] ?? ""),
  };
}

/** Combined feed, newest calendar date first. Same day: Story, then App. */
export const FEED: FeedItem[] = [
  ...MATCH_STORIES.map(storyItem),
  ...RELEASE_NOTES.map(noteItem),
].sort((a, b) => {
  if (a.date !== b.date) return b.date.localeCompare(a.date);
  if (a.kind !== b.kind) return a.kind === "story" ? -1 : 1;
  return 0;
});

export const STORY_FEED = FEED.filter((item) => item.kind === "story");
export const NOTE_FEED = FEED.filter((item) => item.kind === "note");

/** Noon UTC on the heading date, so unread compares calendar days only. */
export function feedDateAt(date: string): number {
  const [year, month, day] = date.split("-").map(Number);
  return Date.UTC(year, month - 1, day, 12, 0, 0);
}

/** "22 August 2026" — same shape as the match-story headings. */
export function formatFeedDate(date: string): string {
  return new Date(feedDateAt(date)).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

export const latestFeedAt = Math.max(
  ...FEED.map((item) => feedDateAt(item.date)),
);

export function feedKindLabel(kind: FeedKind): "Story" | "App" {
  return kind === "story" ? "Story" : "App";
}
