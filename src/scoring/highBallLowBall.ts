import {
  pairBestBallScore,
  pairHighBallScore,
  playerHoleScore,
  type ScoreContext,
} from '@/scoring/round';
import type { HighBallLowBallGameConfig, PairMatch, ScoreType } from '@/types';

export interface HighBallLowBallTeam {
  id: string;
  players: string[]; // exactly 2 players
}

export interface HighBallLowBallConfig {
  teams: [HighBallLowBallTeam, HighBallLowBallTeam]; // exactly 2 teams of exactly 2 players
  scoreBasis: 'gross' | 'net';
  scoringMode: 'stroke' | 'match';
  stake: { front: number; back: number; overall: number };
}

export interface HighBallLowBallTeamHoleScore {
  playerScores: Record<string, number>;
  lowBallScore: number | null;
  lowBallCountingPlayerIds: string[];
  highBallScore: number | null;
  highBallCountingPlayerIds: string[];
}

export interface HighBallLowBallHoleResult {
  holeNumber: number;
  teamScores: Record<string, HighBallLowBallTeamHoleScore>;
  lowBallWinnerTeamId: string | undefined;
  lowBallTied: boolean;
  highBallWinnerTeamId: string | undefined;
  highBallTied: boolean;
  incomplete: boolean;
}

export type HblContest = 'low_ball' | 'high_ball';
export type HblSegment = 'front' | 'back' | 'overall';

export interface HighBallLowBallSegmentResult {
  contest: HblContest;
  segment: HblSegment;
  stakePerPerson: number;
  winnerTeamId: string | undefined;
  loserTeamId: string | undefined;
  pushed: boolean;
  incomplete: boolean;
  teamScores?: Record<string, number>; // stroke play totals
  teamHolesWon?: Record<string, number>; // match play hole counts
}

export interface HighBallLowBallLedgerEntry {
  fromPlayerId: string;
  toPlayerId: string;
  amount: number;
  gameType: 'high_ball_low_ball';
  contest: HblContest;
  segment: HblSegment;
  reason: string;
}

export interface HighBallLowBallResult {
  gameType: 'high_ball_low_ball';
  scoringMode: 'stroke' | 'match';
  scoreBasis: 'gross' | 'net';
  teams: [HighBallLowBallTeam, HighBallLowBallTeam];
  holeResults: HighBallLowBallHoleResult[];
  segmentResults: {
    lowBall: {
      front: HighBallLowBallSegmentResult;
      back: HighBallLowBallSegmentResult;
      overall: HighBallLowBallSegmentResult;
    };
    highBall: {
      front: HighBallLowBallSegmentResult;
      back: HighBallLowBallSegmentResult;
      overall: HighBallLowBallSegmentResult;
    };
  };
  ledgerEntries: HighBallLowBallLedgerEntry[];
  valid: boolean;
  validationError?: string;
}

const SEGMENT_RANGES: Record<HblSegment, [number, number]> = {
  front: [0, 9],
  back: [9, 18],
  overall: [0, 18],
};

/**
 * Build a single-match HighBallLowBallConfig from a pair match (a = team1 side,
 * b = team2 side) and the round's High Ball / Low Ball game settings.
 */
export function buildHighBallLowBallConfig(
  match: PairMatch,
  game: HighBallLowBallGameConfig,
): HighBallLowBallConfig {
  return {
    teams: [
      { id: 'a', players: [...match.a] },
      { id: 'b', players: [...match.b] },
    ],
    scoreBasis: game.scoreBasis,
    scoringMode: game.scoringMode,
    stake: { ...game.stake },
  };
}

function validateConfig(config: HighBallLowBallConfig): string | null {
  if (!config.teams || config.teams.length !== 2) {
    return 'High Ball / Low Ball requires exactly 2 teams.';
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
 * Build the per-team hole detail. Low Ball is the lower (best) of the pair;
 * High Ball is the higher (worse) of the pair. Both are null when the team is
 * missing a player's score for the hole.
 */
function computeTeamHoleScore(
  context: ScoreContext,
  team: HighBallLowBallTeam,
  hole: number,
  scoreBasis: ScoreType,
): HighBallLowBallTeamHoleScore {
  const playerScores: Record<string, number> = {};
  for (const player of team.players) {
    const value = playerHoleScore(context, player, hole, scoreBasis);
    if (value != null) playerScores[player] = value;
  }

  const lowBallScore = pairBestBallScore(context, team.players, hole, scoreBasis);
  const highBallScore = pairHighBallScore(context, team.players, hole, scoreBasis);
  const lowBallCountingPlayerIds =
    lowBallScore == null
      ? []
      : team.players.filter((player) => playerScores[player] === lowBallScore);
  const highBallCountingPlayerIds =
    highBallScore == null
      ? []
      : team.players.filter((player) => playerScores[player] === highBallScore);

  return { playerScores, lowBallScore, lowBallCountingPlayerIds, highBallScore, highBallCountingPlayerIds };
}

function buildHoleResults(
  config: HighBallLowBallConfig,
  context: ScoreContext,
): HighBallLowBallHoleResult[] {
  const [teamA, teamB] = config.teams;
  const holeResults: HighBallLowBallHoleResult[] = [];

  for (let hole = 0; hole < 18; hole += 1) {
    const teamScores: Record<string, HighBallLowBallTeamHoleScore> = {};
    let incomplete = false;

    for (const team of config.teams) {
      const detail = computeTeamHoleScore(context, team, hole, config.scoreBasis);
      teamScores[team.id] = detail;
      if (detail.lowBallScore == null || detail.highBallScore == null) incomplete = true;
    }

    let lowBallWinnerTeamId: string | undefined;
    let lowBallTied = false;
    let highBallWinnerTeamId: string | undefined;
    let highBallTied = false;

    if (!incomplete) {
      // Lower score wins both contests (High Ball compares each team's worse score).
      const aLow = teamScores[teamA.id].lowBallScore as number;
      const bLow = teamScores[teamB.id].lowBallScore as number;
      if (aLow < bLow) lowBallWinnerTeamId = teamA.id;
      else if (bLow < aLow) lowBallWinnerTeamId = teamB.id;
      else lowBallTied = true;

      const aHigh = teamScores[teamA.id].highBallScore as number;
      const bHigh = teamScores[teamB.id].highBallScore as number;
      if (aHigh < bHigh) highBallWinnerTeamId = teamA.id;
      else if (bHigh < aHigh) highBallWinnerTeamId = teamB.id;
      else highBallTied = true;
    }

    holeResults.push({
      holeNumber: hole + 1,
      teamScores,
      lowBallWinnerTeamId,
      lowBallTied,
      highBallWinnerTeamId,
      highBallTied,
      incomplete,
    });
  }

  return holeResults;
}

export function scoreHblSegment(
  config: HighBallLowBallConfig,
  holeResults: HighBallLowBallHoleResult[],
  contest: HblContest,
  segment: HblSegment,
): HighBallLowBallSegmentResult {
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
    const key = contest === 'low_ball' ? 'lowBallScore' : 'highBallScore';
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
  const winnerKey = contest === 'low_ball' ? 'lowBallWinnerTeamId' : 'highBallWinnerTeamId';
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
  winningTeam: HighBallLowBallTeam,
  losingTeam: HighBallLowBallTeam,
  result: HighBallLowBallSegmentResult,
): HighBallLowBallLedgerEntry[] {
  const stakePerPerson = result.stakePerPerson;
  const totalExposure = stakePerPerson * losingTeam.players.length;
  const amountPerPair = totalExposure / (winningTeam.players.length * losingTeam.players.length);

  const entries: HighBallLowBallLedgerEntry[] = [];
  for (const loser of losingTeam.players) {
    for (const winner of winningTeam.players) {
      entries.push({
        fromPlayerId: loser,
        toPlayerId: winner,
        amount: amountPerPair,
        gameType: 'high_ball_low_ball',
        contest: result.contest,
        segment: result.segment,
        reason: `high_ball_low_ball ${result.contest} ${result.segment}`,
      });
    }
  }
  return entries;
}

function invalidSegment(
  config: HighBallLowBallConfig,
  contest: HblContest,
  segment: HblSegment,
): HighBallLowBallSegmentResult {
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

export function scoreHighBallLowBall(
  config: HighBallLowBallConfig,
  context: ScoreContext,
): HighBallLowBallResult {
  const validationError = validateConfig(config);
  if (validationError) {
    return {
      gameType: 'high_ball_low_ball',
      scoringMode: config.scoringMode,
      scoreBasis: config.scoreBasis,
      teams: config.teams,
      holeResults: [],
      segmentResults: {
        lowBall: {
          front: invalidSegment(config, 'low_ball', 'front'),
          back: invalidSegment(config, 'low_ball', 'back'),
          overall: invalidSegment(config, 'low_ball', 'overall'),
        },
        highBall: {
          front: invalidSegment(config, 'high_ball', 'front'),
          back: invalidSegment(config, 'high_ball', 'back'),
          overall: invalidSegment(config, 'high_ball', 'overall'),
        },
      },
      ledgerEntries: [],
      valid: false,
      validationError,
    };
  }

  const holeResults = buildHoleResults(config, context);

  const segmentResults = {
    lowBall: {
      front: scoreHblSegment(config, holeResults, 'low_ball', 'front'),
      back: scoreHblSegment(config, holeResults, 'low_ball', 'back'),
      overall: scoreHblSegment(config, holeResults, 'low_ball', 'overall'),
    },
    highBall: {
      front: scoreHblSegment(config, holeResults, 'high_ball', 'front'),
      back: scoreHblSegment(config, holeResults, 'high_ball', 'back'),
      overall: scoreHblSegment(config, holeResults, 'high_ball', 'overall'),
    },
  };

  const ledgerEntries: HighBallLowBallLedgerEntry[] = [];
  const allSegments: HighBallLowBallSegmentResult[] = [
    ...Object.values(segmentResults.lowBall),
    ...Object.values(segmentResults.highBall),
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
    gameType: 'high_ball_low_ball',
    scoringMode: config.scoringMode,
    scoreBasis: config.scoreBasis,
    teams: config.teams,
    holeResults,
    segmentResults,
    ledgerEntries,
    valid: true,
  };
}
