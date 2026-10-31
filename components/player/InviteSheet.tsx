"use client";

import { useEffect, useState } from "react";
import { useMutation } from "convex/react";
import { Check, Copy, X } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { WhatsAppIcon } from "@/components/ui/WhatsAppIcon";
import { errorMessage } from "@/lib/utils";

/** Admin sends the community's invite link. The code is made on first open. */
export function InviteSheet({
  token,
  orgId,
  orgName,
  onClose,
}: {
  token: string;
  orgId: Id<"orgs">;
  orgName: string;
  onClose: () => void;
}) {
  const getInvite = useMutation(api.orgs.getInvite);
  const resetInvite = useMutation(api.orgs.resetInvite);
  const [code, setCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirmNew, setConfirmNew] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    getInvite({ token, orgId })
      .then((res) => {
        if (live) setCode(res.code);
      })
      .catch((e) => {
        if (live) setError(errorMessage(e, "Could not make the link"));
      });
    return () => {
      live = false;
    };
  }, [getInvite, token, orgId]);

  const link = code ? `${window.location.origin}/i/${code}` : "";
  const message = `Join ${orgName} on Gully Cricket: ${link}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setError("Could not copy. Hold the link to copy it.");
    }
  }

  async function newLink() {
    setBusy(true);
    setError(null);
    try {
      const res = await resetInvite({ token, orgId });
      setCode(res.code);
      setCopied(false);
      setConfirmNew(false);
    } catch (e) {
      setError(errorMessage(e, "Could not make a new link"));
      setConfirmNew(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div
        className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 sm:items-center"
        onClick={onClose}
      >
        <div
          role="dialog"
          aria-label="Invite players"
          className="w-full max-w-md rounded-t-2xl bg-surface p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-lift sm:rounded-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-[17px] font-semibold text-ink">Invite players</h2>
            <button
              type="button"
              aria-label="Close"
              onClick={onClose}
              className="-mr-2 flex h-11 w-11 items-center justify-center rounded-xl text-muted active:bg-ink/[0.04]"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {error ? (
            <p className="mt-3 rounded-2xl border border-danger/20 bg-danger-soft px-4 py-2.5 text-[13px] text-danger">
              {error}
            </p>
          ) : null}

          {code ? (
            <div className="mt-3 space-y-3">
              <div className="flex min-h-12 items-center gap-2 rounded-xl border border-line bg-bg pl-3.5">
                <span className="min-w-0 flex-1 select-all truncate text-[13px] text-muted">
                  {link}
                </span>
                <button
                  type="button"
                  aria-label="Copy link"
                  onClick={() => void copy()}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-muted active:bg-ink/[0.04]"
                >
                  {copied ? (
                    <Check className="h-4 w-4 text-accent-deep" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </button>
              </div>
              <a
                href={`https://wa.me/?text=${encodeURIComponent(message)}`}
                target="_blank"
                rel="noreferrer"
                className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-ink text-[15px] font-semibold text-bg active:scale-[0.98]"
              >
                <WhatsAppIcon className="h-5 w-5" />
                Send on WhatsApp
              </a>
              <button
                type="button"
                onClick={() => setConfirmNew(true)}
                className="flex min-h-11 w-full items-center justify-center text-[13px] font-medium text-muted"
              >
                New link
              </button>
            </div>
          ) : !error ? (
            <div className="mt-3 h-12 animate-pulse rounded-xl bg-line/60" />
          ) : null}
        </div>
      </div>

      <ConfirmDialog
        open={confirmNew}
        title="Stop the old link?"
        description="People who joined stay."
        confirmLabel="New link"
        busy={busy}
        onConfirm={() => void newLink()}
        onCancel={() => setConfirmNew(false)}
      />
    </>
  );
}
