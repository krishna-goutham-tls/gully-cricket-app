"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useAuth } from "@/components/providers/AuthProvider";
import { Button } from "@/components/ui/Button";
import { useRouter } from "next/navigation";
import { Clock, Link2 } from "lucide-react";
import { Id } from "@/convex/_generated/dataModel";
import { cn } from "@/lib/utils";

/**
 * A signed-in person with no community lands here. Two cards: start one, or
 * get the link from the admin who already did. Nobody searches for a
 * community any more, so a mistyped name can no longer start a second one.
 */
export default function JoinPage() {
  const { token, memberships, pendingMemberships, activeMemberships, logout, selectOrg } =
    useAuth();
  const router = useRouter();
  const [askOpen, setAskOpen] = useState(false);

  // Only the platform owner gets rows back.
  const orgs = useQuery(api.orgs.listDiscoverable, token ? { token } : "skip");
  const list = orgs ?? [];
  const waitingOn = pendingMemberships.map((m) => m.orgName).join(", ");
  const closed = (memberships ?? []).filter((m) => m.status === "closed" && !m.isSandbox);

  async function onOpen(orgId: Id<"orgs">) {
    await selectOrg(orgId);
    router.push("/home");
  }

  return (
    <main className="mx-auto max-w-md px-5 pb-[calc(2.5rem+env(safe-area-inset-bottom))] pt-[calc(var(--safe-top)+1.5rem)]">
      <h1 className="mb-6 text-2xl font-semibold tracking-tight text-ink">
        Your community
      </h1>

      {activeMemberships.length > 0 ? (
        <Button
          variant="secondary"
          fullWidth
          className="mb-4"
          onClick={() => router.push("/home")}
        >
          Go to home
        </Button>
      ) : null}

      {closed.length > 0 && activeMemberships.length === 0 ? (
        <p className="mb-4 rounded-2xl border border-line bg-surface px-4 py-3 text-[13px] text-muted">
          {closed.map((m) => m.orgName).join(", ")} is closed.
        </p>
      ) : null}

      {pendingMemberships.length > 0 ? (
        <section className="mb-4 flex items-center gap-2.5 rounded-2xl border border-accent/30 bg-accent-soft px-4 py-4">
          <Clock className="h-5 w-5 shrink-0 text-accent-deep" />
          <p className="text-[15px] font-semibold text-accent-deep">
            Waiting for {waitingOn}
          </p>
        </section>
      ) : null}

      <div className="space-y-3">
        <button
          type="button"
          onClick={() => router.push("/org/new")}
          className="flex min-h-24 w-full items-center gap-4 rounded-2xl border border-line bg-surface px-5 py-5 text-left shadow-card transition active:scale-[0.98] active:bg-bg"
        >
          <span aria-hidden className="text-3xl">
            🏏
          </span>
          <span className="min-w-0">
            <span className="block text-xl font-semibold tracking-tight text-ink">
              I&apos;m the admin
            </span>
            <span className="mt-0.5 block text-[13px] text-muted">
              Create your community
            </span>
          </span>
        </button>

        <button
          type="button"
          aria-expanded={askOpen}
          onClick={() => setAskOpen((o) => !o)}
          className={cn(
            "w-full rounded-2xl border bg-surface px-5 py-5 text-left shadow-card transition active:bg-bg",
            askOpen ? "border-ink/20" : "border-line",
          )}
        >
          <span className="flex min-h-14 items-center gap-4">
            <span aria-hidden className="text-3xl">
              👥
            </span>
            <span className="min-w-0">
              <span className="block text-xl font-semibold tracking-tight text-ink">
                My team is already on Gully Cricket
              </span>
              {askOpen ? null : (
                <span className="mt-0.5 block text-[13px] text-muted">
                  Ask your admin for the community link
                </span>
              )}
            </span>
          </span>
          {askOpen ? <AskForLink /> : null}
        </button>
      </div>

      {list.length > 0 ? (
        <section className="mt-8">
          <p className="px-1 pb-1.5 text-[11px] font-semibold uppercase tracking-wide text-faint">
            All communities
          </p>
          <div className="overflow-hidden rounded-2xl border border-line bg-surface">
            {list.map((org) => (
              <button
                key={org._id}
                type="button"
                onClick={() => void onOpen(org._id)}
                className="flex min-h-12 w-full items-center justify-between gap-3 border-b border-line/60 px-4 py-3 text-left last:border-b-0 active:bg-bg"
              >
                <span className="min-w-0 truncate text-[15px] font-semibold text-ink">
                  {org.name}
                </span>
                <span className="shrink-0 text-[13px] font-semibold text-muted">Open</span>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      <div className="mt-6 flex flex-col items-center">
        <button
          type="button"
          onClick={() => void logout().then(() => router.replace("/login"))}
          className="min-h-11 px-4 text-[13px] text-muted underline-offset-4 hover:underline"
        >
          Sign out
        </button>
      </div>
    </main>
  );
}

/** The line again, with a picture of the link the admin sends on WhatsApp. */
function AskForLink() {
  return (
    <span className="mt-4 block">
      <span className="block text-[15px] font-semibold text-ink">
        Ask your admin for the community link
      </span>
      <span
        aria-hidden
        className="mt-3 flex w-fit max-w-full items-center gap-2 rounded-2xl rounded-tl-md bg-accent-soft px-4 py-3"
      >
        <Link2 className="h-4 w-4 shrink-0 text-accent-deep" />
        <span className="truncate text-[13px] font-semibold text-accent-deep underline underline-offset-4">
          gullycricket.space/i/…
        </span>
      </span>
    </span>
  );
}
