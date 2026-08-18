import { scoreAt } from '@/scoring/cells';
import { getsStroke } from '@/scoring/handicap';
import type { Course, ScoreMatrix, ScoreType } from '@/types';

export interface ScoreContext {
  course: Course;
  scores: ScoreMatrix;
  strokes: Record<string, number>;
}

export interface PairSegmentWins {
  a: number;
  b: number;
  tied: number;
  played: number;
}

export interface HoleWinner {
  winner: 'a' | 'b' | 'tie' | null;
}

export function playerHoleScore(
  context: ScoreContext,
  player: string,
  hole: number,
  type: ScoreType = 'net',
): number | null {
  const gross = scoreAt(context.scores, player, hole);
  if (gross == null) return null;

  return type === 'gross'
    ? gross
    : gross - (getsStroke(context.strokes[player], context.course.si[hole]) ? 1 : 0);
}

export function playerRangeScore(
  context: ScoreContext,
  player: string,
  start: number,
  end: number,
  type: ScoreType = 'net',
): number | null {
  let total = 0;
  let any = false;

  for (let hole = start; hole < end; hole += 1) {
    const value = playerHoleScore(context, player, hole, type);
    if (value != null) {
      total += value;
      any = true;
    }
  }

  return any ? total : null;
}

export function pairBestBallScore(
  context: ScoreContext,
  pair: string[],
  hole: number,
  type: ScoreType = 'net',
): number | null {
  const values = pair
    .map((player) => playerHoleScore(context, player, hole, type))
    .filter((value): value is number => value != null);

  return pair.length > 0 && values.length === pair.length ? Math.min(...values) : null;
}

export function pairAggyScore(
  context: ScoreContext,
  pair: string[],
  hole: number,
  type: ScoreType = 'net',
): number | null {
  const values = pair
    .map((player) => playerHoleScore(context, player, hole, type))
    .filter((value): value is number => value != null);

  return pair.length > 0 && values.length === pair.length
    ? values.reduce((total, value) => total + value, 0)
    : null;
}

export function pairHighBallScore(
  context: ScoreContext,
  pair: string[],
  hole: number,
  type: ScoreType = 'net',
): number | null {
  const values = pair
    .map((player) => playerHoleScore(context, player, hole, type))
    .filter((value): value is number => value != null);

  return pair.length > 0 && values.length === pair.length ? Math.max(...values) : null;
}

export function pairRangeScore(
  context: ScoreContext,
  pair: string[],
  start: number,
  end: number,
  type: ScoreType = 'net',
): number | null {
  let total = 0;

  for (let hole = start; hole < end; hole += 1) {
    const value = pairBestBallScore(context, pair, hole, type);
    if (value == null) return null;
    total += value;
  }

  return total;
}

export function bestBallRangeScore(
  context: ScoreContext,
  pair: string[],
  start: number,
  end: number,
  type: ScoreType = 'net',
): number | null {
  let total = 0;
  let any = false;

  for (let hole = start; hole < end; hole += 1) {
    const value = pairBestBallScore(context, pair, hole, type);
    if (value == null) continue;
    total += value;
    any = true;
  }

  return any ? total : null;
}

export function pairMatchRangeWins(
  context: ScoreContext,
  aPlayers: string[],
  bPlayers: string[],
  start: number,
  end: number,
  type: ScoreType = 'net',
): PairSegmentWins | null {
  let a = 0;
  let b = 0;
  let tied = 0;

  for (let hole = start; hole < end; hole += 1) {
    const aScore = pairBestBallScore(context, aPlayers, hole, type);
    const bScore = pairBestBallScore(context, bPlayers, hole, type);
    if (aScore == null || bScore == null) return null;

    if (aScore < bScore) a += 1;
    else if (bScore < aScore) b += 1;
    else tied += 1;
  }

  return { a, b, tied, played: end - start };
}

export function pairSegmentHoles(
  holes: HoleWinner[],
  start: number,
  end: number,
): { aWon: number; bWon: number; tied: number; played: number; total: number } {
  const segment = holes.slice(start, end);

  return {
    aWon: segment.filter((hole) => hole.winner === 'a').length,
    bWon: segment.filter((hole) => hole.winner === 'b').length,
    tied: segment.filter((hole) => hole.winner === 'tie').length,
    played: segment.filter((hole) => hole.winner).length,
    total: end - start,
  };
}
