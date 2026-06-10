import {
  pairAggyScore,
  pairBestBallScore,
  playerHoleScore,
  type ScoreContext,
} from '@/scoring/round';
import type { ScoreType } from '@/types';

export interface BestBallAggyTeam {
  id: string;
  players: string[]; // exactly 2 players
}

export interface BestBallAggyConfig {
  teams: [BestBallAggyTeam, BestBallAggyTeam]; // exactly 2 teams of exactly 2 players
  scoreBasis: 'gross' | 'net';
  scoringMode: 'stroke' | 'match';
  stake: { front: number; back: number; overall: number };
}

export interface BestBallAggyTeamHoleScore {
  playerScores: Record<string, number>;
  bestBallScore: number | null;
  bestBallCountingPlayerIds: string[];
  aggyScore: number | null;
}

export interface BestBallAggyHoleResult {
  holeNumber: number;
  teamScores: Record<string, BestBallAggyTeamHoleScore>;
  bestBallWinnerTeamId: string | undefined;
  bestBallTied: boolean;
  aggyWinnerTeamId: string | undefined;
  aggyTied: boolean;
  incomplete: boolean;
}

export type BbaContest = 'best_ball' | 'aggy';
export type BbaSegment = 'front' | 'back' | 'overall';

export interface BestBallAggySegmentResult {
  contest: BbaContest;
  segment: BbaSegment;
  stakePerPerson: number;
  winnerTeamId: string | undefined;
  loserTeamId: string | undefined;
  pushed: boolean;
  incomplete: boolean;
  teamScores?: Record<string, number>; // stroke play totals
  teamHolesWon?: Record<string, number>; // match play hole counts
}

export interface LedgerEntry {
  fromPlayerId: string;
  toPlayerId: string;
  amount: number;
  gameType: 'best_ball_aggy';
  contest: BbaContest;
  segment: BbaSegment;
  reason: string;
}

export interface BestBallAggyResult {
  gameType: 'best_ball_aggy';
  scoringMode: 'stroke' | 'match';
  scoreBasis: 'gross' | 'net';
  teams: [BestBallAggyTeam, BestBallAggyTeam];
  holeResults: BestBallAggyHoleResult[];
  segmentResults: {
    bestBall: {
      front: BestBallAggySegmentResult;
      back: BestBallAggySegmentResult;
      overall: BestBallAggySegmentResult;
    };
    aggy: {
      front: BestBallAggySegmentResult;
      back: BestBallAggySegmentResult;
      overall: BestBallAggySegmentResult;
    };
  };
  ledgerEntries: LedgerEntry[];
  valid: boolean;
  validationError?: string;
}

const SEGMENT_RANGES: Record<BbaSegment, [number, number]> = {
  front: [0, 9],
  back: [9, 18],
  overall: [0, 18],
};

function validateConfig(config: BestBallAggyConfig): string | null {
  if (!config.teams || config.teams.length !== 2) {
    return 'Best Ball + Aggy requires exactly 2 teams.';
  }
  for (const team of config.teams) {
    if (!team.players || team.players.length !== 2) {
      return 'Each team must contain exactly 2 players.';
    }
  }
  const [teamA, teamB] = config.teams;
  const seen = new Set(teamA.players);
  for (const player of teamB.players) {
    if (seen.has(player)) {
      return 'A player cannot appear on both teams.';
    }
  }
  const stakes = [config.stake.front, config.stake.back, config.stake.overall];
  if (stakes.some((stake) => typeof stake !== 'number' || stake < 0 || Number.isNaN(stake))) {
    return 'Stakes must be numbers greater than or equal to 0.';
  }
  return null;
}

/**
 * Build the per-team hole detail. `bestBallScore`/`aggyScore` are null when the
 * team is missing a player's score for the hole.
 */
function computeTeamHoleScore(
  context: ScoreContext,
  team: BestBallAggyTeam,
  hole: number,
  scoreBasis: ScoreType,
): BestBallAggyTeamHoleScore {
  const playerScores: Record<string, number> = {};
  for (const player of team.players) {
    const value = playerHoleScore(context, player, hole, scoreBasis);
    if (value != null) playerScores[player] = value;
  }

  const bestBallScore = pairBestBallScore(context, team.players, hole, scoreBasis);
  const aggyScore = pairAggyScore(context, team.players, hole, scoreBasis);
  const bestBallCountingPlayerIds =
    bestBallScore == null
      ? []
      : team.players.filter((player) => playerScores[player] === bestBallScore);

  return { playerScores, bestBallScore, bestBallCountingPlayerIds, aggyScore };
}

function buildHoleResults(
  config: BestBallAggyConfig,
  context: ScoreContext,
): BestBallAggyHoleResult[] {
  const [teamA, teamB] = config.teams;
  const holeResults: BestBallAggyHoleResult[] = [];

  for (let hole = 0; hole < 18; hole += 1) {
    const teamScores: Record<string, BestBallAggyTeamHoleScore> = {};
    let incomplete = false;

    for (const team of config.teams) {
      const detail = computeTeamHoleScore(context, team, hole, config.scoreBasis);
      teamScores[team.id] = detail;
      if (detail.bestBallScore == null || detail.aggyScore == null) incomplete = true;
    }

    let bestBallWinnerTeamId: string | undefined;
    let bestBallTied = false;
    let aggyWinnerTeamId: string | undefined;
    let aggyTied = false;

    if (!incomplete) {
      const aBest = teamScores[teamA.id].bestBallScore as number;
      const bBest = teamScores[teamB.id].bestBallScore as number;
      if (aBest < bBest) bestBallWinnerTeamId = teamA.id;
      else if (bBest < aBest) bestBallWinnerTeamId = teamB.id;
      else bestBallTied = true;

      const aAggy = teamScores[teamA.id].aggyScore as number;
      const bAggy = teamScores[teamB.id].aggyScore as number;
      if (aAggy < bAggy) aggyWinnerTeamId = teamA.id;
      else if (bAggy < aAggy) aggyWinnerTeamId = teamB.id;
      else aggyTied = true;
    }

    holeResults.push({
      holeNumber: hole + 1,
      teamScores,
      bestBallWinnerTeamId,
      bestBallTied,
      aggyWinnerTeamId,
      aggyTied,
      incomplete,
    });
  }

  return holeResults;
}

export function scoreBbaSegment(
  config: BestBallAggyConfig,
  holeResults: BestBallAggyHoleResult[],
  contest: BbaContest,
  segment: BbaSegment,
): BestBallAggySegmentResult {
  const stakePerPerson = config.stake[segment];
  const [start, end] = SEGMENT_RANGES[segment];
  const segmentHoles = holeResults.slice(start, end);
  const [teamA, teamB] = config.teams;

  const base = { contest, segment, stakePerPerson } as const;

  if (segmentHoles.length === 0 || segmentHoles.some((hole) => hole.incomplete)) {
    return {
      ...base,
      winnerTeamId: undefined,
      loserTeamId: undefined,
      pushed: false,
      incomplete: true,
    };
  }

  if (config.scoringMode === 'stroke') {
    const key = contest === 'best_ball' ? 'bestBallScore' : 'aggyScore';
    const totalA = segmentHoles.reduce(
      (sum, hole) => sum + (hole.teamScores[teamA.id][key] as number),
      0,
    );
    const totalB = segmentHoles.reduce(
      (sum, hole) => sum + (hole.teamScores[teamB.id][key] as number),
      0,
    );
    const teamScores = { [teamA.id]: totalA, [teamB.id]: totalB };

    if (totalA < totalB) {
      return { ...base, winnerTeamId: teamA.id, loserTeamId: teamB.id, pushed: false, incomplete: false, teamScores };
    }
    if (totalB < totalA) {
      return { ...base, winnerTeamId: teamB.id, loserTeamId: teamA.id, pushed: false, incomplete: false, teamScores };
    }
    return { ...base, winnerTeamId: undefined, loserTeamId: undefined, pushed: true, incomplete: false, teamScores };
  }

  // match play
  const winnerKey = contest === 'best_ball' ? 'bestBallWinnerTeamId' : 'aggyWinnerTeamId';
  let holesWonA = 0;
  let holesWonB = 0;
  for (const hole of segmentHoles) {
    if (hole[winnerKey] === teamA.id) holesWonA += 1;
    else if (hole[winnerKey] === teamB.id) holesWonB += 1;
  }
  const teamHolesWon = { [teamA.id]: holesWonA, [teamB.id]: holesWonB };

  if (holesWonA > holesWonB) {
    return { ...base, winnerTeamId: teamA.id, loserTeamId: teamB.id, pushed: false, incomplete: false, teamHolesWon };
  }
  if (holesWonB > holesWonA) {
    return { ...base, winnerTeamId: teamB.id, loserTeamId: teamA.id, pushed: false, incomplete: false, teamHolesWon };
  }
  return { ...base, winnerTeamId: undefined, loserTeamId: undefined, pushed: true, incomplete: false, teamHolesWon };
}

function createTeamLedgerEntries(
  winningTeam: BestBallAggyTeam,
  losingTeam: BestBallAggyTeam,
  result: BestBallAggySegmentResult,
): LedgerEntry[] {
  const stakePerPerson = result.stakePerPerson;
  const totalExposure = stakePerPerson * losingTeam.players.length;
  const amountPerPair = totalExposure / (winningTeam.players.length * losingTeam.players.length);

  const entries: LedgerEntry[] = [];
  for (const loser of losingTeam.players) {
    for (const winner of winningTeam.players) {
      entries.push({
        fromPlayerId: loser,
        toPlayerId: winner,
        amount: amountPerPair,
        gameType: 'best_ball_aggy',
        contest: result.contest,
        segment: result.segment,
        reason: `best_ball_aggy ${result.contest} ${result.segment}`,
      });
    }
  }
  return entries;
}

function invalidSegment(
  config: BestBallAggyConfig,
  contest: BbaContest,
  segment: BbaSegment,
): BestBallAggySegmentResult {
  return {
    contest,
    segment,
    stakePerPerson: config.stake[segment],
    winnerTeamId: undefined,
    loserTeamId: undefined,
    pushed: false,
    incomplete: true,
  };
}

export function scoreBestBallAggy(
  config: BestBallAggyConfig,
  context: ScoreContext,
): BestBallAggyResult {
  const validationError = validateConfig(config);
  if (validationError) {
    return {
      gameType: 'best_ball_aggy',
      scoringMode: config.scoringMode,
      scoreBasis: config.scoreBasis,
      teams: config.teams,
      holeResults: [],
      segmentResults: {
        bestBall: {
          front: invalidSegment(config, 'best_ball', 'front'),
          back: invalidSegment(config, 'best_ball', 'back'),
          overall: invalidSegment(config, 'best_ball', 'overall'),
        },
        aggy: {
          front: invalidSegment(config, 'aggy', 'front'),
          back: invalidSegment(config, 'aggy', 'back'),
          overall: invalidSegment(config, 'aggy', 'overall'),
        },
      },
      ledgerEntries: [],
      valid: false,
      validationError,
    };
  }

  const holeResults = buildHoleResults(config, context);

  const segmentResults = {
    bestBall: {
      front: scoreBbaSegment(config, holeResults, 'best_ball', 'front'),
      back: scoreBbaSegment(config, holeResults, 'best_ball', 'back'),
      overall: scoreBbaSegment(config, holeResults, 'best_ball', 'overall'),
    },
    aggy: {
      front: scoreBbaSegment(config, holeResults, 'aggy', 'front'),
      back: scoreBbaSegment(config, holeResults, 'aggy', 'back'),
      overall: scoreBbaSegment(config, holeResults, 'aggy', 'overall'),
    },
  };

  const ledgerEntries: LedgerEntry[] = [];
  const allSegments: BestBallAggySegmentResult[] = [
    ...Object.values(segmentResults.bestBall),
    ...Object.values(segmentResults.aggy),
  ];
  for (const segment of allSegments) {
    if (
      segment.incomplete ||
      segment.pushed ||
      !segment.winnerTeamId ||
      !segment.loserTeamId ||
      segment.stakePerPerson <= 0
    ) {
      continue;
    }
    const winningTeam = config.teams.find((team) => team.id === segment.winnerTeamId);
    const losingTeam = config.teams.find((team) => team.id === segment.loserTeamId);
    if (!winningTeam || !losingTeam) continue;
    ledgerEntries.push(...createTeamLedgerEntries(winningTeam, losingTeam, segment));
  }

  return {
    gameType: 'best_ball_aggy',
    scoringMode: config.scoringMode,
    scoreBasis: config.scoreBasis,
    teams: config.teams,
    holeResults,
    segmentResults,
    ledgerEntries,
    valid: true,
  };
}
