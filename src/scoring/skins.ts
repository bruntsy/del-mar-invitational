import { scoreAt } from '@/scoring/cells';
import { playerHoleScore, type ScoreContext } from '@/scoring/round';

export interface SkinHoleResult {
  hole: number;
  winner: string | null;
  pot: number;
  nets: Record<string, number>;
  tied: boolean;
  tiedPlayers?: string[];
}

export interface SkinsResult {
  skinsByPlayer: Record<string, number>;
  holeResults: SkinHoleResult[];
  pendingPot: number;
}

export function computeSkins(context: ScoreContext, players: string[]): SkinsResult {
  const skinsByPlayer = Object.fromEntries(players.map((player) => [player, 0]));
  const holeResults: SkinHoleResult[] = [];

  if (!players.length) {
    return { skinsByPlayer, holeResults, pendingPot: 0 };
  }

  for (let hole = 0; hole < 18; hole += 1) {
    const allEntered = players.every((player) => scoreAt(context.scores, player, hole) != null);
    if (!allEntered) break;

    const nets = Object.fromEntries(
      players.map((player) => [player, playerHoleScore(context, player, hole, 'net') ?? 0]),
    );
    const min = Math.min(...Object.values(nets));
    const winners = players.filter((player) => nets[player] === min);

    if (winners.length === 1) {
      const [winner] = winners;
      skinsByPlayer[winner] += 1;
      holeResults.push({ hole: hole + 1, winner, pot: 1, nets, tied: false });
    } else {
      holeResults.push({
        hole: hole + 1,
        winner: null,
        pot: 0,
        nets,
        tied: true,
        tiedPlayers: winners,
      });
    }
  }

  return { skinsByPlayer, holeResults, pendingPot: 0 };
}
