"use client";

import { api } from "@/convex/_generated/api";
import { cn } from "@/lib/utils";
import { FunctionReturnType } from "convex/server";
import { useMemo, useRef, useState } from "react";

/**
 * The Match Story — the "what happened today" page for a completed match.
 * Everything here is read-model only: badges, the scrubbable lead worm,
 * the turning point and the headline numbers all come from one
 * story.matchStory query. Approved via the 2026-08-01 interactive mockup;
 * layout and visual language mirror it deliberately.
 */

export type Story = NonNullable<FunctionReturnType<typeof api.story.matchStory>>;
type StoryBall = Story["timeline"][number];

const BADGE_EMOJI: Record<string, string> = {
  potm: "🏆",
  finisher: "🔨",
  wall: "🧱",
  sixmachine: "💣",
  safehands: "🧤",
  miser: "💎",
  goldenduck: "🦆",
  atm: "🏧",
  spraycan: "🎨",
  statue: "🗿",
};

function clockTime(ts: number) {
  return new Date(ts).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

function ordinalWord(n: number) {
  return n === 1 ? "1st" : n === 2 ? "2nd" : n === 3 ? "3rd" : `${n}th`;
}

/** "Ganesh c Amarnath b Sheen" / "Amarnath hits Naman for SIX" */
function describeBall(b: StoryBall) {
  if (b.wicketType) {
    const out = b.outName ?? "Batter";
    switch (b.wicketType) {
      case "bowled":
        return `${out} b ${b.bowlerName}`;
      case "lbw":
        return `${out} lbw b ${b.bowlerName}`;
      case "caught":
        return `${out} c ${b.fielderName ?? "?"} b ${b.bowlerName}`;
      case "stumped":
        return `${out} st ${b.fielderName ?? "?"} b ${b.bowlerName}`;
      case "runout":
        return `${out} run out${b.fielderName ? ` (${b.fielderName})` : ""}`;
      default:
        return `${out} out`;
    }
  }
  if (b.runsBat === 6) return `${b.strikerName} hits ${b.bowlerName} for SIX`;
  if (b.runsBat === 4) return `${b.strikerName} finds the boundary — four`;
  if (b.runsBat > 0)
    return `${b.strikerName} takes ${b.runsBat} off ${b.bowlerName}`;
  if (b.extrasRuns > 0) return `Extras — ${b.extrasRuns}`;
  return `${b.strikerName} plays out a dot`;
}

export function MatchStory({ story }: { story: Story }) {
  return (
    <div className="space-y-5">
      <MetaLine story={story} />
      {story.badges.length > 0 ? <BadgeShelf badges={story.badges} /> : null}
      <WormCard story={story} />
      {story.turningPoint ? <TurningPoint story={story} /> : null}
      <NumbersStrip story={story} />
    </div>
  );
}

function MetaLine({ story }: { story: Story }) {
  const parts = [
    `${clockTime(story.startedAt)} – ${clockTime(story.endedAt)}`,
    `${story.durationMin} min of cricket`,
    `${story.totalBalls} balls`,
    `${story.totalWickets} wickets`,
  ];
  return (
    <p className="flex flex-wrap gap-x-1.5 gap-y-0.5 text-[11px] text-faint">
      {parts.map((p, i) => (
        <span key={p}>
          {i > 0 ? <span className="mr-1.5 text-line">·</span> : null}
          {p}
        </span>
      ))}
    </p>
  );
}

function BadgeShelf({ badges }: { badges: Story["badges"] }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <section>
      <h2 className="mb-2.5 text-[11px] font-semibold uppercase tracking-wide text-faint">
        Badges
      </h2>
      <div className="grid grid-cols-2 gap-2.5">
        {badges.map((b) => (
          <button
            key={b.key}
            type="button"
            onClick={() => setOpen(open === b.key ? null : b.key)}
            className="rounded-2xl border border-line bg-surface p-3.5 pb-3 text-left shadow-card transition-transform active:scale-[0.97]"
          >
            <span className="text-[22px] leading-none">
              {BADGE_EMOJI[b.key] ?? "🏅"}
            </span>
            <span className="mt-2 block text-[13px] font-semibold leading-snug">
              {b.name}
            </span>
            <span
              className={cn(
                "block text-[14px] font-semibold",
                b.kind === "roast" ? "text-danger" : "text-accent-deep",
              )}
            >
              {b.playerName}
            </span>
            <span className="mt-0.5 block text-[11px] leading-relaxed text-muted">
              {b.stat}
            </span>
            {open === b.key ? (
              <span className="mt-2 block border-t border-dashed border-line pt-2 text-[11px] leading-relaxed text-faint">
                {b.receipt}
              </span>
            ) : null}
          </button>
        ))}
      </div>
      <p className="mt-2 text-center text-[11px] text-faint">
        Tap a badge for the receipt
      </p>
    </section>
  );
}

/**
 * The scrubbable lead worm. One line: the batting-first side's lead across
 * every ball of the match, innings shaded alternately, wickets as red dots,
 * milestones as gold dots, sixes as gold ticks on the baseline. Dragging
 * anywhere replays that moment in the card below — this IS ball-by-ball v1.
 */
const W = 700;
const H = 250;
const PAD = { l: 10, r: 10, t: 34, b: 30 };

function WormCard({ story }: { story: Story }) {
  const tl = story.timeline;
  const [sel, setSel] = useState<number | null>(null);
  const [activeChip, setActiveChip] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const leader =
    story.battingFirst === "A" ? story.sideAName : story.sideBName;

  const geom = useMemo(() => {
    const n = tl.length;
    const leads = tl.map((b) => b.lead);
    const hi = Math.max(0, ...leads);
    const lo = Math.min(0, ...leads);
    const span = Math.max(1, hi - lo);
    const x = (i: number) => PAD.l + ((W - PAD.l - PAD.r) * i) / Math.max(1, n - 1);
    const y = (v: number) =>
      PAD.t + (H - PAD.t - PAD.b) * (1 - (v - lo) / span);
    let line = `M ${x(0)} ${y(leads[0])}`;
    for (let i = 1; i < n; i++) line += ` L ${x(i)} ${y(leads[i])}`;
    const area =
      `M ${x(0)} ${y(0)}` +
      leads.map((v, i) => ` L ${x(i)} ${y(v)}`).join("") +
      ` L ${x(n - 1)} ${y(0)} Z`;
    // Innings band bounds
    const bands: Array<{ x0: number; x1: number; label: string }> = [];
    story.innings.forEach((inn, k) => {
      const start = inn.firstBallIndex;
      if (start < 0) return;
      const next = story.innings[k + 1]?.firstBallIndex ?? n;
      const end = (next < 0 ? n : next) - 1;
      bands.push({
        x0: x(start),
        x1: x(end),
        label: `${ordinalWord(k + 1)} · ${inn.battingTeamName.replace(/^team\s+/i, "")}`,
      });
    });
    return { n, x, y, line, area, bands, leads };
  }, [tl, story.innings]);

  const chips = useMemo(() => {
    const out: Array<{ label: string; idx: number }> = [];
    tl.forEach((b, i) => {
      if (b.milestone === "fifty")
        out.push({ label: `${b.strikerName}'s fifty`, idx: i });
      if (b.milestone === "hundred")
        out.push({ label: `${b.strikerName}'s hundred`, idx: i });
      if (b.nemesisCount)
        out.push({ label: `Nemesis strikes`, idx: i });
    });
    if (story.turningPoint)
      out.push({ label: "The turning point", idx: story.turningPoint.ballIndex });
    out.sort((a, b) => a.idx - b.idx);
    return out.slice(0, 8);
  }, [tl, story.turningPoint]);

  const moments = useMemo(() => {
    const out: Array<{ idx: number; radius: number; milestone: boolean }> = [];
    tl.forEach((b, i) => {
      if (b.milestone) out.push({ idx: i, radius: 24, milestone: true });
      else if (b.wicketType) out.push({ idx: i, radius: 14, milestone: false });
    });
    return out;
  }, [tl]);

  const pick = (clientX: number) => {
    const el = svgRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const fx = ((clientX - r.left) / r.width) * W;
    const i = Math.round(
      ((fx - PAD.l) / (W - PAD.l - PAD.r)) * (geom.n - 1),
    );
    const raw = Math.max(0, Math.min(geom.n - 1, i));

    let snapIdx: number | null = null;
    let snapDist = Infinity;
    let snapIsMilestone = false;
    for (const m of moments) {
      const dist = Math.abs(geom.x(m.idx) - fx);
      if (dist > m.radius) continue;
      if (dist < snapDist || (dist === snapDist && m.milestone && !snapIsMilestone)) {
        snapIdx = m.idx;
        snapDist = dist;
        snapIsMilestone = m.milestone;
      }
    }

    setSel(snapIdx ?? raw);
    setActiveChip(null);
  };

  const ball = sel !== null ? tl[sel] : null;

  return (
    <section>
      <h2 className="mb-2.5 text-[11px] font-semibold uppercase tracking-wide text-faint">
        The match, ball by ball
      </h2>
      <div className="rounded-2xl border border-line bg-surface px-2.5 pb-3 pt-3.5 shadow-card">
        <div className="flex items-baseline justify-between px-1.5 pb-1">
          <span className="text-[13px] font-semibold">{leader}&apos;s lead</span>
          <span className="text-[11px] text-faint">drag to replay ↔</span>
        </div>
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          className="block w-full touch-pan-y select-none"
          role="img"
          aria-label="Lead across the match — drag to replay any ball"
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            pick(e.clientX);
          }}
          onPointerMove={(e) => {
            if (e.buttons > 0) pick(e.clientX);
          }}
        >
          {geom.bands.map((band, i) => (
            <g key={band.label}>
              {i % 2 === 1 ? (
                <rect
                  x={band.x0}
                  y={PAD.t - 22}
                  width={band.x1 - band.x0}
                  height={H - PAD.t - PAD.b + 22}
                  fill="#f5f1e8"
                />
              ) : null}
              <text
                x={band.x0 + 5}
                y={PAD.t - 9}
                fontSize={11}
                fontWeight={600}
                fill="#767066"
              >
                {band.label}
              </text>
            </g>
          ))}
          <line
            x1={PAD.l}
            y1={geom.y(0)}
            x2={W - PAD.r}
            y2={geom.y(0)}
            stroke="#eae4d9"
            strokeWidth={1}
          />
          <text
            x={W - PAD.r}
            y={geom.y(0) + 14}
            fontSize={11}
            fill="#767066"
            textAnchor="end"
          >
            scores level
          </text>
          <path d={geom.area} fill="#fdf4de" />
          <path
            d={geom.line}
            fill="none"
            stroke="#18181b"
            strokeWidth={2.4}
            strokeLinejoin="round"
          />
          {tl.map((b, i) =>
            b.runsBat === 6 ? (
              <line
                key={`s${i}`}
                x1={geom.x(i)}
                y1={H - PAD.b + 4}
                x2={geom.x(i)}
                y2={H - PAD.b + 12}
                stroke="#f0b429"
                strokeWidth={2}
              />
            ) : null,
          )}
          {tl.map((b, i) =>
            b.wicketType ? (
              <circle
                key={`w${i}`}
                cx={geom.x(i)}
                cy={geom.y(b.lead)}
                r={4.6}
                fill="#c0392b"
                stroke="#fff"
                strokeWidth={1.6}
              />
            ) : null,
          )}
          {tl.map((b, i) =>
            b.milestone ? (
              <g key={`m${i}`}>
                <circle
                  cx={geom.x(i)}
                  cy={geom.y(b.lead)}
                  r={7.5}
                  fill="#f0b429"
                  stroke="#fff"
                  strokeWidth={1.6}
                />
                <text
                  x={geom.x(i)}
                  y={geom.y(b.lead) + 3}
                  fontSize={8}
                  fontWeight={700}
                  fill="#18181b"
                  textAnchor="middle"
                >
                  {b.milestone === "fifty" ? "50" : "100"}
                </text>
              </g>
            ) : null,
          )}
          {sel !== null ? (
            <>
              <line
                x1={geom.x(sel)}
                y1={PAD.t - 4}
                x2={geom.x(sel)}
                y2={H - PAD.b}
                stroke="#8a5a0b"
                strokeWidth={1.4}
                strokeDasharray="3 3"
              />
              <circle
                cx={geom.x(sel)}
                cy={geom.y(tl[sel].lead)}
                r={5.4}
                fill="#8a5a0b"
                stroke="#fff"
                strokeWidth={1.8}
              />
            </>
          ) : null}
        </svg>

        <div
          className={cn(
            "mx-1.5 mt-2.5 min-h-[72px] rounded-xl border px-3.5 py-2.5",
            ball?.wicketType
              ? "border-danger/20 bg-danger-soft"
              : ball?.runsBat === 6
                ? "border-accent/30 bg-accent-soft"
                : "border-line bg-bg",
          )}
        >
          {ball ? (
            <>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-faint">
                {ordinalWord(ball.inn)} innings · Over {ball.over}.
                {ball.ballInOver} · {clockTime(ball.at)}
              </p>
              <p className="mt-0.5 text-[15px] font-semibold">
                {describeBall(ball)}
              </p>
              <p className="mt-0.5 text-[11px] text-muted">
                {leader}{" "}
                {ball.lead >= 0
                  ? `lead by ${ball.lead}`
                  : `trail by ${-ball.lead}`}
              </p>
              {ball.nemesisCount ? (
                <p className="mt-1.5 flex items-center gap-1.5 text-[11px] font-semibold text-danger">
                  👀 That&apos;s the {ordinalWord(ball.nemesisCount)} time{" "}
                  {ball.bowlerName} has got {ball.outName}
                </p>
              ) : null}
            </>
          ) : (
            <>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-faint">
                The whole match
              </p>
              <p className="mt-0.5 text-[15px] font-semibold">
                Drag along the line to replay it
              </p>
              <p className="mt-0.5 text-[11px] text-muted">
                Every wicket, six and milestone is a dot you can touch
              </p>
            </>
          )}
        </div>

        {chips.length > 0 ? (
          <div className="no-scrollbar mt-3 flex gap-2 overflow-x-auto px-1.5">
            {chips.map((c, k) => (
              <button
                key={`${c.label}-${c.idx}`}
                type="button"
                onClick={() => {
                  setSel(c.idx);
                  setActiveChip(k);
                }}
                className={cn(
                  "flex min-h-11 shrink-0 items-center rounded-full border px-3.5 text-[13px] font-semibold",
                  activeChip === k
                    ? "border-ink bg-ink text-bg"
                    : "border-line bg-surface text-ink active:bg-line/60",
                )}
              >
                {c.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}

function TurningPoint({ story }: { story: Story }) {
  const tp = story.turningPoint!;
  const at = story.timeline[tp.ballIndex]?.at;
  return (
    <section>
      <h2 className="mb-2.5 text-[11px] font-semibold uppercase tracking-wide text-faint">
        Turning point
      </h2>
      <div className="rounded-2xl bg-ink p-4 text-bg shadow-card">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-accent">
          {at ? `${clockTime(at)} · ` : ""}
          {tp.title}
        </p>
        <p className="mt-1.5 text-[14px] leading-relaxed">{tp.text}</p>
        <p className="mt-2 text-[11px] text-bg/70">{tp.meta}</p>
      </div>
    </section>
  );
}

function NumbersStrip({ story }: { story: Story }) {
  const n = story.numbers;
  const tiles = [
    {
      v: String(n.biggestOver),
      k: n.biggestOverCount > 1 ? `Biggest over ×${n.biggestOverCount}` : "Biggest over",
      gold: true,
    },
    { v: String(n.sixes), k: "Sixes", gold: false },
    { v: n.bestFigures, k: n.bestFiguresName ?? "Best figures", gold: false },
    { v: `${story.durationMin}m`, k: "Of cricket", gold: false },
  ];
  return (
    <section>
      <h2 className="mb-2.5 text-[11px] font-semibold uppercase tracking-wide text-faint">
        The numbers
      </h2>
      <div className="grid grid-cols-4 gap-2">
        {tiles.map((t) => (
          <div
            key={t.k}
            className="rounded-xl border border-line bg-surface px-1.5 py-2.5 text-center shadow-card"
          >
            <p
              className={cn(
                "tabular text-[17px] font-bold",
                t.gold && "text-accent-deep",
              )}
            >
              {t.v}
            </p>
            <p className="mt-0.5 text-[11px] font-semibold uppercase leading-snug tracking-wide text-faint">
              {t.k}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
