"use client";

import { FEED, feedKindLabel, formatFeedDate } from "@/content/feed";
import { hasUnread } from "@/lib/feedSeen";
import { ChevronRight, Newspaper } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

const latest = FEED[0];

export function FeedDoor() {
  const [unread, setUnread] = useState(false);

  useEffect(() => {
    setUnread(hasUnread());
  }, []);

  const meta = latest
    ? `${feedKindLabel(latest.kind)} · ${formatFeedDate(latest.date)}`
    : "";

  return (
    <Link
      href="/feed"
      className="flex min-h-12 min-w-0 flex-1 items-center gap-2.5 rounded-2xl border border-line bg-surface px-3 py-2.5 active:bg-bg"
    >
      <span className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent-deep">
        <Newspaper className="h-4 w-4" strokeWidth={2.2} />
        {unread ? (
          <span
            aria-label="Unread"
            className="absolute right-0.5 top-0.5 h-2 w-2 rounded-full bg-accent"
          />
        ) : null}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-semibold text-ink">
          Feed
        </span>
        <span className="tabular block truncate text-[11px] text-muted">
          {meta}
        </span>
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-faint" />
    </Link>
  );
}
