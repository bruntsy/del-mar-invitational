/**
 * Running match-play status from an ordered list of per-hole winners.
 *
 * Side 'a' is team1 / side A, 'b' is team2 / side B, 'tie' is a halved hole,
 * and `null` is a hole that has not been fully scored yet (Pending).
 *
 * Pure and side-effect free so it can be unit tested and reused by any
 * match-play contest that already produces per-hole winners (BB+Aggy, High/Low,
 * Two-Man Scramble).
 */

export type HoleWinner = 'a' | 'b' | 'tie' | null;

export interface RunningStatus {
  /** Leader after this hole, or null when all square / not yet started. */
  leader: 'a' | 'b' | null;
  /** Holes the leader is up by (always >= 0). */
  diff: number;
  /** Human label: "2 Up", "All Square", "Pending", or a closeout like "3 & 2". */
  label: string;
  /** True once the lead exceeds the holes remaining (match is mathematically won). */
  decided: boolean;
}

function statusLabel(net: number, holesRemaining: number, anyDecided: boolean, holeScored: boolean, closeout: boolean): RunningStatus {
  const diff = Math.abs(net);
  const leader = net > 0 ? 'a' : net < 0 ? 'b' : null;

  if (!holeScored && !anyDecided) {
    return { leader: null, diff: 0, label: 'Pending', decided: false };
  }

  // Closed out: lead is larger than the holes left to play. Only meaningful when
  // the caller confirms the array spans the whole contest (closeout=true), and
  // only evaluated on a hole that has actually been scored — trailing unscored
  // holes must not shrink "holes remaining" and trigger a phantom closeout.
  if (closeout && holeScored && diff > holesRemaining && holesRemaining >= 0 && diff > 0) {
    return { leader, diff, label: `${diff} & ${holesRemaining}`, decided: true };
  }

  if (diff === 0) return { leader: null, diff: 0, label: 'All Square', decided: false };
  return { leader, diff, label: `${diff} Up`, decided: false };
}

/**
 * Returns one RunningStatus per input hole, reflecting the standing through that
 * hole. A hole whose winner is still `null` carries the previous standing (or
 * "Pending" if nothing has been decided yet).
 */
export function runningMatchStatus(
  winners: HoleWinner[],
  options: { closeout?: boolean } = {},
): RunningStatus[] {
  const closeout = options.closeout ?? false;
  const total = winners.length;
  let net = 0; // positive = 'a' ahead
  let decidedCount = 0;
  let closed: RunningStatus | null = null;

  return winners.map((winner, index) => {
    if (closed) return closed;

    if (winner === 'a') net += 1;
    else if (winner === 'b') net -= 1;
    if (winner === 'a' || winner === 'b' || winner === 'tie') decidedCount += 1;

    const holesRemaining = total - (index + 1);
    const status = statusLabel(net, holesRemaining, decidedCount > 0, winner != null, closeout);
    if (status.decided) closed = status;
    return status;
  });
}

/** Final standing for a whole contest. */
export function finalMatchStatus(winners: HoleWinner[], options: { closeout?: boolean } = {}): RunningStatus {
  const all = runningMatchStatus(winners, options);
  return all.length ? all[all.length - 1] : { leader: null, diff: 0, label: 'Pending', decided: false };
}
