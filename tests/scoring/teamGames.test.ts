import { describe, expect, it } from 'vitest';
import { computeTeamHoleStats, computeTeamTotals } from '@/scoring/teamGames';
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

function setHole(scores: ScoreMatrix, hole: number, values: Record<string, number>) {
  for (const [player, score] of Object.entries(values)) {
    scores[player][hole] = score;
  }
}

describe('team game scoring', () => {
  it('computes best-ball value for a complete hole', () => {
    const scores = matrix(['A', 'B', 'C']);
    setHole(scores, 0, { A: 4, B: 5, C: 6 });

    expect(
      computeTeamHoleStats({ course, scores, strokes: { A: 0, B: 0, C: 0 } }, ['A', 'B', 'C'], 0),
    ).toEqual({
      bestBall: 4,
    });
  });

  it('requires every team player before producing a hole stat', () => {
    const scores = matrix(['A', 'B']);
    scores.A[0] = 4;

    expect(
      computeTeamHoleStats({ course, scores, strokes: { A: 0, B: 0 } }, ['A', 'B'], 0),
    ).toEqual({
      bestBall: null,
    });
  });

  it('applies net strokes when requested', () => {
    const scores = matrix(['A', 'B']);
    setHole(scores, 0, { A: 4, B: 5 });

    expect(
      computeTeamHoleStats({ course, scores, strokes: { A: 0, B: 1 } }, ['A', 'B'], 0, 'net'),
    ).toEqual({
      bestBall: 4,
    });
  });

  it('uses gross scores when requested', () => {
    const scores = matrix(['A', 'B']);
    setHole(scores, 0, { A: 4, B: 5 });

    expect(
      computeTeamHoleStats({ course, scores, strokes: { A: 0, B: 1 } }, ['A', 'B'], 0, 'gross'),
    ).toEqual({
      bestBall: 4,
    });
  });

  it('rolls complete holes into front, back, and total values', () => {
    const scores = matrix(['A', 'B']);
    for (let hole = 0; hole < 18; hole += 1) {
      setHole(scores, hole, { A: hole < 9 ? 4 : 5, B: hole < 9 ? 5 : 6 });
    }

    expect(computeTeamTotals({ course, scores, strokes: { A: 0, B: 0 } }, ['A', 'B'])).toEqual({
      bbOut: 36,
      bbIn: 45,
      bbTotal: 81,
    });
  });

  it('allows partial front/back totals from completed holes only', () => {
    const scores = matrix(['A', 'B']);
    setHole(scores, 0, { A: 4, B: 5 });
    scores.A[1] = 4;
    setHole(scores, 9, { A: 5, B: 6 });

    const totals = computeTeamTotals({ course, scores, strokes: { A: 0, B: 0 } }, ['A', 'B']);

    expect(totals.bbOut).toBe(4);
    expect(totals.bbIn).toBe(5);
    expect(totals.bbTotal).toBe(9);
  });

  it('returns null totals when no complete holes exist', () => {
    const scores = matrix(['A', 'B']);

    expect(computeTeamTotals({ course, scores, strokes: { A: 0, B: 0 } }, ['A', 'B'])).toEqual({
      bbOut: null,
      bbIn: null,
      bbTotal: null,
    });
  });
});
