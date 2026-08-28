"use client";

import { useEffect, useRef, useState } from "react";
import {
  CARD_HEIGHT,
  CARD_WIDTH,
  ShareCard,
  type ShareData,
} from "@/components/share/ShareCard";

/** Scales the fixed 1080×1350 ShareCard down to the container width. */
export function PosterPreview({ data }: { data: ShareData }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => setScale(el.clientWidth / CARD_WIDTH);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div
      ref={containerRef}
      className="w-full overflow-hidden rounded-[28px] shadow-lift"
      style={{ aspectRatio: `${CARD_WIDTH} / ${CARD_HEIGHT}` }}
    >
      <div
        style={{
          width: CARD_WIDTH,
          height: CARD_HEIGHT,
          transform: `scale(${scale})`,
          transformOrigin: "top left",
        }}
      >
        <ShareCard data={data} />
      </div>
    </div>
  );
}
