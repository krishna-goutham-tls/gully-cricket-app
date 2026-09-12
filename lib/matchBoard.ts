/**
 * Scoreboard chip under the big score (pad + watch). Current-innings runs
 * always come from live.totalRuns — the innings row lags until persist.
 */

export type MatchBoardLine =
  | { kind: "lead"; by: number }
  | { kind: "trail"; by: number }
  | { kind: "level" }
  | { kind: "target"; target: number; need: number }
  | null;

export function matchBoardLine(opts: {
  inningsPerSide: number; // 2 = test, 1 = ODI
  innings: Array<{ _id: string; battingSide: "A" | "B"; totalRuns: number }>;
  live: {
    battingSide: "A" | "B";
    totalRuns: number;
    inningsNo: number;
    currentInningsId?: string | null;
    target?: number;
  };
}): MatchBoardLine {
  const { inningsPerSide, innings, live } = opts;

  if (live.target !== undefined) {
    return {
      kind: "target",
      target: live.target,
      need: live.target - live.totalRuns,
    };
  }

  if (inningsPerSide !== 2) return null;
  if (live.inningsNo === 1) return null;

  const ownPrior = innings
    .filter(
      (i) =>
        i.battingSide === live.battingSide && i._id !== live.currentInningsId,
    )
    .reduce((sum, i) => sum + i.totalRuns, 0);
  const other = innings
    .filter((i) => i.battingSide !== live.battingSide)
    .reduce((sum, i) => sum + i.totalRuns, 0);

  const delta = ownPrior + live.totalRuns - other;
  if (delta > 0) return { kind: "lead", by: delta };
  if (delta < 0) return { kind: "trail", by: -delta };
  return { kind: "level" };
}

export function matchBoardLabel(line: NonNullable<MatchBoardLine>): string {
  switch (line.kind) {
    case "lead":
      return `Lead by ${line.by}`;
    case "trail":
      return `Trail by ${line.by}`;
    case "level":
      return "Scores level";
    case "target":
      return `Target ${line.target} · need ${line.need}`;
  }
}
