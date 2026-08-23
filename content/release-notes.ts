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
  "Gully Cricket is the scorebook we use while we play. You tap what happened to the ball, it is saved, and after the game you can open the match again: the score, the story, the dropped catches, the result. What follows is a record of what we put on the phone, newest first. I have written it the way I would explain a change to someone who actually plays, not as a list of engineering work.",
];

export const RELEASE_NOTES: ReleaseNote[] = [
  {
    slug: "2026-08-22-extra-players-in-a-series",
    date: "2026-08-22",
    title: "Extra players in a series",
    paragraphs: [
      "A series is two teams agreed in advance. That part has not changed. What kept happening on the ground is simpler than any rule we had written: someone extra turns up, a junior who is not in the squad, a guest, and they play anyway, because that is how a gully morning works. Until this change, the app would refuse to start that match from the series. You scored it as a friendly, and then it never sat on the table, which meant the series and the morning quietly drifted apart.",
      "You can now include extra players in a series match, as long as each side still has at least one person from its own team. If the match was already scored as a friendly, an admin can add it to the series afterwards. The table can finally describe the cricket that actually happened.",
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
    title: "Making the screens feel like one app",
    paragraphs: [
      "Over a few weeks the screens had started to disagree with each other. Buttons were one height here and another there. Type jumped. On some phones the last line of a form sat under the home bar, so you were scoring with your thumb and also fighting the phone.",
      "We put one set of colours, type, and control sizes across the app. Buttons are large enough to tap with one hand. Text stays above the home bar. Gold text is easier to read on a light screen. We left the score pad keys alone on purpose. Those already had a job, and they were doing it.",
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
    title: "Tossing in the app",
    paragraphs: [
      "We still toss with a real coin when someone has one. Plenty of mornings nobody does, and then ten people argue about a twig, which is also cricket, but it is a slow way to start.",
      "The app can toss now. You pick a team and heads or tails, tap Toss, the coin lands, and the winner chooses bat or bowl. If you already tossed outside, that path is still there. The screen fits on a small phone without scrolling, you can tap the coin itself, and the form hides while it spins so you do not tap twice by accident. People watching the match only see who bats first. They do not need the flip. They need the innings.",
    ],
    whatsNew: [
      "Heads or tails in the app, then bat or bowl",
      "Tossed outside, if you already did it on the ground",
    ],
  },
  {
    slug: "2026-08-21-github-and-the-code-going-public",
    date: "2026-08-21",
    title: "GitHub, and the code going public",
    paragraphs: [
      "There is a GitHub link in the landing page footer. The code is public (MIT). Anyone can read it and run their own copy. The live matches stay with the community that scored them. A fresh copy of the app has no scores in it, which is the right deal: you get the recipe, not our book.",
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
    title: "Visitor, Junior, win%, and the battery",
    paragraphs: [
      "A junior who is also a guest is a real person on our ground, and the board used to make you pick one label. Win% and contribution were hiding in the profile in a way that made them hard to compare. Live matches also pinged every fifteen seconds to show who was scoring. Every phone watching the innings reloaded, four times a minute, for a name nobody was using. Battery went with it.",
      "Visitor and Junior can both sit on one player now. Regulars have no tag. Win% and contribution are on the profile and on the Players tab of Leaders, and win% only ranks after three finished matches, which stops a lucky weekend looking like a career. We also stopped saying the product was for Sunday games. We play whenever people come.",
      "We dropped the scoring ping, and we dropped the scorer's name on live matches. The Live mark is still there.",
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
    title: "Invite-only, last man stands, Catch Drop",
    paragraphs: [
      "The app is not an open club. An organiser registers, we talk on WhatsApp, and then they can make a community. That is slower than a sign-up form, and it is the point.",
      "Last man stands is how we actually play. The last batter keeps batting. We had a setting for it that did not do anything, which is a slightly insulting thing to discover in a live match. It is a real rule now, on by default. You can switch it off if you are playing proper cricket.",
      "Catch Drop was marking the next ball instead of the one you had just scored. It now tags the ball that happened. Groups are called Communities.",
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
      "Picking two sides by hand every morning takes time, and it usually becomes a negotiation rather than cricket.",
      "Auto form teams splits whoever is here. You can still move people after. We also added extra all-round points for the big batting and bowling days, without rewriting history: older matches keep the points they already had.",
    ],
    whatsNew: ["Auto form teams", "Milestone bonuses on all-round points"],
  },
  {
    slug: "2026-08-08-catch-drop-hero-and-watching",
    date: "2026-08-08",
    title: "Catch Drop, Hero, and watching",
    paragraphs: [
      "A dropped catch is part of the match. For a long time it lived only in the shouting, which means it lived in whoever was loudest.",
      "Catch Drop is on the pad, next to the runs. It does not change the score. It marks the ball. After the game you can open the match and the drops are still there, which is the difference between folklore and a record.",
      "Hero is one screen of how you played that day, and you can share it. If you are not the person scoring, you can still watch the live match.",
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
    title: "More ways to rank",
    paragraphs: [
      "People do not only argue about runs. Some mornings the story is bowling. Some mornings it is who even came.",
      "There are more leaderboards now, including bat, ball, and field, and the stats say which innings they came from, so a second-innings collapse does not get mixed into a first-innings fifty.",
    ],
    whatsNew: ["More leaderboards", "Innings labelled on the stats"],
  },
  {
    slug: "2026-08-04-4s-6s-and-records-that-mean-something",
    date: "2026-08-04",
    title: "4s, 6s, and records that mean something",
    paragraphs: [
      "There is a 4s and 6s board, because some innings are about hitting and pretending otherwise is prissy. Records also need enough games. One lucky morning should not become a career.",
    ],
    whatsNew: ["4s and 6s leaderboard", "Qualification on records"],
  },
  {
    slug: "2026-08-03-sharing-trophies-borrowing-a-player",
    date: "2026-08-03",
    title: "Sharing, trophies, borrowing a player",
    paragraphs: [
      "The score used to live in one phone. The group chat got a paragraph, or it got nothing, and by evening the numbers had already moved.",
      "You can share an image of a player, a match, or the board on WhatsApp. Profiles have a trophy shelf. In a series you can borrow a player from the other team if a side is short. Records include a roast called Mr. Defensive, which a few people have earned honestly.",
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
    title: "Home, and a place for old matches",
    paragraphs: [
      "Home is the first screen after you sign in: the cricket, not the settings. Past matches have their own page. Finished cards show the scoreline, 148/6 or 148 and 90, so you can find last week without asking who had the phone.",
    ],
    whatsNew: ["Home as the starting point", "A match list with scores on the cards"],
  },
  {
    slug: "2026-08-01-match-story",
    date: "2026-08-01",
    title: "Match Story",
    paragraphs: [
      '"Won by 22 runs" is the result. It is not the match.',
      "Match Story sits on a finished game: badges, a graph of who was ahead ball by ball, the turning point. You open it later and the innings is still there. The argument can look at something other than confidence.",
    ],
    whatsNew: ["Match Story", "Badges", "Lead graph", "Turning point"],
  },
  {
    slug: "2026-07-26-scorecard-profiles-adding-gully-to-the-phone",
    date: "2026-07-26",
    title: "Scorecard, profiles, adding Gully to the phone",
    paragraphs: [
      "The scorecard is easier to read. Home groups matches by the day you played. Profiles try to show what kind of player you are, not only a pile of totals. You can add Gully to the home screen, and locking the phone does not sign you out in the middle of an over, which used to happen and was as annoying as it sounds.",
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
    title: "Shared batting quota in ODIs",
    paragraphs: [
      "In a limited-overs game each batter has a ball limit. If they got out early, leftover balls used to vanish, so the next person could not use them. We had a match stall on that, which is how you find out a rule is wrong.",
      "Leftover balls now go into a shared pot for the team. If you retire, you do not dump unused balls into the pot. The pad and the next-batter screen use the same rule, so they cannot disagree in the middle of an innings.",
    ],
    whatsNew: ["Shared quota pot"],
  },
  {
    slug: "2026-07-24-series-sandbox-late-arrivals",
    date: "2026-07-24",
    title: "Series, sandbox, late arrivals",
    paragraphs: [
      "Some months we are not playing random games. We are playing the same two sides again.",
      "Tournaments are a two-team series with a table. Sandbox is practice that does not touch the real leaderboard. You can add someone who arrives after the match has started, which is most of our uncles.",
    ],
    whatsNew: ["Tournaments", "Sandbox", "Add a player mid-match"],
  },
  {
    slug: "2026-07-19-tests",
    date: "2026-07-19",
    title: "Tests",
    paragraphs: [
      "A lot of our cricket is short. Some mornings we want two innings and a follow-on and a match total, because that is the argument we are in.",
      "The app has a Test format now, captains pick sides, and ODIs have ball and over limits. You choose when you create the match.",
    ],
    whatsNew: ["Test matches", "Captains draft", "ODI quotas"],
  },
  {
    slug: "2026-07-18-scoring-with-one-thumb",
    date: "2026-07-18",
    title: "Scoring with one thumb",
    paragraphs: [
      "This is the product. You tap runs, wicket, or wide, and it is in the book. Guests can play before they have a full login. If you forget your PIN, an admin can reset it. Everything else in the app is reading what this writes.",
    ],
    whatsNew: ["Tap-to-score", "Guests", "PIN reset by an admin"],
  },
  {
    slug: "2026-07-17-first-version-on-the-phone",
    date: "2026-07-17",
    title: "First version on the phone",
    paragraphs: [
      "The first live scorebook. You could add it to the home screen. Until then the score was a notebook, or someone's memory, or the fight after. We have been adding to it since.",
    ],
  },
];

export function getReleaseNote(slug: string): ReleaseNote | undefined {
  return RELEASE_NOTES.find((note) => note.slug === slug);
}
