"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useAuth } from "@/components/providers/AuthProvider";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { PinPad } from "@/components/ui/PinPad";
import { Logo } from "@/components/ui/Logo";
import { getLastPhone, setLastPhone } from "@/lib/session";
import { errorMessage, sanitizePhoneInput } from "@/lib/utils";
import { useRouter } from "next/navigation";

/**
 * One door: the phone number. The app picks the next step from it — a PIN
 * for an account, name and PIN for a player an admin added (their stats come
 * with them), name and PIN for a new number, who then lands on /join.
 */
type Step = "phone" | "signin-pin" | "forgot" | "signup-name" | "signup-pin";

export default function LoginPage() {
  const { setToken } = useAuth();
  const router = useRouter();
  const signIn = useMutation(api.auth.signIn);
  const signUp = useMutation(api.auth.signUp);
  const requestPinReset = useMutation(api.auth.requestPinReset);

  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [wrongPin, setWrongPin] = useState(false);
  const [resetSent, setResetSent] = useState<string | null>(null);
  const [lookupPhone, setLookupPhone] = useState<string | null>(null);

  const lookup = useQuery(
    api.auth.lookupPhone,
    lookupPhone ? { phone: lookupPhone } : "skip",
  );

  // Storage loss shouldn't cost a phone number as well as a PIN — if a sign-in
  // is forced, prefill the number they used last so it's four taps, not typing.
  // A ?phone= from the landing door wins over that memory.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("phone");
    if (q) {
      const cleaned = sanitizePhoneInput(q);
      setPhone(cleaned);
      if (cleaned.length >= 10) setLookupPhone(cleaned);
      return;
    }
    const last = getLastPhone();
    if (last) setPhone(last);
  }, []);

  useEffect(() => {
    if (!lookupPhone || lookup === undefined) return;
    if (lookup.status === "invalid") {
      setError("Enter a valid phone number");
      setLookupPhone(null);
      setStep("phone");
      return;
    }
    setError(null);
    setPin("");
    if (lookup.status === "hasPin") {
      setNotice(null);
      setStep("signin-pin");
    } else if (lookup.status === "guest") {
      setNotice("Added as a guest. Claim your stats below.");
      setStep("signup-name");
    } else {
      setNotice(null);
      setStep("signup-name");
    }
    setLookupPhone(null);
  }, [lookup, lookupPhone]);

  function continueFromPhone() {
    setError(null);
    if (phone.trim().length < 10) {
      setError("Enter a valid phone number");
      return;
    }
    setLookupPhone(phone);
  }

  async function doSignIn(nextPin: string) {
    if (nextPin.length !== 4) return;
    setBusy(true);
    setError(null);
    try {
      const res = await signIn({ phone, pin: nextPin });
      setLastPhone(phone);
      setToken(res.token);
      router.replace("/");
    } catch (e) {
      const msg = errorMessage(e, "Sign in failed");
      const lower = msg.toLowerCase();
      if (lower.includes("no account")) {
        setNotice(null);
        setStep("signup-name");
        setPin("");
        setError(null);
      } else if (lower.includes("guest")) {
        setNotice("Added as a guest. Claim your stats below.");
        setStep("signup-name");
        setPin("");
        setError(null);
      } else {
        setError(msg);
        setPin("");
        if (lower.includes("pin") || lower.includes("attempts")) {
          setWrongPin(true);
        }
      }
    } finally {
      setBusy(false);
    }
  }

  async function askAdminForReset() {
    setBusy(true);
    setError(null);
    try {
      const res = await requestPinReset({ phone });
      setResetSent(res.orgName);
    } catch (e) {
      setError(errorMessage(e, "Could not send the request"));
    } finally {
      setBusy(false);
    }
  }

  async function doSignUp(finalPin: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await signUp({ phone, pin: finalPin, displayName: name });
      setLastPhone(phone);
      setToken(res.token);
      router.replace("/");
    } catch (e) {
      const msg = errorMessage(e, "Sign up failed");
      if (msg.toLowerCase().includes("already registered")) {
        setNotice(null);
        setError("You already have an account. Enter your PIN.");
        setStep("signin-pin");
        setPin("");
      } else {
        setError(msg);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-dvh flex-col justify-center px-5 pb-[calc(2.5rem+env(safe-area-inset-bottom))] pt-[calc(var(--safe-top)+2rem)]">
      <div className="rise-in mb-9 flex flex-col items-center text-center">
        <Logo size={68} className="shadow-lift" />
        <h1 className="mt-5 text-2xl font-semibold leading-none tracking-tight text-ink">
          Gully Cricket
        </h1>
        <p className="mt-3 max-w-[17rem] text-[15px] leading-relaxed text-muted">
          Score gully cricket ball by ball.
        </p>
      </div>

      <div className="rise-in rounded-2xl border border-line bg-surface p-6 shadow-card">
        {step === "phone" ? (
          <div className="space-y-5">
            <Input
              label="Phone number"
              inputMode="tel"
              autoComplete="tel"
              placeholder="98765 43210"
              value={phone}
              onChange={(e) => setPhone(sanitizePhoneInput(e.target.value))}
              onPaste={(e) => {
                e.preventDefault();
                const text = e.clipboardData.getData("text");
                setPhone(sanitizePhoneInput(text));
              }}
            />
            <Button
              fullWidth
              disabled={busy || !!lookupPhone}
              onClick={continueFromPhone}
            >
              {lookupPhone ? "…" : "Continue"}
            </Button>
          </div>
        ) : null}

        {step === "signin-pin" ? (
          <div className="space-y-5">
            <div className="text-center">
              <p className="text-[15px] font-semibold text-ink">Welcome back</p>
              <p className="mt-0.5 text-[13px] text-muted">{phone}</p>
            </div>
            <PinPad
              value={pin}
              disabled={busy}
              onChange={(next) => {
                setPin(next);
                if (next.length === 4) void doSignIn(next);
              }}
            />
            <div className="space-y-2.5">
              {wrongPin ? (
                <button
                  type="button"
                  className="flex min-h-11 w-full items-center justify-center text-[13px] font-semibold text-accent-deep underline-offset-4 hover:underline"
                  onClick={() => {
                    setError(null);
                    setStep("forgot");
                  }}
                >
                  Forgot your PIN?
                </button>
              ) : null}
              <button
                type="button"
                className="flex min-h-11 w-full items-center justify-center text-[13px] text-muted underline-offset-4 hover:text-ink hover:underline"
                onClick={() => {
                  setStep("phone");
                  setPin("");
                  setWrongPin(false);
                }}
              >
                Change number
              </button>
            </div>
          </div>
        ) : null}

        {step === "forgot" ? (
          <div className="space-y-5">
            {resetSent ? (
              <>
                <div className="text-center">
                  <p className="text-[15px] font-semibold text-ink">
                    Request sent
                  </p>
                  <p className="mt-0.5 text-[13px] text-muted">
                    An admin will give you a new PIN.
                  </p>
                </div>
                <Button
                  fullWidth
                  onClick={() => {
                    setResetSent(null);
                    setWrongPin(false);
                    setPin("");
                    setStep("signin-pin");
                  }}
                >
                  Back to sign in
                </Button>
              </>
            ) : (
              <>
                <div className="text-center">
                  <p className="text-[15px] font-semibold text-ink">
                    Forgot PIN?
                  </p>
                  <p className="mt-0.5 text-[13px] text-muted">{phone}</p>
                </div>
                <Button
                  fullWidth
                  disabled={busy}
                  onClick={() => void askAdminForReset()}
                >
                  {busy ? "Sending…" : "Ask admin to reset"}
                </Button>
                <button
                  type="button"
                  className="flex min-h-11 w-full items-center justify-center text-[13px] text-muted underline-offset-4 hover:text-ink hover:underline"
                  onClick={() => {
                    setError(null);
                    setStep("signin-pin");
                    setPin("");
                  }}
                >
                  Back
                </button>
              </>
            )}
          </div>
        ) : null}

        {step === "signup-name" ? (
          <div className="space-y-5">
            <div className="text-center">
              <p className="text-[15px] font-semibold text-ink">Welcome</p>
              <p className="mt-0.5 text-[13px] text-muted">{phone}</p>
            </div>
            {notice ? (
              <p className="rounded-2xl bg-accent-soft px-4 py-3 text-[13px] leading-relaxed text-accent-deep">
                {notice}
              </p>
            ) : null}
            <Input
              label="Your name"
              placeholder="How teammates see you"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
            <Button
              fullWidth
              disabled={busy || name.trim().length < 2 || phone.trim().length < 10}
              onClick={() => {
                setPin("");
                setStep("signup-pin");
              }}
            >
              Next
            </Button>
            <button
              type="button"
              className="flex min-h-11 w-full items-center justify-center text-[13px] text-muted underline-offset-4 hover:text-ink hover:underline"
              onClick={() => {
                setNotice(null);
                setError(null);
                setName("");
                setStep("phone");
              }}
            >
              Change number
            </button>
          </div>
        ) : null}

        {step === "signup-pin" ? (
          <div className="space-y-5">
            <p className="text-center text-[15px] font-semibold text-ink">
              Set a 4-digit PIN
            </p>
            {/* The digits show, so nobody types the PIN twice. */}
            <PinPad reveal value={pin} disabled={busy} onChange={setPin} />
            <div>
              <Button
                fullWidth
                disabled={busy || pin.length !== 4}
                onClick={() => void doSignUp(pin)}
              >
                {busy ? "…" : "Continue"}
              </Button>
              <button
                type="button"
                className="mt-2 flex min-h-11 w-full items-center justify-center text-[13px] text-muted underline-offset-4 hover:text-ink hover:underline"
                onClick={() => {
                  setError(null);
                  setStep("signup-name");
                }}
              >
                Back
              </button>
            </div>
          </div>
        ) : null}

        {error ? (
          <p className="mt-4 rounded-2xl border border-danger/20 bg-danger-soft px-4 py-2.5 text-center text-[13px] text-danger">
            {error}
          </p>
        ) : null}
      </div>
    </main>
  );
}
