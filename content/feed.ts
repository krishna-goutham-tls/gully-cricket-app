import { RELEASE_NOTES, type ReleaseNote } from "./release-notes";

export type FeedItem = {
  kind: "note";
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

export const NOTE_FEED: FeedItem[] = RELEASE_NOTES.map(noteItem);

/** Noon UTC on the heading date, so unread compares calendar days only. */
export function feedDateAt(date: string): number {
  const [year, month, day] = date.split("-").map(Number);
  return Date.UTC(year, month - 1, day, 12, 0, 0);
}

/** "22 August 2026" */
export function formatFeedDate(date: string): string {
  return new Date(feedDateAt(date)).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

export const latestFeedAt = Math.max(
  ...NOTE_FEED.map((item) => feedDateAt(item.date)),
);
