"use client";

import { useEffect, useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useAuth } from "@/components/providers/AuthProvider";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { PinPad } from "@/components/ui/PinPad";
import { Logo } from "@/components/ui/Logo";
import { getLastPhone, setLastPhone } from "@/lib/session";
import { errorMessage, sanitizePhoneInput } from "@/lib/utils";
import { useRouter } from "next/navigation";

type Step =
  | "phone"
  | "signin-pin"
  | "no-account"
  | "forgot"
  | "signup-name"
  | "signup-pin"
  | "signup-pin-confirm";

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
  const [confirmPin, setConfirmPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [wrongPin, setWrongPin] = useState(false);
  const [resetSent, setResetSent] = useState<string | null>(null);
  // The number that just failed "no account" — until the digits actually
  // change, "Try this number" would only replay the same failed sign-in.
  const [failedPhone, setFailedPhone] = useState("");

  // Storage loss shouldn't cost a phone number as well as a PIN — if a sign-in
  // is forced, prefill the number they used last so it's four taps, not typing.
  useEffect(() => {
    const last = getLastPhone();
    if (last) setPhone(last);
  }, []);

  async function continueFromPhone() {
    setError(null);
    if (phone.trim().length < 10) {
      setError("Enter a valid phone number");
      return;
    }
    setStep("signin-pin");
    setPin("");
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
        // Never slide straight into sign-up: one mistyped digit looks
        // identical to a new player, and continuing makes a duplicate account.
        setStep("no-account");
        setFailedPhone(phone);
        setPin("");
        setError(null);
      } else if (lower.includes("guest")) {
        setNotice(
          "This number was added as a guest player. Set your name and PIN to claim your stats.",
        );
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
        setError(
          msg.toLowerCase().includes("didn't match")
            ? "Looks like you already have an account. Enter your real PIN here."
            : "Looks like you already have an account — enter your PIN.",
        );
        setStep("signin-pin");
        setPin("");
      } else {
        setError(msg);
        setConfirmPin("");
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
          Score gully cricket ball by ball. Phone + 4-digit PIN, no SMS.
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
            <Button fullWidth disabled={busy} onClick={continueFromPhone}>
              Continue
            </Button>
            <button
              type="button"
              className="flex min-h-11 w-full items-center justify-center text-[13px] font-medium text-muted underline-offset-4 hover:text-ink hover:underline"
              onClick={() => setStep("signup-name")}
            >
              New here? Create account
            </button>
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

        {step === "no-account" ? (
          <div className="space-y-5">
            <div className="text-center">
              <p className="text-[15px] font-semibold text-ink">
                No account on this number
              </p>
              <p className="mt-2 text-[13px] leading-relaxed text-muted">
                We couldn’t find anyone signed up as{" "}
                <span className="font-medium text-ink">{phone}</span>. If you’ve
                played before, one digit is probably off — fix it and try again.
              </p>
            </div>
            <Input
              label="Phone number"
              inputMode="tel"
              autoComplete="tel"
              placeholder="98765 43210"
              value={phone}
              autoFocus
              onChange={(e) => setPhone(sanitizePhoneInput(e.target.value))}
              onPaste={(e) => {
                e.preventDefault();
                const text = e.clipboardData.getData("text");
                setPhone(sanitizePhoneInput(text));
              }}
            />
            <Button
              fullWidth
              disabled={busy || phone.trim().length < 10 || phone === failedPhone}
              onClick={() => {
                setError(null);
                setPin("");
                setStep("signin-pin");
              }}
            >
              Try this number
            </Button>
            <button
              type="button"
              className="flex min-h-11 w-full items-center justify-center text-[13px] font-medium text-muted underline-offset-4 hover:text-ink hover:underline"
              onClick={() => {
                setError(null);
                setStep("signup-name");
              }}
            >
              I’m new — create an account
            </button>
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
                  <p className="mt-2 text-[13px] leading-relaxed text-muted">
                    An admin of{" "}
                    <span className="font-medium text-ink">{resetSent}</span>{" "}
                    will reset your PIN and give you a temporary one. Sign in
                    with that, then pick your own PIN.
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
                    Reset your PIN
                  </p>
                  <p className="mt-2 text-[13px] leading-relaxed text-muted">
                    We’ll ask an admin of your community to reset it. They’ll hand
                    you a temporary PIN — no SMS involved.
                  </p>
                  <p className="mt-2 text-[13px] text-muted">{phone}</p>
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
              <p className="text-[15px] font-semibold text-ink">Create account</p>
              {phone ? <p className="mt-0.5 text-[13px] text-muted">{phone}</p> : null}
            </div>
            {notice ? (
              <p className="rounded-2xl bg-accent-soft px-4 py-3 text-[13px] leading-relaxed text-accent-deep">
                {notice}
              </p>
            ) : null}
            {!phone ? (
              <Input
                label="Phone number"
                inputMode="tel"
                placeholder="98765 43210"
                value={phone}
                onChange={(e) => setPhone(sanitizePhoneInput(e.target.value))}
                onPaste={(e) => {
                  e.preventDefault();
                  const text = e.clipboardData.getData("text");
                  setPhone(sanitizePhoneInput(text));
                }}
              />
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
              Set PIN
            </Button>
          </div>
        ) : null}

        {step === "signup-pin" ? (
          <div className="space-y-5">
            <div className="text-center">
              <p className="text-[15px] font-semibold text-ink">Set a 4-digit PIN</p>
              <p className="mt-0.5 text-[13px] text-muted">
                You’ll use this every time. No SMS codes.
              </p>
            </div>
            <PinPad
              value={pin}
              disabled={busy}
              onChange={(next) => {
                setPin(next);
                if (next.length === 4) {
                  setConfirmPin("");
                  setStep("signup-pin-confirm");
                }
              }}
            />
          </div>
        ) : null}

        {step === "signup-pin-confirm" ? (
          <div className="space-y-5">
            <div className="text-center">
              <p className="text-[15px] font-semibold text-ink">Confirm PIN</p>
              <p className="mt-0.5 text-[13px] text-muted">
                Enter the same 4 digits again.
              </p>
            </div>
            <PinPad
              value={confirmPin}
              disabled={busy}
              onChange={(next) => {
                setConfirmPin(next);
                if (next.length === 4) {
                  if (next !== pin) {
                    setError("PINs don’t match");
                    setConfirmPin("");
                    return;
                  }
                  void doSignUp(next);
                }
              }}
            />
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
