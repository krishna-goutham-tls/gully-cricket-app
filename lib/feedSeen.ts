import { latestFeedAt } from "@/content/feed";

const KEY = "gully.feed.seenAt";

function readSeenAt(): number | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(KEY);
  if (!raw) return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

export function hasUnread(): boolean {
  const seenAt = readSeenAt();
  if (seenAt == null) return true;
  return latestFeedAt > seenAt;
}

export function markFeedSeen(): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(
    KEY,
    String(Math.max(Date.now(), latestFeedAt)),
  );
}

export { latestFeedAt };
