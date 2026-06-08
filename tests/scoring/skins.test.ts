import { describe, expect, it } from 'vitest';
import { computeSkins } from '@/scoring/skins';
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

describe('skins scoring', () => {
  it('counts one skin for a single low net score', () => {
    const scores = matrix(['A', 'B', 'C']);
    setHole(scores, 0, { A: 4, B: 5, C: 6 });

    const result = computeSkins({ course, scores, strokes: { A: 0, B: 0, C: 0 } }, ['A', 'B', 'C']);

    expect(result.skinsByPlayer).toEqual({ A: 1, B: 0, C: 0 });
    expect(result.holeResults[0]).toMatchObject({
      hole: 1,
      winner: 'A',
      pot: 1,
      nets: { A: 4, B: 5, C: 6 },
      tied: false,
    });
  });

  it('uses net scores with stroke allocation', () => {
    const scores = matrix(['A', 'B']);
    setHole(scores, 0, { A: 4, B: 5 });

    const result = computeSkins({ course, scores, strokes: { A: 0, B: 1 } }, ['A', 'B']);

    expect(result.skinsByPlayer).toEqual({ A: 0, B: 0 });
    expect(result.holeResults[0]).toMatchObject({
      winner: null,
      nets: { A: 4, B: 4 },
      tied: true,
      tiedPlayers: ['A', 'B'],
    });
  });

  it('records tied holes without awarding a skin', () => {
    const scores = matrix(['A', 'B']);
    setHole(scores, 0, { A: 4, B: 4 });

    const result = computeSkins({ course, scores, strokes: { A: 0, B: 0 } }, ['A', 'B']);

    expect(result.skinsByPlayer).toEqual({ A: 0, B: 0 });
    expect(result.holeResults[0]).toMatchObject({ tied: true, tiedPlayers: ['A', 'B'], pot: 0 });
  });

  it('stops at the first incomplete hole', () => {
    const scores = matrix(['A', 'B']);
    setHole(scores, 0, { A: 4, B: 5 });
    scores.A[1] = 4;
    setHole(scores, 2, { A: 3, B: 5 });

    const result = computeSkins({ course, scores, strokes: { A: 0, B: 0 } }, ['A', 'B']);

    expect(result.holeResults).toHaveLength(1);
    expect(result.skinsByPlayer).toEqual({ A: 1, B: 0 });
  });

  it('returns empty results for no players', () => {
    expect(computeSkins({ course, scores: {}, strokes: {} }, [])).toEqual({
      skinsByPlayer: {},
      holeResults: [],
      pendingPot: 0,
    });
  });
});
