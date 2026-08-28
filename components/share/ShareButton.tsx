"use client";

import { ShareCard, type ShareData } from "@/components/share/ShareCard";
import { nodeToPngBlob, shareImageBlob } from "@/lib/share";
import { cn, errorMessage } from "@/lib/utils";
import { Loader2, Share2 } from "lucide-react";
import { useRef, useState } from "react";

const STATUS_COPY: Record<"copied" | "downloaded", string> = {
  copied: "Copied — paste in WhatsApp",
  downloaded: "Image saved",
};

// "dark" = current styling for charcoal headers (matches/player). "light" =
// same button, restyled to read on a paper background (leaderboard).
const BUTTON_TONE: Record<"dark" | "light", string> = {
  dark: "text-bg/70 active:bg-white/10",
  light: "border border-line text-muted active:bg-line/60",
};
const PILL_TONE: Record<"dark" | "light", string> = {
  dark: "bg-ink text-bg shadow-lift",
  light: "border border-line bg-surface text-ink shadow-card",
};

export function ShareButton({
  data,
  filename,
  className,
  tone = "dark",
  label,
}: {
  data: ShareData;
  filename: string;
  className?: string;
  tone?: "dark" | "light";
  /** When set, this is a labelled button, not an icon. */
  label?: string;
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);
  const [pill, setPill] = useState<string | null>(null);

  async function handleShare() {
    if (busy) return;
    setBusy(true);
    setPill(null);
    try {
      const node = cardRef.current;
      if (!node) throw new Error("Could not generate the image. Please try again.");
      const blob = await nodeToPngBlob(node);
      const outcome = await shareImageBlob(blob, filename);
      if (outcome === "copied" || outcome === "downloaded") {
        setPill(STATUS_COPY[outcome]);
        window.setTimeout(() => setPill(null), 2500);
      }
    } catch (err) {
      setPill(errorMessage(err, "Couldn't share this card"));
      window.setTimeout(() => setPill(null), 2500);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={cn("relative", label && "w-full")}>
      <button
        type="button"
        onClick={handleShare}
        disabled={busy}
        aria-label={label ?? "Share card"}
        className={cn(
          "flex items-center justify-center disabled:opacity-60",
          label
            ? "min-h-12 gap-2 rounded-xl bg-bg px-5 text-[15px] font-semibold text-ink active:scale-[0.98]"
            : cn(
                "h-11 w-11 rounded-lg",
                BUTTON_TONE[tone],
              ),
          className,
        )}
      >
        {busy ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : (
          <Share2 className="h-5 w-5" />
        )}
        {label}
      </button>

      {pill ? (
        <div
          role="status"
          className={cn(
            "absolute right-0 top-12 z-20 max-w-[220px] rounded-xl px-3 py-2 text-[13px] font-semibold leading-snug",
            PILL_TONE[tone],
          )}
        >
          {pill}
        </div>
      ) : null}

      {/* Off-screen render target for capture. `left: -9999px` (not
          display:none) keeps it laid out so html-to-image can measure and
          rasterize it. */}
      <div style={{ position: "fixed", top: 0, left: -9999, zIndex: -1 }} aria-hidden>
        <ShareCard ref={cardRef} data={data} />
      </div>
    </div>
  );
}
