import { describe, expect, it } from 'vitest';
import { eventDefaultRound, normalizeEventConfig } from '@/domain/events';
import { computeEventRoundResult, bestBallAggyHoleComponent } from '@/scoring/eventRound';
import type { Course, EventRoundConfig, PairMatch, ScoreMatrix } from '@/types';

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

function inputFor(pairMatches: PairMatch[] = [{ a: ['A', 'B'], b: ['C', 'D'] }]) {
  const team1 = [...new Set(pairMatches.flatMap((match) => match.a))];
  const team2 = [...new Set(pairMatches.flatMap((match) => match.b))];
  const players = [...team1, ...team2];
  const config = normalizeEventConfig(
    {
      teamNames: { team1: 'Team One', team2: 'Team Two' },
      team1,
      team2,
      rounds: [{ ...eventDefaultRound(0, team1, team2), format: 'twoManBestBallAggy', pairMatches }],
    },
    players,
  );

  return {
    round: config.rounds[0] as EventRoundConfig,
    scoreContext: {
      course,
      scores: matrix(players),
      strokes: Object.fromEntries(players.map((player) => [player, 0])),
    },
    pairMatches,
    team1,
    team2,
  };
}

describe('event round scoring', () => {
  it('scores 2-0 when one side wins best ball and aggy', () => {
    const input = inputFor();
    setHole(input.scoreContext.scores, 0, { A: 4, B: 5, C: 5, D: 6 });

    const result = computeEventRoundResult(input);

    expect(result.team1).toBe(2);
    expect(result.team2).toBe(0);
    expect(result.rows[0].components[0].team1).toBe(2);
    expect(result.rows[0].components[0].winner).toBe('team1');
  });

  it('splits points when best ball ties and aggy is won', () => {
    const input = inputFor();
    setHole(input.scoreContext.scores, 0, { A: 4, B: 5, C: 4, D: 6 });

    const result = computeEventRoundResult(input);

    expect(result.team1).toBe(1.5);
    expect(result.team2).toBe(0.5);
  });

  it('splits points when best ball is won and aggy ties', () => {
    const input = inputFor();
    setHole(input.scoreContext.scores, 0, { A: 4, B: 6, C: 5, D: 5 });

    const result = computeEventRoundResult(input);

    expect(result.team1).toBe(1.5);
    expect(result.team2).toBe(0.5);
  });

  it('ties all components for a 1-1 hole', () => {
    const input = inputFor();
    setHole(input.scoreContext.scores, 0, { A: 4, B: 6, C: 4, D: 6 });

    const result = computeEventRoundResult(input);

    expect(result.team1).toBe(1);
    expect(result.team2).toBe(1);
  });

  it('splits a hole when best ball and aggy are won by opposite sides', () => {
    const input = inputFor();
    setHole(input.scoreContext.scores, 0, { A: 4, B: 7, C: 5, D: 5 });

    const result = computeEventRoundResult(input);

    expect(result.team1).toBe(1);
    expect(result.team2).toBe(1);
  });

  it('keeps incomplete holes open', () => {
    const input = inputFor();
    setHole(input.scoreContext.scores, 0, { A: 4, B: 5, C: 5 });

    const result = computeEventRoundResult(input);

    expect(result.team1).toBe(0);
    expect(result.team2).toBe(0);
    expect(result.complete).toBe(false);
    expect(result.rows[0].components[0].winner).toBe('open');
  });

  it('accumulates multi-hole totals', () => {
    const input = inputFor();
    setHole(input.scoreContext.scores, 0, { A: 4, B: 5, C: 5, D: 6 });
    setHole(input.scoreContext.scores, 1, { A: 4, B: 5, C: 4, D: 6 });
    setHole(input.scoreContext.scores, 2, { A: 4, B: 6, C: 4, D: 6 });

    const result = computeEventRoundResult(input);

    expect(result.team1).toBe(4.5);
    expect(result.team2).toBe(1.5);
  });

  it('accumulates multiple matches', () => {
    const input = inputFor([
      { a: ['A', 'B'], b: ['C', 'D'] },
      { a: ['E', 'F'], b: ['G', 'H'] },
    ]);
    setHole(input.scoreContext.scores, 0, {
      A: 4,
      B: 5,
      C: 5,
      D: 6,
      E: 6,
      F: 6,
      G: 4,
      H: 5,
    });

    const result = computeEventRoundResult(input);

    expect(result.team1).toBe(2);
    expect(result.team2).toBe(2);
  });

  it('builds best-ball-aggy component details', () => {
    const input = inputFor();
    setHole(input.scoreContext.scores, 0, { A: 4, B: 5, C: 5, D: 6 });

    const component = bestBallAggyHoleComponent(input.scoreContext, ['A', 'B'], ['C', 'D'], 0);

    expect(component.detail).toEqual({
      kind: 'bestBallAggy',
      bb: { winner: 'team1', a: 4, b: 5 },
      aggy: { winner: 'team1', a: 9, b: 11 },
    });
  });
});
