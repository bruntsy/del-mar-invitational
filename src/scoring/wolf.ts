import { playerHoleScore, type ScoreContext } from '@/scoring/round';
import type { ScoreType } from '@/types';

export type WolfMode = 'partner' | 'solo';
export type WolfHoleWinner = 'wolf' | 'field' | 'tie' | null;
export type WolfSegmentLabel = 'Front' | 'Back' | 'Overall';

export interface WolfHoleConfig {
  wolf?: string;
  mode?: WolfMode | string;
  partner?: string;
}

export interface WolfHoleResult {
  sideA: string[];
  sideB: string[];
  a?: number | null;
  b?: number | null;
  points: Record<string, number>;
  winner: WolfHoleWinner;
}

export interface WolfSegment {
  label: WolfSegmentLabel;
  start: number;
  end: number;
}

export interface WolfSegmentResult extends WolfSegment {
  points: Record<string, number>;
  winners: string[];
}

export function defaultWolfHole(players: string[], hole: number): Required<WolfHoleConfig> {
  const wolf = players[hole % Math.max(players.length, 1)] || '';
  const partner = players.find((player) => player !== wolf) || '';

  return { wolf, mode: 'partner', partner };
}

export function wolfSegments(nassau = false): WolfSegment[] {
  return nassau
    ? [
        { label: 'Front', start: 0, end: 9 },
        { label: 'Back', start: 9, end: 18 },
        { label: 'Overall', start: 0, end: 18 },
      ]
    : [{ label: 'Overall', start: 0, end: 18 }];
}

export function wolfHoleResult(
  context: ScoreContext,
  players: string[],
  hole: number,
  config: WolfHoleConfig = defaultWolfHole(players, hole),
  type: ScoreType = 'net',
): WolfHoleResult {
  const wolf = config.wolf || '';
  const partner = config.mode === 'solo' ? null : config.partner || '';
  const sideA = [wolf, partner].filter((player): player is string => Boolean(player));
  const sideB = players.filter((player) => !sideA.includes(player));
  const points = Object.fromEntries(players.map((player) => [player, 0]));

  if (!wolf || !sideA.length || !sideB.length) return { sideA, sideB, points, winner: null };

  const sideScore = (side: string[]) => {
    const values = side
      .map((player) => playerHoleScore(context, player, hole, type))
      .filter((value): value is number => value != null);

    return values.length === side.length ? Math.min(...values) : null;
  };
  const a = sideScore(sideA);
  const b = sideScore(sideB);

  if (a == null || b == null) return { sideA, sideB, a, b, points, winner: null };
  if (a === b) return { sideA, sideB, a, b, points, winner: 'tie' };

  const winningSide = a < b ? sideA : sideB;
  const winner = a < b ? 'wolf' : 'field';
  const pts = winningSide.length === 1 ? 2 : 1;
  winningSide.forEach((player) => {
    points[player] = pts;
  });

  return { sideA, sideB, a, b, points, winner };
}

export function wolfPoints(
  context: ScoreContext,
  players: string[],
  holes: Record<string, WolfHoleConfig | undefined> = {},
  start = 0,
  end = 18,
  type: ScoreType = 'net',
): Record<string, number> {
  const totals = Object.fromEntries(players.map((player) => [player, 0]));

  for (let hole = start; hole < end; hole += 1) {
    const result = wolfHoleResult(context, players, hole, holes[hole] ?? defaultWolfHole(players, hole), type);
    players.forEach((player) => {
      totals[player] += result.points[player] || 0;
    });
  }

  return totals;
}

export function wolfSegmentWinners(points: Record<string, number>): string[] {
  const entries = Object.entries(points);
  if (!entries.length) return [];

  const max = Math.max(...entries.map(([, value]) => value));
  if (max <= 0) return [];

  return entries.filter(([, value]) => value === max).map(([player]) => player);
}

export function wolfSegmentResults(
  context: ScoreContext,
  players: string[],
  holes: Record<string, WolfHoleConfig | undefined> = {},
  nassau = false,
  type: ScoreType = 'net',
): WolfSegmentResult[] {
  return wolfSegments(nassau).map((segment) => {
    const points = wolfPoints(context, players, holes, segment.start, segment.end, type);

    return {
      ...segment,
      points,
      winners: wolfSegmentWinners(points),
    };
  });
}

export function wolfSettlement(
  segmentResults: WolfSegmentResult[],
  players: string[],
  amount: number,
): Record<string, number> {
  const pnl = Object.fromEntries(players.map((player) => [player, 0]));

  if (!amount) return pnl;

  for (const segment of segmentResults) {
    if (!segment.winners.length) continue;

    const pot = amount * players.length;
    players.forEach((player) => {
      pnl[player] -= amount;
    });
    segment.winners.forEach((player) => {
      pnl[player] += pot / segment.winners.length;
    });
  }

  return pnl;
}
