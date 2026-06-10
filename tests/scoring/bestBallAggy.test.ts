import { describe, expect, it } from 'vitest';
import { scoreBestBallAggy, type BestBallAggyConfig } from '@/scoring/bestBallAggy';
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

/** Fill a contiguous range of holes [start, end) with a constant per-player score. */
function fillRange(scores: ScoreMatrix, start: number, end: number, values: Record<string, number>) {
  for (let hole = start; hole < end; hole += 1) {
    for (const [player, score] of Object.entries(values)) {
      scores[player][hole] = score;
    }
  }
}

const PLAYERS = ['A1', 'A2', 'B1', 'B2'];

function baseConfig(overrides: Partial<BestBallAggyConfig> = {}): BestBallAggyConfig {
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

/** Reduce ledger entries into a per-player net P&L map. */
function pnlFromLedger(entries: { fromPlayerId: string; toPlayerId: string; amount: number }[]) {
  const pnl: Record<string, number> = Object.fromEntries(PLAYERS.map((p) => [p, 0]));
  for (const entry of entries) {
    pnl[entry.fromPlayerId] -= entry.amount;
    pnl[entry.toPlayerId] += entry.amount;
  }
  return pnl;
}

describe('scoreBestBallAggy', () => {
  it('stroke play: team A wins BB front, team B wins Aggy front, net offset', () => {
    // Per front hole: A1=4 A2=7 (BB=4, Aggy=11), B1=5 B2=5 (BB=5, Aggy=10).
    // BB front -> A wins (36 < 45). Aggy front -> B wins (90 < 99).
    const scores = matrix(PLAYERS);
    fillRange(scores, 0, 9, { A1: 4, A2: 7, B1: 5, B2: 5 });
    // back nine left empty -> back & overall incomplete

    const result = scoreBestBallAggy(baseConfig(), context(scores));

    expect(result.valid).toBe(true);

    const bbFront = result.segmentResults.bestBall.front;
    expect(bbFront.winnerTeamId).toBe('a');
    expect(bbFront.loserTeamId).toBe('b');
    expect(bbFront.teamScores).toEqual({ a: 36, b: 45 });

    const aggyFront = result.segmentResults.aggy.front;
    expect(aggyFront.winnerTeamId).toBe('b');
    expect(aggyFront.loserTeamId).toBe('a');
    expect(aggyFront.teamScores).toEqual({ a: 99, b: 90 });

    // back & overall incomplete -> no ledger entries from them
    expect(result.segmentResults.bestBall.back.incomplete).toBe(true);
    expect(result.segmentResults.bestBall.overall.incomplete).toBe(true);

    // 4 entries per won segment (2 losers x 2 winners), two segments -> 8.
    expect(result.ledgerEntries).toHaveLength(8);
    for (const entry of result.ledgerEntries) {
      expect(entry.amount).toBe(5);
      expect(entry.segment).toBe('front');
    }

    // BB and Aggy offset on the front -> everyone net 0.
    expect(pnlFromLedger(result.ledgerEntries)).toEqual({ A1: 0, A2: 0, B1: 0, B2: 0 });
  });

  it('match play: counts holes won per contest independently', () => {
    // Every front hole: BB -> A wins, Aggy -> B wins.
    const scores = matrix(PLAYERS);
    fillRange(scores, 0, 9, { A1: 4, A2: 7, B1: 5, B2: 5 });

    const result = scoreBestBallAggy(baseConfig({ scoringMode: 'match' }), context(scores));

    const bbFront = result.segmentResults.bestBall.front;
    expect(bbFront.teamHolesWon).toEqual({ a: 9, b: 0 });
    expect(bbFront.winnerTeamId).toBe('a');
    expect(bbFront.teamScores).toBeUndefined();

    const aggyFront = result.segmentResults.aggy.front;
    expect(aggyFront.teamHolesWon).toEqual({ a: 0, b: 9 });
    expect(aggyFront.winnerTeamId).toBe('b');

    expect(result.ledgerEntries).toHaveLength(8);
    expect(pnlFromLedger(result.ledgerEntries)).toEqual({ A1: 0, A2: 0, B1: 0, B2: 0 });
  });

  it('incomplete hole 9 (index 8): front + overall incomplete, back still scores', () => {
    const scores = matrix(PLAYERS);
    fillRange(scores, 0, 18, { A1: 4, A2: 7, B1: 5, B2: 5 });
    scores.A1[8] = null; // remove a score on the 9th hole (front)

    const result = scoreBestBallAggy(baseConfig(), context(scores));

    expect(result.holeResults[8].incomplete).toBe(true);

    expect(result.segmentResults.bestBall.front.incomplete).toBe(true);
    expect(result.segmentResults.aggy.front.incomplete).toBe(true);
    expect(result.segmentResults.bestBall.overall.incomplete).toBe(true);
    expect(result.segmentResults.aggy.overall.incomplete).toBe(true);

    // back nine is complete -> resolves
    expect(result.segmentResults.bestBall.back.incomplete).toBe(false);
    expect(result.segmentResults.bestBall.back.winnerTeamId).toBe('a');
    expect(result.segmentResults.aggy.back.winnerTeamId).toBe('b');

    // ledger only from the back segment (4 BB + 4 Aggy)
    expect(result.ledgerEntries.every((e) => e.segment === 'back')).toBe(true);
    expect(result.ledgerEntries).toHaveLength(8);
  });

  it('push: tied segment produces no ledger entries', () => {
    // Front symmetric: both teams BB=4, Aggy=9 each hole.
    const scores = matrix(PLAYERS);
    fillRange(scores, 0, 9, { A1: 4, A2: 5, B1: 4, B2: 5 });

    const result = scoreBestBallAggy(baseConfig(), context(scores));

    expect(result.segmentResults.bestBall.front.pushed).toBe(true);
    expect(result.segmentResults.bestBall.front.winnerTeamId).toBeUndefined();
    expect(result.segmentResults.aggy.front.pushed).toBe(true);
    expect(result.ledgerEntries).toHaveLength(0);
  });

  it('net mode uses relative strokes while gross does not', () => {
    // Gross: A1=A2=4 (BB 4, Aggy 8), B1=B2=5 (BB 5, Aggy 10).
    // B players each receive a stroke on every front hole (strokes >= 9).
    // Net: B nets to 4/4 -> BB 4, Aggy 8 -> everything ties (push).
    const scores = matrix(PLAYERS);
    fillRange(scores, 0, 9, { A1: 4, A2: 4, B1: 5, B2: 5 });
    const ctx = context(scores, { B1: 9, B2: 9 });

    const gross = scoreBestBallAggy(baseConfig({ scoreBasis: 'gross' }), ctx);
    expect(gross.segmentResults.bestBall.front.winnerTeamId).toBe('a');
    expect(gross.segmentResults.aggy.front.winnerTeamId).toBe('a');

    const net = scoreBestBallAggy(baseConfig({ scoreBasis: 'net' }), ctx);
    expect(net.segmentResults.bestBall.front.pushed).toBe(true);
    expect(net.segmentResults.aggy.front.pushed).toBe(true);
    expect(net.segmentResults.bestBall.front.teamScores).toEqual({ a: 36, b: 36 });
  });

  it('zero stake scores the segment but creates no ledger entries', () => {
    const scores = matrix(PLAYERS);
    fillRange(scores, 0, 9, { A1: 4, A2: 7, B1: 5, B2: 5 });

    const result = scoreBestBallAggy(
      baseConfig({ stake: { front: 0, back: 0, overall: 0 } }),
      context(scores),
    );

    expect(result.segmentResults.bestBall.front.winnerTeamId).toBe('a');
    expect(result.ledgerEntries).toHaveLength(0);
  });

  it('returns a validation error for a team without exactly 2 players', () => {
    const scores = matrix([...PLAYERS, 'A3']);
    fillRange(scores, 0, 9, { A1: 4, A2: 7, B1: 5, B2: 5, A3: 4 });

    const config = baseConfig({
      teams: [
        { id: 'a', players: ['A1', 'A2', 'A3'] },
        { id: 'b', players: ['B1', 'B2'] },
      ] as unknown as BestBallAggyConfig['teams'],
    });

    const result = scoreBestBallAggy(config, context(scores));
    expect(result.valid).toBe(false);
    expect(result.validationError).toBeTruthy();
    expect(result.ledgerEntries).toHaveLength(0);
    expect(result.holeResults).toHaveLength(0);
  });

  it('returns a validation error for a duplicate player across teams', () => {
    const scores = matrix(PLAYERS);
    fillRange(scores, 0, 9, { A1: 4, A2: 7, B1: 5, B2: 5 });

    const config = baseConfig({
      teams: [
        { id: 'a', players: ['A1', 'A2'] },
        { id: 'b', players: ['A1', 'B2'] },
      ],
    });

    const result = scoreBestBallAggy(config, context(scores));
    expect(result.valid).toBe(false);
    expect(result.validationError).toMatch(/both teams/i);
  });
});
