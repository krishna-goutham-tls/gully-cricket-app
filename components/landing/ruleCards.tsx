import { cn } from "@/lib/utils";

/**
 * The rule cards, shared by the landing page's rules fold (first six) and
 * the full rulebook at /gully-rules (all of them). Pure presentational —
 * no hooks, so both server and client components can import it.
 * Every card is a rule the app actually implements today; keep it honest.
 */

export function RuleChipRow({ balls }: { balls: string[] }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5" aria-hidden>
      {balls.map((b, i) => (
        <span
          key={i}
          className={cn(
            "tabular flex h-7 min-w-7 items-center justify-center rounded-full px-2 text-[12px] font-bold",
            b === "W"
              ? "bg-danger text-white"
              : b === "4" || b === "6"
                ? "bg-accent text-ink"
                : b === "Wd" || b === "Nb"
                  ? "bg-accent/25 text-accent-deep"
                  : "bg-ink/[0.06] text-ink/70",
          )}
        >
          {b}
        </span>
      ))}
    </div>
  );
}

export type Rule = {
  emoji: string;
  title: string;
  body: string;
  /** The setting behind the rule — ranges say "flexible" better than prose. */
  knob?: string;
  isNew?: boolean;
  tilt?: "l" | "r";
};

export function RuleCard({ emoji, title, body, knob, isNew, tilt }: Rule) {
  return (
    <div
      className={cn(
        "flex flex-col rounded-[1.75rem] border border-line bg-surface p-5 shadow-card transition-transform duration-300 hover:rotate-0",
        tilt === "l" ? "-rotate-[0.7deg]" : tilt === "r" ? "rotate-[0.7deg]" : "",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-3xl leading-none">{emoji}</p>
        {isNew ? (
          <span className="rounded-full bg-accent px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-ink">
            New
          </span>
        ) : null}
      </div>
      <p className="mt-3 text-lg font-bold leading-snug text-ink">{title}</p>
      <p className="mt-1.5 text-sm leading-relaxed text-muted">{body}</p>
      {knob ? (
        <p className="tabular mt-3 w-fit rounded-full bg-accent-soft px-3 py-1 text-[12px] font-bold text-accent-deep">
          {knob}
        </p>
      ) : null}
    </div>
  );
}

/** Ordered: the six the landing shows come first. */
export const RULES: Rule[] = [
  {
    emoji: "🧍",
    title: "Last man stands",
    body: "Everyone else is out? The survivor bats on alone till he is too. Playing proper cricket today? Toggle it off, purist.",
    knob: "On by default · switchable per match",
    isNew: true,
    tilt: "l",
  },
  {
    emoji: "🔀",
    title: "The common player",
    body: "One guy, both teams — because someone always has to leave at 8. He bats and bowls for everyone, on half quota so it stays fair.",
    knob: "Any player · both sides",
    tilt: "r",
  },
  {
    emoji: "🎳",
    title: "Everyone bowls their share",
    body: "Set overs-per-player once and the app shares the bowling out. Quotas guide, never block — nobody gets stranded by a rule.",
    knob: "2–20 overs each",
    tilt: "l",
  },
  {
    emoji: "🫙",
    title: "The spare-balls pot",
    body: "Out early with balls left in your quota? They go into the team pot, and whoever's still in can use them. Nothing wasted.",
    knob: "Automatic",
    tilt: "r",
  },
  {
    emoji: "🔁",
    title: "Retire & return",
    body: "Cramp, phone call, sulking — retired is not out. Walk off, cool down, come back and finish the job.",
    knob: "Anytime",
    tilt: "l",
  },
  {
    emoji: "🧈",
    title: "Catch drops, on record",
    body: "Shell a sitter and it's tagged on that very ball. The Butterfingers board remembers so your friends don't have to.",
    knob: "Forever",
    tilt: "r",
  },
  {
    emoji: "🏏",
    title: "One batter or two",
    body: "Pairs like TV cricket, or true gully style — one batter at a time, everyone gets a go, nobody runs for anybody.",
    knob: "Pick per match",
    tilt: "l",
  },
  {
    emoji: "⏱️",
    title: "Any size of match",
    body: "A five-over slog before sunset or a full-day epic. The scorebook doesn't judge.",
    knob: "1–200 overs an innings",
    tilt: "r",
  },
  {
    emoji: "🎩",
    title: "Proper Tests, if you dare",
    body: "Two innings a side, follow-on, declarations, chasing a lead across days. Yes — gully Tests are a thing here.",
    knob: "Up to 4 innings",
    tilt: "l",
  },
  {
    emoji: "🚪",
    title: "Late? Still playing.",
    body: "Squads stay open mid-match. Someone's alarm failed again — add him when he shows up, quota and all.",
    knob: "Join mid-match",
    tilt: "r",
  },
];

/** Ranking maths — live on Leaders, Match Story, and season awards. */
export const COUNTING: Rule[] = [
  {
    emoji: "🧮",
    title: "All-round points",
    body: "1 point per run. 20 per wicket. 8 per catch. That number ranks Players, crowns Player of the Match, and seeds auto-formed teams.",
    knob: "1 · 20 · 8",
    tilt: "l",
  },
  {
    emoji: "📈",
    title: "Big days",
    body: "A batting innings of 25, 50, 75, or 100 adds 5, 15, 25, or 40. Three wickets in a match add 5. Five wickets add 40.",
    knob: "On top of the base",
    tilt: "r",
  },
  {
    emoji: "⭐",
    title: "Player of the Match",
    body: "Highest all-round points in that match. The app counts it. Nobody picks a name.",
    tilt: "l",
  },
  {
    emoji: "🧢",
    title: "Orange Cap and Purple Cap",
    body: "This season, most runs is Orange Cap. Most wickets is Purple Cap. Regulars only. The labels sit on Home before the names load.",
    tilt: "r",
  },
  {
    emoji: "👑",
    title: "Player of the Season",
    body: "When an admin ends a season, the highest all-round points on that board is Player of the Season. Same formula as a match.",
    tilt: "l",
  },
  {
    emoji: "📅",
    title: "Season vs all time",
    body: "Leaders and Records can show this season or the whole book. All-time rate records need 24 balls and 3 innings. A season is looser so a short stretch can still have a holder.",
    knob: "24 balls · 3 innings (all time)",
    tilt: "r",
  },
];
