import { scoreAt } from '@/scoring/cells';
import { playerRangeScore, type ScoreContext } from '@/scoring/round';
import { computeSkins } from '@/scoring/skins';
import { computeStableford } from '@/scoring/stableford';
import { computeTeamTotals } from '@/scoring/teamGames';
import { threeManNassauResults } from '@/scoring/threeManNassau';
import { wolfPoints, wolfSegmentWinners, wolfSegments, type WolfHoleConfig } from '@/scoring/wolf';
import type { GameConfig, ScoreMatrix } from '@/types';

export interface SettlementInput {
  scoreContext: ScoreContext;
  teamScores?: ScoreMatrix;
  team1: string[];
  team2: string[];
  players: string[];
  matchups: Array<{ t1: string; t2: string }>;
  games: GameConfig;
  wolfHoles?: Record<string, WolfHoleConfig | undefined>;
}

export interface SettlementTransfer {
  from: string;
  to: string;
  amount: number;
}

function teamScoreRange(
  teamScores: ScoreMatrix | undefined,
  teamKey: string,
  start: number,
  end: number,
): number | null {
  if (!teamScores) return null;
  let total = 0;
  let any = false;

  for (let hole = start; hole < end; hole += 1) {
    const value = scoreAt(teamScores, teamKey, hole);
    if (value != null) {
      total += value;
      any = true;
    }
  }

  return any ? total : null;
}

/**
 * Pure port of the legacy `computePlayerPnL()` settlement aggregator.
 *
 * Combines every money game into a single per-player profit/loss map. Putt poker
 * is intentionally excluded — it is a standalone pot in the legacy app and does
 * not feed settlement. Pair match play is likewise points-only and not settled
 * here, matching the monolith.
 */
export function computePlayerPnL(input: SettlementInput): Record<string, number> {
  const { scoreContext, teamScores, team1, team2, players, matchups, games: g, wolfHoles } = input;
  const pnl: Record<string, number> = Object.fromEntries(players.map((player) => [player, 0]));

  if (g.skins.enabled && g.skins.pot) {
    const { skinsByPlayer } = computeSkins(scoreContext, players);
    const totalPot = g.skins.pot * players.length;
    const total = Object.values(skinsByPlayer).reduce((sum, value) => sum + value, 0);
    if (total > 0) {
      players.forEach((player) => {
        pnl[player] += (skinsByPlayer[player] / total) * totalPot - g.skins.pot;
      });
    }
  }

  const applyTeam = (v1: number | null, v2: number | null, amount: number) => {
    if (!amount || v1 == null || v2 == null) return;
    if (v1 < v2) {
      team1.forEach((player) => (pnl[player] += amount));
      team2.forEach((player) => (pnl[player] -= amount));
    } else if (v2 < v1) {
      team2.forEach((player) => (pnl[player] += amount));
      team1.forEach((player) => (pnl[player] -= amount));
    }
  };

  if (g.bestBall.enabled) {
    const bb1 = computeTeamTotals(scoreContext, team1, g.bestBall.type);
    const bb2 = computeTeamTotals(scoreContext, team2, g.bestBall.type);
    applyTeam(bb1.bbOut, bb2.bbOut, g.bestBall.front);
    applyTeam(bb1.bbIn, bb2.bbIn, g.bestBall.back);
    applyTeam(bb1.bbTotal, bb2.bbTotal, g.bestBall.total);
  }
  if (g.scramble4.enabled) {
    applyTeam(teamScoreRange(teamScores, 'team1', 0, 9), teamScoreRange(teamScores, 'team2', 0, 9), g.scramble4.front);
    applyTeam(teamScoreRange(teamScores, 'team1', 9, 18), teamScoreRange(teamScores, 'team2', 9, 18), g.scramble4.back);
    applyTeam(teamScoreRange(teamScores, 'team1', 0, 18), teamScoreRange(teamScores, 'team2', 0, 18), g.scramble4.total);
  }
  if (g.twoBall.enabled) {
    const tb1 = computeTeamTotals(scoreContext, team1, g.twoBall.type);
    const tb2 = computeTeamTotals(scoreContext, team2, g.twoBall.type);
    applyTeam(tb1.tbOut, tb2.tbOut, g.twoBall.front);
    applyTeam(tb1.tbIn, tb2.tbIn, g.twoBall.back);
    applyTeam(tb1.tbTotal, tb2.tbTotal, g.twoBall.total);
  }
  if (g.aggy.enabled) {
    const ag1 = computeTeamTotals(scoreContext, team1, g.aggy.type);
    const ag2 = computeTeamTotals(scoreContext, team2, g.aggy.type);
    applyTeam(ag1.agOut, ag2.agOut, g.aggy.front);
    applyTeam(ag1.agIn, ag2.agIn, g.aggy.back);
    applyTeam(ag1.agTotal, ag2.agTotal, g.aggy.total);
  }

  if (g.h2h.enabled && g.h2h.perMatchup) {
    matchups.forEach((m) => {
      const n1 = playerRangeScore(scoreContext, m.t1, 0, 18, g.h2h.type);
      const n2 = playerRangeScore(scoreContext, m.t2, 0, 18, g.h2h.type);
      if (n1 == null || n2 == null) return;
      if (n1 < n2) {
        pnl[m.t1] += g.h2h.perMatchup;
        pnl[m.t2] -= g.h2h.perMatchup;
      } else if (n2 < n1) {
        pnl[m.t2] += g.h2h.perMatchup;
        pnl[m.t1] -= g.h2h.perMatchup;
      }
    });
  }

  if (g.stableford.enabled && g.stableford.buyIn) {
    const sf = computeStableford(scoreContext, players, g.stableford.type, g.stableford.points);
    const totalPot = g.stableford.buyIn * players.length;
    const maxPts = Math.max(...players.map((player) => sf[player].points));
    const winners = players.filter((player) => sf[player].points === maxPts && sf[player].holes > 0);
    players.forEach((player) => (pnl[player] -= g.stableford.buyIn));
    if (winners.length) winners.forEach((player) => (pnl[player] += totalPot / winners.length));
  }

  if (g.threeManNassau.enabled && g.threeManNassau.amount) {
    threeManNassauResults(scoreContext, players, g.threeManNassau.type).rows.forEach((r) => {
      if (r.winner === 'solo') {
        pnl[r.solo] += g.threeManNassau.amount * r.side.length;
        r.side.forEach((player) => (pnl[player] -= g.threeManNassau.amount));
      } else if (r.winner === 'side') {
        pnl[r.solo] -= g.threeManNassau.amount * r.side.length;
        r.side.forEach((player) => (pnl[player] += g.threeManNassau.amount));
      }
    });
  }

  if (g.wolf.enabled && g.wolf.amount) {
    wolfSegments(g.wolf.nassau).forEach((segment) => {
      const pts = wolfPoints(scoreContext, players, wolfHoles ?? {}, segment.start, segment.end, g.wolf.type);
      const winners = wolfSegmentWinners(pts);
      if (!winners.length) return;
      const pot = g.wolf.amount * players.length;
      players.forEach((player) => (pnl[player] -= g.wolf.amount));
      winners.forEach((player) => (pnl[player] += pot / winners.length));
    });
  }

  return pnl;
}

/**
 * Pure port of the legacy `computeSettlement()` greedy debtor/creditor matcher.
 * Produces the minimal "who pays who" transfer list from a P&L map.
 */
export function computeSettlement(pnl: Record<string, number>): SettlementTransfer[] {
  const debtors = Object.entries(pnl)
    .filter(([, value]) => value < 0)
    .map(([name, value]) => ({ name, amt: -value }))
    .sort((a, b) => b.amt - a.amt);
  const creditors = Object.entries(pnl)
    .filter(([, value]) => value > 0)
    .map(([name, value]) => ({ name, amt: value }))
    .sort((a, b) => b.amt - a.amt);

  const transfers: SettlementTransfer[] = [];
  let di = 0;
  let ci = 0;

  while (di < debtors.length && ci < creditors.length) {
    const pay = Math.min(debtors[di].amt, creditors[ci].amt);
    if (pay > 0) transfers.push({ from: debtors[di].name, to: creditors[ci].name, amount: pay });
    debtors[di].amt -= pay;
    creditors[ci].amt -= pay;
    if (debtors[di].amt < 0.01) di += 1;
    if (creditors[ci].amt < 0.01) ci += 1;
  }

  return transfers;
}

/**
 * Pure port of the legacy `gamesHaveBets()` gate. Determines whether any money
 * game has a non-zero stake, which the results screen uses to show or hide the
 * settlement section. Note putt poker counts here even though it does not feed
 * the P&L, mirroring the legacy quirk.
 */
export function gamesHaveBets(g: GameConfig): boolean {
  return Boolean(
    (g.skins.enabled && g.skins.pot) ||
      (g.bestBall.enabled && (g.bestBall.front || g.bestBall.back || g.bestBall.total)) ||
      (g.scramble4.enabled && (g.scramble4.front || g.scramble4.back || g.scramble4.total)) ||
      (g.twoBall.enabled && (g.twoBall.front || g.twoBall.back || g.twoBall.total)) ||
      (g.aggy.enabled && (g.aggy.front || g.aggy.back || g.aggy.total)) ||
      (g.h2h.enabled && g.h2h.perMatchup) ||
      (g.stableford.enabled && g.stableford.buyIn) ||
      (g.threeManNassau.enabled && g.threeManNassau.amount) ||
      (g.wolf.enabled && g.wolf.amount) ||
      (g.puttPoker.enabled && g.puttPoker.pot),
  );
}
