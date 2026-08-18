import { cellValue } from '@/scoring/cells';
import type { PairMatch, ScoreRow, TwoManScrambleGameConfig } from '@/types';

export interface TwoManScrambleTeam {
  id: string;
  players: string[]; // exactly 2 players for display; scores are team-level
}

export interface TwoManScrambleConfig {
  teams: [TwoManScrambleTeam, TwoManScrambleTeam];
  scoringMode: 'stroke' | 'match';
  stake: { front: number; back: number; overall: number };
}

export type TmsSegment = 'front' | 'back' | 'overall';

export interface TwoManScrambleHoleResult {
  holeNumber: number;
  teamScores: Record<string, { scrambleScore: number }>;
  winnerTeamId: string | undefined;
  tied: boolean;
  incomplete: boolean;
}

export interface TwoManScrambleSegmentResult {
  segment: TmsSegment;
  stakePerPerson: number;
  winnerTeamId: string | undefined;
  loserTeamId: string | undefined;
  pushed: boolean;
  incomplete: boolean;
  teamScores?: Record<string, number>;
  teamHolesWon?: Record<string, number>;
}

export interface TwoManScrambleLedgerEntry {
  fromPlayerId: string;
  toPlayerId: string;
  amount: number;
  gameType: 'two_man_scramble';
  segment: TmsSegment;
  reason: string;
}

export interface TwoManScrambleResult {
  gameType: 'two_man_scramble';
  scoringMode: 'stroke' | 'match';
  teams: [TwoManScrambleTeam, TwoManScrambleTeam];
  holeResults: TwoManScrambleHoleResult[];
  segmentResults: {
    front: TwoManScrambleSegmentResult;
    back: TwoManScrambleSegmentResult;
    overall: TwoManScrambleSegmentResult;
  };
  ledgerEntries: TwoManScrambleLedgerEntry[];
  valid: boolean;
  validationError?: string;
}

const SEGMENT_RANGES: Record<TmsSegment, [number, number]> = {
  front: [0, 9],
  back: [9, 18],
  overall: [0, 18],
};

/** Stable team-score keys for a pair match's two scramble teams. */
export function twoManScrambleTeamKey(index: number, side: 'a' | 'b'): string {
  return `match_${index}_${side}`;
}

/**
 * Build a single-match TwoManScrambleConfig. Team ids double as the keys used
 * to look up team-level scramble scores in the team-scores matrix.
 */
export function buildTwoManScrambleConfig(
  match: PairMatch,
  index: number,
  game: TwoManScrambleGameConfig,
): TwoManScrambleConfig {
  return {
    teams: [
      { id: twoManScrambleTeamKey(index, 'a'), players: [...match.a] },
      { id: twoManScrambleTeamKey(index, 'b'), players: [...match.b] },
    ],
    scoringMode: game.scoringMode,
    stake: { ...game.stake },
  };
}

function validateConfig(config: TwoManScrambleConfig): string | null {
  if (!config.teams || config.teams.length !== 2) {
    return 'Two-Man Scramble requires exactly 2 teams.';
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

function buildHoleResults(
  config: TwoManScrambleConfig,
  teamHoleScores: Record<string, ScoreRow | undefined>,
): TwoManScrambleHoleResult[] {
  const [teamA, teamB] = config.teams;
  const holeResults: TwoManScrambleHoleResult[] = [];

  for (let hole = 0; hole < 18; hole += 1) {
    const teamScores: Record<string, { scrambleScore: number }> = {};
    let incomplete = false;

    for (const team of config.teams) {
      const score = cellValue(teamHoleScores[team.id]?.[hole]);
      if (score == null) {
        incomplete = true;
        continue;
      }
      teamScores[team.id] = { scrambleScore: score };
    }

    let winnerTeamId: string | undefined;
    let tied = false;

    if (!incomplete) {
      const scoreA = teamScores[teamA.id].scrambleScore;
      const scoreB = teamScores[teamB.id].scrambleScore;
      if (scoreA < scoreB) winnerTeamId = teamA.id;
      else if (scoreB < scoreA) winnerTeamId = teamB.id;
      else tied = true;
    }

    holeResults.push({ holeNumber: hole + 1, teamScores, winnerTeamId, tied, incomplete });
  }

  return holeResults;
}

export function scoreTwoManScrambleSegment(
  config: TwoManScrambleConfig,
  holeResults: TwoManScrambleHoleResult[],
  segment: TmsSegment,
): TwoManScrambleSegmentResult {
  const stakePerPerson = config.stake[segment];
  const [start, end] = SEGMENT_RANGES[segment];
  const segmentHoles = holeResults.slice(start, end);
  const [teamA, teamB] = config.teams;
  const base = { segment, stakePerPerson } as const;

  if (segmentHoles.length === 0 || segmentHoles.some((hole) => hole.incomplete)) {
    return { ...base, winnerTeamId: undefined, loserTeamId: undefined, pushed: false, incomplete: true };
  }

  if (config.scoringMode === 'stroke') {
    const totalA = segmentHoles.reduce((sum, hole) => sum + hole.teamScores[teamA.id].scrambleScore, 0);
    const totalB = segmentHoles.reduce((sum, hole) => sum + hole.teamScores[teamB.id].scrambleScore, 0);
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
  let holesWonA = 0;
  let holesWonB = 0;
  for (const hole of segmentHoles) {
    if (hole.winnerTeamId === teamA.id) holesWonA += 1;
    else if (hole.winnerTeamId === teamB.id) holesWonB += 1;
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
  winningTeam: TwoManScrambleTeam,
  losingTeam: TwoManScrambleTeam,
  result: TwoManScrambleSegmentResult,
): TwoManScrambleLedgerEntry[] {
  const totalExposure = result.stakePerPerson * losingTeam.players.length;
  const amountPerPair = totalExposure / (winningTeam.players.length * losingTeam.players.length);

  const entries: TwoManScrambleLedgerEntry[] = [];
  for (const loser of losingTeam.players) {
    for (const winner of winningTeam.players) {
      entries.push({
        fromPlayerId: loser,
        toPlayerId: winner,
        amount: amountPerPair,
        gameType: 'two_man_scramble',
        segment: result.segment,
        reason: `two_man_scramble ${result.segment}`,
      });
    }
  }
  return entries;
}

function invalidSegment(config: TwoManScrambleConfig, segment: TmsSegment): TwoManScrambleSegmentResult {
  return {
    segment,
    stakePerPerson: config.stake[segment],
    winnerTeamId: undefined,
    loserTeamId: undefined,
    pushed: false,
    incomplete: true,
  };
}

export function scoreTwoManScramble(
  config: TwoManScrambleConfig,
  teamHoleScores: Record<string, ScoreRow | undefined>,
): TwoManScrambleResult {
  const validationError = validateConfig(config);
  if (validationError) {
    return {
      gameType: 'two_man_scramble',
      scoringMode: config.scoringMode,
      teams: config.teams,
      holeResults: [],
      segmentResults: {
        front: invalidSegment(config, 'front'),
        back: invalidSegment(config, 'back'),
        overall: invalidSegment(config, 'overall'),
      },
      ledgerEntries: [],
      valid: false,
      validationError,
    };
  }

  const holeResults = buildHoleResults(config, teamHoleScores);

  const segmentResults = {
    front: scoreTwoManScrambleSegment(config, holeResults, 'front'),
    back: scoreTwoManScrambleSegment(config, holeResults, 'back'),
    overall: scoreTwoManScrambleSegment(config, holeResults, 'overall'),
  };

  const ledgerEntries: TwoManScrambleLedgerEntry[] = [];
  for (const segment of Object.values(segmentResults)) {
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
    gameType: 'two_man_scramble',
    scoringMode: config.scoringMode,
    teams: config.teams,
    holeResults,
    segmentResults,
    ledgerEntries,
    valid: true,
  };
}
