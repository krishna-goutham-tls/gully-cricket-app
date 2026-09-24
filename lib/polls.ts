/**
 * "Who's in?" dates. All local time: the day a poll is for is the day the
 * people answering it will be standing on the pitch.
 */

const pad = (n: number) => String(n).padStart(2, "0");

/** YYYY-MM-DD for a local calendar day. */
export function dayKeyOf(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function parseDay(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

/**
 * The next weekend day after today — the game people are usually asking
 * about. Friday asks for Saturday, Saturday for Sunday, Sunday for next
 * Saturday, and a weekday for the coming Saturday.
 */
export function defaultPollDay(now: Date = new Date()): string {
  for (let i = 1; i <= 7; i++) {
    const d = addDays(now, i);
    if (d.getDay() === 6 || d.getDay() === 0) return dayKeyOf(d);
  }
  return dayKeyOf(addDays(now, 1));
}

/** Today, tomorrow and the coming weekend, soonest first, no repeats. */
export function pollDayOptions(
  now: Date = new Date(),
): Array<{ key: string; label: string }> {
  const out: Array<{ key: string; label: string }> = [];
  const push = (d: Date, label: string) => {
    const key = dayKeyOf(d);
    if (!out.some((o) => o.key === key)) out.push({ key, label });
  };
  push(now, "Today");
  push(addDays(now, 1), "Tomorrow");
  for (let i = 2; i <= 7; i++) {
    const d = addDays(now, i);
    if (d.getDay() === 6 || d.getDay() === 0) {
      push(d, d.toLocaleDateString(undefined, { weekday: "short", day: "numeric" }));
    }
  }
  return out;
}

/** What the server stores: start, and the end of that local day. */
export function pollTimes(day: string, time: string) {
  const d = parseDay(day);
  const [hh, mm] = time.split(":").map(Number);
  return {
    startsAt: new Date(d.getFullYear(), d.getMonth(), d.getDate(), hh, mm).getTime(),
    closesAt: addDays(d, 1).getTime(),
  };
}

/** "Tomorrow · 7:00 am" · "Sat 27 Sep · 6:30 am". */
export function pollWhen(startsAt: number, now: Date = new Date()): string {
  const d = new Date(startsAt);
  const key = dayKeyOf(d);
  const day =
    key === dayKeyOf(now)
      ? "Today"
      : key === dayKeyOf(addDays(now, 1))
        ? "Tomorrow"
        : d.toLocaleDateString(undefined, {
            weekday: "short",
            day: "numeric",
            month: "short",
          });
  const time = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  return `${day} · ${time}`;
}
