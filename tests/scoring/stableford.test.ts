import { describe, expect, it } from 'vitest';
import { computeStableford, stablefordPointsForScore } from '@/scoring/stableford';
import type { Course, ScoreMatrix, StablefordPoints } from '@/types';

const course: Course = {
  tee: { name: 'Test', rating: 72, slope: 113, parTotal: 72 },
  par: Array(18).fill(4),
  si: Array.from({ length: 18 }, (_, index) => index + 1),
  yds: Array(18).fill(400),
};

function matrix(players: string[]): ScoreMatrix {
  return Object.fromEntries(players.map((player) => [player, Array(18).fill(null)]));
}

function setHole(scores: ScoreMatrix, hole: number, values: Record<string, number>) {
  for (const [player, score] of Object.entries(values)) {
    scores[player][hole] = score;
  }
}

describe('stableford scoring', () => {
  it('maps score relative to par into configured points', () => {
    const points: StablefordPoints = { double: -1, bogey: 0, par: 1, birdie: 3, eagle: 5, albatross: 8 };

    expect(stablefordPointsForScore(1, 4, points)).toBe(8);
    expect(stablefordPointsForScore(2, 4, points)).toBe(5);
    expect(stablefordPointsForScore(3, 4, points)).toBe(3);
    expect(stablefordPointsForScore(4, 4, points)).toBe(1);
    expect(stablefordPointsForScore(5, 4, points)).toBe(0);
    expect(stablefordPointsForScore(6, 4, points)).toBe(-1);
  });

  it('computes player totals and holes from completed holes', () => {
    const scores = matrix(['A', 'B']);
    setHole(scores, 0, { A: 4, B: 5 });
    setHole(scores, 1, { A: 3, B: 4 });
    scores.A[2] = 2;

    expect(computeStableford({ course, scores, strokes: { A: 0, B: 0 } }, ['A', 'B'])).toEqual({
      A: { points: 9, holes: 3 },
      B: { points: 3, holes: 2 },
    });
  });

  it('uses net scores with stroke allocation by default', () => {
    const scores = matrix(['A', 'B']);
    setHole(scores, 0, { A: 4, B: 5 });

    expect(computeStableford({ course, scores, strokes: { A: 0, B: 1 } }, ['A', 'B'])).toEqual({
      A: { points: 2, holes: 1 },
      B: { points: 2, holes: 1 },
    });
  });

  it('can use gross scores instead of net scores', () => {
    const scores = matrix(['A', 'B']);
    setHole(scores, 0, { A: 4, B: 5 });

    expect(computeStableford({ course, scores, strokes: { A: 0, B: 1 } }, ['A', 'B'], 'gross')).toEqual({
      A: { points: 2, holes: 1 },
      B: { points: 1, holes: 1 },
    });
  });

  it('honors a custom point map', () => {
    const scores = matrix(['A']);
    setHole(scores, 0, { A: 3 });

    expect(
      computeStableford(
        { course, scores, strokes: { A: 0 } },
        ['A'],
        'net',
        { double: 0, bogey: 1, par: 2, birdie: 5, eagle: 8, albatross: 12 },
      ),
    ).toEqual({
      A: { points: 5, holes: 1 },
    });
  });

  it('returns zero points and holes for players without scores', () => {
    const scores = matrix(['A']);

    expect(computeStableford({ course, scores, strokes: { A: 0 } }, ['A'])).toEqual({
      A: { points: 0, holes: 0 },
    });
  });
});
