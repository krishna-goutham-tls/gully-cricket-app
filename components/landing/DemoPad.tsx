"use client";

import { cn } from "@/lib/utils";
import { Undo2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

/**
 * The landing-page practice pad, rendered as a full phone screen (the parent
 * wraps it in a PhoneFrame). A faithful miniature of the real score pad that
 * never touches Convex — the ball log lives in component state, mirrored to
 * localStorage so a returning visitor finds their net session where they
 * left it.
 *
 * Same replay philosophy as the real engine: the log is the only state, and
 * everything on screen is derived from it. Undo = pop.
 */

const STORAGE_KEY = "gully_demo_pad";
const BALLS_PER_OVER = 6;
const OVERS_CAP = 2;

const BATTERS = ["Ashu", "Vicky", "Sameer", "Golu", "Raju"];
const BOWLERS = ["Chhotu", "Imran"];

type DemoBall = {
  runs: number;
  extra?: "wide" | "noball" | "bye" | "legbye";
  wicket?: boolean;
  dropped?: boolean;
};

function isLegal(b: DemoBall) {
  return b.extra !== "wide" && b.extra !== "noball";
}

function ballRuns(b: DemoBall) {
  if (b.extra === "wide" || b.extra === "noball") return 1 + b.runs;
  return b.runs;
}

function ballLabel(b: DemoBall) {
  if (b.wicket) return "W";
  if (b.extra === "wide") return "Wd";
  if (b.extra === "noball") return "Nb";
  if (b.extra === "bye") return `B${b.runs}`;
  if (b.extra === "legbye") return `Lb${b.runs}`;
  return String(b.runs);
}

function chipClass(b: DemoBall) {
  if (b.wicket) return "bg-danger text-white";
  if (b.extra === "wide" || b.extra === "noball")
    return "bg-accent/30 text-accent";
  if (b.extra) return "bg-white/15 text-bg/80";
  if (b.runs >= 4) return "bg-accent text-ink";
  return "bg-white/10 text-bg";
}

/** Replay the whole log — the demo has no other source of truth. */
function replay(log: DemoBall[]) {
  let runs = 0;
  let wickets = 0;
  let legal = 0;
  let strikerIdx = 0;
  let nonStrikerIdx = 1;
  let nextIn = 2;
  const batRuns = new Array(BATTERS.length).fill(0);
  const batBalls = new Array(BATTERS.length).fill(0);

  for (const b of log) {
    runs += ballRuns(b);
    const scoredOffBat = !b.extra;
    if (scoredOffBat) {
      batRuns[strikerIdx] += b.runs;
      batBalls[strikerIdx] += 1;
    } else if (isLegal(b)) {
      batBalls[strikerIdx] += 1;
    }
    if (b.wicket) {
      wickets += 1;
      if (nextIn < BATTERS.length) {
        strikerIdx = nextIn;
        nextIn += 1;
      }
    } else if (b.runs % 2 === 1 && !b.wicket) {
      [strikerIdx, nonStrikerIdx] = [nonStrikerIdx, strikerIdx];
    }
    if (isLegal(b)) {
      legal += 1;
      if (legal % BALLS_PER_OVER === 0) {
        [strikerIdx, nonStrikerIdx] = [nonStrikerIdx, strikerIdx];
      }
    }
  }

  const overNo = Math.floor(legal / BALLS_PER_OVER);
  const inOver = legal % BALLS_PER_OVER;
  const currentOver: DemoBall[] = [];
  let seenLegal = 0;
  for (let i = log.length - 1; i >= 0; i--) {
    if (seenLegal >= inOver && isLegal(log[i])) break;
    currentOver.unshift(log[i]);
    if (isLegal(log[i])) seenLegal += 1;
  }
  if (inOver === 0) currentOver.length = 0;

  const allOut = wickets >= BATTERS.length - 1;
  const done = legal >= OVERS_CAP * BALLS_PER_OVER || allOut;

  return {
    runs,
    wickets,
    legal,
    oversText: `${overNo}.${inOver}`,
    currentOver,
    strikerIdx,
    nonStrikerIdx,
    batRuns,
    batBalls,
    bowler: BOWLERS[Math.min(overNo, BOWLERS.length - 1)],
    allOut,
    done,
  };
}

function PadKey({
  label,
  onClick,
  emphasis,
  danger,
  small,
  armed,
  disabled,
  className,
}: {
  label: React.ReactNode;
  onClick: () => void;
  emphasis?: boolean;
  danger?: boolean;
  small?: boolean;
  armed?: boolean;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex min-h-11 items-center justify-center rounded-xl border font-semibold shadow-card transition active:scale-[0.96] disabled:opacity-30 disabled:shadow-none",
        danger
          ? "border-danger/25 bg-danger-soft text-danger"
          : armed
            ? "border-accent bg-accent text-ink ring-2 ring-accent"
            : emphasis
              ? "border-accent/45 bg-accent-soft text-accent-deep"
              : "border-line bg-surface text-ink",
        small ? "text-[12px]" : "text-[17px]",
        className,
      )}
    >
      {label}
    </button>
  );
}

/** FOUR! / SIX! / OUT! — the pad celebrates like the crowd does. */
function burstFor(b: DemoBall): { text: string; tone: "gold" | "red" } | null {
  if (b.wicket) return { text: "OUT!", tone: "red" };
  if (!b.extra && b.runs === 6) return { text: "SIX!", tone: "gold" };
  if (!b.extra && b.runs === 4) return { text: "FOUR!", tone: "gold" };
  return null;
}

export function DemoPad() {
  const [log, setLog] = useState<DemoBall[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [pulse, setPulse] = useState(false);
  const [lastDrop, setLastDrop] = useState<string | null>(null);
  const [burst, setBurst] = useState<{
    id: number;
    text: string;
    tone: "gold" | "red";
  } | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setLog(JSON.parse(raw));
    } catch {
      // A corrupt stash just means a fresh net session.
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(log));
    } catch {
      // Storage full/blocked — the demo still works for this visit.
    }
  }, [log, hydrated]);

  const live = useMemo(() => replay(log), [log]);

  function record(b: DemoBall) {
    if (live.done) return;
    setLastDrop(null);
    setLog((l) => [...l, b]);
    setPulse(true);
    setTimeout(() => setPulse(false), 350);
    const bu = burstFor(b);
    if (bu) setBurst({ id: Date.now(), ...bu });
  }

  /**
   * CD annotates the ball just scored, exactly as the real pad does — nobody
   * can call a drop before it happens. Tapping again takes it back off.
   */
  function toggleDrop() {
    if (live.done || log.length === 0) return;
    const wasDropped = log[log.length - 1].dropped ?? false;
    setLog((l) =>
      l.map((b, i) =>
        i === l.length - 1 ? { ...b, dropped: !wasDropped } : b,
      ),
    );
    setLastDrop(
      wasDropped ? null : BATTERS[(live.strikerIdx + 3) % BATTERS.length],
    );
  }

  const lastBallDropped = log.length > 0 && (log[log.length - 1].dropped ?? false);
  const striker = BATTERS[live.strikerIdx];
  const nonStriker = BATTERS[live.nonStrikerIdx];

  return (
    <div className="flex h-full flex-col bg-bg">
      {/* Scoreboard — same dark header grammar as the real pad */}
      <div className="relative bg-ink px-3 pb-3 pt-9 text-bg">
        {burst ? (
          <p
            key={burst.id}
            className={cn(
              "pop-burst pointer-events-none absolute left-1/2 top-9 z-10 text-4xl font-bold tracking-tight",
              burst.tone === "red" ? "text-danger" : "text-accent",
            )}
          >
            {burst.text}
          </p>
        ) : null}
        <p className="text-center text-[11px] font-medium text-bg/60">
          Innings 1 · Team Ashu batting
        </p>
        <div className="mt-1.5 flex items-end justify-center gap-3">
          <p
            className={cn(
              "tabular text-[2.75rem] font-semibold leading-none tracking-tight transition",
              pulse ? "scale-[1.04] text-accent" : "text-bg",
            )}
          >
            {live.runs}
            <span className="text-bg/35">/</span>
            {live.wickets}
          </p>
          <div className="pb-0.5 text-left">
            <p className="tabular text-[1.4rem] font-bold leading-none text-bg">
              {live.oversText}
            </p>
            <p className="mt-0.5 text-[9px] font-semibold uppercase tracking-wide text-bg/50">
              Overs
            </p>
          </div>
        </div>

        <div className="mt-2.5 grid grid-cols-3 gap-1 text-center text-[10px]">
          <div className="rounded-lg bg-accent/20 px-1 py-1 ring-1 ring-accent/60">
            <p className="font-semibold uppercase tracking-wide text-accent">
              Strike
            </p>
            <p className="truncate font-bold text-bg">
              {striker}
              <span className="text-accent">*</span>
            </p>
            <p className="tabular text-bg/70">
              {live.batRuns[live.strikerIdx]}({live.batBalls[live.strikerIdx]})
            </p>
          </div>
          <div className="rounded-lg bg-white/[0.05] px-1 py-1">
            <p className="uppercase tracking-wide text-bg/45">Non-striker</p>
            <p className="truncate font-medium text-bg/75">{nonStriker}</p>
            <p className="tabular text-bg/55">
              {live.batRuns[live.nonStrikerIdx]}(
              {live.batBalls[live.nonStrikerIdx]})
            </p>
          </div>
          <div className="rounded-lg bg-white/[0.05] px-1 py-1">
            <p className="uppercase tracking-wide text-bg/45">Bowling</p>
            <p className="truncate font-medium text-bg/90">{live.bowler}</p>
            <p className="tabular text-bg/55">Over {live.oversText}</p>
          </div>
        </div>

        <div className="mt-2.5 flex min-h-6 flex-wrap items-center justify-center gap-1">
          {live.currentOver.map((b, i) => (
            <span
              key={i}
              className={cn(
                "tabular flex h-6 min-w-6 items-center justify-center rounded-full px-1.5 text-[11px] font-bold",
                chipClass(b),
              )}
            >
              {ballLabel(b)}
            </span>
          ))}
          {Array.from(
            {
              length: Math.max(
                0,
                BALLS_PER_OVER -
                  live.currentOver.filter((b) => isLegal(b)).length,
              ),
            },
            (_, i) => (
              <span
                key={`slot-${i}`}
                className="flex h-6 w-6 items-center justify-center rounded-full border border-white/20"
              >
                <span className="h-1 w-1 rounded-full bg-white/25" />
              </span>
            ),
          )}
        </div>
        <p className="mt-1.5 min-h-4 text-center text-[10px] font-medium text-accent">
          {lastDrop ? `Drop tagged — ${lastDrop} shelled it 🧈` : ""}
        </p>
      </div>

      {/* The pad */}
      <div className="relative flex flex-1 flex-col justify-end p-2.5">
        <div className="grid grid-cols-4 gap-1.5">
          {[0, 1, 2, 3, 4, 5, 6].map((n) => (
            <PadKey
              key={n}
              label={String(n)}
              emphasis={n === 4 || n === 6}
              disabled={live.done}
              onClick={() => record({ runs: n })}
            />
          ))}
          <PadKey
            label="WD"
            small
            disabled={live.done}
            onClick={() => record({ runs: 0, extra: "wide" })}
          />
          <PadKey
            label="NB"
            small
            disabled={live.done}
            onClick={() => record({ runs: 0, extra: "noball" })}
          />
          <PadKey
            label="BYE"
            small
            disabled={live.done}
            onClick={() => record({ runs: 1, extra: "bye" })}
          />
          <PadKey
            label="LB"
            small
            disabled={live.done}
            onClick={() => record({ runs: 1, extra: "legbye" })}
          />
          <PadKey
            label={lastBallDropped ? "CD ✓" : "CD"}
            small
            emphasis
            armed={lastBallDropped}
            disabled={live.done || log.length === 0}
            onClick={toggleDrop}
          />
          <PadKey
            label="OUT"
            danger
            disabled={live.done}
            className="col-span-2"
            onClick={() => record({ runs: 0, wicket: true })}
          />
          <PadKey
            label={<Undo2 className="h-4 w-4" />}
            disabled={log.length === 0}
            className="col-span-2"
            onClick={() => {
              setLog((l) => l.slice(0, -1));
              setLastDrop(null);
            }}
          />
        </div>

        {/* End-of-session card — the demo's whole argument, stated once */}
        {live.done ? (
          <div className="absolute inset-0 flex items-center justify-center bg-bg/95 p-4">
            <div className="text-center">
              <p className="tabular text-4xl font-semibold text-ink">
                {live.runs}/{live.wickets}
              </p>
              <p className="mt-1 text-[13px] font-medium text-muted">
                {live.allOut
                  ? "All out. Someone's buying cold drinks."
                  : `${OVERS_CAP} overs. That's the whole learning curve.`}
              </p>
              <a
                href="#invite"
                className="mt-4 inline-flex min-h-11 items-center justify-center rounded-xl bg-ink px-5 text-sm font-semibold text-bg shadow-card active:scale-[0.98]"
              >
                Get this for your games
              </a>
              <button
                type="button"
                onClick={() => {
                  setLog([]);
                  setLastDrop(null);
                }}
                className="mt-2.5 block w-full text-xs font-semibold text-muted underline-offset-2 hover:underline"
              >
                Play another innings
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
