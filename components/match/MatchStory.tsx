"use client";

import { api } from "@/convex/_generated/api";
import { cn } from "@/lib/utils";
import { FunctionReturnType } from "convex/server";
import { ChevronDown } from "lucide-react";
import { useState } from "react";

/**
 * The Match Story — the "what happened today" page for a completed match.
 * Everything here is read-model only: badges, the turning point and the
 * headline numbers all come from one story.matchStory query.
 */

export type Story = NonNullable<FunctionReturnType<typeof api.story.matchStory>>;

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

export function MatchStory({ story }: { story: Story }) {
  return (
    <div className="space-y-5">
      <MetaLine story={story} />
      {story.badges.length > 0 ? <BadgeShelf badges={story.badges} /> : null}
      {story.turningPoint ? <TurningPoint story={story} /> : null}
      <NumbersStrip story={story} />
    </div>
  );
}

function MetaLine({ story }: { story: Story }) {
  const parts = [
    `${clockTime(story.startedAt)} – ${clockTime(story.endedAt)}`,
    `${story.durationMin} min of cricket`,
    `${story.totalBalls} ${story.totalBalls === 1 ? "ball" : "balls"}`,
    `${story.totalWickets} ${story.totalWickets === 1 ? "wicket" : "wickets"}`,
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
            aria-expanded={open === b.key}
            className="rounded-2xl border border-line bg-surface p-3.5 pb-3 text-left shadow-card transition-transform active:scale-[0.97]"
          >
            <span className="flex items-start justify-between">
              <span className="text-[22px] leading-none">
                {BADGE_EMOJI[b.key] ?? "🏅"}
              </span>
              <ChevronDown
                aria-hidden
                className={cn(
                  "h-4 w-4 shrink-0 text-faint transition-transform",
                  open === b.key && "rotate-180",
                )}
              />
            </span>
            <span className="mt-2 block text-[13px] font-semibold leading-snug">
              {b.name}
            </span>
            <span
              className={cn(
                "block text-[15px] font-semibold",
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
    </section>
  );
}

function TurningPoint({ story }: { story: Story }) {
  const tp = story.turningPoint!;
  return (
    <section>
      <h2 className="mb-2.5 text-[11px] font-semibold uppercase tracking-wide text-faint">
        Turning point
      </h2>
      <div className="rounded-2xl bg-ink p-4 text-bg shadow-card">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-accent">
          {clockTime(tp.at)} ·{" "}
          {tp.title}
        </p>
        <p className="mt-1.5 text-[13px] leading-relaxed">{tp.text}</p>
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
                "tabular text-[15px] font-semibold",
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
