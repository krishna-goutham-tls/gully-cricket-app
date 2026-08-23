import { formatNoteDate, type ReleaseNote } from "@/content/release-notes";
import Link from "next/link";

export function NoteList({ notes }: { notes: ReleaseNote[] }) {
  return (
    <ul className="mt-3 space-y-3">
      {notes.map((note) => (
        <li key={note.slug}>
          <Link
            href={`/release-notes/${note.slug}`}
            className="block min-h-12 rounded-xl border border-line bg-surface px-4 py-3.5 active:bg-bg"
          >
            <time dateTime={note.date} className="text-[13px] text-muted">
              {formatNoteDate(note.date)}
            </time>
            <p className="mt-1.5 text-[15px] font-semibold text-ink">
              {note.title}
            </p>
          </Link>
        </li>
      ))}
    </ul>
  );
}
