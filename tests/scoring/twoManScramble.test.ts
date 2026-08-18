import { describe, expect, it } from 'vitest';
import { scoreTwoManScramble, type TwoManScrambleConfig } from '@/scoring/twoManScramble';
import type { ScoreRow } from '@/types';

const PLAYERS = ['A1', 'A2', 'B1', 'B2'];

function baseConfig(overrides: Partial<TwoManScrambleConfig> = {}): TwoManScrambleConfig {
  return {
    teams: [
      { id: 'a', players: ['A1', 'A2'] },
      { id: 'b', players: ['B1', 'B2'] },
    ],
    scoringMode: 'stroke',
    stake: { front: 10, back: 10, overall: 10 },
    ...overrides,
  };
}

function emptyRow(): ScoreRow {
  return Array(18).fill(null);
}

function rows(): Record<string, ScoreRow> {
  return { a: emptyRow(), b: emptyRow() };
}

function fillRange(row: ScoreRow, start: number, end: number, value: number | null) {
  for (let hole = start; hole < end; hole += 1) row[hole] = value;
}

function pnlFromLedger(entries: { fromPlayerId: string; toPlayerId: string; amount: number }[]) {
  const pnl: Record<string, number> = Object.fromEntries(PLAYERS.map((p) => [p, 0]));
  for (const entry of entries) {
    pnl[entry.fromPlayerId] -= entry.amount;
    pnl[entry.toPlayerId] += entry.amount;
  }
  return pnl;
}

describe('scoreTwoManScramble', () => {
  it('stroke play: lower segment total wins the front', () => {
    const teamHoleScores = rows();
    // Team A front total 34 (4*7 + 3*2 = 28 + 6 = 34), Team B front total 36 (4*9).
    fillRange(teamHoleScores.a, 0, 7, 4);
    fillRange(teamHoleScores.a, 7, 9, 3);
    fillRange(teamHoleScores.b, 0, 9, 4);

    const result = scoreTwoManScramble(baseConfig(), teamHoleScores);

    expect(result.valid).toBe(true);
    const front = result.segmentResults.front;
    expect(front.winnerTeamId).toBe('a');
    expect(front.loserTeamId).toBe('b');
    expect(front.teamScores).toEqual({ a: 34, b: 36 });

    // back & overall incomplete -> only front pays
    expect(result.segmentResults.back.incomplete).toBe(true);
    expect(result.segmentResults.overall.incomplete).toBe(true);

    expect(result.ledgerEntries).toHaveLength(4);
    for (const entry of result.ledgerEntries) {
      expect(entry.amount).toBe(5);
      expect(entry.segment).toBe('front');
    }
    expect(pnlFromLedger(result.ledgerEntries)).toEqual({ A1: 10, A2: 10, B1: -10, B2: -10 });
  });

  it('match play: more holes won wins, counted independently per segment', () => {
    const teamHoleScores = rows();
    // Front: A wins 4, B wins 3, 2 tied -> A wins front.
    fillRange(teamHoleScores.a, 0, 4, 3); // A wins holes 1-4
    fillRange(teamHoleScores.b, 0, 4, 4);
    fillRange(teamHoleScores.a, 4, 7, 5); // B wins holes 5-7
    fillRange(teamHoleScores.b, 4, 7, 4);
    fillRange(teamHoleScores.a, 7, 9, 4); // ties holes 8-9
    fillRange(teamHoleScores.b, 7, 9, 4);

    const result = scoreTwoManScramble(baseConfig({ scoringMode: 'match' }), teamHoleScores);

    const front = result.segmentResults.front;
    expect(front.teamHolesWon).toEqual({ a: 4, b: 3 });
    expect(front.winnerTeamId).toBe('a');
    expect(front.teamScores).toBeUndefined();

    expect(result.ledgerEntries).toHaveLength(4);
    expect(pnlFromLedger(result.ledgerEntries)).toEqual({ A1: 10, A2: 10, B1: -10, B2: -10 });
  });

  it('push: tied segment produces no ledger entries', () => {
    const teamHoleScores = rows();
    fillRange(teamHoleScores.a, 0, 9, 4);
    fillRange(teamHoleScores.b, 0, 9, 4);

    const result = scoreTwoManScramble(baseConfig(), teamHoleScores);

    expect(result.segmentResults.front.pushed).toBe(true);
    expect(result.segmentResults.front.winnerTeamId).toBeUndefined();
    expect(result.ledgerEntries).toHaveLength(0);
  });

  it('incomplete hole 9 (index 8): front + overall incomplete, back still scores', () => {
    const teamHoleScores = rows();
    fillRange(teamHoleScores.a, 0, 18, 4);
    fillRange(teamHoleScores.b, 0, 18, 5); // B always higher -> A wins each hole
    teamHoleScores.a[8] = null; // remove team A score on the 9th hole

    const result = scoreTwoManScramble(baseConfig(), teamHoleScores);

    expect(result.holeResults[8].incomplete).toBe(true);
    expect(result.segmentResults.front.incomplete).toBe(true);
    expect(result.segmentResults.overall.incomplete).toBe(true);

    expect(result.segmentResults.back.incomplete).toBe(false);
    expect(result.segmentResults.back.winnerTeamId).toBe('a');
    expect(result.segmentResults.back.teamScores).toEqual({ a: 36, b: 45 });

    expect(result.ledgerEntries.every((e) => e.segment === 'back')).toBe(true);
    expect(result.ledgerEntries).toHaveLength(4);
  });

  it('zero stake scores the segment but creates no ledger entries', () => {
    const teamHoleScores = rows();
    fillRange(teamHoleScores.a, 0, 9, 4);
    fillRange(teamHoleScores.b, 0, 9, 5);

    const result = scoreTwoManScramble(
      baseConfig({ stake: { front: 0, back: 0, overall: 0 } }),
      teamHoleScores,
    );

    expect(result.segmentResults.front.winnerTeamId).toBe('a');
    expect(result.ledgerEntries).toHaveLength(0);
  });

  it('returns a validation error for a team without exactly 2 players', () => {
    const config = baseConfig({
      teams: [
        { id: 'a', players: ['A1'] },
        { id: 'b', players: ['B1', 'B2'] },
      ] as unknown as TwoManScrambleConfig['teams'],
    });

    const result = scoreTwoManScramble(config, rows());
    expect(result.valid).toBe(false);
    expect(result.validationError).toBeTruthy();
    expect(result.ledgerEntries).toHaveLength(0);
    expect(result.holeResults).toHaveLength(0);
  });
});
