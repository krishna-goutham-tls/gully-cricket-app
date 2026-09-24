import { ImageResponse } from "next/og";

/**
 * The picture on a shared link: 1200×630, charcoal field, cream type, gold
 * for the one thing that matters. Tokens are the design bible's hex values
 * (Satori has no Tailwind). Poppins ships beside this file under the OFL.
 */

export const OG_SIZE = { width: 1200, height: 630 };

const INK = "#18181b";
const BG = "#faf8f4";
const ACCENT = "#f0b429";
/** Cream at /70 on ink — the bible's floor for secondary copy on ink. */
const CREAM_70 = "rgba(250, 248, 244, 0.7)";

async function fonts() {
  const [regular, semibold] = await Promise.all([
    fetch(new URL("./Poppins-Regular.ttf", import.meta.url)).then((r) =>
      r.arrayBuffer(),
    ),
    fetch(new URL("./Poppins-SemiBold.ttf", import.meta.url)).then((r) =>
      r.arrayBuffer(),
    ),
  ]);
  return [
    { name: "Poppins", data: regular, weight: 400 as const, style: "normal" as const },
    { name: "Poppins", data: semibold, weight: 600 as const, style: "normal" as const },
  ];
}

export type OgCard = {
  /** Micro label top-left: "LIVE", "RESULT", "WHO'S IN?". */
  label: string;
  /** Gold pill for live, plain for everything else. */
  live?: boolean;
  /** Top-right, small: the ground. */
  corner?: string;
  /** Small line above the headline: who is batting, or the teams. */
  kicker?: string;
  /** The big line: "84/3", "Sun 28 Sep · 7:00 am". */
  headline: string;
  /** Beside the headline, smaller: "9.2 ov". */
  headlineAside?: string;
  /** Gold line under the headline: "need 23 off 16", "6 in, 2 maybe". */
  highlight?: string;
  /** Last line, cream: "Sonesta Tigers vs Royals". */
  footer?: string;
};

/** Short cache: a re-share a minute later should carry the newer score. */
const CACHE = "public, max-age=60, s-maxage=60, stale-while-revalidate=60";

export async function ogImage(card: OgCard) {
  const long = card.headline.length > 12;
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: INK,
          color: BG,
          fontFamily: "Poppins",
          padding: "64px 72px",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "8px 20px",
              borderRadius: 999,
              background: card.live
                ? "rgba(240, 180, 41, 0.2)"
                : "rgba(255, 255, 255, 0.1)",
              color: card.live ? ACCENT : CREAM_70,
              fontSize: 26,
              fontWeight: 600,
              letterSpacing: 2,
            }}
          >
            {card.live ? (
              <div
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: 999,
                  background: ACCENT,
                }}
              />
            ) : null}
            {card.label}
          </div>
          {card.corner ? (
            <div
              style={{
                display: "flex",
                fontSize: 28,
                color: CREAM_70,
                maxWidth: 560,
              }}
            >
              {card.corner}
            </div>
          ) : null}
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          {card.kicker ? (
            <div style={{ display: "flex", fontSize: 36, color: CREAM_70 }}>
              {card.kicker}
            </div>
          ) : null}
          <div
            style={{
              display: "flex",
              alignItems: "flex-end",
              gap: 28,
              lineHeight: 1,
              // The big score's slash rises above its cap height.
              marginTop: long ? 8 : 32,
            }}
          >
            <div
              style={{
                display: "flex",
                fontSize: long ? 88 : 168,
                fontWeight: 600,
                letterSpacing: long ? -1 : -4,
              }}
            >
              {card.headline}
            </div>
            {card.headlineAside ? (
              <div
                style={{
                  display: "flex",
                  fontSize: 56,
                  fontWeight: 600,
                  color: CREAM_70,
                  paddingBottom: 14,
                }}
              >
                {card.headlineAside}
              </div>
            ) : null}
          </div>
          {card.highlight ? (
            <div
              style={{
                display: "flex",
                marginTop: 24,
                fontSize: 44,
                fontWeight: 600,
                color: ACCENT,
              }}
            >
              {card.highlight}
            </div>
          ) : null}
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "space-between",
            gap: 32,
          }}
        >
          <div style={{ display: "flex", fontSize: 32, fontWeight: 600, maxWidth: 820 }}>
            {card.footer ?? ""}
          </div>
          <div style={{ display: "flex", fontSize: 26, color: CREAM_70 }}>
            gullycricket.space
          </div>
        </div>
      </div>
    ),
    {
      ...OG_SIZE,
      fonts: await fonts(),
      // Lower-case on purpose: it must replace ImageResponse's own default
      // (a year, immutable), not sit beside it.
      headers: { "cache-control": CACHE },
    },
  );
}
