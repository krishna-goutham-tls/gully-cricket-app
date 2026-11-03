/**
 * Match lists group by the day they were played — gully cricket happens in
 * sessions, so three games share one evening. Each card still carries its own
 * date (`matchDate`), so a card read alone says when it was played. Everything
 * here is local time: the day a match belongs to is the day the people who
 * played it were standing on the pitch.
 */

/** Local-calendar-day bucket. Not for display. */
export function dayKey(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

/** "Today" · "Yesterday" · "Sat 19 Jul" · "Sat 19 Jul 2025". */
export function dayLabel(ts: number, now: number = Date.now()): string {
  if (dayKey(ts) === dayKey(now)) return "Today";
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (dayKey(ts) === dayKey(yesterday.getTime())) return "Yesterday";

  return matchDate(ts, now);
}

/** "22 Jul" — for dense log rows where the year is noise. */
export function shortDate(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
  });
}

/** Splits an already-sorted list into consecutive same-day runs. */
export function groupByDay<T>(
  items: T[],
  at: (item: T) => number,
): Array<{ key: string; label: string; items: T[] }> {
  const groups: Array<{ key: string; label: string; items: T[] }> = [];
  for (const item of items) {
    const key = dayKey(at(item));
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.items.push(item);
    else groups.push({ key, label: dayLabel(at(item)), items: [item] });
  }
  return groups;
}

/** Local-midnight bounds of the day a timestamp falls in, as `hero.*` takes them. */
export function dayBounds(ts: number) {
  const d = new Date(ts);
  const start = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0).getTime();
  return { dayStart: start, dayEnd: start + 24 * 60 * 60 * 1000 };
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Sat 1 Nov" — the same on every phone, for a one-line summary. */
export function weekdayDate(ts: number): string {
  const d = new Date(ts);
  return `${WEEKDAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

/** "Sat 1 Nov", or "Sat 1 Nov 2025" once the year stops being obvious. */
export function matchDate(ts: number, now: number = Date.now()): string {
  const year = new Date(ts).getFullYear();
  return year === new Date(now).getFullYear()
    ? weekdayDate(ts)
    : `${weekdayDate(ts)} ${year}`;
}
