import type { Trophy } from "@/lib/trophies";
import {
  Award,
  BarChart3,
  Crown,
  Flame,
  Lock,
  Shield,
  Target,
  Trophy as TrophyIconLucide,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { forwardRef, type ReactNode } from "react";

/** One headline figure on the card — 2 to 4 of these make the stat block. */
export type ShareStat = {
  label: string;
  value: string;
  /** The one number allowed to carry the gold accent — use on exactly one stat. */
  accent?: boolean;
};

/** Everything the card needs to render a player's flex — a deliberately small,
 * pre-shaped slice of `Profile` + `computeTrophies`, so the card never has to
 * know about the stats query shape. */
export type PlayerShareData = {
  kind: "player";
  displayName: string;
  initials: string;
  isGuest: boolean;
  role: string | null;
  matchesPlayed: number;
  stats: ShareStat[];
  trophy?: Trophy | null;
};

/** One team's line on the match result card. */
export type MatchShareTeam = {
  name: string;
  score: string;
};

export type MatchShareData = {
  kind: "match";
  teamA: MatchShareTeam;
  teamB: MatchShareTeam;
  winner: "A" | "B" | null;
  resultText: string | null;
  format: "limited" | "test";
  potm?: { name: string; line: string } | null;
};

export type LeaderboardShareRow = {
  rank: number;
  name: string;
  value: string;
};

export type LeaderboardShareData = {
  kind: "leaderboard";
  title: string;
  subtitle: string;
  rows: LeaderboardShareRow[];
};

/** One completed match's line on the Hero card's per-match strip. */
export type HeroMiniLine = {
  opponent: string;
  battingFigure: string | null;
  bowlingFigure: string | null;
  result: "won" | "lost" | "none";
};

/** One player's flex for one DAY (a day is often several matches) — the
 * "Hero" card. Pre-shaped by app/(app)/hero/page.tsx from `hero.heroDay`
 * so this file never has to know the query's exact return shape. */
export type HeroShareData = {
  kind: "hero";
  displayName: string;
  initials: string;
  dayLabel: string;
  headline: string;
  matchCount: number;
  /** 3-5 short, best-first commentary lines — the card's centerpiece. Numbers
   * are demoted to a compact footer strip; this is what makes someone want
   * to share it. Never a stat dump. */
  insights: string[];
  stats: ShareStat[];
  miniLines: HeroMiniLine[];
};

export type ShareData =
  | PlayerShareData
  | MatchShareData
  | LeaderboardShareData
  | HeroShareData;

// Hex values copied from tailwind.config.ts — html-to-image clones computed
// styles and chokes on oklch()/CSS custom properties, so every colour on this
// card is a literal hex, never a Tailwind colour class or `var(--token)`.
const INK = "#18181b";
const BG = "#faf8f4";
const ACCENT = "#f0b429";
const ACCENT_SOFT = "#fdf4de";
const ACCENT_DEEP = "#8a5a0b";
const LINE_ON_INK = "rgba(250, 248, 244, 0.12)";
const BG_60 = "rgba(250, 248, 244, 0.6)";
const BG_40 = "rgba(250, 248, 244, 0.4)";
const GOLD_WASH = "rgba(240, 180, 41, 0.14)";
const GOLD_RING = "rgba(240, 180, 41, 0.35)";

const TROPHY_ICON: Record<string, LucideIcon> = {
  Crown,
  Award,
  BarChart3,
  Zap,
  Flame,
  Target,
  Lock,
  Shield,
};

// Exported so a full-screen "poster" preview (the Hero screen) can scale the
// exact same card down to fit a phone viewport instead of guessing at its size.
export const CARD_WIDTH = 1080;
export const CARD_HEIGHT = 1350;

/**
 * The shareable card — fixed 1080×1350 (4:5) portrait, captured off-screen by
 * ShareButton via html-to-image. Every value here is an inline px/hex so the
 * rendered PNG is identical regardless of viewport or theme. One `Frame`
 * carries the brand shell (logo row, glow, footer) so all three card kinds
 * stay visually identical at the edges — only the middle changes.
 */
export const ShareCard = forwardRef<HTMLDivElement, { data: ShareData }>(
  function ShareCard({ data }, ref) {
    if (data.kind === "player") {
      return (
        <Frame ref={ref} footerLeft={<PlayerFooterLeft data={data} />}>
          <PlayerLayout data={data} />
        </Frame>
      );
    }
    if (data.kind === "match") {
      return (
        <Frame ref={ref}>
          <MatchLayout data={data} />
        </Frame>
      );
    }
    if (data.kind === "hero") {
      return (
        <Frame ref={ref} footerLeft={<HeroFooterLeft data={data} />}>
          <HeroLayout data={data} />
        </Frame>
      );
    }
    return (
      <Frame ref={ref}>
        <LeaderboardLayout data={data} />
      </Frame>
    );
  },
);

/** Shared brand shell: charcoal canvas, gold glow, logo row, footer. Every
 * layout renders its own content in the middle via `children`; `footerLeft`
 * is an optional extra fragment shown at the footer's left edge (only the
 * player card uses it, for the matches-played count). */
const Frame = forwardRef<
  HTMLDivElement,
  { children: ReactNode; footerLeft?: ReactNode }
>(function Frame({ children, footerLeft }, ref) {
  return (
      <div
        ref={ref}
        style={{
          width: CARD_WIDTH,
          height: CARD_HEIGHT,
          background: INK,
          color: BG,
          fontFamily: "var(--font-sans)",
          position: "relative",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          padding: 72,
          boxSizing: "border-box",
        }}
      >
        {/* Faint gold glow, top-right — the one bit of ornament, kept behind
            everything else so it never touches contrast. */}
        <div
          aria-hidden
          style={{
            position: "absolute",
            top: -180,
            right: -180,
            width: 520,
            height: 520,
            borderRadius: "50%",
            background:
              "radial-gradient(circle, rgba(240,180,41,0.16) 0%, rgba(240,180,41,0) 70%)",
          }}
        />

        {/* Brand row */}
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- html-to-image
              needs a real <img>; next/image renders lazily and can't be captured. */}
          <img
            src="/icons/icon-512.png"
            width={64}
            height={64}
            alt=""
            style={{ borderRadius: 14, display: "block" }}
          />
          <span
            style={{
              fontSize: 30,
              fontWeight: 700,
              letterSpacing: 3,
              color: BG,
            }}
          >
            BOUNDARY
          </span>
        </div>

        {children}

        {/* Footer */}
        <div
          style={{
            marginTop: 48,
            display: "flex",
            alignItems: "center",
            justifyContent: footerLeft ? "space-between" : "flex-end",
          }}
        >
          {footerLeft}
          <span style={{ fontSize: 24, fontWeight: 500, color: BG_40 }}>
            gullycricket.space
          </span>
        </div>
      </div>
  );
});

function PlayerLayout({ data }: { data: PlayerShareData }) {
  const { displayName, initials, isGuest, role, stats, trophy } = data;
  const TrophyIcon = trophy ? TROPHY_ICON[trophy.icon] ?? Award : null;
  const roleLine = [role ? capitalize(role) : null, isGuest ? "Guest" : null]
    .filter(Boolean)
    .join(" · ");

  return (
    <>
      {/* Identity block */}
      <div style={{ marginTop: 88, position: "relative", zIndex: 1 }}>
        <div
          style={{
            width: 152,
            height: 152,
            borderRadius: 40,
            background: GOLD_WASH,
            border: `2px solid ${GOLD_RING}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 60,
            fontWeight: 700,
            color: ACCENT,
          }}
        >
          {initials}
        </div>

        <p
          style={{
            marginTop: 36,
            fontSize: 76,
            lineHeight: 1.05,
            fontWeight: 700,
            color: BG,
            wordBreak: "break-word",
          }}
        >
          {displayName}
        </p>

        {roleLine ? (
          <p
            style={{
              marginTop: 14,
              fontSize: 28,
              fontWeight: 500,
              color: BG_60,
              textTransform: "capitalize",
            }}
          >
            {roleLine}
          </p>
        ) : null}

        {trophy && TrophyIcon ? (
          <div
            style={{
              marginTop: 28,
              display: "inline-flex",
              alignItems: "center",
              gap: 10,
              borderRadius: 999,
              padding: "12px 22px",
              background: ACCENT_SOFT,
            }}
          >
            <TrophyIcon size={26} color={ACCENT_DEEP} strokeWidth={2.4} />
            <span style={{ fontSize: 26, fontWeight: 700, color: ACCENT_DEEP }}>
              {trophy.label}
              {trophy.value ? ` · ${trophy.value}` : ""}
            </span>
          </div>
        ) : null}
      </div>

      {/* Stat block */}
      <div
        style={{
          marginTop: "auto",
          paddingTop: 56,
          borderTop: `1px solid ${LINE_ON_INK}`,
          display: "grid",
          gridTemplateColumns: `repeat(${stats.length > 2 ? 2 : stats.length}, 1fr)`,
          rowGap: 44,
          columnGap: 24,
        }}
      >
        {stats.map((s) => (
          <div key={s.label} style={{ minWidth: 0 }}>
            <p
              style={{
                fontSize: 22,
                fontWeight: 600,
                letterSpacing: 2,
                textTransform: "uppercase",
                color: BG_40,
              }}
            >
              {s.label}
            </p>
            <p
              style={{
                marginTop: 8,
                fontSize: 68,
                lineHeight: 1,
                fontWeight: 700,
                color: s.accent ? ACCENT : BG,
              }}
            >
              {s.value}
            </p>
          </div>
        ))}
      </div>

    </>
  );
}

/** The player card's one addition to the shared footer row: matches played. */
function PlayerFooterLeft({ data }: { data: PlayerShareData }) {
  return (
    <span style={{ fontSize: 24, color: BG_40 }}>
      {data.matchesPlayed} match{data.matchesPlayed === 1 ? "" : "es"} played
    </span>
  );
}

function MatchLayout({ data }: { data: MatchShareData }) {
  const { teamA, teamB, winner, resultText, format, potm } = data;
  const rows: Array<{ side: "A" | "B"; team: MatchShareTeam }> = [
    { side: "A", team: teamA },
    { side: "B", team: teamB },
  ];

  return (
    <>
      {/* Format tag */}
      <div style={{ marginTop: 72 }}>
        <span
          style={{
            display: "inline-block",
            borderRadius: 999,
            padding: "10px 20px",
            fontSize: 22,
            fontWeight: 700,
            letterSpacing: 2,
            textTransform: "uppercase",
            color: BG_60,
            background: LINE_ON_INK,
          }}
        >
          {format === "test" ? "Test" : "Limited overs"}
        </span>
      </div>

      {/* Team rows */}
      <div style={{ marginTop: 56, display: "flex", flexDirection: "column", gap: 28 }}>
        {rows.map(({ side, team }) => {
          const won = winner === side;
          const lost = winner !== null && winner !== side;
          return (
            <div
              key={side}
              style={{
                borderRadius: 32,
                padding: "40px 44px",
                background: won ? GOLD_WASH : "rgba(250,248,244,0.04)",
                border: won ? `2px solid ${GOLD_RING}` : `1px solid ${LINE_ON_INK}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 24,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 16, minWidth: 0 }}>
                {won ? (
                  <TrophyIconLucide
                    size={40}
                    color={ACCENT}
                    strokeWidth={2.2}
                    style={{ flexShrink: 0 }}
                  />
                ) : null}
                <p
                  style={{
                    fontSize: 44,
                    fontWeight: 700,
                    lineHeight: 1.15,
                    color: lost ? BG_60 : BG,
                    wordBreak: "break-word",
                  }}
                >
                  {team.name}
                </p>
              </div>
              <p
                style={{
                  fontSize: 52,
                  fontWeight: 700,
                  color: won ? ACCENT : lost ? BG_60 : BG,
                  flexShrink: 0,
                }}
              >
                {team.score}
              </p>
            </div>
          );
        })}
      </div>

      {/* Result line */}
      {resultText ? (
        <p
          style={{
            marginTop: 48,
            fontSize: 34,
            fontWeight: 600,
            lineHeight: 1.3,
            color: winner ? ACCENT : BG_60,
          }}
        >
          {resultText}
        </p>
      ) : null}

      {/* POTM, pinned above the footer */}
      {potm ? (
        <div
          style={{
            marginTop: "auto",
            paddingTop: 40,
            borderTop: `1px solid ${LINE_ON_INK}`,
          }}
        >
          <p style={{ fontSize: 26, fontWeight: 500, color: BG_60 }}>
            Player of the match —{" "}
            <span style={{ fontWeight: 700, color: BG }}>{potm.name}</span>
            {" · "}
            {potm.line}
          </p>
        </div>
      ) : (
        <div style={{ marginTop: "auto" }} />
      )}
    </>
  );
}

const RESULT_LABEL: Record<HeroMiniLine["result"], string | null> = {
  won: "WON",
  lost: "LOST",
  none: null,
};

function HeroLayout({ data }: { data: HeroShareData }) {
  const { displayName, dayLabel, headline, stats, miniLines, insights } = data;
  // A poster, not a scrollable feed — cap both strips so the card never
  // overflows its fixed 1080×1350 canvas. The insight stack is the reason
  // someone shares this, so the per-match strip gives way to it, not the
  // other way round.
  const shownLines = miniLines.slice(0, 3);
  const extraLines = miniLines.length - shownLines.length;
  const shownStats = stats.slice(0, 4);

  return (
    <>
      {/* Day tag */}
      <div style={{ marginTop: 52 }}>
        <span
          style={{
            display: "inline-block",
            fontSize: 24,
            fontWeight: 600,
            letterSpacing: 2,
            textTransform: "uppercase",
            color: BG_40,
          }}
        >
          {dayLabel}
        </span>
      </div>

      {/* Identity + headline */}
      <div style={{ marginTop: 10 }}>
        <p
          style={{
            fontSize: 64,
            lineHeight: 1.05,
            fontWeight: 700,
            color: BG,
            wordBreak: "break-word",
          }}
        >
          {displayName}
        </p>
        <p
          style={{
            marginTop: 10,
            fontSize: 30,
            fontWeight: 700,
            lineHeight: 1.25,
            color: ACCENT,
          }}
        >
          {headline}
        </p>
      </div>

      {/* Insight stack — the card's centerpiece. Reads like commentary, not
          a scoreboard: the strongest line leads, gold and larger; the rest
          are warm white with a small gold tick, all roomy. */}
      <div
        style={{
          marginTop: 44,
          display: "flex",
          flexDirection: "column",
          gap: 26,
        }}
      >
        {insights.map((line, i) => {
          const lead = i === 0;
          return (
            <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 18 }}>
              <span
                aria-hidden
                style={{
                  flexShrink: 0,
                  marginTop: lead ? 16 : 13,
                  width: lead ? 14 : 10,
                  height: 3,
                  borderRadius: 2,
                  background: ACCENT,
                }}
              />
              <p
                style={{
                  fontSize: lead ? 44 : 32,
                  fontWeight: lead ? 700 : 600,
                  lineHeight: 1.28,
                  color: lead ? ACCENT : BG,
                  wordBreak: "break-word",
                }}
              >
                {line}
              </p>
            </div>
          );
        })}
      </div>

      {/* Compact stat strip — numbers demoted to a footer-style row, one
          line, small. The insights above are the flex; this is the receipt. */}
      <div
        style={{
          marginTop: "auto",
          paddingTop: 32,
          borderTop: `1px solid ${LINE_ON_INK}`,
          display: "flex",
          justifyContent: "space-between",
          gap: 16,
        }}
      >
        {shownStats.map((s) => (
          <div key={s.label} style={{ minWidth: 0 }}>
            <p
              style={{
                fontSize: 17,
                fontWeight: 600,
                letterSpacing: 1.2,
                textTransform: "uppercase",
                color: BG_40,
              }}
            >
              {s.label}
            </p>
            <p
              style={{
                marginTop: 4,
                fontSize: 30,
                lineHeight: 1,
                fontWeight: 700,
                color: s.accent ? ACCENT : BG,
              }}
            >
              {s.value}
            </p>
          </div>
        ))}
      </div>

      {/* Per-match strip */}
      <div
        style={{
          marginTop: 32,
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        {shownLines.map((line, i) => {
          const label = RESULT_LABEL[line.result];
          return (
            <div
              key={i}
              style={{
                borderRadius: 22,
                padding: "18px 24px",
                background: "rgba(250,248,244,0.04)",
                border: `1px solid ${LINE_ON_INK}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 16,
              }}
            >
              <div style={{ minWidth: 0, flex: 1 }}>
                <p
                  style={{
                    fontSize: 20,
                    fontWeight: 600,
                    color: BG_60,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  v {line.opponent}
                </p>
                <p style={{ marginTop: 3, fontSize: 24, fontWeight: 700, color: BG }}>
                  {[line.battingFigure, line.bowlingFigure].filter(Boolean).join("  ·  ") ||
                    "Fielded"}
                </p>
              </div>
              {label ? (
                <span
                  style={{
                    flexShrink: 0,
                    borderRadius: 999,
                    padding: "7px 14px",
                    fontSize: 18,
                    fontWeight: 700,
                    letterSpacing: 1,
                    color: line.result === "won" ? ACCENT_DEEP : BG_60,
                    background: line.result === "won" ? ACCENT_SOFT : LINE_ON_INK,
                  }}
                >
                  {label}
                </span>
              ) : null}
            </div>
          );
        })}
        {extraLines > 0 ? (
          <p style={{ textAlign: "center", fontSize: 20, fontWeight: 600, color: BG_40 }}>
            +{extraLines} more that day
          </p>
        ) : null}
      </div>
    </>
  );
}

/** The Hero card's own footer-left fragment: how many matches that day. */
function HeroFooterLeft({ data }: { data: HeroShareData }) {
  return (
    <span style={{ fontSize: 24, color: BG_40 }}>
      {data.matchCount} match{data.matchCount === 1 ? "" : "es"} that day
    </span>
  );
}

function LeaderboardLayout({ data }: { data: LeaderboardShareData }) {
  const { title, subtitle, rows } = data;

  return (
    <>
      {/* Title block */}
      <div style={{ marginTop: 88 }}>
        <p
          style={{
            fontSize: 72,
            lineHeight: 1.08,
            fontWeight: 700,
            color: BG,
            wordBreak: "break-word",
          }}
        >
          {title}
        </p>
        <p style={{ marginTop: 16, fontSize: 28, fontWeight: 500, color: BG_60 }}>
          {subtitle}
        </p>
      </div>

      {/* Ranked rows */}
      <div
        style={{
          marginTop: 64,
          display: "flex",
          flexDirection: "column",
          gap: 20,
        }}
      >
        {rows.map((r) => {
          const lead = r.rank === 1;
          return (
            <div
              key={r.rank}
              style={{
                borderRadius: 28,
                padding: "30px 36px",
                background: lead ? GOLD_WASH : "rgba(250,248,244,0.04)",
                border: lead ? `2px solid ${GOLD_RING}` : `1px solid ${LINE_ON_INK}`,
                display: "flex",
                alignItems: "center",
                gap: 28,
              }}
            >
              <span
                style={{
                  fontSize: 36,
                  fontWeight: 700,
                  color: lead ? ACCENT : BG_40,
                  width: 56,
                  flexShrink: 0,
                }}
              >
                {r.rank}
              </span>
              <span
                style={{
                  fontSize: 38,
                  fontWeight: 700,
                  color: BG,
                  flex: 1,
                  minWidth: 0,
                  wordBreak: "break-word",
                }}
              >
                {r.name}
              </span>
              <span
                style={{
                  fontSize: 38,
                  fontWeight: 700,
                  color: lead ? ACCENT : BG_60,
                  flexShrink: 0,
                  textAlign: "right",
                }}
              >
                {r.value}
              </span>
            </div>
          );
        })}
      </div>

      <div style={{ marginTop: "auto" }} />
    </>
  );
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
