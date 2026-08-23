"use client";

import { useAuth } from "@/components/providers/AuthProvider";
import { Button } from "@/components/ui/Button";

export function StoryCta() {
  const { token, user } = useAuth();
  const signedIn = Boolean(token && user);

  return (
    <div className="mt-10 rounded-2xl border border-line bg-surface p-5 shadow-card">
      <Button
        href={signedIn ? "/home" : "/#invite"}
        size="lg"
        fullWidth
      >
        {signedIn ? "Open the scorebook" : "Get the scorebook"}
      </Button>
    </div>
  );
}
