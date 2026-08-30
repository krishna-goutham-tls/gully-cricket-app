import { trophyImage } from "@/lib/awardCopy";
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

export type SeasonShareRow = { name: string; value: string };
export type SeasonShareBoardRow = {
  rank: number;
  name: string;
  value: string;
  pct: number;
};
export type SeasonShareRoast = {
  name: string;
  label: string;
  value: string;
};

/** One slide of a season. Variant owns the layout — do not reuse one template. */
export type SeasonShareData = {
  kind: "season";
  seasonName: string;
  variant: "title" | "pots" | "caps" | "board" | "roast" | "book";
  kicker: string;
  headline?: string;
  stat?: { value: string; label: string };
  line?: string;
  caps?: { orange: SeasonShareRow; purple: SeasonShareRow };
  board?: SeasonShareBoardRow[];
  roasts?: SeasonShareRoast[];
  book?: Array<{ value: string; label: string }>;
};

/**
 * One trophy off the shelf, the way it lands in a WhatsApp group. Deliberately
 * flat strings: the shelf and this card both read the same words
 * out of `lib/awardCopy`, so the card never has to know an award's shape.
 *
 * `name` is the winner's FIRST name — the group knows who Naman is, and one
 * word is the only thing that survives a thumbnail. `scope` is the season
 * label, or "All time".
 */
export type TrophyShareData = {
  kind: "trophy";
  /** The award id, e.g. `run_machine` — this picks the photograph. */
  awardKind: string;
  /** "Run Machine" */
  award: string;
  /** "Most runs" — how it was earned. */
  earn: string;
  name: string;
  value: string;
  /** "runs", "dots faced" — what the number counts. */
  unit: string;
  scope: string;
  tone: "honor" | "roast";
};

export type ShareData =
  | PlayerShareData
  | MatchShareData
  | LeaderboardShareData
  | HeroShareData
  | SeasonShareData
  | TrophyShareData;

// Hex values copied from tailwind.config.ts — html-to-image clones computed
// styles and chokes on oklch()/CSS custom properties, so every colour on this
// card is a literal hex, never a Tailwind colour class or `var(--token)`.
const INK = "#18181b";
const BG = "#faf8f4";
const ACCENT = "#f0b429";
const ACCENT_SOFT = "#fdf4de";
const ACCENT_DEEP = "#8a5a0b";
const LINE_ON_INK = "rgba(250, 248, 244, 0.12)";
const BG_70 = "rgba(250, 248, 244, 0.7)";
const BG_60 = "rgba(250, 248, 244, 0.6)";
const BG_40 = "rgba(250, 248, 244, 0.4)";
const GOLD_WASH = "rgba(240, 180, 41, 0.14)";
const GOLD_RING = "rgba(240, 180, 41, 0.35)";
// The roast ring — same danger edge the season roast slide already uses.
const DANGER_RING = "rgba(192, 57, 43, 0.55)";

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
    if (data.kind === "season") {
      return (
        <Frame
          ref={ref}
          art={SEASON_ART[data.variant]}
          footerLeft={
            <span style={{ fontSize: 24, fontWeight: 500, color: BG_70 }}>
              {data.seasonName}
            </span>
          }
        >
          <SeasonLayout data={data} />
        </Frame>
      );
    }
    if (data.kind === "trophy") {
      return (
        <Frame
          ref={ref}
          footerLeft={
            <span style={{ fontSize: 24, fontWeight: 500, color: BG_70 }}>
              {data.scope}
            </span>
          }
        >
          <TrophyLayout data={data} />
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
const SEASON_ART: Record<SeasonShareData["variant"], string> = {
  title: "/share/season-title.jpg",
  pots: "/share/season-pots.jpg",
  caps: "/share/season-caps.jpg",
  board: "/share/season-board.jpg",
  roast: "/share/season-roast.jpg",
  book: "/share/season-book.jpg",
};

const Frame = forwardRef<
  HTMLDivElement,
  { children: ReactNode; footerLeft?: ReactNode; art?: string }
>(function Frame({ children, footerLeft, art }, ref) {
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
        {art ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={art}
              alt=""
              style={{
                position: "absolute",
                inset: 0,
                width: "100%",
                height: "100%",
                objectFit: "cover",
                zIndex: 0,
                filter: "brightness(0.55)",
              }}
            />
            <div
              aria-hidden
              style={{
                position: "absolute",
                inset: 0,
                zIndex: 0,
                background:
                  "linear-gradient(180deg, rgba(24,24,27,0.82) 0%, rgba(24,24,27,0.70) 38%, rgba(24,24,27,0.88) 72%, rgba(24,24,27,0.96) 100%)",
              }}
            />
          </>
        ) : (
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
        )}

        {/* Brand row — same lockup as the landing header. */}
        <div style={{ display: "flex", alignItems: "center", gap: 16, position: "relative", zIndex: 1 }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- html-to-image
              needs a real <img>; next/image renders lazily and can't be captured. */}
          <img
            src="/icons/icon-512.png"
            width={72}
            height={72}
            alt=""
            style={{ borderRadius: "22%", display: "block" }}
          />
          <span
            style={{
              fontSize: 36,
              fontWeight: 700,
              letterSpacing: -0.8,
              color: BG,
            }}
          >
            Gully Cricket
          </span>
        </div>

        <div style={{ position: "relative", zIndex: 1, flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
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
          <span style={{ fontSize: 24, fontWeight: 500, color: BG_70 }}>
            gullycricket.space
          </span>
        </div>
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
  const shownLines = miniLines.slice(0, 3);
  const extraLines = miniLines.length - shownLines.length;
  const shownStats = stats.slice(0, 4);
  const signature = stats.find((s) => s.accent) ?? stats[0];
  const restInsights = insights.slice(0, 4);

  return (
    <>
      <div
        style={{
          marginTop: 36,
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 24,
        }}
      >
        <div style={{ minWidth: 0, flex: 1 }}>
          <span
            style={{
              display: "inline-block",
              fontSize: 22,
              fontWeight: 600,
              letterSpacing: 2,
              textTransform: "uppercase",
              color: BG_70,
            }}
          >
            {dayLabel}
          </span>
          <p
            style={{
              marginTop: 8,
              fontSize: 56,
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
              fontSize: 28,
              fontWeight: 600,
              lineHeight: 1.25,
              color: ACCENT,
            }}
          >
            {headline}
          </p>
        </div>
        {signature ? (
          <div
            style={{
              flexShrink: 0,
              minWidth: 220,
              padding: "28px 32px",
              borderRadius: 28,
              background: GOLD_WASH,
              border: `2px solid ${GOLD_RING}`,
              textAlign: "center",
            }}
          >
            <p
              style={{
                fontSize: signature.value.length > 4 ? 64 : 96,
                lineHeight: 0.9,
                fontWeight: 700,
                color: ACCENT,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {signature.value}
            </p>
            <p
              style={{
                marginTop: 10,
                fontSize: 20,
                fontWeight: 600,
                letterSpacing: 2,
                textTransform: "uppercase",
                color: BG_70,
              }}
            >
              {signature.label}
            </p>
          </div>
        ) : null}
      </div>

      <div
        style={{
          marginTop: 36,
          display: "flex",
          flexDirection: "column",
          gap: 18,
        }}
      >
        {restInsights.map((line, i) => (
          <div
            key={i}
            style={{ display: "flex", alignItems: "flex-start", gap: 16 }}
          >
            <span
              aria-hidden
              style={{
                flexShrink: 0,
                marginTop: 14,
                width: 12,
                height: 3,
                borderRadius: 2,
                background: ACCENT,
              }}
            />
            <p
              style={{
                fontSize: 30,
                fontWeight: 600,
                lineHeight: 1.3,
                color: BG,
                wordBreak: "break-word",
              }}
            >
              {line}
            </p>
          </div>
        ))}
      </div>

      <div
        style={{
          marginTop: 40,
          display: "grid",
          gridTemplateColumns: `repeat(${Math.min(shownStats.length, 4)}, 1fr)`,
          gap: 16,
        }}
      >
        {shownStats.map((s) => (
          <div
            key={s.label}
            style={{
              padding: "20px 18px",
              borderRadius: 20,
              background: s.accent ? GOLD_WASH : "rgba(250,248,244,0.05)",
              border: s.accent ? `1px solid ${GOLD_RING}` : `1px solid ${LINE_ON_INK}`,
            }}
          >
            <p
              style={{
                fontSize: 16,
                fontWeight: 600,
                letterSpacing: 1.2,
                textTransform: "uppercase",
                color: BG_70,
              }}
            >
              {s.label}
            </p>
            <p
              style={{
                marginTop: 6,
                fontSize: 40,
                lineHeight: 1,
                fontWeight: 700,
                color: s.accent ? ACCENT : BG,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {s.value}
            </p>
          </div>
        ))}
      </div>

      <div
        style={{
          marginTop: 28,
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
                padding: "20px 26px",
                background: "rgba(250,248,244,0.05)",
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
                    color: BG_70,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  v {line.opponent}
                </p>
                <p
                  style={{
                    marginTop: 4,
                    fontSize: 28,
                    fontWeight: 700,
                    color: BG,
                  }}
                >
                  {[line.battingFigure, line.bowlingFigure]
                    .filter(Boolean)
                    .join("  ·  ") || "Fielded"}
                </p>
              </div>
              {label ? (
                <span
                  style={{
                    flexShrink: 0,
                    borderRadius: 999,
                    padding: "8px 16px",
                    fontSize: 18,
                    fontWeight: 700,
                    letterSpacing: 1,
                    color: line.result === "won" ? ACCENT_DEEP : BG_70,
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
          <p
            style={{
              textAlign: "center",
              fontSize: 20,
              fontWeight: 600,
              color: BG_70,
            }}
          >
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
    <span style={{ fontSize: 24, color: BG_70 }}>
      {data.matchCount} match{data.matchCount === 1 ? "" : "es"} that day
    </span>
  );
}

function SeasonKicker({
  children,
  roast,
}: {
  children: ReactNode;
  roast?: boolean;
}) {
  return (
    <span
      style={{
        display: "inline-block",
        fontSize: 22,
        fontWeight: 600,
        letterSpacing: 3,
        textTransform: "uppercase",
        color: roast ? BG_70 : ACCENT,
      }}
    >
      {children}
    </span>
  );
}

function SeasonLayout({ data }: { data: SeasonShareData }) {
  if (data.variant === "title") {
    return (
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          marginTop: 40,
        }}
      >
        <SeasonKicker>{data.kicker}</SeasonKicker>
        <p
          style={{
            marginTop: 16,
            fontSize: 48,
            fontWeight: 700,
            lineHeight: 1.1,
            color: BG,
          }}
        >
          {data.headline}
        </p>
        <div style={{ flex: 1, display: "flex", alignItems: "center" }}>
          <div>
            <p
              style={{
                fontSize: 200,
                lineHeight: 0.85,
                fontWeight: 700,
                color: ACCENT,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {data.stat?.value}
            </p>
            <p
              style={{
                marginTop: 8,
                fontSize: 36,
                fontWeight: 600,
                letterSpacing: 4,
                textTransform: "uppercase",
                color: BG,
              }}
            >
              {data.stat?.label}
            </p>
          </div>
        </div>
        {data.line ? (
          <p style={{ fontSize: 28, fontWeight: 500, color: BG_70 }}>
            {data.line}
          </p>
        ) : null}
      </div>
    );
  }

  if (data.variant === "pots" && data.headline && data.stat) {
    return (
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          marginTop: 40,
        }}
      >
        <SeasonKicker>{data.kicker}</SeasonKicker>
        <p
          style={{
            marginTop: 20,
            fontSize: data.headline.length > 12 ? 64 : 88,
            fontWeight: 700,
            lineHeight: 1.05,
            color: BG,
            wordBreak: "break-word",
          }}
        >
          {data.headline}
        </p>
        <div
          style={{
            flex: 1,
            marginTop: 32,
            borderRadius: 32,
            background: GOLD_WASH,
            border: `2px solid ${GOLD_RING}`,
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            padding: 48,
          }}
        >
          <p
            style={{
              fontSize: 160,
              lineHeight: 0.9,
              fontWeight: 700,
              color: ACCENT,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {data.stat.value}
          </p>
          <p
            style={{
              marginTop: 12,
              fontSize: 28,
              fontWeight: 600,
              letterSpacing: 2,
              textTransform: "uppercase",
              color: BG_70,
            }}
          >
            {data.stat.label}
          </p>
        </div>
      </div>
    );
  }

  if (data.variant === "caps" && data.caps) {
    const col = (title: string, row: { name: string; value: string }) => (
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: 36,
          minWidth: 0,
        }}
      >
        <p
          style={{
            fontSize: 20,
            fontWeight: 600,
            letterSpacing: 2,
            textTransform: "uppercase",
            color: ACCENT,
          }}
        >
          {title}
        </p>
        <p
          style={{
            marginTop: 16,
            fontSize: row.name.length > 10 ? 40 : 52,
            fontWeight: 700,
            lineHeight: 1.1,
            color: BG,
            wordBreak: "break-word",
          }}
        >
          {row.name}
        </p>
        <p
          style={{
            marginTop: 20,
            fontSize: 72,
            fontWeight: 700,
            color: ACCENT,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {row.value}
        </p>
      </div>
    );
    return (
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          marginTop: 40,
        }}
      >
        <SeasonKicker>{data.kicker}</SeasonKicker>
        <div
          style={{
            flex: 1,
            marginTop: 28,
            display: "flex",
            borderRadius: 32,
            overflow: "hidden",
            border: `1px solid ${LINE_ON_INK}`,
          }}
        >
          <div style={{ flex: 1, background: GOLD_WASH }}>
            {col("Orange Cap", data.caps.orange)}
          </div>
          <div style={{ width: 1, background: LINE_ON_INK }} />
          <div style={{ flex: 1, background: "rgba(250,248,244,0.04)" }}>
            {col("Purple Cap", data.caps.purple)}
          </div>
        </div>
      </div>
    );
  }

  if (data.variant === "board" && data.board) {
    return (
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          marginTop: 40,
        }}
      >
        <SeasonKicker>{data.kicker}</SeasonKicker>
        <div
          style={{
            flex: 1,
            marginTop: 28,
            display: "flex",
            flexDirection: "column",
            gap: 18,
          }}
        >
          {data.board.map((row) => {
            const lead = row.rank === 1;
            return (
              <div
                key={row.rank}
                style={{
                  flex: lead ? 1.4 : 1,
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "center",
                  padding: lead ? "28px 32px" : "20px 28px",
                  borderRadius: 24,
                  background: lead ? GOLD_WASH : "rgba(250,248,244,0.05)",
                  border: lead
                    ? `2px solid ${GOLD_RING}`
                    : `1px solid ${LINE_ON_INK}`,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "baseline",
                    justifyContent: "space-between",
                    gap: 16,
                  }}
                >
                  <p
                    style={{
                      fontSize: lead ? 44 : 32,
                      fontWeight: 700,
                      color: BG,
                      minWidth: 0,
                    }}
                  >
                    <span style={{ color: BG_70, marginRight: 12 }}>
                      {row.rank}
                    </span>
                    {row.name}
                  </p>
                  <p
                    style={{
                      fontSize: lead ? 48 : 32,
                      fontWeight: 700,
                      color: lead ? ACCENT : BG,
                      fontVariantNumeric: "tabular-nums",
                      flexShrink: 0,
                    }}
                  >
                    {row.value}
                  </p>
                </div>
                <div
                  style={{
                    marginTop: 12,
                    height: 8,
                    borderRadius: 99,
                    background: LINE_ON_INK,
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      width: `${row.pct}%`,
                      height: "100%",
                      borderRadius: 99,
                      background: lead ? ACCENT : "rgba(250,248,244,0.35)",
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  if (data.variant === "roast" && data.roasts) {
    return (
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          marginTop: 40,
        }}
      >
        <SeasonKicker roast>{data.kicker}</SeasonKicker>
        <div
          style={{
            flex: 1,
            marginTop: 28,
            display: "flex",
            flexDirection: "column",
            gap: 16,
          }}
        >
          {data.roasts.map((r) => (
            <div
              key={`${r.label}-${r.name}`}
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                justifyContent: "center",
                padding: "28px 36px",
                borderRadius: 28,
                background: "rgba(24,24,27,0.72)",
                border: "1px solid rgba(192,57,43,0.55)",
              }}
            >
              <p
                style={{
                  fontSize: 20,
                  fontWeight: 600,
                  letterSpacing: 2,
                  textTransform: "uppercase",
                  color: BG_70,
                }}
              >
                {r.label}
              </p>
              <div
                style={{
                  marginTop: 8,
                  display: "flex",
                  alignItems: "baseline",
                  justifyContent: "space-between",
                  gap: 16,
                }}
              >
                <p
                  style={{
                    fontSize: 44,
                    fontWeight: 700,
                    color: BG,
                    minWidth: 0,
                    wordBreak: "break-word",
                  }}
                >
                  {r.name}
                </p>
                <p
                  style={{
                    fontSize: 56,
                    fontWeight: 700,
                    color: BG,
                    fontVariantNumeric: "tabular-nums",
                    flexShrink: 0,
                  }}
                >
                  {r.value}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (data.variant === "book" && data.book) {
    // Two columns, rows sized 1fr so the grid always fills the card whether a
    // season has six totals or two. An odd count makes the last tile span both
    // columns — the ledger never ends on a ragged half-row.
    const book = data.book.slice(0, 6);
    const odd = book.length % 2 === 1;
    return (
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          marginTop: 40,
        }}
      >
        <SeasonKicker>{data.kicker}</SeasonKicker>
        <div
          style={{
            flex: 1,
            marginTop: 24,
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gridAutoRows: "1fr",
            gap: 16,
          }}
        >
          {book.map((item, i) => {
            const wide = odd && i === book.length - 1;
            const accent = i === 0;
            return (
              <div
                key={item.label}
                style={{
                  gridColumn: wide ? "span 2" : undefined,
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "center",
                  padding: "24px 36px",
                  borderRadius: 28,
                  background: accent ? GOLD_WASH : "rgba(250,248,244,0.05)",
                  border: accent
                    ? `2px solid ${GOLD_RING}`
                    : `1px solid ${LINE_ON_INK}`,
                }}
              >
                <p
                  style={{
                    // 388px of usable column after padding, so a four-digit
                    // season total still gets to be enormous. Longer figures
                    // step down rather than run out of the tile.
                    fontSize:
                      item.value.length >= 6
                        ? 96
                        : item.value.length === 5
                          ? 116
                          : 140,
                    fontWeight: 700,
                    lineHeight: 1,
                    color: accent ? ACCENT : BG,
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {item.value}
                </p>
                <p
                  style={{
                    marginTop: 12,
                    fontSize: 26,
                    fontWeight: 600,
                    letterSpacing: 2,
                    textTransform: "uppercase",
                    color: BG_70,
                  }}
                >
                  {item.label}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return null;
}

/**
 * The trophy window, in whole pixels so html-to-image never has to round one.
 * 768 × 708 is exactly TrophyCard's 512/472: the photograph is drawn square at
 * 768 and pinned to the top, so the bottom 60 rendered pixels — the bottom 40
 * source pixels, which is the render's "Grok" watermark and nothing else —
 * fall outside the window. Change either number and the watermark is back in
 * every card the group shares.
 *
 * The window must also carry `flexShrink: 0`. It is a flex item in the Frame's
 * column, and a card whose text runs long would otherwise squeeze it — which
 * crops deeper than 512/472 and quietly stops matching the shelf.
 */
const TROPHY_WINDOW_W = 768;
const TROPHY_WINDOW_H = 708;

/**
 * One trophy, one number, one name. Everything on this card is sized to
 * survive WhatsApp's thumbnail: the photograph is the subject, the figure is
 * the headline, and the first name is the only word that has to be read at
 * 200px. The kicker states what the number counts and nothing else — the tone
 * is carried by the colour and the trophy, not by a line of commentary.
 */
function TrophyLayout({ data }: { data: TrophyShareData }) {
  const { award, earn, name, value, unit, awardKind, tone } = data;
  const roast = tone === "roast";
  const kicker = earn;

  return (
    <>
      <div style={{ marginTop: 40 }}>
        <span
          style={{
            display: "inline-block",
            fontSize: 22,
            fontWeight: 600,
            letterSpacing: 3,
            textTransform: "uppercase",
            color: roast ? BG_70 : ACCENT,
          }}
        >
          {kicker}
        </span>
        <p
          style={{
            marginTop: 12,
            fontSize: award.length > 14 ? 56 : 68,
            lineHeight: 1.05,
            fontWeight: 700,
            color: BG,
            wordBreak: "break-word",
          }}
        >
          {award}
        </p>
      </div>

      <div
        style={{
          marginTop: 32,
          alignSelf: "center",
          flexShrink: 0,
          position: "relative",
          width: TROPHY_WINDOW_W,
          height: TROPHY_WINDOW_H,
          borderRadius: 32,
          overflow: "hidden",
          border: `2px solid ${roast ? DANGER_RING : GOLD_RING}`,
          background: INK,
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- html-to-image
            needs a real <img>; next/image renders lazily and can't be captured. */}
        <img
          src={trophyImage(awardKind)}
          alt=""
          width={TROPHY_WINDOW_W}
          height={TROPHY_WINDOW_W}
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: TROPHY_WINDOW_W,
            height: TROPHY_WINDOW_W,
            objectFit: "cover",
            display: "block",
          }}
        />
      </div>

      <div
        style={{
          marginTop: "auto",
          paddingTop: 36,
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "space-between",
          gap: 24,
        }}
      >
        <p
          style={{
            fontSize: name.length > 9 ? 60 : 80,
            lineHeight: 1,
            fontWeight: 700,
            color: BG,
            minWidth: 0,
            wordBreak: "break-word",
          }}
        >
          {name}
        </p>
        <div style={{ flexShrink: 0, textAlign: "right" }}>
          <p
            style={{
              fontSize: value.length > 4 ? 96 : 128,
              lineHeight: 0.9,
              fontWeight: 700,
              color: roast ? BG : ACCENT,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {value}
          </p>
          {unit ? (
            <p
              style={{
                marginTop: 10,
                fontSize: 24,
                fontWeight: 600,
                letterSpacing: 2,
                textTransform: "uppercase",
                color: BG_70,
              }}
            >
              {unit}
            </p>
          ) : null}
        </div>
      </div>
    </>
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
