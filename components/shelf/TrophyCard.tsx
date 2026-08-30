"use client";

import { ShareButton } from "@/components/share/ShareButton";
import type { TrophyShareData } from "@/components/share/ShareCard";
import { awardCopy, trophyImage } from "@/lib/awardCopy";
import { cn } from "@/lib/utils";
import { Trophy } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

/**
 * The trophy renders are opaque 512×512 JPG-sourced webp — every one has its
 * own baked background, from near-white to a hard black/cream diptych, so they
 * cannot be floated as cutouts. The photograph IS the card face: full-bleed,
 * edge to edge, with the museum plate engraved underneath. Twelve mismatched
 * backgrounds stop reading as a defect and start reading as twelve separately
 * lit exhibits.
 *
 * Each render also carries a "Grok" watermark in the bottom-right corner. The
 * window is 512/472, not square, and the image is pinned to the top — that
 * crops the bottom 40 source pixels, which is the watermark and nothing else.
 * Change this ratio and the watermark comes back.
 */
const WINDOW_RATIO = "512 / 472";

/** One award as it lands on the shelf, already flattened for the card. */
export type ShelfCardAward = {
  kind: string;
  userId: string;
  displayName: string;
  display: string;
  tiedWith: Array<{ displayName: string }>;
};

function slug(name: string) {
  return (
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "player"
  );
}

/**
 * The photograph, cropped past its watermark, sized for the slot it sits in.
 * `priority` is for the hero alone — every other trophy is below the fold and
 * loads when it gets there.
 */
function TrophyImage({
  kind,
  sizes,
  priority,
}: {
  kind: string;
  sizes: string;
  priority?: boolean;
}) {
  return (
    <div
      className="relative w-full overflow-hidden bg-bg"
      style={{ aspectRatio: WINDOW_RATIO }}
    >
      <Image
        src={trophyImage(kind)}
        alt=""
        fill
        sizes={sizes}
        priority={priority}
        loading={priority ? undefined : "lazy"}
        className="object-cover object-top"
      />
    </div>
  );
}

/** Share sits on the photograph, not the plate — a 161px plate has no room
 *  for a 44px control, and an ink disc reads on every one of these
 *  backgrounds, cream or charcoal. */
function CardShare({
  data,
  filename,
}: {
  data: TrophyShareData;
  filename: string;
}) {
  return (
    <div className="absolute right-1.5 top-1.5 z-10">
      <ShareButton
        data={data}
        filename={filename}
        tone="dark"
        className="rounded-full bg-ink/85 text-bg backdrop-blur-sm active:bg-ink"
      />
    </div>
  );
}

/** "Also on 61 — Saral, Naman" — a tie is news, and it is the loser's news
 *  too, so both names are on the winner's card. */
function TiedLine({
  award,
  tone,
}: {
  award: ShelfCardAward;
  tone: "paper" | "ink";
}) {
  if (award.tiedWith.length === 0) return null;
  return (
    <p
      className={cn(
        "mt-1.5 text-[11px] leading-tight",
        tone === "ink" ? "text-bg/70" : "text-faint",
      )}
    >
      Also on {award.display} — {award.tiedWith.map((t) => t.displayName).join(", ")}
    </p>
  );
}

/**
 * The full-width opener. Same anatomy as a grid card, one size up, with the
 * number promoted to the stat scale — the reader should be able to screenshot
 * the first fold and have a complete thing.
 */
export function TrophyHeroCard({
  award,
  scopeLabel,
  tone,
}: {
  award: ShelfCardAward;
  scopeLabel: string;
  tone: "honor" | "roast";
}) {
  const copy = awardCopy(award.kind);
  return (
    <div className="relative overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
      <Link href={`/players/${award.userId}`} className="block active:bg-bg">
        <TrophyImage kind={award.kind} sizes="(max-width: 448px) 100vw, 448px" priority />
        <div className="px-4 py-3.5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-faint">
            {copy.name}
          </p>
          <div className="mt-1 flex items-end justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-[15px] font-semibold text-ink" title={award.displayName}>
                {award.displayName}
              </p>
              <p className="mt-0.5 text-[13px] text-muted">{copy.earn}</p>
            </div>
            <p className="tabular shrink-0 text-right text-2xl font-semibold tracking-tight text-ink">
              {award.display}
              <span className="ml-1 block text-[11px] font-semibold uppercase tracking-wide text-faint">
                {copy.unit}
              </span>
            </p>
          </div>
          <TiedLine award={award} tone="paper" />
        </div>
      </Link>
      <CardShare
        data={toShareData(award, scopeLabel, tone)}
        filename={`gully-${award.kind.replace(/_/g, "-")}-${slug(award.displayName)}.png`}
      />
    </div>
  );
}

/** One won trophy in the 2-up grid. `ink` is the roast band's ground. */
export function TrophyGridCard({
  award,
  scopeLabel,
  tone,
}: {
  award: ShelfCardAward;
  scopeLabel: string;
  tone: "honor" | "roast";
}) {
  const copy = awardCopy(award.kind);
  const onInk = tone === "roast";
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl border",
        onInk
          ? "border-white/10 bg-white/[0.06]"
          : "border-line bg-surface shadow-card",
      )}
    >
      <Link
        href={`/players/${award.userId}`}
        className={cn("block", onInk ? "active:bg-white/10" : "active:bg-bg")}
      >
        <TrophyImage kind={award.kind} sizes="(max-width: 448px) 50vw, 224px" />
        <div className="px-3 py-3">
          <p
            className={cn(
              "text-[11px] font-semibold uppercase tracking-wide",
              onInk ? "text-bg/70" : "text-faint",
            )}
          >
            {copy.name}
          </p>
          <p
            className={cn(
              "mt-1 text-[15px] font-semibold [overflow-wrap:anywhere] line-clamp-2",
              onInk ? "text-bg" : "text-ink",
            )}
            title={award.displayName}
          >
            {award.displayName}
          </p>
          <p
            className={cn(
              "tabular mt-0.5 text-[13px]",
              onInk ? "text-bg/70" : "text-muted",
            )}
          >
            {award.display} {copy.unit}
          </p>
          <TiedLine award={award} tone={onInk ? "ink" : "paper"} />
        </div>
      </Link>
      <CardShare
        data={toShareData(award, scopeLabel, tone)}
        filename={`gully-${award.kind.replace(/_/g, "-")}-${slug(award.displayName)}.png`}
      />
    </div>
  );
}

/**
 * Nobody has won this one. The slot stays on the shelf and keeps the grid
 * whole — an award that vanishes when it is unclaimed can never be an
 * invitation, and the invitation is the point for anyone who has won nothing.
 */
export function TrophyEmptySlot({
  kind,
  tone,
  wide,
}: {
  kind: string;
  tone: "honor" | "roast";
  /** Full width, for the hero slot on a shelf that has no winners at all. */
  wide?: boolean;
}) {
  const copy = awardCopy(kind);
  const onInk = tone === "roast";
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-2xl border border-dashed px-3 py-5 text-center",
        onInk ? "border-white/15 bg-white/[0.03]" : "border-line bg-surface",
        wide ? "min-h-[11rem]" : "min-h-[9.5rem]",
      )}
    >
      <Trophy
        className={cn("h-6 w-6", onInk ? "text-bg/70" : "text-faint")}
        strokeWidth={1.6}
        aria-hidden
      />
      <p
        className={cn(
          "mt-2 text-[15px] font-semibold",
          onInk ? "text-bg" : "text-ink",
        )}
      >
        {copy.name}
      </p>
      <p
        className={cn(
          "mt-1 text-[13px] leading-snug",
          onInk ? "text-bg/70" : "text-muted",
        )}
      >
        {copy.earn}
      </p>
      <p
        className={cn(
          "mt-1 text-[11px] leading-snug",
          onInk ? "text-bg/70" : "text-faint",
        )}
      >
        Nobody has earned this yet.
      </p>
    </div>
  );
}

/** The card the group actually sees in WhatsApp. First name only — the group
 *  knows who Naman is, and one word survives a thumbnail. */
export function toShareData(
  award: ShelfCardAward,
  scopeLabel: string,
  tone: "honor" | "roast",
): TrophyShareData {
  const copy = awardCopy(award.kind);
  return {
    kind: "trophy",
    awardKind: award.kind,
    award: copy.name,
    earn: copy.earn,
    name: award.displayName.trim().split(/\s+/)[0] ?? award.displayName,
    value: award.display,
    unit: copy.unit,
    scope: scopeLabel,
    tone,
  };
}
