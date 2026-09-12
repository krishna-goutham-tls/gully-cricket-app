"use client";

import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Button } from "@/components/ui/Button";
import {
  clockView,
  formatClockMs,
  type ClockView,
  type MatchClock,
} from "@/lib/matchClock";
import { cn } from "@/lib/utils";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

const FIVE_MIN_MS = 5 * 60 * 1000;
const FLASH_MS = 3000;

/** Survives Strict Mode remount so a day does not beep twice. */
const announced = new Set<string>();

function once(key: string) {
  if (announced.has(key)) return false;
  announced.add(key);
  return true;
}

type BeepKind = "five" | "day" | "timeup";

function playBeep(kind: BeepKind) {
  try {
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    const ctx = new AC();
    const chirp = (when: number, dur: number, freq: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "square";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, when);
      gain.gain.exponentialRampToValueAtTime(0.35, when + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, when + dur);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(when);
      osc.stop(when + dur + 0.02);
    };
    const t0 = ctx.currentTime;
    if (kind === "five") chirp(t0, 0.18, 880);
    else if (kind === "day") {
      chirp(t0, 0.16, 880);
      chirp(t0 + 0.22, 0.16, 880);
    } else {
      chirp(t0, 0.7, 660);
    }
    window.setTimeout(() => void ctx.close(), 1500);
  } catch {
    /* autoplay blocked or no Web Audio */
  }
  try {
    const pattern =
      kind === "day" ? [180, 80, 180] : kind === "timeup" ? [400] : [160];
    navigator.vibrate?.(pattern);
  } catch {
    /* no haptic */
  }
}

function notifyDayDone(day: number) {
  try {
    if (typeof Notification === "undefined") return;
    if (Notification.permission !== "granted") return;
    new Notification(`Day ${day} done`, { silent: true });
  } catch {
    /* denied or unsupported */
  }
}

function useNow(active: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [active]);
  return now;
}

function fiveMinWindow(view: ClockView) {
  return (
    view.remainingDayMs > 0 &&
    view.remainingDayMs <= FIVE_MIN_MS &&
    !view.overtime &&
    !view.timeUp
  );
}

function clockLabel(view: ClockView) {
  return `Day ${view.day} · ${formatClockMs(view.remainingDayMs)}`;
}

function durationMinutesOf(clock: MatchClock) {
  return Math.round(clock.durationMs / 60000);
}

type ClockRole = "scorer" | "watcher";

type ClockCtx = {
  view: ClockView;
  role: ClockRole;
  durationMinutes: number;
  busy: boolean;
  pause: () => void;
  resume: () => void;
  keepPlaying: () => void;
  onEndMatch?: () => void;
  suppressTimeUp: boolean;
  flashDay: number | null;
  dismissFlash: () => void;
};

const Ctx = createContext<ClockCtx | null>(null);

function useClockCtx() {
  return useContext(Ctx);
}

export function TestClockProvider({
  clock,
  role,
  matchId,
  onPause,
  onResume,
  onKeepPlaying,
  onEndMatch,
  suppressTimeUp = false,
  children,
}: {
  clock: MatchClock | null | undefined;
  role: ClockRole;
  matchId: string;
  onPause?: () => Promise<unknown> | void;
  onResume?: () => Promise<unknown> | void;
  onKeepPlaying?: () => Promise<unknown> | void;
  onEndMatch?: () => void;
  suppressTimeUp?: boolean;
  children: ReactNode;
}) {
  const now = useNow(!!clock?.startedAt);
  const view = clock ? clockView(clock, now) : null;
  const prevDayRef = useRef<number | null>(null);
  const [flashDay, setFlashDay] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  const hasClock = !!clock;
  const day = view?.day ?? null;
  const dayCount = view?.dayCount ?? 0;
  const inFive = view ? fiveMinWindow(view) : false;
  const timeUp = view?.timeUp ?? false;

  useEffect(() => {
    if (role !== "scorer" || !hasClock) return;
    if (typeof Notification === "undefined") return;
    if (Notification.permission !== "default") return;
    void Notification.requestPermission().catch(() => {});
  }, [role, hasClock]);

  useEffect(() => {
    if (day === null) return;
    const prev = prevDayRef.current;
    prevDayRef.current = day;
    if (prev === null) return;
    if (day > prev && prev < dayCount) {
      const doneDay = day - 1;
      if (doneDay < 1) return;
      if (!once(`${matchId}:daydone:${doneDay}`)) return;
      setFlashDay(doneDay);
      playBeep("day");
      notifyDayDone(doneDay);
    }
  }, [day, dayCount, matchId]);

  useEffect(() => {
    if (!inFive || day === null) return;
    if (!once(`${matchId}:five:${day}`)) return;
    playBeep("five");
  }, [inFive, day, matchId]);

  useEffect(() => {
    if (!timeUp) return;
    if (!once(`${matchId}:timeup`)) return;
    playBeep("timeup");
  }, [timeUp, matchId]);

  useEffect(() => {
    if (flashDay === null) return;
    const t = window.setTimeout(() => setFlashDay(null), FLASH_MS);
    return () => window.clearTimeout(t);
  }, [flashDay]);

  const run = useCallback(
    async (fn?: () => Promise<unknown> | void) => {
      if (!fn || busy) return;
      setBusy(true);
      try {
        await fn();
      } catch {
        /* scoring stays live */
      } finally {
        setBusy(false);
      }
    },
    [busy],
  );

  const pause = useCallback(() => {
    if (role !== "scorer" || view?.paused) return;
    void run(onPause);
  }, [role, view?.paused, run, onPause]);

  const resume = useCallback(() => {
    if (role !== "scorer") return;
    void run(onResume);
  }, [role, run, onResume]);

  const keepPlaying = useCallback(() => {
    if (role !== "scorer") return;
    void run(onKeepPlaying);
  }, [role, run, onKeepPlaying]);

  const durationMinutes = clock ? durationMinutesOf(clock) : 0;

  const ctx = useMemo<ClockCtx | null>(() => {
    if (!view) return null;
    return {
      view,
      role,
      durationMinutes,
      busy,
      pause,
      resume,
      keepPlaying,
      onEndMatch,
      suppressTimeUp,
      flashDay,
      dismissFlash: () => setFlashDay(null),
    };
  }, [
    view,
    role,
    durationMinutes,
    busy,
    pause,
    resume,
    keepPlaying,
    onEndMatch,
    suppressTimeUp,
    flashDay,
  ]);

  return <Ctx.Provider value={ctx}>{children}</Ctx.Provider>;
}

/** Tappable Day N · M:SS under the innings row. Hidden until the clock starts. */
export function TestClockLine({
  tone = "ink",
}: {
  tone?: "ink" | "paper";
}) {
  const ctx = useClockCtx();
  if (!ctx) return null;
  const { view, role, pause } = ctx;
  const accent = view.overtime || view.timeUp || view.remainingDayMs === 0;
  const cls = cn(
    "flex min-h-11 w-full items-center justify-center tabular text-[13px] font-semibold active:opacity-70",
    accent
      ? "text-accent"
      : tone === "paper"
        ? "text-muted"
        : "text-bg/70",
  );
  const label = clockLabel(view);
  if (role !== "scorer") {
    return <p className={cls}>{label}</p>;
  }
  return (
    <button type="button" onClick={pause} className={cls}>
      {label}
    </button>
  );
}

/** Paused bar, 5-minute warning, watcher time-up. Sit just under the ink header. */
export function TestClockStatus() {
  const ctx = useClockCtx();
  if (!ctx) return null;
  const { view, role, resume, busy, durationMinutes } = ctx;
  const five = fiveMinWindow(view);
  return (
    <>
      {view.paused ? (
        <div className="flex min-h-12 items-center justify-between gap-3 bg-accent-soft px-5 py-2">
          <p className="text-[13px] font-semibold text-accent-deep">
            Clock paused
          </p>
          {role === "scorer" ? (
            <Button onClick={resume} disabled={busy}>
              Resume
            </Button>
          ) : null}
        </div>
      ) : null}
      {five ? (
        <p className="bg-accent-soft px-5 py-2 text-center text-[13px] font-semibold text-accent-deep">
          5 minutes left in day {view.day}
        </p>
      ) : null}
      {role === "watcher" && view.timeUp ? (
        <div className="bg-accent-soft px-5 py-2 text-center">
          <p className="text-[15px] font-semibold text-ink">Time</p>
          <p className="mt-0.5 text-[13px] text-accent-deep">
            The {durationMinutes} minutes are done.
          </p>
        </div>
      ) : null}
    </>
  );
}

/** Day-done flash + scorer time-up sheet. */
export function TestClockOverlays() {
  const ctx = useClockCtx();
  if (!ctx) return null;
  const {
    view,
    role,
    flashDay,
    dismissFlash,
    durationMinutes,
    onEndMatch,
    keepPlaying,
    busy,
    suppressTimeUp,
  } = ctx;
  return (
    <>
      {flashDay !== null ? (
        <button
          type="button"
          onClick={dismissFlash}
          className="fixed inset-0 z-[70] flex items-center justify-center bg-ink"
        >
          <p className="text-2xl font-semibold text-bg">
            Day <span className="text-accent">{flashDay}</span> done
          </p>
        </button>
      ) : null}
      {role === "scorer" ? (
        <ConfirmDialog
          open={view.timeUp && !suppressTimeUp}
          title="Time"
          description={`The ${durationMinutes} minutes are done.`}
          confirmLabel="End match"
          cancelLabel="Keep playing"
          busy={busy}
          onConfirm={() => onEndMatch?.()}
          onCancel={keepPlaying}
        />
      ) : null}
    </>
  );
}

/** Innings-break / openers line on paper. Hidden until the clock starts. */
export function CompactTestClock({
  clock,
}: {
  clock: MatchClock | null | undefined;
}) {
  const now = useNow(!!clock?.startedAt);
  const view = clock ? clockView(clock, now) : null;
  if (!view) return null;
  return (
    <p className="mt-2 tabular text-[13px] font-semibold text-muted">
      {clockLabel(view)}
    </p>
  );
}
