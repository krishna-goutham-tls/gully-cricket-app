"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useAuth } from "@/components/providers/AuthProvider";
import { PinPad } from "@/components/ui/PinPad";
import { Logo } from "@/components/ui/Logo";
import { errorMessage } from "@/lib/utils";
import { useRouter } from "next/navigation";

/**
 * Forced PIN change after an admin-approved reset. The temp PIN the admin
 * handed over is single-use — this is where the player replaces it.
 */
export default function SetPinPage() {
  const { token, user } = useAuth();
  const changePin = useMutation(api.auth.changePin);
  const router = useRouter();

  const [pin, setPin] = useState("");
  const [confirm, setConfirm] = useState("");
  const [stage, setStage] = useState<"new" | "confirm">("new");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(finalPin: string) {
    if (!token) return;
    setBusy(true);
    setError(null);
    try {
      await changePin({ token, newPin: finalPin });
      router.replace("/home");
    } catch (e) {
      setError(errorMessage(e, "Could not set your PIN"));
      setStage("new");
      setPin("");
      setConfirm("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-dvh flex-col justify-center px-5 pb-[calc(2.5rem+env(safe-area-inset-bottom))] pt-[calc(var(--safe-top)+2rem)]">
      <div className="mb-8 flex flex-col items-center text-center">
        <Logo size={56} className="shadow-lift" />
        <h1 className="mt-5 text-2xl font-semibold tracking-tight text-ink">
          Set a new PIN
        </h1>
        <p className="mt-2 max-w-[18rem] text-[15px] leading-relaxed text-muted">
          {user?.displayName ? `${user.displayName}, your` : "Your"} PIN was
          reset. Pick a new 4-digit PIN only you know.
        </p>
      </div>

      <div className="rounded-2xl border border-line bg-surface p-6 shadow-card">
        <p className="mb-5 text-center text-[15px] font-semibold text-ink">
          {stage === "new" ? "New PIN" : "Confirm PIN"}
        </p>
        <PinPad
          value={stage === "new" ? pin : confirm}
          disabled={busy}
          onChange={(next) => {
            if (stage === "new") {
              setPin(next);
              if (next.length === 4) {
                setConfirm("");
                setStage("confirm");
              }
              return;
            }
            setConfirm(next);
            if (next.length === 4) {
              if (next !== pin) {
                setError("PINs don’t match — start again");
                setPin("");
                setConfirm("");
                setStage("new");
                return;
              }
              void submit(next);
            }
          }}
        />
        {error ? (
          <p className="mt-4 rounded-2xl border border-danger/20 bg-danger-soft px-4 py-2.5 text-center text-[13px] text-danger">
            {error}
          </p>
        ) : null}
      </div>
    </main>
  );
}
