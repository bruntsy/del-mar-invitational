import { describe, expect, it } from 'vitest';
import { scoreHighBallLowBall, type HighBallLowBallConfig } from '@/scoring/highBallLowBall';
import type { ScoreContext } from '@/scoring/round';
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

function context(scores: ScoreMatrix, strokes: Record<string, number> = {}): ScoreContext {
  const filled = Object.fromEntries(Object.keys(scores).map((p) => [p, strokes[p] ?? 0]));
  return { course, scores, strokes: filled };
}

function fillRange(scores: ScoreMatrix, start: number, end: number, values: Record<string, number>) {
  for (let hole = start; hole < end; hole += 1) {
    for (const [player, score] of Object.entries(values)) {
      scores[player][hole] = score;
    }
  }
}

const PLAYERS = ['A1', 'A2', 'B1', 'B2'];

function baseConfig(overrides: Partial<HighBallLowBallConfig> = {}): HighBallLowBallConfig {
  return {
    teams: [
      { id: 'a', players: ['A1', 'A2'] },
      { id: 'b', players: ['B1', 'B2'] },
    ],
    scoreBasis: 'gross',
    scoringMode: 'stroke',
    stake: { front: 10, back: 10, overall: 10 },
    ...overrides,
  };
}

function pnlFromLedger(entries: { fromPlayerId: string; toPlayerId: string; amount: number }[]) {
  const pnl: Record<string, number> = Object.fromEntries(PLAYERS.map((p) => [p, 0]));
  for (const entry of entries) {
    pnl[entry.fromPlayerId] -= entry.amount;
    pnl[entry.toPlayerId] += entry.amount;
  }
  return pnl;
}

describe('scoreHighBallLowBall', () => {
  it('lower score wins both contests; High Ball compares the worse balls', () => {
    // Spec §1: A1=4 A2=6 -> Low 4, High 6; B1=5 B2=5 -> Low 5, High 5.
    // Low Ball: A wins (4<5). High Ball: B wins (5<6, the lower worse ball).
    const scores = matrix(PLAYERS);
    fillRange(scores, 0, 9, { A1: 4, A2: 6, B1: 5, B2: 5 });

    const result = scoreHighBallLowBall(baseConfig({ scoringMode: 'match' }), context(scores));

    expect(result.valid).toBe(true);
    const low = result.segmentResults.lowBall.front;
    const high = result.segmentResults.highBall.front;
    expect(low.winnerTeamId).toBe('a');
    expect(low.teamHolesWon).toEqual({ a: 9, b: 0 });
    expect(high.winnerTeamId).toBe('b');
    expect(high.teamHolesWon).toEqual({ a: 0, b: 9 });
  });

  it('stroke play: team A wins Low front, team B wins High front, net offset', () => {
    // Per hole: A1=4 A2=6 (Low 4, High 6), B1=5 B2=5 (Low 5, High 5).
    // Low front: A 36 < B 45 -> A wins. High front: B 45 < A 54 -> B wins.
    const scores = matrix(PLAYERS);
    fillRange(scores, 0, 9, { A1: 4, A2: 6, B1: 5, B2: 5 });

    const result = scoreHighBallLowBall(baseConfig(), context(scores));

    const low = result.segmentResults.lowBall.front;
    expect(low.winnerTeamId).toBe('a');
    expect(low.teamScores).toEqual({ a: 36, b: 45 });

    const high = result.segmentResults.highBall.front;
    expect(high.winnerTeamId).toBe('b');
    expect(high.teamScores).toEqual({ a: 54, b: 45 });

    // back & overall incomplete -> no ledger entries from them
    expect(result.segmentResults.lowBall.back.incomplete).toBe(true);
    expect(result.segmentResults.lowBall.overall.incomplete).toBe(true);

    expect(result.ledgerEntries).toHaveLength(8);
    for (const entry of result.ledgerEntries) {
      expect(entry.amount).toBe(5);
      expect(entry.segment).toBe('front');
    }
    // Low and High offset on the front -> everyone net 0.
    expect(pnlFromLedger(result.ledgerEntries)).toEqual({ A1: 0, A2: 0, B1: 0, B2: 0 });
  });

  it('match play: counts holes won per contest independently', () => {
    const scores = matrix(PLAYERS);
    fillRange(scores, 0, 9, { A1: 4, A2: 6, B1: 5, B2: 5 });

    const result = scoreHighBallLowBall(baseConfig({ scoringMode: 'match' }), context(scores));

    expect(result.segmentResults.lowBall.front.teamHolesWon).toEqual({ a: 9, b: 0 });
    expect(result.segmentResults.highBall.front.teamHolesWon).toEqual({ a: 0, b: 9 });
    expect(result.ledgerEntries).toHaveLength(8);
    expect(pnlFromLedger(result.ledgerEntries)).toEqual({ A1: 0, A2: 0, B1: 0, B2: 0 });
  });

  it('incomplete hole 9 (index 8): front + overall incomplete, back still scores', () => {
    const scores = matrix(PLAYERS);
    fillRange(scores, 0, 18, { A1: 4, A2: 5, B1: 6, B2: 7 }); // team A lower on both balls -> A sweeps
    scores.A1[8] = null;

    const result = scoreHighBallLowBall(baseConfig(), context(scores));

    expect(result.holeResults[8].incomplete).toBe(true);
    expect(result.segmentResults.lowBall.front.incomplete).toBe(true);
    expect(result.segmentResults.highBall.front.incomplete).toBe(true);
    expect(result.segmentResults.lowBall.overall.incomplete).toBe(true);
    expect(result.segmentResults.highBall.overall.incomplete).toBe(true);

    expect(result.segmentResults.lowBall.back.incomplete).toBe(false);
    expect(result.segmentResults.lowBall.back.winnerTeamId).toBe('a');
    expect(result.segmentResults.highBall.back.winnerTeamId).toBe('a');
    expect(result.ledgerEntries.every((e) => e.segment === 'back')).toBe(true);
    expect(result.ledgerEntries).toHaveLength(8);
  });

  it('push: tied segment produces no ledger entries', () => {
    const scores = matrix(PLAYERS);
    fillRange(scores, 0, 9, { A1: 4, A2: 5, B1: 4, B2: 5 });

    const result = scoreHighBallLowBall(baseConfig(), context(scores));

    expect(result.segmentResults.lowBall.front.pushed).toBe(true);
    expect(result.segmentResults.highBall.front.pushed).toBe(true);
    expect(result.ledgerEntries).toHaveLength(0);
  });

  it('net mode uses relative strokes while gross does not', () => {
    // Gross: A 4/4, B 5/5. B players each receive a stroke on every front hole.
    // Net: B nets to 4/4 -> everything ties (push).
    const scores = matrix(PLAYERS);
    fillRange(scores, 0, 9, { A1: 4, A2: 4, B1: 5, B2: 5 });
    const ctx = context(scores, { B1: 9, B2: 9 });

    const gross = scoreHighBallLowBall(baseConfig({ scoreBasis: 'gross' }), ctx);
    expect(gross.segmentResults.lowBall.front.winnerTeamId).toBe('a');
    expect(gross.segmentResults.highBall.front.winnerTeamId).toBe('a');

    const net = scoreHighBallLowBall(baseConfig({ scoreBasis: 'net' }), ctx);
    expect(net.segmentResults.lowBall.front.pushed).toBe(true);
    expect(net.segmentResults.highBall.front.pushed).toBe(true);
  });

  it('zero stake scores the segment but creates no ledger entries', () => {
    const scores = matrix(PLAYERS);
    fillRange(scores, 0, 9, { A1: 4, A2: 5, B1: 6, B2: 7 });

    const result = scoreHighBallLowBall(
      baseConfig({ stake: { front: 0, back: 0, overall: 0 } }),
      context(scores),
    );

    expect(result.segmentResults.lowBall.front.winnerTeamId).toBe('a');
    expect(result.ledgerEntries).toHaveLength(0);
  });

  it('returns a validation error for a team without exactly 2 players', () => {
    const config = baseConfig({
      teams: [
        { id: 'a', players: ['A1', 'A2', 'A3'] },
        { id: 'b', players: ['B1', 'B2'] },
      ] as unknown as HighBallLowBallConfig['teams'],
    });
    const result = scoreHighBallLowBall(config, context(matrix(PLAYERS)));
    expect(result.valid).toBe(false);
    expect(result.validationError).toBeTruthy();
    expect(result.ledgerEntries).toHaveLength(0);
    expect(result.holeResults).toHaveLength(0);
  });

  it('returns a validation error for a duplicate player across teams', () => {
    const config = baseConfig({
      teams: [
        { id: 'a', players: ['A1', 'A2'] },
        { id: 'b', players: ['A1', 'B2'] },
      ],
    });
    const result = scoreHighBallLowBall(config, context(matrix(PLAYERS)));
    expect(result.valid).toBe(false);
    expect(result.validationError).toMatch(/both teams/i);
  });
});
