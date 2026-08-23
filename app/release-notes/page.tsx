import { NOTE_FEED } from "@/content/feed";
import { RELEASE_NOTES_INTRO } from "@/content/release-notes";
import { FeedList } from "@/components/reading/FeedList";
import { ReadingChrome } from "@/components/reading/ReadingChrome";

export const metadata = {
  title: "Notes",
  description:
    "What we put on the phone — Gully Cricket notes, newest first.",
};

export default function ReleaseNotesPage() {
  return (
    <ReadingChrome>
      <h1 className="text-4xl font-bold tracking-tight text-ink sm:text-5xl">
        Notes
      </h1>
      <div className="mt-5 space-y-4 text-base leading-relaxed text-muted">
        {RELEASE_NOTES_INTRO.map((paragraph) => (
          <p key={paragraph}>{paragraph}</p>
        ))}
      </div>
      <FeedList items={NOTE_FEED} />
    </ReadingChrome>
  );
}
