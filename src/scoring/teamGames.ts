import { playerHoleScore, type ScoreContext } from '@/scoring/round';
import type { ScoreType } from '@/types';

export interface TeamHoleStats {
  bestBall: number | null;
  twoBall: number | null;
  aggy: number | null;
}

export interface TeamTotals {
  bbOut: number | null;
  bbIn: number | null;
  bbTotal: number | null;
  tbOut: number | null;
  tbIn: number | null;
  tbTotal: number | null;
  agOut: number | null;
  agIn: number | null;
  agTotal: number | null;
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
    twoBall: complete && values.length >= 2 ? values[0] + values[1] : null,
    aggy: complete ? values.reduce((total, value) => total + value, 0) : null,
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
  let tbOut = 0;
  let tbOutAny = false;
  let tbIn = 0;
  let tbInAny = false;
  let agOut = 0;
  let agOutAny = false;
  let agIn = 0;
  let agInAny = false;

  for (let hole = 0; hole < 18; hole += 1) {
    const stats = computeTeamHoleStats(context, teamPlayers, hole, type);

    if (hole < 9) {
      if (stats.bestBall != null) {
        bbOut += stats.bestBall;
        bbOutAny = true;
      }
      if (stats.twoBall != null) {
        tbOut += stats.twoBall;
        tbOutAny = true;
      }
      if (stats.aggy != null) {
        agOut += stats.aggy;
        agOutAny = true;
      }
    } else {
      if (stats.bestBall != null) {
        bbIn += stats.bestBall;
        bbInAny = true;
      }
      if (stats.twoBall != null) {
        tbIn += stats.twoBall;
        tbInAny = true;
      }
      if (stats.aggy != null) {
        agIn += stats.aggy;
        agInAny = true;
      }
    }
  }

  return {
    bbOut: totalOrNull(bbOut, bbOutAny),
    bbIn: totalOrNull(bbIn, bbInAny),
    bbTotal: bbOutAny || bbInAny ? (bbOutAny ? bbOut : 0) + (bbInAny ? bbIn : 0) : null,
    tbOut: totalOrNull(tbOut, tbOutAny),
    tbIn: totalOrNull(tbIn, tbInAny),
    tbTotal: tbOutAny || tbInAny ? (tbOutAny ? tbOut : 0) + (tbInAny ? tbIn : 0) : null,
    agOut: totalOrNull(agOut, agOutAny),
    agIn: totalOrNull(agIn, agInAny),
    agTotal: agOutAny || agInAny ? (agOutAny ? agOut : 0) + (agInAny ? agIn : 0) : null,
  };
}
