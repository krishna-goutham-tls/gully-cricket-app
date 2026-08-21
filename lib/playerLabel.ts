export const PLAYER_TAGS = ["visitor", "junior"] as const;
export type PlayerTag = (typeof PLAYER_TAGS)[number];

export const PLAYER_TAG_COPY: Record<PlayerTag, string> = {
  visitor: "Visitor",
  junior: "Junior",
};
