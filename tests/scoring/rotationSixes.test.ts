import { describe, expect, it } from 'vitest';
import {
  defaultRotationSixesMatches,
  scoreRotationSixes,
  type RotationSixesConfig,
  type RotationSixesLedgerEntry,
} from '@/scoring/rotationSixes';
import type { ScoreContext } from '@/scoring/round';
import type { Course, ScoreMatrix } from '@/types';

const PLAYERS: [string, string, string, string] = ['A', 'B', 'C', 'D'];

const course: Course = {
  tee: { name: 'Test', rating: 72, slope: 113, parTotal: 72 },
  par: Array(18).fill(4),
  si: Array.from({ length: 18 }, (_, index) => index + 1),
  yds: Array(18).fill(400),
};

function matrix(players: string[] = PLAYERS): ScoreMatrix {
  return Object.fromEntries(players.map((player) => [player, Array(18).fill(null)]));
}

function context(scores: ScoreMatrix, strokes: Record<string, number> = {}): ScoreContext {
  return {
    course,
    scores,
    strokes: Object.fromEntries(Object.keys(scores).map((player) => [player, strokes[player] ?? 0])),
  };
}

function fillRange(scores: ScoreMatrix, start: number, end: number, values: Record<string, number>) {
  for (let hole = start; hole < end; hole += 1) {
    for (const [player, score] of Object.entries(values)) scores[player][hole] = score;
  }
}

function baseConfig(overrides: Partial<RotationSixesConfig> = {}): RotationSixesConfig {
  return {
    players: PLAYERS,
    variant: 'best_ball',
    scoreBasis: 'gross',
    stakePerPlayer: 5,
    ...overrides,
  };
}

function pnlFromLedger(entries: RotationSixesLedgerEntry[]) {
  const pnl = Object.fromEntries(PLAYERS.map((player) => [player, 0]));
  for (const entry of entries) {
    pnl[entry.fromPlayerId] -= entry.amount;
    pnl[entry.toPlayerId] += entry.amount;
  }
  return pnl;
}

describe('Rotation Sixes scoring', () => {
  it('builds the default three-match partner rotation', () => {
    expect(defaultRotationSixesMatches(PLAYERS).map((match) => ({
      label: match.label,
      sideA: match.sideA,
      sideB: match.sideB,
    }))).toEqual([
      { label: 'Holes 1-6', sideA: ['A', 'B'], sideB: ['C', 'D'] },
      { label: 'Holes 7-12', sideA: ['A', 'C'], sideB: ['B', 'D'] },
      { label: 'Holes 13-18', sideA: ['A', 'D'], sideB: ['B', 'C'] },
    ]);
  });

  it('validates exactly four unique players', () => {
    const scores = matrix();
    const result = scoreRotationSixes(
      baseConfig({ players: ['A', 'B', 'C', 'C'] as unknown as RotationSixesConfig['players'] }),
      context(scores),
    );
    expect(result.valid).toBe(false);
    expect(result.validationError).toMatch(/four unique players/i);
    expect(result.matches).toHaveLength(0);
  });

  it('scores gross Best Ball across holes 1-6 and generates match ledger entries', () => {
    const scores = matrix();
    fillRange(scores, 0, 6, { A: 4, B: 5, C: 5, D: 6 });

    const result = scoreRotationSixes(baseConfig(), context(scores));
    const first = result.matches[0];

    expect(result.valid).toBe(true);
    expect(first.complete).toBe(true);
    expect(first.components[0]).toMatchObject({ key: 'best_ball', sideAPoints: 6, sideBPoints: 0, pushed: 0 });
    expect(first.winnerSide).toBe('a');
    expect(first.ledgerEntries).toHaveLength(4);
    expect(first.ledgerEntries[0].amount).toBe(2.5);
    expect(pnlFromLedger(first.ledgerEntries)).toEqual({ A: 5, B: 5, C: -5, D: -5 });
  });

  it('scores net Best Ball with stroke allocation', () => {
    const scores = matrix();
    fillRange(scores, 0, 6, { A: 4, B: 4, C: 5, D: 5 });

    const gross = scoreRotationSixes(baseConfig({ scoreBasis: 'gross' }), context(scores, { C: 6, D: 6 }));
    expect(gross.matches[0].winnerSide).toBe('a');

    const net = scoreRotationSixes(baseConfig({ scoreBasis: 'net' }), context(scores, { C: 6, D: 6 }));
    expect(net.matches[0].winnerSide).toBe('push');
    expect(net.matches[0].components[0]).toMatchObject({ sideAPoints: 0, sideBPoints: 0, pushed: 6 });
  });

  it('scores High / Low as two component points per hole', () => {
    const scores = matrix();
    fillRange(scores, 0, 6, { A: 4, B: 6, C: 5, D: 5 });

    const result = scoreRotationSixes(baseConfig({ variant: 'high_low' }), context(scores));
    const [low, high] = result.matches[0].components;

    expect(low).toMatchObject({ key: 'low_ball', sideAPoints: 6, sideBPoints: 0 });
    expect(high).toMatchObject({ key: 'high_ball', sideAPoints: 0, sideBPoints: 6 });
    expect(result.matches[0].sideAPoints).toBe(6);
    expect(result.matches[0].sideBPoints).toBe(6);
    expect(result.matches[0].winnerSide).toBe('push');
  });

  it('scores Best Ball + Aggy as two component points per hole', () => {
    const scores = matrix();
    fillRange(scores, 0, 6, { A: 4, B: 7, C: 5, D: 5 });

    const result = scoreRotationSixes(baseConfig({ variant: 'best_ball_aggy' }), context(scores));
    const [bestBall, aggy] = result.matches[0].components;

    expect(bestBall).toMatchObject({ key: 'best_ball', sideAPoints: 6, sideBPoints: 0 });
    expect(aggy).toMatchObject({ key: 'aggy', sideAPoints: 0, sideBPoints: 6 });
    expect(result.matches[0].winnerSide).toBe('push');
  });

  it('marks a six-hole match incomplete when a required score is missing', () => {
    const scores = matrix();
    fillRange(scores, 0, 6, { A: 4, B: 5, C: 6, D: 7 });
    scores.A[5] = null;

    const result = scoreRotationSixes(baseConfig(), context(scores));

    expect(result.matches[0].complete).toBe(false);
    expect(result.matches[0].winnerSide).toBe('open');
    expect(result.matches[0].holesPlayed).toBe(5);
    expect(result.matches[0].ledgerEntries).toHaveLength(0);
  });

  it('pushes tied six-hole matches and creates no ledger entries', () => {
    const scores = matrix();
    fillRange(scores, 0, 6, { A: 4, B: 5, C: 4, D: 5 });

    const result = scoreRotationSixes(baseConfig(), context(scores));

    expect(result.matches[0].winnerSide).toBe('push');
    expect(result.matches[0].ledgerEntries).toHaveLength(0);
  });
});
