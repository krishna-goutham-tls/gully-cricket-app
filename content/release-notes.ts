export type ReleaseNote = {
  slug: string;
  date: string;
  title: string;
  paragraphs: string[];
  whatsNew?: string[];
  whatGotBetter?: string[];
  whatWeDropped?: string[];
};

export const RELEASE_NOTES_INTRO = [
  "What we put on the phone, newest first. Match Story still sits on a finished game. This list is the app, not the cricket.",
];

export const RELEASE_NOTES: ReleaseNote[] = [
  {
    slug: "2026-08-23-seasons-leaders-records",
    date: "2026-08-23",
    title: "Seasons, Leaders, Records",
    paragraphs: [
      "A career board keeps the same names on top. A season is a fresh board for the cricket we are playing now.",
      "Season-01 holds every match we already had. Later seasons start on the day an admin opens them. Home's season card is the match folder: the series sits inside it, Orange Cap and Purple Cap sit on the card, and the title opens that season's matches.",
      "Leaders is Regulars or Everyone, this season or all time. Records split the same way. Super striker, most dots, best score, and best spell are on that page.",
      "Rules live on the website, next to Notes. The public Stories list is gone.",
    ],
    whatsNew: [
      "Named seasons",
      "Season match folder",
      "Orange Cap and Purple Cap",
      "Season records",
    ],
    whatWeDropped: ["Public Stories and the mixed Feed"],
  },
  {
    slug: "2026-08-22-extra-players-in-a-series",
    date: "2026-08-22",
    title: "Extra players",
    paragraphs: [
      "Someone extra turns up. They play anyway. The app used to refuse a series match for that, so you scored a friendly and the table missed the morning.",
      "You can include extra players in a series match, as long as each side still has at least one person from its own team. An admin can attach a finished friendly afterwards.",
    ],
    whatsNew: [
      "Extra players in a series match",
      "Each side still needs someone from its series team",
      "An admin can attach a finished friendly to the series",
    ],
  },
  {
    slug: "2026-08-21-making-the-screens-feel-like-one-app",
    date: "2026-08-21",
    title: "One app look",
    paragraphs: [
      "Buttons, type, and space above the home bar now share one set of sizes. Gold text is easier to read on a light screen. The score pad keys stayed as they were.",
    ],
    whatsNew: ["One set of sizes and colours for the installed app"],
    whatGotBetter: [
      "Thumb-sized buttons",
      "Space above the home bar",
      "Gold text you can actually read",
    ],
  },
  {
    slug: "2026-08-21-tossing-in-the-app",
    date: "2026-08-21",
    title: "Toss",
    paragraphs: [
      "The app can toss when nobody has a coin. Pick a team and heads or tails, tap Toss, the winner chooses bat or bowl. Tossed outside is still there.",
    ],
    whatsNew: [
      "Heads or tails in the app, then bat or bowl",
      "Tossed outside, if you already did it on the ground",
    ],
  },
  {
    slug: "2026-08-21-github-and-the-code-going-public",
    date: "2026-08-21",
    title: "Public code",
    paragraphs: [
      "The code is public (MIT). A fresh copy has no scores in it. You get the recipe, not our book.",
    ],
    whatsNew: [
      "Public code",
      "A landing page that says what the app is",
      "GitHub in the footer",
    ],
  },
  {
    slug: "2026-08-21-visitor-junior-win-and-the-battery",
    date: "2026-08-21",
    title: "Visitor and Junior",
    paragraphs: [
      "Visitor and Junior can both sit on one player. Regulars have no tag. Win% ranks after three finished matches.",
      "We dropped the 15-second scoring ping and the scorer name on live matches. The Live mark is still there.",
    ],
    whatsNew: [
      "Visitor and Junior together on one player",
      "Win% and contribution on profile and Leaders",
    ],
    whatWeDropped: ["The 15-second ping", "The scorer name on live games"],
  },
  {
    slug: "2026-08-17-invite-only-last-man-stands-catch-drop",
    date: "2026-08-17",
    title: "Invite-only",
    paragraphs: [
      "An organiser registers, we talk on WhatsApp, then they can make a community.",
      "Last man stands is a real rule now, on by default. Catch Drop tags the ball you just scored. Groups are called Communities.",
    ],
    whatsNew: [
      "Invite-only signup and a public landing page",
      "Last man stands as a working rule, on by default",
      "A Gully rules page you can share",
      "Catch Drop on the ball you just scored",
    ],
  },
  {
    slug: "2026-08-15-auto-form-teams",
    date: "2026-08-15",
    title: "Auto form teams",
    paragraphs: [
      "Auto form teams splits whoever is here. You can still move people after. Extra all-round points for big batting and bowling days sit on top; older matches keep the points they already had.",
    ],
    whatsNew: ["Auto form teams", "Milestone bonuses on all-round points"],
  },
  {
    slug: "2026-08-08-catch-drop-hero-and-watching",
    date: "2026-08-08",
    title: "Catch Drop",
    paragraphs: [
      "Catch Drop is on the pad, next to the runs. It does not change the score. After the game the drops are still there. Hero is one screen of how you played that day. You can watch a live match without scoring it.",
    ],
    whatsNew: [
      "Catch Drop on the pad",
      "Hero for the day you had",
      "Watch a live match without scoring it",
    ],
  },
  {
    slug: "2026-08-07-more-ways-to-rank",
    date: "2026-08-07",
    title: "More boards",
    paragraphs: [
      "There are more leaderboards now, including bat, ball, and field. Stats say which innings they came from.",
    ],
    whatsNew: ["More leaderboards", "Innings labelled on the stats"],
  },
  {
    slug: "2026-08-04-4s-6s-and-records-that-mean-something",
    date: "2026-08-04",
    title: "4s and 6s",
    paragraphs: [
      "There is a 4s and 6s board. Records need enough games. One lucky morning should not become a career.",
    ],
    whatsNew: ["4s and 6s leaderboard", "Qualification on records"],
  },
  {
    slug: "2026-08-03-sharing-trophies-borrowing-a-player",
    date: "2026-08-03",
    title: "Share cards",
    paragraphs: [
      "You can share an image of a player, a match, or the board on WhatsApp. Profiles have a trophy shelf. In a series you can borrow a player if a side is short.",
    ],
    whatsNew: [
      "Share cards for WhatsApp",
      "Trophy shelf",
      "Borrow a player in a series",
      "Mr. Defensive",
    ],
  },
  {
    slug: "2026-08-02-home-and-a-place-for-old-matches",
    date: "2026-08-02",
    title: "Home",
    paragraphs: [
      "Home is the first screen after you sign in. Past matches have their own page. Finished cards show the scoreline.",
    ],
    whatsNew: ["Home as the starting point", "A match list with scores on the cards"],
  },
  {
    slug: "2026-08-01-match-story",
    date: "2026-08-01",
    title: "Match Story",
    paragraphs: [
      "Match Story sits on a finished game: badges, a graph of who was ahead ball by ball, the turning point. The argument can look at something other than confidence.",
    ],
    whatsNew: ["Match Story", "Badges", "Lead graph", "Turning point"],
  },
  {
    slug: "2026-07-26-scorecard-profiles-adding-gully-to-the-phone",
    date: "2026-07-26",
    title: "Scorecard",
    paragraphs: [
      "The scorecard is easier to read. Profiles show what kind of player you are. You can add Gully to the home screen, and locking the phone does not sign you out mid-over.",
    ],
    whatsNew: [
      "Clearer scorecard",
      "Home by day",
      "Player profiles",
      "Home screen app that stays signed in",
    ],
  },
  {
    slug: "2026-07-25-shared-batting-quota-in-odis",
    date: "2026-07-25",
    title: "Shared quota",
    paragraphs: [
      "If a batter got out early, leftover balls used to vanish. They now go into a shared pot for the team. If you retire, you do not dump unused balls into the pot.",
    ],
    whatsNew: ["Shared quota pot"],
  },
  {
    slug: "2026-07-24-series-sandbox-late-arrivals",
    date: "2026-07-24",
    title: "Series",
    paragraphs: [
      "Tournaments are a two-team series with a table. Sandbox is practice that does not touch the real leaderboard. You can add someone who arrives after the match has started.",
    ],
    whatsNew: ["Tournaments", "Sandbox", "Add a player mid-match"],
  },
  {
    slug: "2026-07-19-tests",
    date: "2026-07-19",
    title: "Tests",
    paragraphs: [
      "The app has a Test format now. Captains pick sides. ODIs have ball and over limits. You choose when you create the match.",
    ],
    whatsNew: ["Test matches", "Captains draft", "ODI quotas"],
  },
  {
    slug: "2026-07-18-scoring-with-one-thumb",
    date: "2026-07-18",
    title: "Scoring",
    paragraphs: [
      "You tap runs, wicket, or wide, and it is in the book. Guests can play before they have a full login. If you forget your PIN, an admin can reset it.",
    ],
    whatsNew: ["Tap-to-score", "Guests", "PIN reset by an admin"],
  },
  {
    slug: "2026-07-17-first-version-on-the-phone",
    date: "2026-07-17",
    title: "First version",
    paragraphs: [
      "The first live scorebook. You could add it to the home screen. Until then the score was a notebook, or someone's memory, or the fight after.",
    ],
  },
];

export function getReleaseNote(slug: string): ReleaseNote | undefined {
  return RELEASE_NOTES.find((note) => note.slug === slug);
}

function noteDateAt(date: string): number {
  const [year, month, day] = date.split("-").map(Number);
  return Date.UTC(year, month - 1, day, 12, 0, 0);
}

/** "22 August 2026" */
export function formatNoteDate(date: string): string {
  return new Date(noteDateAt(date)).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}
