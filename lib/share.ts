import { toBlob } from "html-to-image";

/**
 * Capture a DOM node to a PNG blob.
 *
 * Two things make the exported image "incomplete" on real phones, both handled
 * here:
 *  - pixelRatio must stay at 2, not 3. A 1080×1350 card at ×3 is 3240×4050,
 *    which exceeds iOS Safari's canvas-size limit and gets silently clipped
 *    (the top of the card renders, the rest is blank). ×2 (2160×2700) is well
 *    inside the limit and still sharp for WhatsApp.
 *  - fonts AND every <img> (the logo) must be fully loaded first, and even
 *    then html-to-image's first pass often rasterizes a half-embedded card —
 *    so a warm-up pass primes its caches and the second pass is the real one.
 */
export async function nodeToPngBlob(node: HTMLElement): Promise<Blob> {
  await document.fonts.ready;
  await Promise.all(
    Array.from(node.querySelectorAll("img")).map((img) =>
      img.complete && img.naturalWidth > 0
        ? Promise.resolve()
        : new Promise<void>((resolve) => {
            img.addEventListener("load", () => resolve(), { once: true });
            img.addEventListener("error", () => resolve(), { once: true });
          }),
    ),
  );

  const options = { pixelRatio: 2, cacheBust: true } as const;
  await toBlob(node, options); // warm-up — discarded (first pass is often partial)
  const blob = await toBlob(node, options);
  if (!blob) {
    throw new Error("Could not generate the image. Please try again.");
  }
  return blob;
}

export type ShareOutcome = "shared" | "copied" | "downloaded";

/**
 * Share order: native share sheet (phones, where the point is dropping the
 * image straight into WhatsApp) → copy to clipboard (desktop browsers that
 * support it) → plain download link (last resort, everywhere else).
 *
 * The image is shared ALONE — no `title`/`text`. Passing text alongside the
 * file made WhatsApp/iOS split the share into two items (the image plus a
 * separate text card). The card already carries every word it needs.
 */
export async function shareImageBlob(
  blob: Blob,
  filename: string,
): Promise<ShareOutcome> {
  const file = new File([blob], filename, { type: "image/png" });

  if (
    typeof navigator !== "undefined" &&
    "canShare" in navigator &&
    navigator.canShare({ files: [file] })
  ) {
    try {
      await navigator.share({ files: [file] });
      return "shared";
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        // User dismissed the share sheet — not an error, just stop here.
        return "shared";
      }
      throw err;
    }
  }

  if (typeof navigator !== "undefined" && navigator.clipboard && "ClipboardItem" in window) {
    await navigator.clipboard.write([
      new ClipboardItem({ "image/png": blob }),
    ]);
    return "copied";
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  return "downloaded";
}
