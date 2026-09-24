"use client";

import {
  MIN_TO_START,
  pollShareText,
  startFromPollHref,
} from "@/components/poll/PollCard";
import { AnswerBar, PollNames } from "@/components/poll/PollParts";
import { useAuth } from "@/components/providers/AuthProvider";
import { ShareLinkButton } from "@/components/share/ShareLinkButton";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { pollWhen } from "@/lib/polls";
import { publicPollUrl } from "@/lib/share";
import { errorMessage } from "@/lib/utils";
import { useMutation, useQuery } from "convex/react";
import { ArrowLeft, Play } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";

const STATUS_LABEL = {
  open: "Open",
  closed: "Closed",
  cancelled: "Called off",
} as const;

/**
 * One poll, whole: when and where, every answer, and — for whoever asked and
 * the admins — close, call off or reopen. Kept at a stable /polls/[id] so a
 * shared link can land here.
 */
export default function PollPage() {
  const params = useParams();
  const pollId = params.id as Id<"polls">;
  const { token, isObserver, isSandbox } = useAuth();
  const poll = useQuery(api.polls.get, token ? { token, pollId } : "skip");
  const setStatus = useMutation(api.polls.setStatus);
  const [confirm, setConfirm] = useState<"closed" | "cancelled" | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function changeStatus(status: "open" | "closed" | "cancelled") {
    if (!token) return;
    setBusy(true);
    setError(null);
    try {
      await setStatus({ token, pollId, status });
      setConfirm(null);
    } catch (e) {
      setError(errorMessage(e, "Could not change the poll"));
      setConfirm(null);
    } finally {
      setBusy(false);
    }
  }

  const open = poll?.status === "open";
  const dayAhead = !!poll && poll.closesAt > Date.now();
  const canReopen = !!poll && !open && !poll.matchId && dayAhead;
  // Closing the poll is how an organiser settles the list — starting the
  // match from it still works until the day is gone. Called off is final.
  const canStart =
    !!poll && !isObserver && dayAhead && poll.status !== "cancelled";

  return (
    <div className="bg-bg pb-6">
      <header className="sticky top-0 z-30 border-b border-line bg-bg/90 px-5 pb-3 pt-[calc(var(--safe-top)+0.75rem)] backdrop-blur-md">
        <div className="mx-auto flex max-w-md items-center gap-1">
          <Link
            href="/home"
            aria-label="Back to home"
            className="-ml-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-muted active:bg-line/60"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-semibold leading-tight tracking-tight text-ink">
              Who&apos;s in?
            </h1>
            {poll ? (
              <p className="text-[13px] font-semibold text-muted">
                {STATUS_LABEL[poll.status]}
              </p>
            ) : null}
          </div>
          {poll && !isSandbox ? (
            <ShareLinkButton
              url={() => publicPollUrl(poll._id)}
              text={pollShareText(poll)}
              tone="light"
              className="-mr-2"
            />
          ) : null}
        </div>
      </header>

      <main className="mx-auto max-w-md space-y-3 px-5 py-5">
        {poll === undefined ? (
          <div className="h-48 animate-pulse rounded-2xl bg-line" />
        ) : poll === null ? (
          <EmptyState
            title="Poll not found"
            body="It may belong to another community."
          />
        ) : (
          <>
            <section className="rounded-2xl border border-line bg-surface p-4 shadow-card">
              <p className="text-2xl font-semibold tracking-tight text-ink">
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

              <div className="mt-4">
                <AnswerBar poll={poll} readOnly={isObserver || !open} />
              </div>
              <div className="mt-4">
                <PollNames poll={poll} />
              </div>
            </section>

            {poll.matchId ? (
              <Button href={`/matches/${poll.matchId}`} variant="secondary" fullWidth>
                Open the match
              </Button>
            ) : canStart && poll.counts.in >= MIN_TO_START ? (
              <Button href={startFromPollHref(poll._id)} fullWidth size="lg">
                <Play className="h-4 w-4" strokeWidth={2.4} />
                Start match with these {poll.counts.in}
              </Button>
            ) : null}

            {error ? <p className="text-[13px] text-danger">{error}</p> : null}

            {poll.canManage && open ? (
              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant="secondary"
                  disabled={busy}
                  onClick={() => setConfirm("closed")}
                >
                  Close poll
                </Button>
                <Button
                  variant="danger"
                  disabled={busy}
                  onClick={() => setConfirm("cancelled")}
                >
                  Call it off
                </Button>
              </div>
            ) : null}
            {poll.canManage && canReopen ? (
              <Button
                variant="ghost"
                fullWidth
                disabled={busy}
                onClick={() => void changeStatus("open")}
              >
                Reopen
              </Button>
            ) : null}
          </>
        )}
      </main>

      <ConfirmDialog
        open={confirm !== null}
        title={confirm === "cancelled" ? "Call off this game?" : "Close this poll?"}
        description={
          confirm === "cancelled"
            ? "It comes off Home and nobody can answer."
            : "Answers stop. It comes off Home."
        }
        confirmLabel={confirm === "cancelled" ? "Call it off" : "Close"}
        danger={confirm === "cancelled"}
        busy={busy}
        onConfirm={() => confirm && void changeStatus(confirm)}
        onCancel={() => setConfirm(null)}
      />
    </div>
  );
}
