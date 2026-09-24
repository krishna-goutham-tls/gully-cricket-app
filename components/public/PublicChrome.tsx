"use client";

import { Button } from "@/components/ui/Button";
import { Logo } from "@/components/ui/Logo";
import { cn } from "@/lib/utils";
import Link from "next/link";

/**
 * Frame for the no-login pages (/m, /p). A stranger lands here from a
 * WhatsApp link with no back stack, so the mark says what this is and the
 * footer says how a member gets into the app.
 */

export function PublicMark({ tone }: { tone: "dark" | "light" }) {
  return (
    <Link
      href="/"
      className={cn(
        "-ml-1 flex min-h-11 shrink-0 items-center gap-2 rounded-lg px-1 text-[13px] font-semibold",
        tone === "dark"
          ? "text-bg/70 active:bg-white/10"
          : "text-ink active:bg-line/60",
      )}
    >
      <Logo size={28} />
      Gully Cricket
    </Link>
  );
}

export function PublicFooter({
  signedIn,
  appHref,
  appLabel,
}: {
  signedIn: boolean;
  /** Where a member reads or answers this in the app. */
  appHref: string;
  appLabel: string;
}) {
  return (
    <div>
      <Button href={signedIn ? appHref : "/login"} fullWidth>
        {signedIn ? appLabel : "Sign in to Gully Cricket"}
      </Button>
      <p className="mt-2 text-center text-[13px] text-muted">
        {signedIn
          ? "You're seeing the public page — the app has the rest."
          : "Members sign in with their phone and PIN."}
      </p>
      <p className="mt-6 text-center">
        <Link
          href="/"
          className="inline-flex min-h-11 items-center rounded-lg px-2 text-[13px] font-semibold text-accent-deep active:bg-line/60"
        >
          What is Gully Cricket?
        </Link>
      </p>
    </div>
  );
}
