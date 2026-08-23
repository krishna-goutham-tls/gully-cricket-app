import {
  COUNTING,
  RULES,
  RuleCard,
  RuleChipRow,
} from "@/components/landing/ruleCards";
import { Logo } from "@/components/ui/Logo";
import Link from "next/link";

export const metadata = {
  title: "Gully Rules",
  description:
    "The rulebook your gully never wrote down — last man stands, common players, shared quotas, retire & return. Every match carries its own rules.",
};

/**
 * Public, shareable rulebook at /gully-rules. Static on purpose — it's a
 * WhatsApp-shareable page, so it should load like one. Each card is a rule
 * the app actually implements today; keep this page honest when rules ship.
 */

export default function GullyRulesPage() {
  return (
    <main className="full-bleed min-h-dvh bg-bg">
      {/* Header + hero */}
      <div className="mx-auto max-w-5xl px-5 pt-6">
        <header className="flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5">
            <Logo size={32} />
            <span className="font-bold tracking-tight text-ink">
              Gully Cricket
            </span>
          </Link>
          <nav className="flex shrink-0 items-center">
            <Link
              href="/release-notes"
              className="inline-flex min-h-11 items-center rounded-xl px-2.5 text-sm font-semibold text-muted hover:bg-ink/[0.04]"
            >
              Notes
            </Link>
            <Link
              href="/"
              className="inline-flex min-h-11 items-center rounded-xl px-2.5 text-sm font-semibold text-muted hover:bg-ink/[0.04]"
            >
              Home
            </Link>
          </nav>
        </header>

        <div className="mt-10 text-center sm:mt-14">
          <p className="text-[12px] font-bold uppercase tracking-[0.18em] text-accent-deep">
            The rulebook your gully never wrote down
          </p>
          <h1 className="mx-auto mt-3 max-w-2xl text-4xl font-bold leading-[1.05] tracking-tight text-ink sm:text-6xl">
            Gully rules.
            <br />
            <span className="relative whitespace-nowrap">
              <span className="absolute inset-x-[-0.15em] bottom-[0.05em] top-[0.5em] -rotate-1 rounded-md bg-accent/35" />
              <span className="relative">Your rules.</span>
            </span>
          </h1>
          <p className="mx-auto mt-4 max-w-md text-base leading-relaxed text-muted sm:text-lg">
            Every match carries its own rules — set them in ten seconds,
            argue about them never.
          </p>
          <div className="mt-6 flex justify-center">
            <RuleChipRow balls={["0", "1", "4", "Wd", "W", "6"]} />
          </div>
        </div>
      </div>

      {/* The rules */}
      <div className="mx-auto max-w-5xl px-5 pb-4 pt-10 sm:pt-14">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 lg:gap-5">
          {RULES.map((r) => (
            <RuleCard key={r.title} {...r} />
          ))}
        </div>
      </div>

      {/* How we count */}
      <div className="mx-auto max-w-5xl px-5 pb-4 pt-10 sm:pt-14">
        <div className="text-center">
          <p className="text-[12px] font-bold uppercase tracking-[0.18em] text-accent-deep">
            The ranking maths
          </p>
          <h2 className="mt-3 text-2xl font-bold tracking-tight text-ink sm:text-3xl">
            How we count.
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted sm:text-base">
            Same formula on Leaders, Player of the Match, and season awards.
            Nobody picks a name.
          </p>
        </div>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 lg:gap-5">
          {COUNTING.map((r) => (
            <RuleCard key={r.title} {...r} />
          ))}
        </div>
      </div>

      {/* Every ball counted */}
      <div className="mx-auto max-w-5xl px-5 py-12 text-center sm:py-16">
        <h2 className="text-2xl font-bold tracking-tight text-ink sm:text-3xl">
          And every ball counted.
        </h2>
        <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted sm:text-base">
          Wides, no-balls, byes, leg byes. All seven ways of getting out,
          with the fielder credited. And an undo for the fat-finger moments.
        </p>
        <div className="mt-5 flex justify-center">
          <RuleChipRow
            balls={["Wd", "Nb", "B1", "Lb2", "W", "0", "1", "2", "3", "4", "6"]}
          />
        </div>
      </div>

      {/* Closer */}
      <div className="bg-ink">
        <div className="mx-auto max-w-2xl px-5 py-16 text-center sm:py-20">
          <h2 className="text-3xl font-bold leading-tight tracking-tight text-bg sm:text-4xl">
            Want these rules on
            <br />
            <span className="text-accent">your match?</span>
          </h2>
          <div className="mt-8 flex justify-center">
            <Link
              href="/#invite"
              className="inline-flex min-h-14 items-center justify-center rounded-xl bg-accent px-8 text-base font-semibold text-ink shadow-lift transition hover:bg-accent/90 active:scale-[0.98]"
            >
              Register your community
            </Link>
          </div>
          <footer className="mt-14 flex flex-col items-center gap-3 border-t border-white/10 pt-8">
            <Logo size={28} />
            <p className="text-sm text-bg/60">
              Gully Cricket — made by gully cricketers, with{" "}
              <span className="text-accent">♥</span>
            </p>
          </footer>
        </div>
      </div>
    </main>
  );
}
