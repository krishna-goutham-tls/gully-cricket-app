"use client";

import { TruncText } from "@/components/ui/TruncText";
import { NOTE_FEED, formatFeedDate } from "@/content/feed";
import { hasUnread } from "@/lib/feedSeen";
import { BookOpen, ChevronRight, Newspaper } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

const latest = NOTE_FEED[0];

function Door({
  href,
  icon,
  title,
  meta,
  unread,
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  meta: string;
  unread?: boolean;
}) {
  return (
    <Link
      href={href}
      className="flex min-h-12 min-w-0 flex-1 items-center gap-2.5 rounded-xl border border-line bg-surface px-3 py-2.5 active:bg-bg"
    >
      <span className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent-deep">
        {icon}
        {unread ? (
          <span
            aria-label="Unread"
            className="absolute right-0.5 top-0.5 h-2 w-2 rounded-full bg-accent"
          />
        ) : null}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-semibold text-ink">{title}</span>
        <TruncText className="tabular text-[11px] text-muted">{meta}</TruncText>
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-faint" />
    </Link>
  );
}

export function ReadingDoors() {
  const [unread, setUnread] = useState(false);

  useEffect(() => {
    setUnread(hasUnread());
  }, []);

  const notesMeta = latest ? formatFeedDate(latest.date) : "What we put on the phone";

  return (
    <div className="mt-2 flex gap-2">
      <Door
        href="/release-notes"
        icon={<Newspaper className="h-4 w-4" strokeWidth={2.2} />}
        title="Notes"
        meta={notesMeta}
        unread={unread}
      />
      <Door
        href="/gully-rules"
        icon={<BookOpen className="h-4 w-4" strokeWidth={2.2} />}
        title="Rules"
        meta="Play + how we count"
      />
    </div>
  );
}
