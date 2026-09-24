"use client";

import { shareLink } from "@/lib/share";
import { cn, errorMessage } from "@/lib/utils";
import { Share2 } from "lucide-react";
import { useState } from "react";

// Same two tones as ShareButton: charcoal headers and paper cards.
const BUTTON_TONE: Record<"dark" | "light", string> = {
  dark: "text-bg/70 active:bg-white/10",
  light: "text-muted active:bg-line/60",
};
const PILL_TONE: Record<"dark" | "light", string> = {
  dark: "bg-ink text-bg shadow-lift",
  light: "border border-line bg-surface text-ink shadow-card",
};

/**
 * Shares the no-login page for a match or poll — the link, not a poster.
 * The poster (ShareButton) stays the way to share a finished result.
 * `url` is a function so it reads window.location only on tap.
 */
export function ShareLinkButton({
  url,
  text,
  tone = "dark",
  className,
}: {
  url: () => string;
  text: string;
  tone?: "dark" | "light";
  className?: string;
}) {
  const [pill, setPill] = useState<string | null>(null);

  async function handleShare() {
    setPill(null);
    try {
      const outcome = await shareLink(url(), text);
      if (outcome === "copied") setPill("Link copied — paste in WhatsApp");
    } catch (err) {
      setPill(errorMessage(err, "Couldn't share this link"));
    }
    window.setTimeout(() => setPill(null), 2500);
  }

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={() => void handleShare()}
        aria-label="Share link"
        className={cn(
          "flex h-11 w-11 items-center justify-center rounded-lg",
          BUTTON_TONE[tone],
          className,
        )}
      >
        <Share2 className="h-5 w-5" />
      </button>
      {pill ? (
        <div
          role="status"
          className={cn(
            "absolute right-0 top-12 z-20 w-max max-w-[220px] rounded-xl px-3 py-2 text-[13px] font-semibold leading-snug",
            PILL_TONE[tone],
          )}
        >
          {pill}
        </div>
      ) : null}
    </div>
  );
}
