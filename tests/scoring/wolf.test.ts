import { describe, expect, it } from 'vitest';
import {
  defaultWolfHole,
  wolfHoleResult,
  wolfPoints,
  wolfSegmentResults,
  wolfSegmentWinners,
  wolfSegments,
  wolfSettlement,
  type WolfHoleConfig,
} from '@/scoring/wolf';
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

describe('wolf scoring', () => {
  it('defaults wolf order by hole and first available partner', () => {
    expect(defaultWolfHole(['A', 'B', 'C'], 0)).toEqual({ wolf: 'A', mode: 'partner', partner: 'B' });
    expect(defaultWolfHole(['A', 'B', 'C'], 1)).toEqual({ wolf: 'B', mode: 'partner', partner: 'A' });
    expect(defaultWolfHole(['A', 'B', 'C'], 4)).toEqual({ wolf: 'B', mode: 'partner', partner: 'A' });
  });

  it('uses overall only by default and front/back/overall for Nassau', () => {
    expect(wolfSegments()).toEqual([{ label: 'Overall', start: 0, end: 18 }]);
    expect(wolfSegments(true)).toEqual([
      { label: 'Front', start: 0, end: 9 },
      { label: 'Back', start: 9, end: 18 },
      { label: 'Overall', start: 0, end: 18 },
    ]);
  });

  it('awards one point to each winning partner-side player', () => {
    const scores = matrix(['A', 'B', 'C']);
    setHole(scores, 0, { A: 4, B: 5, C: 6 });

    expect(
      wolfHoleResult(
        { course, scores, strokes: { A: 0, B: 0, C: 0 } },
        ['A', 'B', 'C'],
        0,
        { wolf: 'A', mode: 'partner', partner: 'B' },
      ),
    ).toEqual({
      sideA: ['A', 'B'],
      sideB: ['C'],
      a: 4,
      b: 6,
      points: { A: 1, B: 1, C: 0 },
      winner: 'wolf',
    });
  });

  it('awards two points to a winning solo player', () => {
    const scores = matrix(['A', 'B', 'C']);
    setHole(scores, 0, { A: 4, B: 5, C: 6 });

    expect(
      wolfHoleResult(
        { course, scores, strokes: { A: 0, B: 0, C: 0 } },
        ['A', 'B', 'C'],
        0,
        { wolf: 'A', mode: 'solo', partner: 'B' },
      ),
    ).toMatchObject({
      sideA: ['A'],
      sideB: ['B', 'C'],
      points: { A: 2, B: 0, C: 0 },
      winner: 'wolf',
    });
  });

  it('awards one point to each field player when the field wins', () => {
    const scores = matrix(['A', 'B', 'C']);
    setHole(scores, 0, { A: 6, B: 4, C: 5 });

    expect(
      wolfHoleResult(
        { course, scores, strokes: { A: 0, B: 0, C: 0 } },
        ['A', 'B', 'C'],
        0,
        { wolf: 'A', mode: 'solo' },
      ),
    ).toMatchObject({
      sideA: ['A'],
      sideB: ['B', 'C'],
      points: { A: 0, B: 1, C: 1 },
      winner: 'field',
    });
  });

  it('pushes tied holes without carry points', () => {
    const scores = matrix(['A', 'B', 'C']);
    setHole(scores, 0, { A: 4, B: 5, C: 4 });

    expect(
      wolfHoleResult(
        { course, scores, strokes: { A: 0, B: 0, C: 0 } },
        ['A', 'B', 'C'],
        0,
        { wolf: 'A', mode: 'partner', partner: 'B' },
      ),
    ).toMatchObject({
      a: 4,
      b: 4,
      points: { A: 0, B: 0, C: 0 },
      winner: 'tie',
    });
  });

  it('leaves incomplete holes open', () => {
    const scores = matrix(['A', 'B', 'C']);
    setHole(scores, 0, { A: 4, B: 5 });

    expect(
      wolfHoleResult(
        { course, scores, strokes: { A: 0, B: 0, C: 0 } },
        ['A', 'B', 'C'],
        0,
        { wolf: 'A', mode: 'partner', partner: 'B' },
      ),
    ).toMatchObject({
      a: 4,
      b: null,
      points: { A: 0, B: 0, C: 0 },
      winner: null,
    });
  });

  it('uses net scores by default and can use gross scores', () => {
    const scores = matrix(['A', 'B', 'C']);
    setHole(scores, 0, { A: 5, B: 5, C: 4 });
    const config: WolfHoleConfig = { wolf: 'A', mode: 'partner', partner: 'B' };

    const net = wolfHoleResult({ course, scores, strokes: { A: 0, B: 1, C: 0 } }, ['A', 'B', 'C'], 0, config);
    const gross = wolfHoleResult(
      { course, scores, strokes: { A: 0, B: 1, C: 0 } },
      ['A', 'B', 'C'],
      0,
      config,
      'gross',
    );

    expect(net).toMatchObject({ a: 4, b: 4, winner: 'tie' });
    expect(gross).toMatchObject({ a: 5, b: 4, winner: 'field' });

    scores.C[0] = 6;
    expect(
      wolfHoleResult({ course, scores, strokes: { A: 0, B: 1, C: 0 } }, ['A', 'B', 'C'], 0, config),
    ).toMatchObject({ a: 4, b: 6, winner: 'wolf' });
    expect(
      wolfHoleResult(
        { course, scores, strokes: { A: 0, B: 1, C: 0 } },
        ['A', 'B', 'C'],
        0,
        config,
        'gross',
      ),
    ).toMatchObject({ a: 5, b: 6, winner: 'wolf' });
  });

  it('totals points across a segment and finds only positive leaders', () => {
    const scores = matrix(['A', 'B', 'C']);
    setHole(scores, 0, { A: 4, B: 5, C: 6 });
    setHole(scores, 1, { A: 6, B: 4, C: 5 });
    const holes = {
      0: { wolf: 'A', mode: 'solo' },
      1: { wolf: 'A', mode: 'solo' },
    };

    const points = wolfPoints({ course, scores, strokes: { A: 0, B: 0, C: 0 } }, ['A', 'B', 'C'], holes, 0, 2);

    expect(points).toEqual({ A: 2, B: 1, C: 1 });
    expect(wolfSegmentWinners(points)).toEqual(['A']);
    expect(wolfSegmentWinners({ A: 0, B: 0, C: 0 })).toEqual([]);
  });

  it('computes Nassau segment results and settlement', () => {
    const scores = matrix(['A', 'B', 'C']);
    setHole(scores, 0, { A: 4, B: 5, C: 6 });
    setHole(scores, 9, { A: 6, B: 4, C: 5 });
    const holes = {
      0: { wolf: 'A', mode: 'solo' },
      9: { wolf: 'A', mode: 'solo' },
    };

    const segments = wolfSegmentResults(
      { course, scores, strokes: { A: 0, B: 0, C: 0 } },
      ['A', 'B', 'C'],
      holes,
      true,
    );

    expect(segments).toEqual([
      { label: 'Front', start: 0, end: 9, points: { A: 2, B: 0, C: 0 }, winners: ['A'] },
      { label: 'Back', start: 9, end: 18, points: { A: 0, B: 1, C: 1 }, winners: ['B', 'C'] },
      { label: 'Overall', start: 0, end: 18, points: { A: 2, B: 1, C: 1 }, winners: ['A'] },
    ]);
    expect(wolfSettlement(segments, ['A', 'B', 'C'], 10)).toEqual({
      A: 30,
      B: -15,
      C: -15,
    });
  });
});
