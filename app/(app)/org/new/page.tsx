"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useAuth } from "@/components/providers/AuthProvider";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useRouter } from "next/navigation";
import { setActiveOrgId } from "@/lib/session";
import { errorMessage } from "@/lib/utils";

/**
 * Creating a community is invite-only. The server is the real gate
 * (`orgs.create` → `requireCreateOrgAllowance`); this screen just avoids
 * showing a form that would only fail on submit. Both read the same row, so
 * they cannot disagree.
 */
export default function NewOrgPage() {
  const { token, selectOrg } = useAuth();
  const createOrg = useMutation(api.orgs.create);
  const allowance = useQuery(
    api.access.canCreateOrg,
    token ? { token } : "skip",
  );
  const router = useRouter();
  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onCreate() {
    if (!token) return;
    setBusy(true);
    setError(null);
    try {
      const res = await createOrg({
        token,
        name,
        location: location || undefined,
      });
      setActiveOrgId(res.orgId);
      await selectOrg(res.orgId);
      router.replace("/home");
    } catch (e) {
      setError(errorMessage(e, "Could not create community"));
      setBusy(false);
    }
  }

  if (allowance === undefined) {
    return (
      <main className="mx-auto max-w-md px-6 pt-[calc(var(--safe-top)+1.5rem)]">
        <div className="h-40 animate-pulse rounded-3xl bg-line/60" />
      </main>
    );
  }

  if (!allowance.allowed) {
    const copy =
      allowance.reason === "pending"
        ? {
            title: "You're in the queue",
            body: "Your request is in. I'll WhatsApp you to say hello, and your community opens up right after.",
          }
        : allowance.reason === "already-used"
          ? {
              title: "You've already got one",
              body: "That number has a community against it. One per organiser — open it from the list, or ask me if something's gone wrong.",
            }
          : {
              title: "Communities are invite-only",
              body: "Register yours at gullycricket.space and I'll WhatsApp you within a day. Every community gets a personal hello before it gets a scorebook.",
            };

    return (
      <main className="mx-auto max-w-md px-6 pb-10 pt-[calc(var(--safe-top)+1.5rem)]">
        <div className="rounded-3xl border border-line bg-surface p-6 text-center">
          <p className="text-3xl">🏏</p>
          <h1 className="mt-3 text-xl font-semibold tracking-tight text-ink">
            {copy.title}
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-muted">{copy.body}</p>
          <Button
            variant="secondary"
            fullWidth
            className="mt-5"
            onClick={() => router.replace("/join")}
          >
            Back
          </Button>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-md px-6 pb-10 pt-[calc(var(--safe-top)+1.5rem)]">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">
          Create your community
        </h1>
        <p className="mt-1.5 text-sm text-muted">
          You become admin. Players sign up and you approve them.
        </p>
      </div>

      <div className="space-y-4 rounded-3xl border border-line bg-surface p-5">
        <Input
          label="Community name"
          placeholder="Green Valley Society"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <Input
          label="Location"
          placeholder="Optional"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
        />
        {error ? <p className="text-sm text-danger">{error}</p> : null}
        <Button
          fullWidth
          disabled={busy || name.trim().length < 2}
          onClick={() => void onCreate()}
        >
          {busy ? "Creating…" : "Create & continue"}
        </Button>
        <Button variant="ghost" fullWidth onClick={() => router.back()}>
          Back
        </Button>
      </div>
    </main>
  );
}
