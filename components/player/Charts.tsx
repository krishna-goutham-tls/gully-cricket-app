"use client";

import { cn } from "@/lib/utils";
import { useEffect, useRef, useState } from "react";

/**
 * Two small charts for the profile, plain SVG. Colours are tokens: ink for
 * data, accent-deep for the bars and marks that matter (gold `accent` is too
 * pale to read on white), and `line` for the hairlines. Tap, not hover:
 * this is a phone app.
 */
const INK = "#18181b";
const GOLD = "#8a5a0b";
const LINE = "#eae4d9";
const SURFACE = "#ffffff";

function useWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return { ref, width };
}

/** A bar with a rounded data end and a square foot on the baseline. */
function barPath(x: number, y: number, w: number, h: number) {
  const r = Math.min(4, w / 2, h);
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}

const BAR_HEIGHT = 96;

/**
 * One bar per innings, oldest on the left. `highlight` bars are gold; the
 * reference line is the career figure the bars are read against.
 */
export function InningsBars({
  bars,
  reference,
  hint,
}: {
  bars: Array<{ value: number; highlight: boolean; label: string }>;
  reference?: { value: number; label: string };
  /** What the caption says before anything is tapped. */
  hint: string;
}) {
  const { ref, width } = useWidth();
  const [picked, setPicked] = useState<number | null>(null);
  const max = Math.max(1, reference?.value ?? 0, ...bars.map((b) => b.value));
  const slot = bars.length > 0 ? width / bars.length : 0;
  const barW = Math.max(1, Math.min(24, slot - 2));
  const y = (v: number) => BAR_HEIGHT - (v / max) * (BAR_HEIGHT - 4);

  return (
    <div>
      <div className="flex min-h-5 items-baseline justify-between gap-3">
        <p className="tabular min-w-0 truncate text-[13px] text-muted">
          {picked !== null ? (
            <span className="font-semibold text-ink">{bars[picked]?.label}</span>
          ) : (
            hint
          )}
        </p>
        {/* The line's key sits outside the plot, where no bar can cover it. */}
        {reference && reference.value > 0 ? (
          <span className="flex shrink-0 items-center gap-1.5 text-[11px] font-semibold text-muted">
            <span className="h-px w-3 bg-ink/50" />
            {reference.label}
          </span>
        ) : null}
      </div>
      <div ref={ref} className="mt-1.5">
        {width > 0 ? (
          <svg
            width={width}
            height={BAR_HEIGHT + 1}
            role="img"
            aria-label={hint}
            className="block"
          >
            {bars.map((b, i) => {
              const x = i * slot + (slot - barW) / 2;
              const top = y(b.value);
              const fill =
                picked === i ? INK : b.highlight ? GOLD : "rgba(24,24,27,0.18)";
              return (
                <g key={i} onClick={() => setPicked(picked === i ? null : i)}>
                  {b.value > 0 ? (
                    <path d={barPath(x, top, barW, BAR_HEIGHT - top)} fill={fill} />
                  ) : (
                    <rect x={x} y={BAR_HEIGHT - 2} width={barW} height={2} fill={fill} />
                  )}
                  {/* The tap target is the whole column, not the thin bar. */}
                  <rect
                    x={i * slot}
                    y={0}
                    width={slot}
                    height={BAR_HEIGHT}
                    fill="transparent"
                  />
                </g>
              );
            })}
            {reference && reference.value > 0 ? (
              <>
                <line
                  x1={0}
                  x2={width}
                  y1={y(reference.value)}
                  y2={y(reference.value)}
                  stroke={INK}
                  strokeOpacity={0.5}
                  strokeWidth={1}
                />
              </>
            ) : null}
            <line x1={0} x2={width} y1={BAR_HEIGHT + 0.5} y2={BAR_HEIGHT + 0.5} stroke={LINE} />
          </svg>
        ) : (
          <div style={{ height: BAR_HEIGHT + 1 }} />
        )}
      </div>
    </div>
  );
}

const CLIMB_HEIGHT = 120;
const PAD_TOP = 18;

/**
 * The running total, innings by innings, with a gold mark where each rung
 * fell and a hairline at the next one. The shape is the story: a steep
 * stretch is a purple patch, a flat one is a drought.
 */
export function ClimbChart({
  series,
  marks,
  next,
  unit,
}: {
  series: number[];
  marks: Array<{ target: number; innings: number }>;
  next: number;
  unit: string;
}) {
  const { ref, width } = useWidth();
  const [picked, setPicked] = useState<number | null>(null);
  const n = series.length;
  const max = Math.max(next, series[n - 1] ?? 0, 1);
  const x = (i: number) => (n <= 1 ? 0 : (i / (n - 1)) * (width - 8) + 4);
  const y = (v: number) =>
    CLIMB_HEIGHT - (v / max) * (CLIMB_HEIGHT - PAD_TOP);
  const line = series.map((v, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(v)}`).join("");
  const area = `${line}L${x(n - 1)},${CLIMB_HEIGHT}L${x(0)},${CLIMB_HEIGHT}Z`;
  // Labels only on the two highest rungs: the early ones crowd the corner.
  const labelled = new Set(marks.slice(-2).map((m) => m.target));

  const pick = (clientX: number, el: SVGSVGElement) => {
    const left = el.getBoundingClientRect().left;
    const i = Math.round(((clientX - left - 4) / Math.max(1, width - 8)) * (n - 1));
    setPicked(Math.min(n - 1, Math.max(0, i)));
  };

  return (
    <div>
      <p className="tabular min-h-5 truncate text-[13px] text-muted">
        {picked !== null ? (
          <span className="font-semibold text-ink">
            Innings {picked + 1} · {series[picked].toLocaleString("en-IN")} {unit}
          </span>
        ) : (
          `${n} innings. Tap the line to read it.`
        )}
      </p>
      <div ref={ref} className="mt-1.5">
        {width > 0 && n > 0 ? (
          <svg
            width={width}
            height={CLIMB_HEIGHT + 1}
            role="img"
            aria-label={`Career ${unit}, innings by innings`}
            className="block touch-pan-y"
            onClick={(e) => pick(e.clientX, e.currentTarget)}
          >
            <line x1={0} x2={width} y1={y(next)} y2={y(next)} stroke={LINE} strokeWidth={1} />
            <text x={4} y={y(next) - 5} stroke={SURFACE} strokeWidth={3} paintOrder="stroke" className="fill-muted text-[11px] font-semibold">
              Next: {next.toLocaleString("en-IN")}
            </text>
            <path d={area} fill={INK} fillOpacity={0.06} />
            <path d={line} fill="none" stroke={INK} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
            {marks.map((m) => {
              const i = m.innings - 1;
              if (i < 0 || i >= n) return null;
              return (
                <g key={m.target}>
                  <circle cx={x(i)} cy={y(series[i])} r={6} fill={SURFACE} />
                  <circle cx={x(i)} cy={y(series[i])} r={4} fill={GOLD} />
                  {labelled.has(m.target) ? (
                    <text
                      x={x(i) - 6}
                      y={y(series[i]) - 8}
                      textAnchor="end"
                      stroke={SURFACE}
                      strokeWidth={3}
                      paintOrder="stroke"
                      className="fill-ink text-[11px] font-semibold"
                    >
                      {m.target.toLocaleString("en-IN")}
                    </text>
                  ) : null}
                </g>
              );
            })}
            {picked !== null ? (
              <>
                <line x1={x(picked)} x2={x(picked)} y1={PAD_TOP} y2={CLIMB_HEIGHT} stroke={INK} strokeOpacity={0.3} />
                <circle cx={x(picked)} cy={y(series[picked])} r={6} fill={SURFACE} />
                <circle cx={x(picked)} cy={y(series[picked])} r={4} fill={INK} />
              </>
            ) : null}
            <line x1={0} x2={width} y1={CLIMB_HEIGHT + 0.5} y2={CLIMB_HEIGHT + 0.5} stroke={LINE} />
          </svg>
        ) : (
          <div style={{ height: CLIMB_HEIGHT + 1 }} />
        )}
      </div>
    </div>
  );
}

/** A row of big counts: 30s, 50s, 70s, 100s, or 3-fors, 5-fors. */
export function CountStrip({
  items,
}: {
  items: Array<{ label: string; value: number; hint: string }>;
}) {
  return (
    <div
      className={cn(
        "grid gap-2",
        items.length === 4 ? "grid-cols-4" : "grid-cols-2",
      )}
    >
      {items.map((it) => (
        <div
          key={it.label}
          className={cn(
            "rounded-xl px-2 py-2.5 text-center",
            it.value > 0 ? "bg-accent-soft" : "bg-ink/[0.04]",
          )}
        >
          <p
            className={cn(
              "tabular text-2xl font-semibold leading-none",
              it.value > 0 ? "text-accent-deep" : "text-faint",
            )}
          >
            {it.value}
          </p>
          <p className="mt-1 text-[13px] font-semibold text-ink">
            {it.label}
          </p>
          <p className="text-[11px] leading-tight text-faint">{it.hint}</p>
        </div>
      ))}
    </div>
  );
}
