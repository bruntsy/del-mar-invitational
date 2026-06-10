import { buildBestBallAggyConfig, scoreBestBallAggy } from '@/scoring/bestBallAggy';
import { scoreAt } from '@/scoring/cells';
import { type ScoreContext } from '@/scoring/round';
import { computeSkins } from '@/scoring/skins';
import { computeTeamTotals } from '@/scoring/teamGames';
import {
  buildTwoManScrambleConfig,
  scoreTwoManScramble,
  twoManScrambleTeamKey,
} from '@/scoring/twoManScramble';
import { wolfPoints, wolfSegmentWinners, wolfSegments, type WolfHoleConfig } from '@/scoring/wolf';
import type { GameConfig, PairMatch, ScoreMatrix } from '@/types';

export interface SettlementInput {
  scoreContext: ScoreContext;
  teamScores?: ScoreMatrix;
  twoManScrambleTeamScores?: ScoreMatrix;
  team1: string[];
  team2: string[];
  players: string[];
  pairMatches?: PairMatch[];
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

export function computePlayerPnL(input: SettlementInput): Record<string, number> {
  const {
    scoreContext,
    teamScores,
    twoManScrambleTeamScores,
    team1,
    team2,
    players,
    pairMatches,
    games: g,
    wolfHoles,
  } = input;
  const pnl: Record<string, number> = Object.fromEntries(players.map((player) => [player, 0]));

  const applyLedger = (
    entries: { fromPlayerId: string; toPlayerId: string; amount: number }[],
  ) => {
    for (const entry of entries) {
      if (entry.fromPlayerId in pnl) pnl[entry.fromPlayerId] -= entry.amount;
      if (entry.toPlayerId in pnl) pnl[entry.toPlayerId] += entry.amount;
    }
  };

  if (g.skins.enabled && g.skins.pot) {
    const { skinsByPlayer } = computeSkins(scoreContext, players, g.skins.type);
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

  if (g.bestBallAggy.enabled) {
    for (const match of pairMatches ?? []) {
      const config = buildBestBallAggyConfig(match, g.bestBallAggy);
      const result = scoreBestBallAggy(config, scoreContext);
      applyLedger(result.ledgerEntries);
    }
  }

  if (g.twoManScramble.enabled) {
    (pairMatches ?? []).forEach((match, index) => {
      const config = buildTwoManScrambleConfig(match, index, g.twoManScramble);
      const teamHoleScores = {
        [twoManScrambleTeamKey(index, 'a')]: twoManScrambleTeamScores?.[twoManScrambleTeamKey(index, 'a')],
        [twoManScrambleTeamKey(index, 'b')]: twoManScrambleTeamScores?.[twoManScrambleTeamKey(index, 'b')],
      };
      const result = scoreTwoManScramble(config, teamHoleScores);
      applyLedger(result.ledgerEntries);
    });
  }

  if (g.scramble4.enabled) {
    applyTeam(teamScoreRange(teamScores, 'team1', 0, 9), teamScoreRange(teamScores, 'team2', 0, 9), g.scramble4.front);
    applyTeam(teamScoreRange(teamScores, 'team1', 9, 18), teamScoreRange(teamScores, 'team2', 9, 18), g.scramble4.back);
    applyTeam(teamScoreRange(teamScores, 'team1', 0, 18), teamScoreRange(teamScores, 'team2', 0, 18), g.scramble4.total);
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

export function gamesHaveBets(g: GameConfig): boolean {
  return Boolean(
    (g.skins.enabled && g.skins.pot) ||
      (g.bestBall.enabled && (g.bestBall.front || g.bestBall.back || g.bestBall.total)) ||
      (g.bestBallAggy?.enabled &&
        (g.bestBallAggy.stake.front || g.bestBallAggy.stake.back || g.bestBallAggy.stake.overall)) ||
      (g.twoManScramble?.enabled &&
        (g.twoManScramble.stake.front ||
          g.twoManScramble.stake.back ||
          g.twoManScramble.stake.overall)) ||
      (g.scramble4.enabled && (g.scramble4.front || g.scramble4.back || g.scramble4.total)) ||
      (g.wolf.enabled && g.wolf.amount) ||
      (g.puttPoker.enabled && g.puttPoker.pot),
  );
}
