import { describe, expect, it } from 'vitest';
import { computePuttPoker, puttPenaltyNote } from '@/scoring/puttPoker';
import type { ScoreMatrix } from '@/types';

function matrix(players: string[]): ScoreMatrix {
  return Object.fromEntries(players.map((player) => [player, Array(18).fill(null)]));
}

describe('putt poker scoring', () => {
  it('starts every player with two cards and no penalties', () => {
    const putts = matrix(['A', 'B']);

    expect(computePuttPoker(putts, ['A', 'B'])).toEqual({
      cards: { A: 2, B: 2 },
      coinHolder: null,
      pot: 0,
      threePuttCount: { A: 0, B: 0 },
      fourPuttCount: { A: 0, B: 0 },
    });
  });

  it('seeds the base pot from buy-in times player count', () => {
    const putts = matrix(['A', 'B', 'C']);

    expect(computePuttPoker(putts, ['A', 'B', 'C'], 5).pot).toBe(15);
  });

  it('awards two cards for a no-putt hole and one for a one-putt', () => {
    const putts = matrix(['A', 'B']);
    putts.A[0] = 0; // chip-in
    putts.A[1] = 1; // one-putt
    putts.B[0] = 1; // one-putt

    const result = computePuttPoker(putts, ['A', 'B']);

    expect(result.cards).toEqual({ A: 5, B: 3 });
    expect(result.pot).toBe(0);
    expect(result.coinHolder).toBeNull();
  });

  it('does not change cards or pot for a two-putt hole', () => {
    const putts = matrix(['A']);
    putts.A[0] = 2;

    expect(computePuttPoker(putts, ['A'])).toMatchObject({
      cards: { A: 2 },
      pot: 0,
      coinHolder: null,
    });
  });

  it('hands the coin and adds one dollar for a three-putt', () => {
    const putts = matrix(['A', 'B']);
    putts.A[3] = 3;

    const result = computePuttPoker(putts, ['A', 'B'], 0);

    expect(result.coinHolder).toBe('A');
    expect(result.pot).toBe(1);
    expect(result.threePuttCount).toEqual({ A: 1, B: 0 });
    expect(result.fourPuttCount).toEqual({ A: 0, B: 0 });
    // a penalty putt does not add cards
    expect(result.cards).toEqual({ A: 2, B: 2 });
  });

  it('hands the coin and adds two dollars for a four-or-more putt', () => {
    const putts = matrix(['A', 'B']);
    putts.A[3] = 5;

    const result = computePuttPoker(putts, ['A', 'B']);

    expect(result.coinHolder).toBe('A');
    expect(result.pot).toBe(2);
    expect(result.fourPuttCount).toEqual({ A: 1, B: 0 });
  });

  it('gives the coin to the most recent penalty in hole then player order', () => {
    const putts = matrix(['A', 'B']);
    putts.A[2] = 3; // earlier hole
    putts.B[5] = 4; // later hole
    putts.A[5] = 3; // same hole as B but earlier in player order

    const result = computePuttPoker(putts, ['A', 'B']);

    // hole 5 is the latest penalty hole; within it B is processed after A
    expect(result.coinHolder).toBe('B');
    // 3-putt ($1) + 4-putt ($2) + 3-putt ($1)
    expect(result.pot).toBe(4);
    expect(result.threePuttCount).toEqual({ A: 2, B: 0 });
    expect(result.fourPuttCount).toEqual({ A: 0, B: 1 });
  });

  it('ignores holes with no recorded putts', () => {
    const putts = matrix(['A', 'B']);
    putts.A[0] = 1;
    // B has nothing recorded

    const result = computePuttPoker(putts, ['A', 'B'], 2);

    expect(result.cards).toEqual({ A: 3, B: 2 });
    expect(result.coinHolder).toBeNull();
    expect(result.pot).toBe(4);
  });

  it('reads timed putt cells as well as raw numbers', () => {
    const putts: ScoreMatrix = {
      A: Array(18).fill(null),
    };
    putts.A[0] = { v: 0, t: '2026-06-08T12:00:00.000Z' };
    putts.A[1] = { v: 3, t: '2026-06-08T12:05:00.000Z' };

    const result = computePuttPoker(putts, ['A']);

    expect(result.cards).toEqual({ A: 4 });
    expect(result.coinHolder).toBe('A');
    expect(result.pot).toBe(1);
  });

  it('formats penalty notes like the legacy panel', () => {
    expect(puttPenaltyNote(0, 0)).toBe('');
    expect(puttPenaltyNote(2, 0)).toBe('2x 3-putt');
    expect(puttPenaltyNote(0, 1)).toBe('1x 4+ putt');
    expect(puttPenaltyNote(1, 2)).toBe('1x 3-putt / 2x 4+ putt');
  });
});
