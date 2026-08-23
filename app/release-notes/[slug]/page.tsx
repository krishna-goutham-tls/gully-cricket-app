import {
  formatNoteDate,
  getReleaseNote,
  RELEASE_NOTES,
} from "@/content/release-notes";
import { ReadingChrome } from "@/components/reading/ReadingChrome";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

export function generateStaticParams() {
  return RELEASE_NOTES.map((note) => ({ slug: note.slug }));
}

export function generateMetadata({
  params,
}: {
  params: { slug: string };
}): Metadata {
  const note = getReleaseNote(params.slug);
  if (!note) return { title: "Notes" };
  return {
    title: note.title,
    description: note.paragraphs[0],
  };
}

function NoteList({ heading, items }: { heading: string; items?: string[] }) {
  if (!items?.length) return null;
  return (
    <section className="mt-8">
      <h2 className="text-[15px] font-semibold text-ink">{heading}</h2>
      <ul className="mt-3 list-disc space-y-2 pl-5 text-base leading-relaxed text-muted">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </section>
  );
}

export default function ReleaseNotePage({
  params,
}: {
  params: { slug: string };
}) {
  const note = getReleaseNote(params.slug);
  if (!note) notFound();

  return (
    <ReadingChrome>
      <article>
        <time
          dateTime={note.date}
          className="text-[13px] font-semibold text-faint"
        >
          {formatNoteDate(note.date)}
        </time>
        <h1 className="mt-3 text-3xl font-bold tracking-tight text-ink sm:text-4xl">
          {note.title}
        </h1>
        <div className="mt-6 space-y-5 text-base leading-relaxed text-muted">
          {note.paragraphs.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
        </div>
        <NoteList heading="What's new" items={note.whatsNew} />
        <NoteList heading="What got better" items={note.whatGotBetter} />
        <NoteList heading="What we dropped" items={note.whatWeDropped} />
      </article>
    </ReadingChrome>
  );
}
