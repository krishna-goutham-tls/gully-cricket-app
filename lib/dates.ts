/**
 * Match lists group by the day they were played — gully cricket happens in
 * sessions, so three games share one evening and a per-card date would just
 * repeat itself. Everything here is local time: the day a match belongs to is
 * the day the people who played it were standing on the pitch.
 */

/** Local-calendar-day bucket. Not for display. */
export function dayKey(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

/** "Today" · "Yesterday" · "Sat, 19 Jul" · "Sat, 19 Jul 2025". */
export function dayLabel(ts: number, now: number = Date.now()): string {
  if (dayKey(ts) === dayKey(now)) return "Today";
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (dayKey(ts) === dayKey(yesterday.getTime())) return "Yesterday";

  const d = new Date(ts);
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    // Only spell out the year once it stops being obvious.
    ...(d.getFullYear() === new Date(now).getFullYear()
      ? {}
      : { year: "numeric" }),
  });
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
