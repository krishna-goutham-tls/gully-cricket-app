"use client";

import { DemoPad } from "@/components/landing/DemoPad";
import { InviteForm } from "@/components/landing/InviteForm";
import { RULES, RuleCard } from "@/components/landing/ruleCards";
import { Logo } from "@/components/ui/Logo";
import { cn } from "@/lib/utils";
import { Home, Trophy, User, Users } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

/**
 * The public front door at "/" for logged-out visitors. Logged-in users never
 * see this — app/page.tsx bounces them to /home before it paints.
 *
 * Structure: every product surface is shown ON A PHONE (device-framed mock
 * screens), one short line each. The interactive pad is the centerpiece; the
 * hero's tilted phone hands it over. Copy is draft v1 — flag anything off.
 */

/* ------------------------------ Device chrome ----------------------------- */

function PhoneFrame({
  children,
  className,
  screenClassName,
}: {
  children: React.ReactNode;
  className?: string;
  screenClassName?: string;
}) {
  return (
    <div
      className={cn(
        "w-[272px] shrink-0 rounded-[2.75rem] bg-ink p-2.5 shadow-lift ring-1 ring-ink/50",
        className,
      )}
    >
      <div
        className={cn(
          "relative h-[560px] overflow-hidden rounded-[2.25rem] bg-bg",
          screenClassName,
        )}
      >
        {/* Punch-hole island */}
        <div className="absolute left-1/2 top-2.5 z-20 h-[16px] w-16 -translate-x-1/2 rounded-full bg-ink ring-1 ring-white/15" />
        {children}
      </div>
    </div>
  );
}

function ScreenNav({ active }: { active: "home" | "leaders" | "players" }) {
  const items = [
    { key: "home", label: "Home", Icon: Home },
    { key: "leaders", label: "Leaders", Icon: Trophy },
    { key: "players", label: "Players", Icon: Users },
    { key: "profile", label: "Profile", Icon: User },
  ] as const;
  return (
    <div className="flex items-center justify-around border-t border-line bg-surface px-2 py-2">
      {items.map(({ key, label, Icon }) => (
        <div key={key} className="flex flex-col items-center gap-0.5">
          <Icon
            className={cn(
              "h-4 w-4",
              key === active ? "text-ink" : "text-faint/60",
            )}
          />
          <span
            className={cn(
              "text-[9px] font-semibold",
              key === active ? "text-ink" : "text-faint/60",
            )}
          >
            {label}
          </span>
        </div>
      ))}
    </div>
  );
}

function AppScreen({
  title,
  active,
  children,
}: {
  title: string;
  active: "home" | "leaders" | "players";
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-full flex-col bg-bg">
      <div className="px-4 pb-2 pt-9">
        <p className="text-[17px] font-bold text-ink">{title}</p>
      </div>
      <div className="flex-1 overflow-hidden px-4">{children}</div>
      <ScreenNav active={active} />
    </div>
  );
}

/* ------------------------------ Mock screens ------------------------------ */

function LeadersScreen() {
  const rows = [
    { r: 1, n: "Ashu", v: "342", p: 100, lead: true },
    { r: 2, n: "Imran", v: "296", p: 86 },
    { r: 3, n: "Sameer", v: "251", p: 73 },
    { r: 4, n: "Vicky", v: "187", p: 55, you: true },
    { r: 5, n: "Golu", v: "120", p: 35 },
    { r: 6, n: "Raju", v: "88", p: 26 },
  ];
  return (
    <AppScreen title="Leaders" active="leaders">
      <div className="mb-2 flex gap-1.5">
        {["Runs", "Avg", "SR"].map((c, i) => (
          <span
            key={c}
            className={cn(
              "rounded-full px-2.5 py-1 text-[10px] font-bold",
              i === 0 ? "bg-ink text-bg" : "text-muted",
            )}
          >
            {c}
          </span>
        ))}
      </div>
      {rows.map((row) => (
        <div key={row.r} className="flex items-center gap-2 py-[7px]">
          <span className="tabular w-4 text-right text-[11px] font-semibold text-faint">
            {row.r}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-2">
              <p
                className={cn(
                  "truncate text-[13px]",
                  row.lead ? "font-bold text-ink" : "font-medium text-ink/80",
                )}
              >
                {row.n}
                {row.you ? (
                  <span className="ml-1 rounded-full bg-accent-soft px-1.5 py-px text-[8px] font-bold text-accent-deep">
                    You
                  </span>
                ) : null}
              </p>
              <p className="tabular text-[13px] font-semibold text-ink">
                {row.v}
              </p>
            </div>
            <div className="mt-1 h-1 overflow-hidden rounded-full bg-ink/[0.05]">
              <div
                className={cn(
                  "h-full rounded-full",
                  row.lead ? "bg-accent" : "bg-ink/15",
                )}
                style={{ width: `${row.p}%` }}
              />
            </div>
          </div>
        </div>
      ))}
    </AppScreen>
  );
}

function RoastScreen() {
  return (
    <AppScreen title="Records" active="players">
      <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-accent-deep">
        Honours
      </p>
      <div className="mt-1.5 space-y-1.5">
        {[
          ["Best knock", "Ashu", "51*"],
          ["Best figures", "Imran", "4/12"],
        ].map(([l, h, v]) => (
          <div
            key={l}
            className="flex items-center justify-between rounded-lg bg-accent-soft px-2.5 py-1.5"
          >
            <p className="text-[12px] font-semibold text-ink">{l}</p>
            <p className="text-[12px] text-muted">
              {h} ·{" "}
              <span className="tabular font-bold text-accent-deep">{v}</span>
            </p>
          </div>
        ))}
      </div>
      <p className="mt-3 text-[10px] font-bold uppercase tracking-[0.14em] text-danger">
        The Roast
      </p>
      <div className="mt-1.5 space-y-1.5">
        {[
          ["Most ducks", "Golu", "4"],
          ["Butterfingers 🧈", "Vicky", "5 drops"],
          ["Most expensive", "Chhotu", "11.2/ov"],
          ["Mr. Defensive", "Sameer", "71% dots"],
          ["Most irregular", "Raju", "3 of 9"],
        ].map(([l, h, v]) => (
          <div
            key={l}
            className="flex items-center justify-between rounded-lg bg-danger-soft/60 px-2.5 py-1.5"
          >
            <p className="text-[12px] font-semibold text-ink">{l}</p>
            <p className="text-[12px] text-muted">
              {h} · <span className="tabular font-bold text-danger">{v}</span>
            </p>
          </div>
        ))}
      </div>
    </AppScreen>
  );
}

function StoryScreen() {
  return (
    <AppScreen title="Match story" active="home">
      <p className="text-[13px] font-bold text-ink">
        Team Ashu won by 14 runs
      </p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {["⭐ POTM — Ashu", "💥 22 off the last over", "🧤 3 catches — Imran"].map(
          (b) => (
            <span
              key={b}
              className="rounded-full bg-accent-soft px-2.5 py-1 text-[11px] font-semibold text-accent-deep"
            >
              {b}
            </span>
          ),
        )}
      </div>
      {/* The lead worm — wicket dots, six tick */}
      <svg viewBox="0 0 232 84" className="mt-3 w-full">
        <line x1="0" y1="42" x2="232" y2="42" stroke="#eae4d9" strokeWidth="1" />
        <path
          d="M0 42 C 24 34, 44 30, 64 36 S 100 58, 124 54 S 168 20, 200 16 L 232 10"
          fill="none"
          stroke="#f0b429"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
        <circle cx="64" cy="36" r="3.5" fill="#c0392b" />
        <circle cx="124" cy="54" r="3.5" fill="#c0392b" />
        <circle cx="200" cy="16" r="3.5" fill="#18181b" />
      </svg>
      <div className="rounded-xl border border-line bg-surface px-3 py-2">
        <p className="text-[9px] font-bold uppercase tracking-wide text-faint">
          Turning point
        </p>
        <p className="mt-0.5 text-[12px] font-medium leading-snug text-ink">
          3 wickets in 4 balls — the collapse that flipped it.
        </p>
      </div>
      <div className="mt-2 rounded-xl bg-ink px-3 py-2.5">
        <p className="text-[12px] font-semibold leading-snug text-bg">
          5th time <span className="text-accent">Imran</span> has got{" "}
          <span className="text-accent">Ashu</span>.
        </p>
        <p className="mt-0.5 text-[10px] text-bg/60">
          Nobody else has got him twice.
        </p>
      </div>
    </AppScreen>
  );
}

/* --------------------------------- Folds ---------------------------------- */

function Kicker({
  children,
  dark,
}: {
  children: React.ReactNode;
  dark?: boolean;
}) {
  return (
    <p
      className={cn(
        "text-[12px] font-bold uppercase tracking-[0.18em]",
        dark ? "text-accent" : "text-accent-deep",
      )}
    >
      {children}
    </p>
  );
}

function Mark({ children }: { children: React.ReactNode }) {
  return (
    <span className="relative whitespace-nowrap">
      <span className="absolute inset-x-[-0.15em] bottom-[0.05em] top-[0.5em] -rotate-1 rounded-md bg-accent/35" />
      <span className="relative">{children}</span>
    </span>
  );
}

function CTA({
  href = "/login",
  children,
  gold,
  className,
}: {
  href?: string;
  children: React.ReactNode;
  gold?: boolean;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex min-h-14 items-center justify-center rounded-xl px-8 text-base font-semibold shadow-lift transition active:scale-[0.98]",
        gold
          ? "bg-accent text-ink hover:bg-accent/90"
          : "bg-ink text-bg hover:bg-ink/90",
        className,
      )}
    >
      {children}
    </Link>
  );
}

/**
 * 0 → 1 driving the poster→live phone transition. Two regimes:
 * - Mobile: the phone scrolls with the page, so progress follows the phone's
 *   own centre travelling up the viewport.
 * - Desktop (lg+): the phone is sticky while two text folds pass it, so
 *   progress follows how far the visitor has scrolled INTO the hero section.
 * rAF-throttled scroll listener rather than scroll-timeline CSS so iOS
 * Safari behaves; reduced-motion visitors get the phone live from the start.
 */
function useLiveProgress(
  sectionRef: React.RefObject<HTMLElement>,
  phoneRef: React.RefObject<HTMLDivElement>,
) {
  const [p, setP] = useState(0);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setP(1);
      return;
    }
    let raf = 0;
    const update = () => {
      const vh = window.innerHeight;
      let raw = 0;
      if (window.matchMedia("(min-width: 1024px)").matches) {
        const r = sectionRef.current?.getBoundingClientRect();
        if (!r) return;
        raw = (-r.top / Math.max(1, r.height - vh)) * 1.3;
      } else {
        const r = phoneRef.current?.getBoundingClientRect();
        if (!r) return;
        const center = r.top + r.height / 2;
        raw = (vh * 0.92 - center) / (vh * 0.35);
      }
      setP(Math.min(1, Math.max(0, raw)));
    };
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      cancelAnimationFrame(raf);
    };
  }, [sectionRef, phoneRef]);
  return p;
}

/**
 * ONE phone for the whole top of the page. It enters as a tilted product
 * shot (3D perspective, glass sheen, untouchable) and — as it scrolls to
 * centre stage — straightens, sheds the sheen and goes live.
 */
function LivePhone({
  sectionRef,
}: {
  sectionRef: React.RefObject<HTMLElement>;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const p = useLiveProgress(sectionRef, ref);
  const live = p > 0.85;
  return (
    <div
      id="try"
      ref={ref}
      className="flex scroll-mt-24 flex-col items-center [perspective:1400px]"
    >
      <div
        style={{
          transform: `rotateX(${18 * (1 - p)}deg) rotateZ(${5 * (1 - p)}deg) scale(${0.93 + 0.07 * p})`,
        }}
        className="will-change-transform"
      >
        <PhoneFrame
          className={cn(
            "transition-shadow duration-500",
            live && "ring-2 ring-accent/50",
          )}
        >
          <div className={cn("h-full", !live && "pointer-events-none")}>
            <DemoPad />
          </div>
          {/* Poster glass — fades out as the phone wakes up */}
          <div
            style={{ opacity: Math.max(0, 1 - p * 1.2) }}
            className="pointer-events-none absolute inset-0 z-30 bg-gradient-to-br from-white/30 via-transparent to-ink/25"
          />
        </PhoneFrame>
      </div>
      <p
        className={cn(
          "mt-4 flex items-center gap-2 text-sm font-semibold text-accent transition-opacity duration-500",
          live ? "opacity-100" : "opacity-0",
        )}
      >
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-60" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-accent" />
        </span>
        It&apos;s live — tap away
      </p>
    </div>
  );
}

function HeroLive() {
  const sectionRef = useRef<HTMLElement>(null);
  return (
    <section ref={sectionRef} className="relative">
      {/* Paper hands over to ink; mobile mid-fold so the phone straddles the
          seam, desktop at the second fold the sticky phone scrolls into. */}
      <div className="absolute inset-x-0 bottom-0 top-[46%] bg-ink lg:top-[88vh]" />
      <div className="relative mx-auto max-w-6xl px-5 pt-6 sm:pt-8">
        <header className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <div className="flex min-w-0 items-center gap-2.5">
            <Logo size={36} />
            <span className="truncate text-lg font-bold tracking-tight text-ink">
              Gully Cricket
            </span>
          </div>
          <nav className="flex shrink-0 items-center">
            <Link
              href="/gully-rules"
              className="inline-flex min-h-11 items-center rounded-lg px-2.5 text-[13px] font-semibold text-muted hover:bg-ink/[0.04]"
            >
              Rules
            </Link>
            <Link
              href="/release-notes"
              className="inline-flex min-h-11 items-center rounded-lg px-2.5 text-[13px] font-semibold text-muted hover:bg-ink/[0.04]"
            >
              Notes
            </Link>
            <Link
              href="/login"
              className="inline-flex min-h-11 items-center rounded-lg px-2.5 text-[13px] font-semibold text-muted hover:bg-ink/[0.04]"
            >
              Sign in
            </Link>
          </nav>
        </header>

        {/* Mobile: text → phone → caption, stacked. Desktop: two full text
            folds on the left scrolling past ONE sticky phone on the right. */}
        <div className="grid gap-4 lg:grid-cols-[1.1fr_1fr] lg:gap-6">
          <div className="contents lg:block">
            {/* Mobile budget is tight: the fold must also fit the phone down
                to its big score, so every mobile gap here is spent twice. */}
            <div className="order-1 mt-7 sm:mt-16 lg:mt-0 lg:flex lg:min-h-[calc(88vh-120px)] lg:flex-col lg:justify-center">
              <Kicker>The scorebook for your match</Kicker>
              <h1 className="mt-3 text-[2.4rem] font-bold leading-[1.04] tracking-tight text-ink sm:mt-4 sm:text-6xl lg:text-7xl">
                Score the whole match.
                <br />
                <Mark>While you play.</Mark>
              </h1>
              <p className="mt-4 max-w-md text-[17px] leading-relaxed text-muted sm:mt-5 sm:text-lg">
                Tap what happened. The scorecard — and the{" "}
                <span className="font-semibold text-ink">bragging rights</span>{" "}
                — write themselves.
              </p>
              <div className="mt-6 sm:mt-8">
                <CTA
                  href="#invite"
                  className="min-h-[3.25rem] px-5 text-[15px] sm:min-h-14 sm:px-8 sm:text-base"
                >
                  Register your community
                </CTA>
              </div>
              <p className="mt-4 text-[13px] font-medium text-faint sm:mt-5">
                Invite-only for now — one community at a time, over WhatsApp
              </p>
            </div>

            {/* The demo's caption — mobile: on the ink under the phone;
                desktop: its own full fold the sticky phone wakes up beside. */}
            <div className="order-3 pb-16 pt-10 text-center sm:pb-20 lg:flex lg:min-h-screen lg:flex-col lg:justify-center lg:pb-0 lg:pt-0 lg:text-left">
              <h2 className="text-3xl font-bold leading-tight tracking-tight text-bg sm:text-4xl">
                Tap. <span className="text-accent">Scored.</span> Next ball.
              </h2>
              <p className="mx-auto mt-3 max-w-sm text-base leading-relaxed text-bg/70 lg:mx-0">
                This is how scoring feels — go on, have a practice over.
              </p>
            </div>
          </div>

          <div className="order-2 mt-6 sm:mt-10 lg:order-none lg:mt-0">
            <div className="lg:sticky lg:top-[max(24px,calc(50vh-370px))] lg:flex lg:justify-center lg:pb-10">
              <LivePhone sectionRef={sectionRef} />
            </div>
          </div>
        </div>

      </div>
    </section>
  );
}

/**
 * Scroll-driven showcase, same mechanism on mobile and desktop: the section
 * is four viewports tall, the stage is sticky, and scroll depth decides
 * which screen is on stage. Each screen gets one line; the sequence ends on
 * "…and much more coming soon."
 */
function AfterMatch() {
  const secRef = useRef<HTMLDivElement>(null);
  const [step, setStep] = useState(0);
  useEffect(() => {
    let raf = 0;
    const update = () => {
      const el = secRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const span = Math.max(1, r.height - window.innerHeight);
      const p = Math.min(1, Math.max(0, -r.top / span));
      setStep(Math.min(3, Math.floor(p * 4)));
    };
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      cancelAnimationFrame(raf);
    };
  }, []);

  const shots = [
    { key: "leaders", screen: <LeadersScreen />, line: "Every match builds your career stats." },
    { key: "story", screen: <StoryScreen />, line: "Every match becomes a story." },
    { key: "roast", screen: <RoastScreen />, line: "The Roast — records nobody wants." },
  ];
  const ended = step >= 3;
  const onStage = Math.min(step, 2);

  return (
    <section className="bg-ink/[0.03]">
      <div ref={secRef} className="relative h-[340vh]">
        <div className="sticky top-0 flex h-screen flex-col items-center overflow-hidden px-5 pt-[6vh] text-center">
          <Kicker>After the match</Kicker>
          <h2 className="mt-2 max-w-xl text-2xl font-bold leading-tight tracking-tight text-ink sm:text-4xl">
            The match ends. <Mark>The talking starts.</Mark>
          </h2>
          <div className="mt-4 flex items-center justify-center gap-1.5">
            {shots.map((s, i) => (
              <span
                key={s.key}
                className={cn(
                  "h-1.5 rounded-full transition-all duration-300",
                  i === onStage && !ended ? "w-6 bg-ink" : "w-1.5 bg-ink/20",
                )}
              />
            ))}
          </div>
          <p className="mt-3 min-h-6 text-[15px] font-semibold text-ink">
            {ended ? "" : shots[onStage].line}
          </p>

          <div className="relative mt-5">
            {shots.map((s, i) => {
              const state = ended
                ? "pointer-events-none -translate-y-8 scale-95 opacity-0"
                : i === step
                  ? "translate-y-0 scale-100 opacity-100"
                  : i < step
                    ? "pointer-events-none -translate-y-8 scale-95 opacity-0"
                    : "pointer-events-none translate-y-8 scale-95 opacity-0";
              return (
                <div
                  key={s.key}
                  className={cn(
                    "transition-all duration-500",
                    i === 0 ? "relative" : "absolute inset-0 flex justify-center",
                    state,
                  )}
                >
                  <PhoneFrame>{s.screen}</PhoneFrame>
                </div>
              );
            })}
            {/* The closing beat */}
            <div
              className={cn(
                "absolute inset-0 flex items-center justify-center transition-all delay-150 duration-500",
                ended ? "scale-100 opacity-100" : "pointer-events-none scale-95 opacity-0",
              )}
            >
              <p className="max-w-xs text-3xl font-bold leading-tight tracking-tight text-ink">
                …and much <Mark>more</Mark> coming soon.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/** The six best rule cards; the full rulebook lives at /gully-rules. */
function GullyRules() {
  return (
    <section className="mx-auto max-w-5xl px-5 py-16 sm:py-20">
      <div className="text-center">
        <Kicker>Set in ten seconds. Argued about never.</Kicker>
        <h2 className="mt-3 text-3xl font-bold leading-tight tracking-tight text-ink sm:text-4xl">
          Gully rules. <Mark>Your rules.</Mark>
        </h2>
      </div>
      <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 lg:gap-5">
        {RULES.slice(0, 6).map((r) => (
          <RuleCard key={r.title} {...r} />
        ))}
      </div>
      <div className="mt-8 text-center">
        <Link
          href="/gully-rules"
          className="inline-flex min-h-12 items-center rounded-xl border border-line bg-surface px-6 text-[15px] font-semibold text-ink shadow-card transition hover:bg-bg active:scale-[0.98]"
        >
          The full rulebook →
        </Link>
      </div>
    </section>
  );
}

/** A WhatsApp-style incoming bubble — the organiser's natural habitat. */
function ChatBubble({
  children,
  time,
  gold,
  tilt,
}: {
  children: React.ReactNode;
  time: string;
  gold?: boolean;
  tilt?: "l" | "r";
}) {
  return (
    <div
      className={cn(
        "w-fit max-w-[280px] rounded-2xl rounded-tl-md px-4 py-2.5 shadow-card",
        gold ? "bg-accent text-ink" : "bg-white/10 text-bg",
        tilt === "l" ? "-rotate-1" : tilt === "r" ? "rotate-1" : "",
      )}
    >
      <p className="text-[15px] font-medium leading-snug">{children}</p>
      <p
        className={cn(
          "mt-0.5 text-right text-[10px]",
          gold ? "text-ink/50" : "text-bg/70",
        )}
      >
        {time}
      </p>
    </div>
  );
}

function Closer() {
  return (
    <section id="invite" className="scroll-mt-8 bg-ink">
      <div className="mx-auto max-w-6xl px-5 py-20 sm:py-24">
        <div className="grid items-start gap-12 lg:grid-cols-2 lg:gap-16">
          <div className="text-center lg:text-left">
            <Kicker dark>No franchise. No academy.</Kicker>
            <h2 className="mt-3 text-3xl font-bold leading-tight tracking-tight text-bg sm:text-5xl">
              One pitch. Two captains.
              <br />
              <span className="text-accent">Whoever showed up.</span>
            </h2>
            <p className="mx-auto mt-4 max-w-md text-base leading-relaxed text-bg/70 lg:mx-0">
              That match deserves a real scorecard too.
            </p>

            {/* The organiser, identified by his own messages — not a paragraph */}
            <div className="mx-auto mt-9 w-fit space-y-2.5 text-left lg:mx-0">
              <p className="text-[12px] font-bold uppercase tracking-[0.16em] text-bg/70">
                Every community has this guy
              </p>
              <ChatBubble time="6:02 am" tilt="l">
                Match at 7. Ground. Be there.
              </ChatBubble>
              <ChatBubble time="6:04 am" tilt="r">
                Yes, AGAIN. And bring the ball.
              </ChatBubble>
              <ChatBubble time="6:07 am" gold tilt="l">
                Who&apos;s keeping score today?
              </ChatBubble>
              <p className="max-w-[300px] pt-2 text-sm leading-relaxed text-bg/70">
                Send these messages?{" "}
                <span className="font-semibold text-bg">
                  The form is yours.
                </span>
                <br />
                Only receive them? Your organiser adds you.
              </p>
            </div>
          </div>

          <div className="mx-auto w-full max-w-md">
            <InviteForm />
          </div>
        </div>
        {/* /privacy and /support stay live as routes (Apple needs the URLs
            when the iOS app ships) — they're just not in the footer for now. */}
        <footer className="mt-16 flex flex-col items-center gap-3 border-t border-white/10 pt-8 text-center">
          <Logo size={28} />
          <p className="text-sm text-bg/60">
            Gully Cricket — made by gully cricketers, with{" "}
            <span className="text-accent">♥</span>
          </p>
          <nav className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-sm text-bg/60">
            <a href="/gully-rules" className="transition hover:text-bg">
              Rules
            </a>
            <a href="/release-notes" className="transition hover:text-bg">
              Notes
            </a>
          </nav>
          <a
            href="https://github.com/krishna-goutham-tls/gully-cricket-app"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-sm text-bg/60 transition hover:text-bg"
          >
            <svg
              className="h-4 w-4"
              viewBox="0 0 24 24"
              fill="currentColor"
              aria-hidden
            >
              <path d="M12 .3a12 12 0 0 0-3.8 23.4c.6.1.8-.3.8-.6v-2.2c-3.3.7-4-1.4-4-1.4-.5-1.4-1.3-1.8-1.3-1.8-1.1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1.1 1.8 2.8 1.3 3.5 1 .1-.8.4-1.3.8-1.6-2.7-.3-5.5-1.3-5.5-6 0-1.3.5-2.4 1.2-3.3-.1-.3-.5-1.5.1-3.2 0 0 1-.3 3.3 1.2a11.5 11.5 0 0 1 6 0c2.3-1.5 3.3-1.2 3.3-1.2.6 1.7.2 2.9.1 3.2.8.9 1.2 2 1.2 3.3 0 4.7-2.8 5.7-5.5 6 .4.4.8 1.1.8 2.2v3.3c0 .3.2.7.8.6A12 12 0 0 0 12 .3Z" />
            </svg>
            Open source. Feel free to contribute.
          </a>
        </footer>
      </div>
    </section>
  );
}

export function LandingPage() {
  return (
    // One breakout at the top: the root layout's phone-shell caps width at
    // 28rem, right for the app, wrong for a marketing page.
    <main className="full-bleed min-h-dvh bg-bg">
      <HeroLive />
      <AfterMatch />
      <GullyRules />
      <Closer />
    </main>
  );
}
