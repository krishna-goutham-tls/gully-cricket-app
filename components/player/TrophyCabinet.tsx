"use client";

import { ShareButton } from "@/components/share/ShareButton";
import type { TrophyShareData } from "@/components/share/ShareCard";
import { awardCopy, awardValueLine, trophyImage } from "@/lib/awardCopy";
import { Medal } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";

/**
 * The same 512/472 window Records uses. The renders carry a "Grok" watermark
 * in the bottom-right corner; pinning the image to the top of a window this
 * shape crops the bottom 40 source pixels, which is the watermark and nothing
 * else. Do not square this off.
 */
const WINDOW_RATIO = "512 / 472";

/** How many rows before the list folds. Four is one thumb-scroll — the
 *  cabinet is a reason to keep scrolling, not the page. */
const PREVIEW = 4;

/** One row of `api.stats.cabinet`, flattened for this component. */
export type CabinetEntry = {
  seasonId: string;
  seasonName: string;
  kind: string;
  display: string;
  tone: "honor" | "roast";
  /** The live season's trophies are today's answer, not a settled one. */
  provisional: boolean;
};

function firstName(name: string) {
  return name.trim().split(/\s+/)[0] ?? name;
}

function slug(s: string) {
  return (
    s
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "player"
  );
}

function toShareData(entry: CabinetEntry, displayName: string): TrophyShareData {
  const copy = awardCopy(entry.kind);
  return {
    kind: "trophy",
    awardKind: entry.kind,
    award: copy.name,
    earn: copy.earn,
    name: firstName(displayName),
    value: entry.display,
    unit: copy.unit,
    scope: entry.seasonName,
    tone: entry.tone,
  };
}

/**
 * The six kinds stamped on seasons that ended before the shelf existed have no
 * photograph and never will. A gold medallion keeps them in the same column as
 * the twelve that do, so an old Orange Cap reads as a trophy rather than as a
 * failed image.
 */
function LegacyMedallion() {
  return (
    <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent-deep">
      <Medal className="h-6 w-6" strokeWidth={1.8} aria-hidden />
    </span>
  );
}

function CabinetRow({
  entry,
  displayName,
}: {
  entry: CabinetEntry;
  displayName: string;
}) {
  const copy = awardCopy(entry.kind);
  return (
    <div className="flex items-center gap-3 px-3 py-2.5">
      {/* The window is a block box, not an inline one — `next/image` with
          `fill` measures its parent, and an inline span has none to measure. */}
      {copy.hasImage ? (
        <div
          className="relative w-14 shrink-0 overflow-hidden rounded-xl bg-bg"
          style={{ aspectRatio: WINDOW_RATIO }}
        >
          <Image
            src={trophyImage(entry.kind)}
            alt=""
            fill
            sizes="56px"
            loading="lazy"
            className="object-cover object-top"
          />
        </div>
      ) : (
        <LegacyMedallion />
      )}

      <div className="min-w-0 flex-1">
        <p className="text-[15px] font-semibold text-ink" title={copy.name}>
          {copy.name}
        </p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[13px] text-muted">
          <span className="tabular">
            {awardValueLine(entry.kind, entry.display)}
          </span>
          <span aria-hidden>·</span>
          <span>{entry.seasonName}</span>
          {entry.provisional ? (
            <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-semibold text-accent-deep">
              Still open
            </span>
          ) : null}
        </p>
      </div>

      {/* Only the photographed twelve are worth a poster — a share card with a
          medallion where the trophy goes is not the thing anyone wants to
          paste into the group. */}
      {copy.hasImage ? (
        <ShareButton
          data={toShareData(entry, displayName)}
          filename={`gully-${entry.kind.replace(/_/g, "-")}-${slug(displayName)}.png`}
          tone="light"
          className="shrink-0"
        />
      ) : null}
    </div>
  );
}

/**
 * Every trophy a season has stamped on this player, newest first. It sits under
 * the feat chips because the two answer the same question from opposite ends —
 * the chips are what their career numbers say, this is what a season awarded.
 */
export function TrophyCabinet({
  entries,
  displayName,
  liveSeasonName,
}: {
  entries: CabinetEntry[];
  displayName: string;
  /** The season still running, if there is one — the empty state's invitation. */
  liveSeasonName: string | null;
}) {
  const [showAll, setShowAll] = useState(false);

  if (entries.length === 0) {
    return (
      <div className="rounded-2xl border border-line bg-surface px-4 py-4">
        <p className="text-[15px] font-semibold text-ink">
          {liveSeasonName
            ? `Nothing yet. ${liveSeasonName} is still open.`
            : "Nothing yet."}
        </p>
        <p className="mt-1 text-[13px] leading-snug text-muted">
          Twelve trophies, one owner each. Three of them nobody wants.
        </p>
        <Link
          href="/records"
          className="mt-3 flex min-h-11 items-center justify-center rounded-xl border border-line bg-bg text-[13px] font-semibold text-ink active:bg-line/60"
        >
          See all twelve ›
        </Link>
      </div>
    );
  }

  const shown = showAll ? entries : entries.slice(0, PREVIEW);

  return (
    <div>
      <div className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
        {shown.map((entry, i) => (
          <CabinetRow
            key={`${entry.seasonId}-${entry.kind}-${i}`}
            entry={entry}
            displayName={displayName}
          />
        ))}
      </div>
      {entries.length > PREVIEW ? (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          className="mt-2 min-h-11 w-full rounded-2xl border border-line bg-surface text-[13px] font-semibold text-muted active:bg-bg"
        >
          {showAll ? "Show less" : `Show all ${entries.length} trophies`}
        </button>
      ) : null}
    </div>
  );
}
