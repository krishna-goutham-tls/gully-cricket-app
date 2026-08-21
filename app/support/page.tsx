import { Logo } from "@/components/ui/Logo";
import Link from "next/link";

// Composes with the root layout's title template → "Support — Gully Cricket"
export const metadata = {
  title: "Support",
  description:
    "Get help with Gully Cricket — a real person answers within a day.",
};

/**
 * Public support page. Apple requires a live support URL on the domain
 * before an iOS app can ship. Draft copy — Krishna reviews the contact
 * channel before launch.
 */
export default function SupportPage() {
  return (
    <main className="min-h-dvh bg-bg px-5 py-10">
      <div className="mx-auto max-w-md">
        <Link href="/" className="flex items-center gap-2.5">
          <Logo size={32} />
          <span className="font-bold text-ink">Gully Cricket</span>
        </Link>
        <h1 className="mt-8 text-3xl font-bold tracking-tight text-ink">
          Support
        </h1>
        <div className="mt-5 space-y-4 text-[15px] leading-relaxed text-muted">
          <p>
            Gully Cricket is run by a real person, not a ticket queue. Stuck,
            found a bug, locked out of your PIN, or want your data removed?
          </p>
          <p>
            Email{" "}
            <a
              href="mailto:krishna@thelaunch.space"
              className="font-semibold text-ink underline"
            >
              krishna@thelaunch.space
            </a>{" "}
            — you&apos;ll hear back within a day, usually much faster.
          </p>
          <p>
            Forgot your PIN? Your group&apos;s admin can reset it from inside the
            app — that&apos;s often quicker than writing in.
          </p>
        </div>
        <p className="mt-8 text-[13px] text-faint">
          gullycricket.space ·{" "}
          <Link href="/" className="font-semibold hover:text-ink">
            Home
          </Link>
        </p>
      </div>
    </main>
  );
}
