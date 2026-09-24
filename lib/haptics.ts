/**
 * A short buzz when a ball goes in, so the scorer knows the tap landed without
 * looking. Wickets and boundaries get their own pattern. No-op where the
 * Vibration API is missing (iOS Safari).
 */
export function buzzBall(kind: "ball" | "boundary" | "wicket") {
  if (typeof navigator === "undefined" || !("vibrate" in navigator)) return;
  const pattern =
    kind === "wicket" ? [30, 60, 30] : kind === "boundary" ? [12, 50, 12] : 12;
  try {
    navigator.vibrate(pattern);
  } catch {
    // Some browsers throw instead of ignoring when vibration is blocked.
  }
}
