import {
  feedKindLabel,
  formatFeedDate,
  type FeedItem,
} from "@/content/feed";
import Link from "next/link";

export function FeedList({ items }: { items: FeedItem[] }) {
  return (
    <ul className="mt-8 space-y-3">
      {items.map((item) => (
        <li key={`${item.kind}-${item.slug}`}>
          <Link
            href={item.href}
            className="block min-h-12 rounded-3xl border border-line bg-surface px-4 py-3.5 active:bg-bg"
          >
            <div className="flex flex-wrap items-center gap-2">
              <time dateTime={item.date} className="text-[13px] text-muted">
                {formatFeedDate(item.date)}
              </time>
              <span className="rounded-full bg-accent-soft px-2.5 py-0.5 text-[13px] font-semibold text-accent-deep">
                {feedKindLabel(item.kind)}
              </span>
            </div>
            <p className="mt-1.5 text-[15px] font-semibold text-ink">
              {item.title}
            </p>
            {item.kind === "story" && item.preview ? (
              <p className="mt-1 text-[13px] leading-relaxed text-muted">
                {item.preview}
              </p>
            ) : null}
          </Link>
        </li>
      ))}
    </ul>
  );
}
