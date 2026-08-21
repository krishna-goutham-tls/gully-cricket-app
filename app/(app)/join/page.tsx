"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useAuth } from "@/components/providers/AuthProvider";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { EmptyState } from "@/components/ui/EmptyState";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Clock } from "lucide-react";
import { Id } from "@/convex/_generated/dataModel";
import { errorMessage } from "@/lib/utils";

export default function JoinPage() {
  const { token, pendingMemberships, activeMemberships, logout } = useAuth();
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const orgs = useQuery(
    api.orgs.listDiscoverable,
    token ? { token, search: search || undefined } : "skip",
  );
  const requestJoin = useMutation(api.orgs.requestJoin);
  // Creating a community is invite-only, so the entry points below only exist
  // for a vetted organiser. The server enforces it either way.
  const allowance = useQuery(
    api.access.canCreateOrg,
    token ? { token } : "skip",
  );
  const canCreate = allowance?.allowed ?? false;

  const list = useMemo(() => orgs ?? [], [orgs]);
  const waiting = pendingMemberships.length > 0;
  const waitingOn = pendingMemberships.map((m) => m.orgName).join(", ");

  async function onRequest(orgId: Id<"orgs">) {
    if (!token) return;
    setBusyId(orgId);
    setError(null);
    try {
      await requestJoin({ token, orgId });
    } catch (e) {
      setError(errorMessage(e, "Could not request join"));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <main className="mx-auto max-w-md px-6 pb-10 pt-[calc(var(--safe-top)+1.5rem)]">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">
          {waiting ? "You’re in the queue" : "Join your group"}
        </h1>
        <p className="mt-1.5 text-sm text-muted">
          {waiting
            ? "One tap from an admin and you’re in."
            : "Pick your society or organiser. An admin approves you."}
        </p>
      </div>

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

      {waiting ? (
        <section className="mb-6 rounded-3xl border border-accent/30 bg-accent-soft p-5">
          <div className="flex items-center gap-2.5">
            <Clock className="h-5 w-5 shrink-0 text-accent-deep" />
            <p className="text-[15px] font-semibold text-accent-deep">
              Request sent to {waitingOn}
            </p>
          </div>
          <ol className="mt-3.5 space-y-3 text-sm leading-relaxed text-ink">
            {[
              "Whoever runs the group has to approve you — usually the person who organises the matches.",
              "Playing today? Give them a nudge on WhatsApp. It’s one tap at their end.",
              "Nothing else to do here — this screen opens up the moment they say yes.",
            ].map((line, i) => (
              <li key={line} className="flex gap-2.5">
                <span
                  aria-hidden
                  className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent/40 text-xs font-bold text-accent-deep"
                >
                  {i + 1}
                </span>
                <span>{line}</span>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {waiting ? (
        <p className="mb-3 text-sm font-semibold text-ink">Other groups</p>
      ) : null}

      <div className="mb-4 space-y-3">
        <Input
          placeholder="Search by name or location"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {error ? (
        <p className="mb-3 rounded-2xl border border-danger/20 bg-danger-soft px-4 py-2.5 text-sm text-danger">
          {error}
        </p>
      ) : null}

      <div className="space-y-3">
        {orgs === undefined ? (
          <div className="space-y-3">
            {[0, 1].map((i) => (
              <div key={i} className="h-20 animate-pulse rounded-3xl bg-line/60" />
            ))}
          </div>
        ) : list.length === 0 ? (
          <EmptyState
            title="No communities found"
            body={
              search.trim()
                ? "Nothing matches that name. Try just the first word — or ask your organiser for the exact one."
                : canCreate
                  ? "Nothing listed yet. Create yours and share the app link with the players you turn up with."
                  : "Ask whoever organises your matches to add you. If that's you, register your community at gullycricket.space."
            }
            action={
              canCreate ? (
                <Button onClick={() => router.push("/org/new")}>
                  Create your community
                </Button>
              ) : undefined
            }
          />
        ) : (
          list.map((org) => (
            <div
              key={org._id}
              className="flex items-center justify-between gap-3 rounded-3xl border border-line bg-surface p-4"
            >
              <div className="min-w-0 flex-1">
                <h2 className="truncate text-[15px] font-semibold text-ink">
                  {org.name}
                </h2>
                {org.location ? (
                  <p className="mt-0.5 truncate text-sm text-muted">{org.location}</p>
                ) : null}
              </div>
              {org.membershipStatus === "active" ? (
                <Button
                  variant="secondary"
                  className="shrink-0"
                  onClick={() => router.push("/home")}
                >
                  Open
                </Button>
              ) : org.membershipStatus === "pending" ? (
                <span className="shrink-0 rounded-full border border-accent/30 bg-accent-soft px-3 py-1.5 text-xs font-semibold text-accent-deep">
                  Waiting
                </span>
              ) : (
                <Button
                  className="shrink-0"
                  disabled={busyId === org._id}
                  onClick={() => void onRequest(org._id)}
                >
                  {busyId === org._id ? "…" : "Join"}
                </Button>
              )}
            </div>
          ))
        )}
      </div>

      <div className="mt-6 flex flex-col items-center">
        {canCreate ? (
          <Link
            href="/org/new"
            className="flex min-h-11 items-center text-sm font-semibold text-accent-deep underline-offset-4 hover:underline"
          >
            Create your community
          </Link>
        ) : null}
        <button
          type="button"
          onClick={() => void logout().then(() => router.replace("/login"))}
          className="min-h-11 px-4 text-sm text-muted underline-offset-4 hover:underline"
        >
          Sign out
        </button>
      </div>
    </main>
  );
}
