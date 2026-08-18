import { describe, expect, it } from 'vitest';
import { computeHeadToHead } from '@/scoring/headToHead';
import type { Course, ScoreMatrix } from '@/types';

const course: Course = {
  tee: { name: 'Test', rating: 72, slope: 113, parTotal: 72 },
  par: Array(18).fill(4),
  si: Array.from({ length: 18 }, (_, index) => index + 1),
  yds: Array(18).fill(400),
};

function matrix(players: string[]): ScoreMatrix {
  return Object.fromEntries(players.map((player) => [player, Array(18).fill(null)]));
}

describe('head-to-head scoring', () => {
  it('scores lower total as winner', () => {
    const scores = matrix(['A', 'B']);
    scores.A[0] = 4;
    scores.A[1] = 4;
    scores.B[0] = 5;
    scores.B[1] = 5;

    expect(computeHeadToHead({ course, scores, strokes: { A: 0, B: 0 } }, [{ t1: 'A', t2: 'B' }])).toEqual([
      { index: 1, t1: 'A', t2: 'B', t1Score: 8, t2Score: 10, winner: 'A' },
    ]);
  });

  it('uses net scoring when requested', () => {
    const scores = matrix(['A', 'B']);
    scores.A[0] = 4;
    scores.B[0] = 5;

    expect(computeHeadToHead({ course, scores, strokes: { A: 0, B: 1 } }, [{ t1: 'A', t2: 'B' }])).toEqual([
      { index: 1, t1: 'A', t2: 'B', t1Score: 4, t2Score: 4, winner: 'tie' },
    ]);
  });

  it('leaves incomplete empty matchups in progress', () => {
    const scores = matrix(['A', 'B']);

    expect(computeHeadToHead({ course, scores, strokes: { A: 0, B: 0 } }, [{ t1: 'A', t2: 'B' }])).toEqual([
      { index: 1, t1: 'A', t2: 'B', t1Score: null, t2Score: null, winner: null },
    ]);
  });
});
