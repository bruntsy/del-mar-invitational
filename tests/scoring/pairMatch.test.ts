import { describe, expect, it } from 'vitest';
import { computePairMatchPlay, ensurePairMatches, pairMatchups } from '@/scoring/pairMatch';
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
  for (const [player, score] of Object.entries(values)) scores[player][hole] = score;
}

describe('pair match play', () => {
  it('repairs pair matches and generates defaults when needed', () => {
    expect(
      ensurePairMatches([{ a: ['A', 'Ghost', 'B'], b: ['C', 'D', 'Other'] }], ['A', 'B'], ['C', 'D']),
    ).toEqual([{ a: ['A', 'B'], b: ['C', 'D'] }]);

    expect(ensurePairMatches([], ['A', 'B', 'E'], ['C', 'D', 'F'])).toEqual([
      { a: ['A', 'B'], b: ['C', 'D'] },
      { a: ['E'], b: ['F'] },
    ]);
  });

  it('filters matchups to complete opposing sides', () => {
    expect(pairMatchups([{ a: ['A'], b: [] }, { a: ['B'], b: ['D'] }], ['A', 'B'], ['C', 'D'])).toEqual([
      { idx: 2, a: ['B'], b: ['D'] },
    ]);
  });

  it('scores best-ball pair match holes', () => {
    const scores = matrix(['A', 'B', 'C', 'D']);
    setHole(scores, 0, { A: 4, B: 5, C: 5, D: 6 });
    setHole(scores, 1, { A: 5, B: 6, C: 4, D: 5 });
    setHole(scores, 2, { A: 4, B: 5, C: 4, D: 6 });

    const result = computePairMatchPlay(
      { course, scores, strokes: { A: 0, B: 0, C: 0, D: 0 } },
      [{ a: ['A', 'B'], b: ['C', 'D'] }],
      ['A', 'B'],
      ['C', 'D'],
      { pointsPerHole: 2, type: 'gross' },
    );

    expect(result.team1Points).toBe(2);
    expect(result.team2Points).toBe(2);
    expect(result.team1Holes).toBe(1);
    expect(result.team2Holes).toBe(1);
    expect(result.tiedHoles).toBe(1);
    expect(result.matches[0].holes.slice(0, 3).map((hole) => hole.winner)).toEqual(['a', 'b', 'tie']);
  });

  it('uses net strokes for pair match scoring', () => {
    const scores = matrix(['A', 'C']);
    setHole(scores, 0, { A: 4, C: 5 });

    const result = computePairMatchPlay(
      { course, scores, strokes: { A: 0, C: 1 } },
      [{ a: ['A'], b: ['C'] }],
      ['A'],
      ['C'],
      { type: 'net' },
    );

    expect(result.team1Points).toBe(0);
    expect(result.team2Points).toBe(0);
    expect(result.tiedHoles).toBe(1);
  });

  it('supports best-ball + aggy point mode', () => {
    const scores = matrix(['A', 'B', 'C', 'D']);
    setHole(scores, 0, { A: 4, B: 5, C: 5, D: 6 });

    const result = computePairMatchPlay(
      { course, scores, strokes: { A: 0, B: 0, C: 0, D: 0 } },
      [{ a: ['A', 'B'], b: ['C', 'D'] }],
      ['A', 'B'],
      ['C', 'D'],
      { useBestBallAggy: true },
    );

    expect(result.team1Points).toBe(2);
    expect(result.team2Points).toBe(0);
    expect(result.matches[0].holes[0]).toMatchObject({ a: 2, b: 0, winner: 'a' });
  });
});
