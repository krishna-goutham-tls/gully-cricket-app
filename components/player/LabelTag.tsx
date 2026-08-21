"use client";

import {
  PLAYER_TAG_COPY,
  PLAYER_TAGS,
  type PlayerTag,
} from "@/lib/playerLabel";
import { cn } from "@/lib/utils";

function Chip({
  tag,
  on,
  interactive,
  disabled,
  onClick,
  tone = "light",
}: {
  tag: PlayerTag;
  on: boolean;
  interactive?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  tone?: "light" | "dark";
}) {
  const label = PLAYER_TAG_COPY[tag];
  const dark = tone === "dark";
  // Slack-like: small type, slight rounding, solid fill when on.
  const className = cn(
    "shrink-0 rounded-[4px] px-1.5 py-0.5 text-[10px] font-semibold leading-none tracking-wide",
    interactive && "min-h-6",
    dark
      ? on
        ? "bg-bg text-ink"
        : "bg-white/15 text-bg/55"
      : on
        ? "bg-ink text-bg"
        : "bg-line text-muted",
  );
  if (!interactive) {
    return <span className={className}>{label}</span>;
  }
  return (
    <button
      type="button"
      aria-pressed={on}
      disabled={disabled}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onClick?.();
      }}
      className={cn(className, "active:opacity-80 disabled:opacity-50")}
    >
      {label}
    </button>
  );
}

/** Active tags only — for non-admins and the leaderboard. */
export function PlayerTagList({
  tags,
  tone = "light",
}: {
  tags: PlayerTag[];
  tone?: "light" | "dark";
}) {
  if (tags.length === 0) return null;
  return (
    <span className="flex shrink-0 flex-wrap items-center gap-1">
      {tags.map((tag) => (
        <Chip key={tag} tag={tag} on tone={tone} />
      ))}
    </span>
  );
}

/**
 * Admin editor: both tags always visible so you can stack Visitor + Junior.
 * Off is a grey rectangle; on is ink. Tap to toggle.
 */
export function PlayerTagEditor({
  tags,
  busy,
  onToggle,
  tone = "light",
}: {
  tags: PlayerTag[];
  busy?: boolean;
  onToggle: (tag: PlayerTag) => void;
  tone?: "light" | "dark";
}) {
  return (
    <span className="flex shrink-0 flex-wrap items-center gap-1">
      {PLAYER_TAGS.map((tag) => (
        <Chip
          key={tag}
          tag={tag}
          on={tags.includes(tag)}
          interactive
          disabled={busy}
          tone={tone}
          onClick={() => onToggle(tag)}
        />
      ))}
    </span>
  );
}
