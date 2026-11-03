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
 * Anyone signed in may create a community, up to the cap in convex/access.ts.
 * The server is the real gate (`orgs.create`); this screen just avoids a form
 * that would only fail on submit.
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
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onCreate() {
    if (!token) return;
    setBusy(true);
    setError(null);
    try {
      const res = await createOrg({ token, name });
      setActiveOrgId(res.orgId);
      await selectOrg(res.orgId);
      // Getting players in is the first job, so Home opens the invite sheet.
      router.replace("/home?invite=1");
    } catch (e) {
      setError(errorMessage(e, "Could not create community"));
      setBusy(false);
    }
  }

  if (allowance === undefined) {
    return (
      <main className="mx-auto max-w-md px-5 pb-[calc(2.5rem+env(safe-area-inset-bottom))] pt-[calc(var(--safe-top)+1.5rem)]">
        <div className="h-40 animate-pulse rounded-2xl bg-line/60" />
      </main>
    );
  }

  if (!allowance.allowed) {
    const copy = {
      title: "You have 3 communities",
      body: "That is the most one person can make.",
    };

    return (
      <main className="mx-auto max-w-md px-5 pb-[calc(2.5rem+env(safe-area-inset-bottom))] pt-[calc(var(--safe-top)+1.5rem)]">
        <div className="rounded-2xl border border-line bg-surface p-6 text-center">
          <p className="text-3xl">🏏</p>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight text-ink">
            {copy.title}
          </h1>
          <p className="mt-2 text-[13px] leading-relaxed text-muted">{copy.body}</p>
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
    <main className="mx-auto max-w-md px-5 pb-[calc(2.5rem+env(safe-area-inset-bottom))] pt-[calc(var(--safe-top)+1.5rem)]">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">
          Create your community
        </h1>
        <p className="mt-1.5 text-[13px] text-muted">
          You become admin. Invite players with a link.
        </p>
      </div>

      <div className="space-y-4 rounded-2xl border border-line bg-surface p-5">
        <Input
          label="Community name"
          placeholder="Green Valley Society"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        {error ? <p className="text-[13px] text-danger">{error}</p> : null}
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
