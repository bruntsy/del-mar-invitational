import { playerHoleScore, type ScoreContext } from '@/scoring/round';
import type { ScoreType } from '@/types';

export interface TeamHoleStats {
  bestBall: number | null;
}

export interface TeamTotals {
  bbOut: number | null;
  bbIn: number | null;
  bbTotal: number | null;
}

function totalOrNull(total: number, any: boolean): number | null {
  return any ? total : null;
}

export function computeTeamHoleStats(
  context: ScoreContext,
  teamPlayers: string[],
  hole: number,
  type: ScoreType = 'net',
): TeamHoleStats {
  const values = teamPlayers
    .map((player) => playerHoleScore(context, player, hole, type))
    .filter((value): value is number => value != null)
    .sort((a, b) => a - b);
  const complete = teamPlayers.length > 0 && values.length === teamPlayers.length;

  return {
    bestBall: complete ? values[0] : null,
  };
}

export function computeTeamTotals(
  context: ScoreContext,
  teamPlayers: string[],
  type: ScoreType = 'net',
): TeamTotals {
  let bbOut = 0;
  let bbOutAny = false;
  let bbIn = 0;
  let bbInAny = false;

  for (let hole = 0; hole < 18; hole += 1) {
    const stats = computeTeamHoleStats(context, teamPlayers, hole, type);

    if (hole < 9) {
      if (stats.bestBall != null) {
        bbOut += stats.bestBall;
        bbOutAny = true;
      }
    } else {
      if (stats.bestBall != null) {
        bbIn += stats.bestBall;
        bbInAny = true;
      }
    }
  }

  return {
    bbOut: totalOrNull(bbOut, bbOutAny),
    bbIn: totalOrNull(bbIn, bbInAny),
    bbTotal: bbOutAny || bbInAny ? (bbOutAny ? bbOut : 0) + (bbInAny ? bbIn : 0) : null,
  };
}
