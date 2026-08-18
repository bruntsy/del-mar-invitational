import { bestBallRangeScore, playerRangeScore, type ScoreContext } from '@/scoring/round';
import type { ScoreType } from '@/types';

export type ThreeManNassauSegmentLabel = 'Front' | 'Back' | 'Overall';
export type ThreeManNassauWinner = 'solo' | 'side' | 'push' | null;

export interface ThreeManNassauSegment {
  label: ThreeManNassauSegmentLabel;
  start: number;
  end: number;
}

export interface ThreeManNassauRow extends ThreeManNassauSegment {
  solo: string;
  side: string[];
  soloScore: number | null;
  sideScore: number | null;
  winner: ThreeManNassauWinner;
}

export interface ThreeManNassauResult {
  valid: boolean;
  players: string[];
  rows: ThreeManNassauRow[];
}

export function threeManNassauSegments(): ThreeManNassauSegment[] {
  return [
    { label: 'Front', start: 0, end: 9 },
    { label: 'Back', start: 9, end: 18 },
    { label: 'Overall', start: 0, end: 18 },
  ];
}

export function threeManNassauResults(
  context: ScoreContext,
  players: string[],
  type: ScoreType = 'net',
): ThreeManNassauResult {
  if (players.length !== 3) return { valid: false, players, rows: [] };

  const rows = players.flatMap((solo) => {
    const side = players.filter((player) => player !== solo);

    return threeManNassauSegments().map((segment) => {
      const soloScore = playerRangeScore(context, solo, segment.start, segment.end, type);
      const sideScore = bestBallRangeScore(context, side, segment.start, segment.end, type);
      let winner: ThreeManNassauWinner = null;

      if (soloScore != null && sideScore != null) {
        if (soloScore < sideScore) winner = 'solo';
        else if (sideScore < soloScore) winner = 'side';
        else winner = 'push';
      }

      return {
        ...segment,
        solo,
        side,
        soloScore,
        sideScore,
        winner,
      };
    });
  });

  return { valid: true, players, rows };
}

export function threeManNassauSettlement(rows: ThreeManNassauRow[], amount: number): Record<string, number> {
  const pnl: Record<string, number> = {};

  for (const row of rows) {
    pnl[row.solo] ??= 0;
    row.side.forEach((player) => {
      pnl[player] ??= 0;
    });

    if (!amount) continue;

    if (row.winner === 'solo') {
      pnl[row.solo] += amount * row.side.length;
      row.side.forEach((player) => {
        pnl[player] -= amount;
      });
    } else if (row.winner === 'side') {
      pnl[row.solo] -= amount * row.side.length;
      row.side.forEach((player) => {
        pnl[player] += amount;
      });
    }
  }

  return pnl;
}
