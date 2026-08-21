"use client";

import { cn, errorMessage } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useEffect, useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { GROUP_SIZES, GROUP_TYPES } from "@/convex/lib/access";

/**
 * The register-your-community card. It writes an `accessRequests` row and
 * NOTHING else — no account, no community, no membership. Krishna vets every
 * organiser over WhatsApp before that phone number is unlocked to create one.
 *
 * The chip labels come from `convex/lib/access` because the mutation
 * validates against the same list; editing them here alone would start
 * silently dropping the answers.
 */

const STORAGE_KEY = "gully_invite_request";

function Chip({
  label,
  selected,
  onClick,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "min-h-11 rounded-2xl border px-4 text-sm font-medium transition active:scale-[0.98]",
        selected
          ? "border-accent bg-accent-soft font-semibold text-accent-deep"
          : "border-line bg-surface text-ink hover:bg-bg",
      )}
    >
      {label}
    </button>
  );
}

export function InviteForm() {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [groupType, setGroupType] = useState<string | null>(null);
  const [groupSize, setGroupSize] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submitRequest = useMutation(api.access.submitRequest);

  useEffect(() => {
    try {
      if (localStorage.getItem(STORAGE_KEY)) setSubmitted(true);
    } catch {
      // Blocked storage just means the form starts fresh.
    }
  }, []);

  async function submit() {
    const digits = phone.replace(/\D/g, "");
    if (digits.length < 10) {
      setError("A WhatsApp number is the one thing I need — 10 digits.");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      // One row per number, ever. A repeat submission comes back as
      // `alreadyRequested` rather than an error — from the organiser's side
      // "I already have your request" and "got it" are the same good news.
      await submitRequest({
        name,
        phone,
        groupType: groupType ?? undefined,
        groupSize: groupSize ?? undefined,
      });
      try {
        localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({ name, phone, groupType, groupSize }),
        );
      } catch {
        // Fine — the submitted state just won't survive a reload.
      }
      setSubmitted(true);
    } catch (e) {
      setError(errorMessage(e, "Couldn't send that — try once more?"));
      setBusy(false);
    }
  }

  if (submitted) {
    return (
      <div className="rounded-[1.75rem] bg-surface p-7 text-center shadow-lift">
        <p className="text-3xl">🏏</p>
        <p className="mt-3 text-xl font-bold text-ink">
          Thanks — I&apos;ll WhatsApp you within 24 hours.
        </p>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          Every group gets a personal hello before it gets a scorebook. That&apos;s
          the whole point.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-[1.75rem] bg-surface p-6 text-left shadow-lift sm:p-7">
      <p className="text-xl font-bold text-ink">Register your community</p>
      <p className="mt-1.5 text-sm leading-relaxed text-muted">
        For the <span className="font-semibold text-ink">organiser</span> —
        invite-only, one community at a time, over WhatsApp.
      </p>

      <div className="mt-5 space-y-4">
        <Input
          label="Your name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="The name on your WhatsApp"
        />
        <Input
          label="WhatsApp number"
          type="tel"
          inputMode="numeric"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="This is where I'll message you"
        />
        <div>
          <p className="text-[13px] font-semibold text-ink">
            What kind of community?
          </p>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {GROUP_TYPES.map((t) => (
              <Chip
                key={t}
                label={t}
                selected={groupType === t}
                onClick={() => setGroupType(t)}
              />
            ))}
          </div>
        </div>
        <div>
          <p className="text-[13px] font-semibold text-ink">
            How many players?
          </p>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {GROUP_SIZES.map((s) => (
              <Chip
                key={s}
                label={s}
                selected={groupSize === s}
                onClick={() => setGroupSize(s)}
              />
            ))}
          </div>
        </div>
      </div>

      {error ? (
        <p className="mt-4 rounded-2xl border border-danger/20 bg-danger-soft px-4 py-2.5 text-sm text-danger">
          {error}
        </p>
      ) : null}

      <Button
        type="button"
        fullWidth
        size="lg"
        disabled={busy}
        onClick={() => void submit()}
        className="mt-5"
      >
        {busy ? "Sending…" : "Register your community"}
      </Button>
    </div>
  );
}
