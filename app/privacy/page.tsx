import { Logo } from "@/components/ui/Logo";
import Link from "next/link";

// Composes with the root layout's title template → "Privacy — Gully Cricket"
export const metadata = {
  title: "Privacy",
  description:
    "What Gully Cricket stores and why: your name, number and match data. No ads, no tracking, no selling data.",
};

/**
 * Public privacy policy. Apple requires a live privacy-policy URL on the
 * domain before an iOS app can ship; keep this page honest and plain rather
 * than legal boilerplate. Draft copy — Krishna reviews before launch.
 */
export default function PrivacyPage() {
  return (
    <main className="min-h-dvh bg-bg px-5 pb-[calc(2rem+env(safe-area-inset-bottom))] pt-[calc(var(--safe-top)+1rem)]">
      <div className="mx-auto max-w-md">
        <Link href="/" className="flex items-center gap-2.5">
          <Logo size={32} />
          <span className="font-bold text-ink">Gully Cricket</span>
        </Link>
        <h1 className="mt-8 text-3xl font-bold tracking-tight text-ink">
          Privacy
        </h1>
        <div className="mt-5 space-y-4 text-[15px] leading-relaxed text-muted">
          <p>
            Gully Cricket is a scorebook for your matches. We keep the minimum
            needed to run it:
          </p>
          <ul className="list-disc space-y-2 pl-5">
            <li>
              <span className="font-semibold text-ink">Your name and phone
              number</span> — so your teammates know who scored those runs, and
              so you can sign in. Your PIN is stored securely and nobody can
              read it.
            </li>
            <li>
              <span className="font-semibold text-ink">Your match data</span> —
              every ball scored in your community&apos;s matches, which is the whole
              product. It&apos;s visible to your community, not to anyone else.
            </li>
          </ul>
          <p>
            No ads, no tracking pixels, no selling data — to anyone, ever. If
            you want your account and history removed, message us on the{" "}
            <Link href="/support" className="font-semibold text-ink underline">
              support page
            </Link>{" "}
            and it&apos;s done.
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
