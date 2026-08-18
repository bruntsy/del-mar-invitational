import { playerHoleScore, type ScoreContext } from '@/scoring/round';
import type { ScoreType } from '@/types';

export interface StablefordPoints {
  double: number;
  bogey: number;
  par: number;
  birdie: number;
  eagle: number;
  albatross: number;
}

const DEFAULT_POINTS: StablefordPoints = { double: 0, bogey: 1, par: 2, birdie: 3, eagle: 4, albatross: 5 };

export interface StablefordPlayerResult {
  points: number;
  holes: number;
}

export type StablefordResult = Record<string, StablefordPlayerResult>;

export function stablefordPointsForScore(score: number, par: number, points: StablefordPoints): number {
  const diff = score - par;

  if (diff <= -3) return points.albatross;
  if (diff === -2) return points.eagle;
  if (diff === -1) return points.birdie;
  if (diff === 0) return points.par;
  if (diff === 1) return points.bogey;
  return points.double;
}

export function computeStableford(
  context: ScoreContext,
  players: string[],
  type: ScoreType = 'net',
  points: StablefordPoints = DEFAULT_POINTS,
): StablefordResult {
  return Object.fromEntries(
    players.map((player) => {
      let total = 0;
      let holes = 0;

      for (let hole = 0; hole < 18; hole += 1) {
        const score = playerHoleScore(context, player, hole, type);
        if (score == null) continue;

        total += stablefordPointsForScore(score, context.course.par[hole], points);
        holes += 1;
      }

      return [player, { points: total, holes }];
    }),
  );
}
