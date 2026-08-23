export type StoryParagraph = {
  kind: "p";
  text: string;
};

export type StoryCard = {
  kind: "card";
  heading: string;
  rows: Array<{ label: string; value: string }>;
  potm?: string;
  facts?: string;
};

export type StoryBlock = StoryParagraph | StoryCard;

export type MatchStory = {
  slug: string;
  date: string;
  title: string;
  /** First paragraph is still the feed preview. */
  blocks: StoryBlock[];
};

export const MATCH_STORIES_INTRO = [
  "We started scoring on the phone because the game kept disappearing the moment we walked off. By evening the scores had already been rounded into a joke, and by next week nobody could agree who had followed on. These notes are the other half of that work. They are for sitting with a match after it is over, the way you sit with a photograph: not to prove a point, just to see it again.",
];

export const MATCH_STORIES_CLOSER =
  "We will write more as we play. Scoring is for the over that is happening. This is for the evening, when you want the morning back without having to invent it.";

export const MATCH_STORIES: MatchStory[] = [
  {
    slug: "2026-08-22",
    date: "2026-08-22",
    title: "22 August 2026",
    blocks: [
      {
        kind: "p",
        text: "We got two Tests in before 10am, which still sounds made up until you open the matches.",
      },
      {
        kind: "p",
        text: "It was last man stands, six a side, one person batting for both teams because we were short. A guest played both. A junior played the first Test and not the second. None of that is unusual for us. What was unusual was the shape of the morning.",
      },
      {
        kind: "card",
        heading: "Test 1 · 8:11 to 8:52",
        rows: [
          { label: "Batting first", value: "148/6 off 141 balls" },
          { label: "The other side", value: "28 all out, then 35 all out" },
          { label: "Result", value: "Won by an innings and 85" },
        ],
        facts: "10 sixes · 4 catch-drops · follow-on twice. A full Test in about 40 minutes.",
      },
      {
        kind: "p",
        text: "The first Test started at 8:11. It was still not close. We finished at 8:52.",
      },
      {
        kind: "card",
        heading: "Test 2 · 9:15 to 9:46",
        rows: [
          { label: "Batting first", value: "176/4 off 149 balls" },
          { label: "The other side", value: "37/5, then 35/5" },
          { label: "Result", value: "Won by an innings and 104" },
        ],
        facts: "16 fours, 10 sixes · 10 catch-drops in this Test · 14 across the two.",
      },
      {
        kind: "p",
        text: "We started the second at 9:15 because stopping felt stranger than continuing. The fielding side was already doing maths they did not want to do. Then they put down 10 catches in that one Test. I remember the laughing more than any single drop. It stopped being embarrassing and became the mood of the innings. The score did not join in. Done by 9:46.",
      },
      {
        kind: "p",
        text: "So the book for that morning holds two innings defeats, 14 catch-drops, two follow-ons, a guest who still has a score against his name, and a junior who has one Test and not the other. The series sits 3-1. We had said five Tests. Nobody has declared a winner in the app. I like that we have not. The table can wait. The matches are already there.",
      },
      {
        kind: "p",
        text: "If you open them later, the drops are still on the balls they belonged to. 148, then 28 and 35. Then 176, then 37 and 35. That is the morning, without the group chat making it larger or smaller.",
      },
    ],
  },
  {
    slug: "2026-08-16",
    date: "2026-08-16",
    title: "16 August 2026",
    blocks: [
      {
        kind: "p",
        text: "Four a side, one person on both teams. The Test was a hitting match in the old sense. You could have gone home happy with that and nobody would have blamed you.",
      },
      {
        kind: "card",
        heading: "Test · Team Saral vs Team Amarnath",
        rows: [
          { label: "Team Saral", value: "142 and 123" },
          { label: "Team Amarnath", value: "84 and 46" },
          { label: "Result", value: "Team Saral won by 135 runs" },
        ],
        potm: "Player of the Match: Saral — 114 runs, 2 wickets, 3 catches.",
        facts: "Next was Sheen, 112 runs. 26 sixes, 26 fours. Highest innings 142.",
      },
      { kind: "p", text: "We marked seven overs anyway." },
      {
        kind: "card",
        heading: "7-over",
        rows: [
          { label: "Team Amarnath", value: "48 without loss" },
          { label: "Team Saral", value: "12/4 in 16 balls" },
          { label: "Result", value: "Team Amarnath won by 36 runs" },
        ],
        potm: "Player of the Match: Amarnath — 6 runs, 4 wickets, 2 catches.",
        facts: "The bowling did the whole job. Shivam made 24. Lowest total of the morning: 12/4. The side that had just made 142 and 123 lasted 16 balls.",
      },
      {
        kind: "p",
        text: "I think about this morning more than the innings wins, because it is the one that is easiest to misremember. The 135 wants to be the story. The 12 is the one people will still mention in a year, usually while looking at the person who was batting. Both matches are on the same day in the app. If you only keep the Test, you are editing.",
      },
    ],
  },
  {
    slug: "2026-08-09",
    date: "2026-08-09",
    title: "9 August 2026",
    blocks: [
      {
        kind: "p",
        text: "Three a side, no common player. There is nowhere to hide, which is either the joy or the problem depending on how you batted.",
      },
      {
        kind: "card",
        heading: "Test 1 · Team Amarnath vs Team Naman",
        rows: [
          { label: "Team Amarnath", value: "32 and 52" },
          { label: "Team Naman", value: "20 and 11" },
          { label: "Result", value: "Team Amarnath won by 53" },
        ],
        potm: "Player of the Match: Amarnath — 35 runs, 2 wickets, 2 catches.",
        facts: "The last pair of the chasing side lasted 11 balls.",
      },
      {
        kind: "card",
        heading: "Test 2",
        rows: [
          { label: "Team Naman", value: "68" },
          { label: "Team Amarnath", value: "18 and 29" },
          { label: "Result", value: "Team Naman won by an innings and 21" },
        ],
        potm: "Player of the Match: Naman — 51 runs, 2 wickets, 1 catch.",
        facts: "1 six in the whole match. Slow cricket, stubborn cricket, the kind where a single is an event.",
      },
      {
        kind: "card",
        heading: "6-over",
        rows: [
          { label: "Team Naman", value: "57/2" },
          { label: "Team Amarnath", value: "61 without loss" },
          { label: "Result", value: "Team Amarnath won by 3 wickets" },
        ],
        potm: "Player of the Match: Sheen — 26 runs, 1 wicket.",
        facts: "Naman made 44.",
      },
      {
        kind: "p",
        text: "Grind, then a walk, same people, same hour of the morning. Home shows three cards. I come back to the order of them more than to any one score. You can feel the day turning.",
      },
    ],
  },
  {
    slug: "2026-08-08",
    date: "2026-08-08",
    title: "8 August 2026",
    blocks: [
      {
        kind: "p",
        text: "Five a side, juniors playing, one common player.",
      },
      {
        kind: "card",
        heading: "Test 1 · Team Naman vs Team Saral",
        rows: [
          { label: "Team Saral", value: "29 and 90" },
          { label: "Team Naman", value: "90 and 33 without loss" },
          { label: "Result", value: "Team Naman won by 5 wickets, 15 balls left" },
        ],
        potm: "Player of the Match: Naman — 61 runs, 5 wickets, 1 catch.",
        facts: "Last man never had to go out.",
      },
      {
        kind: "card",
        heading: "Test 2",
        rows: [
          { label: "Team Naman", value: "11 all out, then 9 all out" },
          { label: "Team Saral", value: "55" },
          { label: "Result", value: "Team Saral won by an innings and 35" },
        ],
        potm: "Player of the Match: Saral — 22 runs, 3 wickets, 3 catches.",
        facts: "0 sixes. 4 fours in the whole match. If you were batting, you remember 9 longer than you remember 55.",
      },
      {
        kind: "card",
        heading: "9-over",
        rows: [
          { label: "Team Naman", value: "94/2" },
          { label: "Team Saral", value: "86/4" },
          { label: "Result", value: "Team Naman won by 8 runs" },
        ],
        potm: "Player of the Match: Saral — 38 runs, 1 wicket, 1 catch.",
      },
      {
        kind: "p",
        text: "We still played 9 overs after that. I am glad we did. After a collapse, a close limited game is how the morning gets its dignity back. You bowl properly again. You bat as if the last Test happened to someone else.",
      },
      {
        kind: "p",
        text: "On Home that day is three cards in a row. The chase, the collapse, the eight-run game. I like that they sit together. You do not have to choose which version of the morning you were in.",
      },
    ],
  },
  {
    slug: "2026-07-26",
    date: "2026-07-26",
    title: "26 July 2026",
    blocks: [
      {
        kind: "p",
        text: "Four a side, no guests, and a lot of hitting.",
      },
      {
        kind: "card",
        heading: "Test · Team Amarnath vs Team Naman",
        rows: [
          { label: "Team Amarnath", value: "102, then 101/3" },
          { label: "Team Naman", value: "52, then 147" },
          { label: "Result", value: "Team Amarnath won by 1 wicket" },
        ],
        potm: "Player of the Match: Krishna — 146 runs, 1 wicket.",
        facts: "Shivam was next, 78 runs and 4 wickets. Turning point: the 147. Last man stands, 101 to get. 23 sixes in the Test.",
      },
      {
        kind: "p",
        text: "I still think about the catch that did not stick. Catch Drop was not on the pad yet, so the moment lived only in the argument afterwards. Now you can walk the balls and at least agree what was bowled, who was in, when the lead changed. You cannot put the catch back in the hand. You can stop the score from drifting.",
      },
      {
        kind: "card",
        heading: "8-over",
        rows: [
          { label: "Team Amarnath", value: "91/2" },
          { label: "Team Naman", value: "86 without loss" },
          { label: "Result", value: "Team Amarnath won by 5 runs" },
        ],
        potm: "Player of the Match: Sheen — 44 runs.",
        facts: "11 more sixes.",
      },
      {
        kind: "p",
        text: 'If you open Match Story, the graph of who was ahead will show the 147 and then the chase climbing. That is closer to how the morning felt than "won by one wicket," which is true and also too small.',
      },
    ],
  },
  {
    slug: "2026-07-25",
    date: "2026-07-25",
    title: "25 July 2026",
    blocks: [
      {
        kind: "p",
        text: "This is the first morning we counted as a series. Six a side, one common player, a guest on both cards.",
      },
      {
        kind: "card",
        heading: "Test · Team Naman vs Team Amarnath",
        rows: [
          { label: "Team Amarnath", value: "148/6 off 150 balls, then 42" },
          { label: "Team Naman", value: "105, then 63" },
          { label: "Result", value: "Team Amarnath won by 22 runs" },
        ],
        potm: "Player of the Match: Saral — 89 runs, 3 wickets, 4 catches.",
        facts: "Amarnath was next on points with 4 wickets and 4 catches. 27 fours, 14 sixes.",
      },
      {
        kind: "p",
        text: "It was a real Test, two full turns, the kind where the second innings gets smaller and everyone can feel it. We did not declare a series winner. We thought we had more Tests in us, and we did. The table is 3-1 now. This match is still the first chapter, and it is still 22 runs, not an innings beating.",
      },
      {
        kind: "card",
        heading: "11-over",
        rows: [
          { label: "Team Naman", value: "101/1" },
          { label: "Team Amarnath", value: "104/5" },
          { label: "Result", value: "Team Amarnath won by 1 wicket" },
        ],
        potm: "Player of the Match: Naman — 12 runs, 3 wickets, 2 catches.",
        facts: "Saral made 66 in the chase. Last man in. The winning run is a ball with a timestamp.",
      },
      {
        kind: "p",
        text: "I like that more than I expected to. For years those finishes lived only in whoever was shouting loudest. This one is still in the book if you want to look at it without performing it.",
      },
    ],
  },
];

export function getMatchStory(slug: string): MatchStory | undefined {
  return MATCH_STORIES.find((story) => story.slug === slug);
}

export function storyPreview(story: MatchStory): string {
  const first = story.blocks.find((b) => b.kind === "p");
  const text = first?.kind === "p" ? first.text : "";
  const match = text.match(/^.+?[.]/);
  return (match ? match[0] : text).trim();
}
