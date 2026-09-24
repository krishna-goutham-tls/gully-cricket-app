"use client";

import { AnswerBar, PollNames, type PollRow } from "@/components/poll/PollParts";
import { useAuth } from "@/components/providers/AuthProvider";
import { ShareLinkButton } from "@/components/share/ShareLinkButton";
import { Button } from "@/components/ui/Button";
import { pollWhen } from "@/lib/polls";
import { publicPollUrl } from "@/lib/share";
import { ChevronRight, Play } from "lucide-react";
import Link from "next/link";

/** Four is the least the new-match flow will take ("Pick at least 4"). */
export const MIN_TO_START = 4;

export function startFromPollHref(pollId: string) {
  return `/matches/new?poll=${pollId}`;
}

/** One line for the group chat, above the link. */
export function pollShareText(poll: Pick<PollRow, "startsAt" | "groundName">) {
  return `Who's in? ${pollWhen(poll.startsAt)}${
    poll.groundName ? ` · ${poll.groundName}` : ""
  }`;
}

/**
 * Home's "Who's in?" card: when and where, one-tap answers with the counts on
 * them, the names, and — once enough are in — the way straight into a match
 * with those players already picked. Everything else (close, cancel, the
 * full list) is one tap away on the poll page.
 */
export function PollCard({
  poll,
  readOnly,
}: {
  poll: PollRow;
  readOnly?: boolean;
}) {
  const { isSandbox } = useAuth();
  const inCount = poll.counts.in;
  return (
    <section className="rounded-2xl border border-line bg-surface p-4 shadow-card">
      <div className="flex items-start gap-1">
        <Link
          href={`/polls/${poll._id}`}
          className="-ml-1 -mt-1 flex min-h-11 min-w-0 flex-1 items-start justify-between gap-2 rounded-lg px-1 pt-1 active:bg-bg"
        >
          <span className="min-w-0">
            <span className="block text-[11px] font-semibold uppercase tracking-wide text-faint">
              Who&apos;s in?
            </span>
            <span className="block text-[15px] font-semibold text-ink">
              {pollWhen(poll.startsAt)}
              {poll.groundName ? ` · ${poll.groundName}` : ""}
            </span>
            {poll.note ? (
              <span className="block truncate text-[13px] text-muted">
                {poll.note}
              </span>
            ) : null}
          </span>
          <ChevronRight className="mt-4 h-4 w-4 shrink-0 text-faint" />
        </Link>
        {/* The no-login page, for the group chat. Not for sandbox polls. */}
        {isSandbox ? null : (
          <ShareLinkButton
            url={() => publicPollUrl(poll._id)}
            text={pollShareText(poll)}
            tone="light"
            className="-mr-2 -mt-1"
          />
        )}
      </div>

      <div className="mt-3">
        <AnswerBar poll={poll} readOnly={readOnly} />
      </div>

      <div className="mt-3">
        <PollNames poll={poll} clamp />
      </div>

      {!readOnly && inCount >= MIN_TO_START ? (
        <Button
          href={startFromPollHref(poll._id)}
          variant="secondary"
          fullWidth
          className="mt-3"
        >
          <Play className="h-4 w-4 text-accent-deep" strokeWidth={2.4} />
          Start match with these {inCount}
        </Button>
      ) : null}
    </section>
  );
}
