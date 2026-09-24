"use client";

import { PollNames } from "@/components/poll/PollParts";
import { useAuth } from "@/components/providers/AuthProvider";
import { PublicFooter, PublicMark } from "@/components/public/PublicChrome";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { api } from "@/convex/_generated/api";
import { pollWhen } from "@/lib/polls";
import { cn } from "@/lib/utils";
import { useQuery } from "convex/react";

const STATUS_LABEL = {
  open: "Open",
  closed: "Closed",
  cancelled: "Called off",
} as const;

const ANSWERS = [
  { id: "in", label: "In" },
  { id: "maybe", label: "Maybe" },
  { id: "out", label: "Out" },
] as const;

/**
 * "Who's in?" for anyone with the link: when, where, the counts and the
 * names, live. Nothing to tap but the way into the app to answer.
 */
export function PublicPollView({ pollId }: { pollId: string }) {
  const { token } = useAuth();
  const poll = useQuery(api.publicView.poll, { pollId });

  return (
    <div className="min-h-dvh bg-bg">
      <header className="border-b border-line px-5 pb-3 pt-[calc(var(--safe-top)+0.75rem)]">
        <div className="mx-auto flex max-w-md items-center justify-between gap-2">
          <PublicMark tone="light" />
          {poll ? (
            <span className="shrink-0 text-[13px] font-semibold text-muted">
              {STATUS_LABEL[poll.status]}
            </span>
          ) : null}
        </div>
      </header>

      <main className="mx-auto max-w-md space-y-5 px-5 pb-[calc(2rem+env(safe-area-inset-bottom))] pt-5">
        {poll === undefined ? (
          <div className="h-48 animate-pulse rounded-2xl bg-line" />
        ) : poll === null ? (
          <EmptyState
            title="Poll not found"
            body="The link may be cut short, or the poll was deleted."
          />
        ) : (
          <>
            <section className="rounded-2xl border border-line bg-surface p-4 shadow-card">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-faint">
                Who&apos;s in?
              </p>
              <p className="mt-1 text-2xl font-semibold tracking-tight text-ink">
                {pollWhen(poll.startsAt)}
              </p>
              <p className="mt-0.5 text-[13px] text-muted">
                {[poll.groundName, `asked by ${poll.createdByName}`]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
              {poll.note ? (
                <p className="mt-2 text-[15px] leading-relaxed text-ink">
                  {poll.note}
                </p>
              ) : null}

              {/* Counts only — the same three as the app, but not buttons. */}
              <div className="mt-4 grid grid-cols-3 gap-2">
                {ANSWERS.map((a) => (
                  <div
                    key={a.id}
                    className={cn(
                      "flex min-h-12 items-center justify-center gap-1.5 rounded-xl border text-[15px] font-semibold",
                      a.id === "in"
                        ? "border-ink bg-ink text-bg"
                        : "border-line bg-surface text-ink",
                    )}
                  >
                    {a.label}
                    <span
                      className={cn(
                        "tabular text-[13px]",
                        a.id === "in" ? "text-bg/70" : "text-muted",
                      )}
                    >
                      {poll.counts[a.id]}
                    </span>
                  </div>
                ))}
              </div>
              <div className="mt-4">
                <PollNames poll={poll} />
              </div>
            </section>

            {poll.matchId ? (
              <Button href={`/m/${poll.matchId}`} variant="secondary" fullWidth>
                Follow the match
              </Button>
            ) : null}

            <PublicFooter
              signedIn={!!token}
              appHref={`/polls/${poll._id}`}
              appLabel={
                poll.status === "open"
                  ? "Answer in Gully Cricket"
                  : "Open in Gully Cricket"
              }
            />
          </>
        )}
      </main>
    </div>
  );
}
