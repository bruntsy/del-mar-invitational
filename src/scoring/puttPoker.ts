import { scoreAt } from '@/scoring/cells';
import type { ScoreMatrix } from '@/types';

export interface PuttPokerResult {
  cards: Record<string, number>;
  coinHolder: string | null;
  pot: number;
  threePuttCount: Record<string, number>;
  fourPuttCount: Record<string, number>;
}

/**
 * Pure port of the legacy `computePuttPoker()` helper.
 *
 * Every player starts with two cards. A no-putt hole (0 putts, e.g. a chip-in)
 * adds two cards, a one-putt adds one. A three-putt hands the player the coin
 * and adds $1 to the pot; a four-or-more putt hands the coin and adds $2. The
 * coin follows the most recent penalty putt in hole order, then player order.
 * Putt poker is a standalone pot and does not feed the settlement P&L ledger.
 */
export function computePuttPoker(
  putts: ScoreMatrix,
  players: string[],
  pot = 0,
): PuttPokerResult {
  const cards: Record<string, number> = {};
  const threePuttCount: Record<string, number> = {};
  const fourPuttCount: Record<string, number> = {};
  players.forEach((player) => {
    cards[player] = 2;
    threePuttCount[player] = 0;
    fourPuttCount[player] = 0;
  });

  let coinHolder: string | null = null;
  let total = (pot || 0) * players.length;

  for (let hole = 0; hole < 18; hole += 1) {
    players.forEach((player) => {
      const value = scoreAt(putts, player, hole);
      if (value == null) return;
      if (value === 0) cards[player] += 2;
      if (value === 1) cards[player] += 1;
      if (value === 3) {
        coinHolder = player;
        total += 1;
        threePuttCount[player] += 1;
      }
      if (value >= 4) {
        coinHolder = player;
        total += 2;
        fourPuttCount[player] += 1;
      }
    });
  }

  return { cards, coinHolder, pot: total, threePuttCount, fourPuttCount };
}

/**
 * Pure port of the legacy `puttPenaltyNote()` display helper.
 */
export function puttPenaltyNote(threePutts: number, fourPutts: number): string {
  return [
    threePutts > 0 ? `${threePutts}x 3-putt` : null,
    fourPutts > 0 ? `${fourPutts}x 4+ putt` : null,
  ]
    .filter(Boolean)
    .join(' / ');
}
