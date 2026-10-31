"use client";

import { useState } from "react";
import { useConvex, useMutation, useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { useAuth } from "@/components/providers/AuthProvider";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Logo } from "@/components/ui/Logo";
import { PinPad } from "@/components/ui/PinPad";
import { setActiveOrgId, setLastPhone } from "@/lib/session";
import { errorMessage, sanitizePhoneInput } from "@/lib/utils";

type Step = "phone" | "pin" | "name" | "isYou" | "newPin";
type Match = { userId: Id<"users">; displayName: string };

const textLink =
  "flex min-h-11 w-full items-center justify-center text-[13px] text-muted underline-offset-4 hover:text-ink hover:underline";

export function InvitePage({ code }: { code: string }) {
  const { token, user, loading, setToken, selectOrg, refreshLocalOrg } = useAuth();
  const router = useRouter();
  const convex = useConvex();
  const info = useQuery(api.orgs.inviteInfo, {
    code,
    ...(token ? { token } : {}),
  });
  const joinByInvite = useMutation(api.orgs.joinByInvite);
  const signIn = useMutation(api.auth.signIn);
  const signUp = useMutation(api.auth.signUp);

  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  const [matches, setMatches] = useState<Match[]>([]);
  const [claimUserId, setClaimUserId] = useState<Id<"users"> | null>(null);
  const [wrongPin, setWrongPin] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(fallback: string, work: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await work();
    } catch (e) {
      setError(errorMessage(e, fallback));
    } finally {
      setBusy(false);
    }
  }

  function enterApp(nextToken: string, orgId: Id<"orgs"> | undefined) {
    setLastPhone(phone);
    // A number stored from an earlier session must not outrank the new community.
    if (orgId) {
      setActiveOrgId(orgId);
      refreshLocalOrg();
    }
    setToken(nextToken);
    router.replace("/home");
  }

  const continueFromPhone = () =>
    run("Could not check that number", async () => {
      const { status } = await convex.query(api.auth.lookupPhone, { phone });
      if (status === "invalid") {
        setError("Enter a valid phone number");
      } else if (status === "hasPin") {
        setPin("");
        setStep("pin");
      } else {
        setClaimUserId(null);
        setMatches([]);
        setStep("name");
      }
    });

  const continueFromName = () =>
    run("Could not check that name", async () => {
      const { status } = await convex.query(api.auth.lookupPhone, { phone });
      const found =
        status === "unknown"
          ? await convex.query(api.orgs.inviteNameMatches, { code, name })
          : [];
      setMatches(found);
      setClaimUserId(null);
      setPin("");
      setStep(found.length > 0 ? "isYou" : "newPin");
    });

  const doSignIn = (nextPin: string) =>
    run("Sign in failed", async () => {
      try {
        const res = await signIn({ phone, pin: nextPin });
        const joined = await joinByInvite({ token: res.token, code });
        enterApp(res.token, joined.orgId);
      } catch (e) {
        setPin("");
        setWrongPin(true);
        throw e;
      }
    });

  const doSignUp = () =>
    run("Could not join", async () => {
      try {
        const res = await signUp({
          phone,
          pin,
          displayName: name,
          inviteCode: code,
          ...(claimUserId ? { claimUserId } : {}),
        });
        enterApp(res.token, res.orgId);
      } catch (e) {
        // A stale claim must not repeat on retry. Start again from the name.
        setClaimUserId(null);
        setStep("name");
        throw e;
      }
    });

  const joinSignedIn = () =>
    run("Could not join", async () => {
      const res = await joinByInvite({ token: token!, code });
      await selectOrg(res.orgId);
      router.replace("/home");
    });

  const pickMatch = (id: Id<"users"> | null) => {
    setClaimUserId(id);
    setPin("");
    setStep("newPin");
  };

  // Lookups above fall through this order: still loading, stopped link, then
  // a signed-in person, then the steps for someone with no session here.
  const signedIn = !!token && !!user;
  const heading = info?.name;

  return (
    <main className="flex min-h-dvh flex-col justify-center px-5 pb-[calc(2.5rem+env(safe-area-inset-bottom))] pt-[calc(var(--safe-top)+2rem)]">
      <div className="rise-in mx-auto w-full max-w-md">
        <div className="mb-6 flex flex-col items-center text-center">
          {/* The keypad needs the room on a small phone. */}
          {step === "pin" || step === "newPin" ? null : (
            <Logo size={52} className="shadow-lift" />
          )}
          {info === undefined || loading ? (
            <div className="mt-5 h-8 w-48 animate-pulse rounded-xl bg-line/60" />
          ) : heading ? (
            <>
              <p className="mt-5 text-[13px] font-medium text-muted">Join</p>
              <h1 className="mt-1 break-words text-[28px] font-semibold leading-tight tracking-tight text-ink">
                {heading}
              </h1>
            </>
          ) : (
            <h1 className="mt-5 text-2xl font-semibold tracking-tight text-ink">
              This link has stopped working
            </h1>
          )}
        </div>

        {info === undefined || loading ? null : !info ? (
          <p className="text-center text-[15px] text-muted">
            Ask your organiser for the new one.
          </p>
        ) : (
          <div className="rounded-2xl border border-line bg-surface p-6 shadow-card">
            {signedIn ? (
              <div className="space-y-3">
                {!info.alreadyMember ? (
                  <p className="truncate text-center text-[15px] font-semibold text-ink">
                    {user?.displayName}
                  </p>
                ) : null}
                <Button fullWidth disabled={busy} onClick={() => void joinSignedIn()}>
                  {info.alreadyMember ? "You’re in. Open" : "Join"}
                </Button>
              </div>
            ) : null}

            {!signedIn && step === "phone" ? (
              <form
                className="space-y-5"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (phone.length >= 10) void continueFromPhone();
                }}
              >
                <Input
                  label="Phone number"
                  inputMode="tel"
                  autoComplete="tel"
                  placeholder="98765 43210"
                  value={phone}
                  onChange={(e) => setPhone(sanitizePhoneInput(e.target.value))}
                />
                <Button type="submit" fullWidth disabled={busy || phone.length < 10}>
                  {busy ? "…" : "Join"}
                </Button>
              </form>
            ) : null}

            {!signedIn && step === "pin" ? (
              <div className="space-y-5">
                <div className="text-center">
                  <p className="text-[15px] font-semibold text-ink">Your PIN</p>
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
                <div>
                  {wrongPin ? (
                    <Link href={`/login?phone=${phone}`} className={textLink}>
                      Forgot your PIN?
                    </Link>
                  ) : null}
                  <button
                    type="button"
                    className={textLink}
                    onClick={() => {
                      setError(null);
                      setWrongPin(false);
                      setStep("phone");
                    }}
                  >
                    Change number
                  </button>
                </div>
              </div>
            ) : null}

            {!signedIn && step === "name" ? (
              <form
                className="space-y-5"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (name.trim().length >= 2) void continueFromName();
                }}
              >
                <Input
                  label="Your name"
                  placeholder="How teammates see you"
                  value={name}
                  maxLength={40}
                  autoFocus
                  onChange={(e) => setName(e.target.value)}
                />
                <Button
                  type="submit"
                  fullWidth
                  disabled={busy || name.trim().length < 2}
                >
                  {busy ? "…" : "Next"}
                </Button>
                <button
                  type="button"
                  className={textLink}
                  onClick={() => {
                    setError(null);
                    setStep("phone");
                  }}
                >
                  Change number
                </button>
              </form>
            ) : null}

            {!signedIn && step === "isYou" ? (
              <div className="space-y-3">
                <p className="text-center text-[13px] text-muted">Is this you?</p>
                {matches.length === 1 ? (
                  <>
                    <p className="break-words pb-2 text-center text-[22px] font-semibold text-ink">
                      {matches[0].displayName}
                    </p>
                    <Button fullWidth onClick={() => pickMatch(matches[0].userId)}>
                      Yes
                    </Button>
                  </>
                ) : (
                  matches.map((m) => (
                    <Button
                      key={String(m.userId)}
                      fullWidth
                      variant="secondary"
                      onClick={() => pickMatch(m.userId)}
                    >
                      {m.displayName}
                    </Button>
                  ))
                )}
                <Button fullWidth variant="secondary" onClick={() => pickMatch(null)}>
                  No
                </Button>
              </div>
            ) : null}

            {!signedIn && step === "newPin" ? (
              <div className="space-y-5">
                <p className="text-center text-[15px] font-semibold text-ink">
                  Set a 4-digit PIN
                </p>
                <PinPad reveal value={pin} disabled={busy} onChange={setPin} />
                <div>
                  <Button
                    fullWidth
                    disabled={busy || pin.length !== 4}
                    onClick={() => void doSignUp()}
                  >
                    {busy ? "…" : "Join"}
                  </Button>
                  <button
                    type="button"
                    className={`${textLink} mt-2`}
                    onClick={() => {
                      setError(null);
                      setClaimUserId(null);
                      setStep("name");
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
        )}
      </div>
    </main>
  );
}
