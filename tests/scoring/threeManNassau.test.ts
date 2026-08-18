import { describe, expect, it } from 'vitest';
import {
  threeManNassauResults,
  threeManNassauSegments,
  threeManNassauSettlement,
} from '@/scoring/threeManNassau';
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

describe('three-man Nassau scoring', () => {
  it('uses front, back, and overall Nassau segments', () => {
    expect(threeManNassauSegments()).toEqual([
      { label: 'Front', start: 0, end: 9 },
      { label: 'Back', start: 9, end: 18 },
      { label: 'Overall', start: 0, end: 18 },
    ]);
  });

  it('requires exactly three players', () => {
    const scores = matrix(['A', 'B']);

    expect(threeManNassauResults({ course, scores, strokes: { A: 0, B: 0 } }, ['A', 'B'])).toEqual({
      valid: false,
      players: ['A', 'B'],
      rows: [],
    });
  });

  it('compares each solo player against the other two players best ball', () => {
    const scores = matrix(['A', 'B', 'C']);
    setHole(scores, 0, { A: 4, B: 5, C: 6 });
    setHole(scores, 9, { A: 6, B: 4, C: 5 });

    const result = threeManNassauResults(
      { course, scores, strokes: { A: 0, B: 0, C: 0 } },
      ['A', 'B', 'C'],
    );

    expect(result.valid).toBe(true);
    expect(result.players).toEqual(['A', 'B', 'C']);
    expect(result.rows).toHaveLength(9);
    expect(result.rows[0]).toEqual({
      label: 'Front',
      start: 0,
      end: 9,
      solo: 'A',
      side: ['B', 'C'],
      soloScore: 4,
      sideScore: 5,
      winner: 'solo',
    });
    expect(result.rows[1]).toMatchObject({ solo: 'A', label: 'Back', soloScore: 6, sideScore: 4, winner: 'side' });
    expect(result.rows[2]).toMatchObject({ solo: 'A', label: 'Overall', soloScore: 10, sideScore: 9, winner: 'side' });
  });

  it('pushes tied completed segments', () => {
    const scores = matrix(['A', 'B', 'C']);
    setHole(scores, 0, { A: 4, B: 4, C: 5 });

    const [row] = threeManNassauResults(
      { course, scores, strokes: { A: 0, B: 0, C: 0 } },
      ['A', 'B', 'C'],
    ).rows;

    expect(row).toMatchObject({ solo: 'A', label: 'Front', soloScore: 4, sideScore: 4, winner: 'push' });
  });

  it('leaves rows open when either side has no completed holes in the segment', () => {
    const scores = matrix(['A', 'B', 'C']);
    scores.A[0] = 4;

    const [front] = threeManNassauResults(
      { course, scores, strokes: { A: 0, B: 0, C: 0 } },
      ['A', 'B', 'C'],
    ).rows;

    expect(front).toMatchObject({ soloScore: 4, sideScore: null, winner: null });
  });

  it('requires both side players to complete a hole before counting best ball', () => {
    const scores = matrix(['A', 'B', 'C']);
    setHole(scores, 0, { A: 4, B: 3 });
    setHole(scores, 1, { A: 4, B: 6, C: 5 });

    const [front] = threeManNassauResults(
      { course, scores, strokes: { A: 0, B: 0, C: 0 } },
      ['A', 'B', 'C'],
    ).rows;

    expect(front).toMatchObject({ soloScore: 8, sideScore: 5, winner: 'side' });
  });

  it('uses net scores by default and can use gross scores', () => {
    const scores = matrix(['A', 'B', 'C']);
    setHole(scores, 0, { A: 4, B: 4, C: 6 });

    const net = threeManNassauResults(
      { course, scores, strokes: { A: 0, B: 1, C: 0 } },
      ['A', 'B', 'C'],
    ).rows[0];
    const gross = threeManNassauResults(
      { course, scores, strokes: { A: 0, B: 1, C: 0 } },
      ['A', 'B', 'C'],
      'gross',
    ).rows[0];

    expect(net).toMatchObject({ soloScore: 4, sideScore: 3, winner: 'side' });
    expect(gross).toMatchObject({ soloScore: 4, sideScore: 4, winner: 'push' });
  });

  it('settles solo wins and side wins at amount per opponent', () => {
    const scores = matrix(['A', 'B', 'C']);
    setHole(scores, 0, { A: 4, B: 5, C: 6 });
    setHole(scores, 9, { A: 6, B: 4, C: 5 });

    const result = threeManNassauResults(
      { course, scores, strokes: { A: 0, B: 0, C: 0 } },
      ['A', 'B', 'C'],
    );

    expect(threeManNassauSettlement(result.rows, 10)).toEqual({
      A: 10,
      B: 40,
      C: -50,
    });
  });
});
