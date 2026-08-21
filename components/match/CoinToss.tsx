"use client";

import { cn } from "@/lib/utils";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

type Side = "A" | "B";
type Face = "heads" | "tails";

const SPIN_MS = 2100;
const SHELL =
  "flex h-dvh flex-col overflow-x-hidden bg-bg px-5 pb-[calc(2rem+env(safe-area-inset-bottom))] pt-[calc(var(--safe-top)+1rem)]";

function other(side: Side): Side {
  return side === "A" ? "B" : "A";
}

export function CoinToss({
  sideA,
  sideB,
  busy,
  error,
  onPickBatting,
}: {
  sideA: { name: string };
  sideB: { name: string };
  busy: boolean;
  error: string | null;
  onPickBatting: (side: Side) => void;
}) {
  const [outside, setOutside] = useState(false);
  const [caller, setCaller] = useState<Side | null>(null);
  const [call, setCall] = useState<Face | null>(null);
  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState<Face | null>(null);
  const [angle, setAngle] = useState(0);
  const [nudge, setNudge] = useState<"caller" | "call" | null>(null);
  const spinTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nudgeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (spinTimer.current) clearTimeout(spinTimer.current);
      if (nudgeTimer.current) clearTimeout(nudgeTimer.current);
    },
    [],
  );

  const name = (s: Side) => (s === "A" ? sideA.name : sideB.name);
  const teams = [
    { side: "A" as const, name: sideA.name },
    { side: "B" as const, name: sideB.name },
  ];
  const winner =
    result && caller && call
      ? call === result
        ? caller
        : other(caller)
      : null;
  const landed = result !== null && !spinning;
  const picking = !landed && !spinning;

  function flash(which: "caller" | "call") {
    setNudge(which);
    if (nudgeTimer.current) clearTimeout(nudgeTimer.current);
    nudgeTimer.current = setTimeout(() => setNudge(null), 380);
  }

  function toss() {
    if (spinning || landed || busy) return;
    if (!caller) {
      flash("caller");
      return;
    }
    if (!call) {
      flash("call");
      return;
    }
    const face: Face = Math.random() < 0.5 ? "heads" : "tails";
    const turns = 9 + Math.floor(Math.random() * 5);
    const end = turns * 360 + (face === "tails" ? 180 : 0);
    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    setResult(face);
    if (reduced) {
      setAngle(face === "tails" ? 180 : 0);
      return;
    }
    setSpinning(true);
    setAngle(end);
    if (spinTimer.current) clearTimeout(spinTimer.current);
    spinTimer.current = setTimeout(() => setSpinning(false), SPIN_MS);
  }

  if (outside) {
    return (
      <div className={SHELL}>
        <Link
          href="/home"
          className="-ml-3 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-muted"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="flex min-h-0 flex-1 flex-col justify-center">
          <h1 className="text-2xl font-semibold tracking-tight text-ink">
            Who bats first?
          </h1>
          <p className="mt-1.5 text-sm text-muted">Tap the batting team.</p>
          {error ? <p className="mt-4 text-sm text-danger">{error}</p> : null}
          <div className="mt-8 space-y-3">
            {teams.map((s) => (
              <button
                key={s.side}
                type="button"
                disabled={busy}
                onClick={() => onPickBatting(s.side)}
                className="flex min-h-16 w-full items-center rounded-3xl border border-line bg-surface px-5 text-left transition active:scale-[0.98] active:border-accent"
              >
                <span className="text-lg font-semibold text-ink">{s.name}</span>
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setOutside(false)}
            className="mt-6 min-h-11 text-[13px] font-medium text-muted underline underline-offset-4"
          >
            Toss in the app
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={SHELL}>
      <Link
        href="/home"
        className="-ml-3 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-muted"
      >
        <ArrowLeft className="h-5 w-5" />
      </Link>

      <h1 className="shrink-0 text-2xl font-semibold tracking-tight text-ink">
        {landed && winner ? `${name(winner)} won` : "Toss"}
      </h1>
      <p className="mt-1.5 min-h-5 shrink-0 text-sm text-muted">
        {landed
          ? result === "heads"
            ? "Heads."
            : "Tails."
          : spinning
            ? ""
            : "Caller picks a side, then toss."}
      </p>
      {error ? (
        <p className="mt-2 shrink-0 text-sm text-danger">{error}</p>
      ) : null}

      {picking ? (
        <div className="mt-3 shrink-0 space-y-2.5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-faint">
            Who&apos;s calling?
          </p>
          <div
            className={cn(
              "grid grid-cols-2 gap-2",
              nudge === "caller" && "coin-toss-nudge",
            )}
          >
            {teams.map((s) => (
              <button
                key={s.side}
                type="button"
                onClick={() => {
                  setCaller(s.side);
                  setNudge(null);
                }}
                className={cn(
                  "min-h-11 min-w-0 truncate rounded-2xl border px-3 text-[15px] font-semibold transition active:scale-[0.98]",
                  caller === s.side
                    ? "border-ink bg-ink text-bg"
                    : "border-line bg-surface text-ink",
                )}
              >
                {s.name}
              </button>
            ))}
          </div>
          <div
            className={cn(
              "grid grid-cols-2 gap-2",
              nudge === "call" && "coin-toss-nudge",
            )}
          >
            {(["heads", "tails"] as const).map((face) => (
              <button
                key={face}
                type="button"
                onClick={() => {
                  setCall(face);
                  setNudge(null);
                }}
                className={cn(
                  "flex min-h-11 items-center justify-center gap-2 rounded-2xl border px-3 py-1.5 transition active:scale-[0.98]",
                  call === face
                    ? "border-ink bg-ink text-bg"
                    : "border-line bg-surface text-ink",
                )}
              >
                <span
                  className="h-8 w-8 shrink-0 rounded-full bg-cover bg-center"
                  style={{ backgroundImage: `url(/${face}.jpg)` }}
                  aria-hidden
                />
                <span className="text-[15px] font-semibold capitalize">
                  {face}
                </span>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1 flex-col items-center justify-center py-2">
        <button
          type="button"
          aria-label="Toss"
          disabled={spinning || landed || busy}
          onClick={toss}
          className="coin-toss-stage disabled:pointer-events-none"
        >
          <div
            className="coin-toss-arc"
            data-tossing={spinning ? "true" : "false"}
          >
            <div
              className="coin-toss-body"
              style={{ transform: `rotateY(${angle}deg)` }}
            >
              <div className="coin-toss-face coin-toss-heads" />
              <div className="coin-toss-face coin-toss-tails" />
            </div>
          </div>
        </button>
      </div>

      {landed && winner ? (
        <div className="shrink-0 space-y-3">
          <p className="text-center text-sm text-muted">{name(winner)} picks</p>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              disabled={busy}
              onClick={() => onPickBatting(winner)}
              className="flex min-h-16 items-center justify-center rounded-3xl border border-line bg-surface text-lg font-semibold text-ink transition active:scale-[0.98] active:border-accent"
            >
              Bat
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => onPickBatting(other(winner))}
              className="flex min-h-16 items-center justify-center rounded-3xl border border-line bg-surface text-lg font-semibold text-ink transition active:scale-[0.98] active:border-accent"
            >
              Bowl
            </button>
          </div>
        </div>
      ) : picking ? (
        <div className="shrink-0">
          <button
            type="button"
            disabled={busy}
            onClick={toss}
            className="flex min-h-14 w-full items-center justify-center rounded-2xl bg-ink text-[15px] font-semibold text-bg shadow-card transition active:scale-[0.98]"
          >
            Toss
          </button>
          <button
            type="button"
            onClick={() => setOutside(true)}
            className="mt-3 min-h-11 w-full text-[13px] font-medium text-muted underline underline-offset-4"
          >
            Tossed outside
          </button>
        </div>
      ) : (
        <div className="min-h-14 shrink-0" />
      )}
    </div>
  );
}
