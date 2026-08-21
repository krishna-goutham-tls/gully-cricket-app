/**
 * Team display labels. "Team A" / "Team B" (the create-time fallback) are
 * confusing to read on a scoreboard, so where a side still carries that
 * default we show the captain instead — the first player of the side, which
 * is how the draft seeds each team. Custom names and draft-created
 * "Team {captain}" names are left exactly as stored.
 */

export function firstName(full: string): string {
  return full.trim().split(/\s+/)[0] || full;
}

export function captainTeamLabel(
  storedName: string,
  captainName: string | undefined,
): string {
  const isDefault =
    !storedName || storedName === "Team A" || storedName === "Team B";
  if (isDefault && captainName) return `Team ${firstName(captainName)}`;
  return storedName;
}
