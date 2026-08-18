import {
  pairAggyScore,
  pairBestBallScore,
  pairHighBallScore,
  type ScoreContext,
} from '@/scoring/round';
import type { RotationSixesVariant, ScoreType } from '@/types';

export type RotationSixesMatchId = 'one' | 'two' | 'three';
export type RotationSixesSide = 'a' | 'b';
export type RotationSixesWinner = RotationSixesSide | 'push' | 'open';
export type RotationSixesComponentKey = 'best_ball' | 'low_ball' | 'high_ball' | 'aggy';

export interface RotationSixesConfig {
  players: [string, string, string, string];
  variant: RotationSixesVariant;
  scoreBasis: ScoreType;
  stakePerPlayer: number;
}

export interface RotationSixesMatch {
  id: RotationSixesMatchId;
  label: string;
  holes: [number, number];
  sideA: [string, string];
  sideB: [string, string];
}

export interface RotationSixesHoleComponent {
  key: RotationSixesComponentKey;
  label: string;
  sideAScore: number | null;
  sideBScore: number | null;
  winnerSide: RotationSixesWinner;
}

export interface RotationSixesHoleResult {
  holeNumber: number;
  incomplete: boolean;
  components: RotationSixesHoleComponent[];
}

export interface RotationSixesComponentResult {
  key: RotationSixesComponentKey;
  label: string;
  sideAPoints: number;
  sideBPoints: number;
  pushed: number;
  played: number;
  winnerSide: RotationSixesWinner;
}

export interface RotationSixesLedgerEntry {
  fromPlayerId: string;
  toPlayerId: string;
  amount: number;
  gameType: 'rotation_sixes';
  matchId: RotationSixesMatchId;
  reason: string;
}

export interface RotationSixesMatchResult {
  match: RotationSixesMatch;
  complete: boolean;
  holesPlayed: number;
  holeResults: RotationSixesHoleResult[];
  components: RotationSixesComponentResult[];
  sideAPoints: number;
  sideBPoints: number;
  winnerSide: RotationSixesWinner;
  ledgerEntries: RotationSixesLedgerEntry[];
}

export interface RotationSixesResult {
  gameType: 'rotation_sixes';
  valid: boolean;
  validationError?: string;
  variant: RotationSixesVariant;
  scoreBasis: ScoreType;
  stakePerPlayer: number;
  matches: RotationSixesMatchResult[];
  ledgerEntries: RotationSixesLedgerEntry[];
}

const COMPONENTS_BY_VARIANT: Record<RotationSixesVariant, Array<{ key: RotationSixesComponentKey; label: string }>> = {
  best_ball: [{ key: 'best_ball', label: 'Best Ball' }],
  high_low: [
    { key: 'low_ball', label: 'Low Ball' },
    { key: 'high_ball', label: 'High Ball' },
  ],
  best_ball_aggy: [
    { key: 'best_ball', label: 'Best Ball' },
    { key: 'aggy', label: 'Aggy' },
  ],
};

export function defaultRotationSixesMatches(players: [string, string, string, string]): RotationSixesMatch[] {
  const [a, b, c, d] = players;
  return [
    { id: 'one', label: 'Holes 1-6', holes: [0, 6], sideA: [a, b], sideB: [c, d] },
    { id: 'two', label: 'Holes 7-12', holes: [6, 12], sideA: [a, c], sideB: [b, d] },
    { id: 'three', label: 'Holes 13-18', holes: [12, 18], sideA: [a, d], sideB: [b, c] },
  ];
}

function validateConfig(config: RotationSixesConfig): string | null {
  if (!config.players || config.players.length !== 4) return 'Rotation Sixes requires exactly four players.';
  const unique = new Set(config.players.filter(Boolean));
  if (unique.size !== 4) return 'Rotation Sixes requires four unique players.';
  if (!COMPONENTS_BY_VARIANT[config.variant]) return 'Rotation Sixes has an unknown scoring variant.';
  if (config.scoreBasis !== 'gross' && config.scoreBasis !== 'net') return 'Rotation Sixes score basis must be gross or net.';
  if (typeof config.stakePerPlayer !== 'number' || Number.isNaN(config.stakePerPlayer) || config.stakePerPlayer < 0) {
    return 'Rotation Sixes stake must be greater than or equal to 0.';
  }
  return null;
}

function sideScore(
  key: RotationSixesComponentKey,
  context: ScoreContext,
  side: string[],
  hole: number,
  scoreBasis: ScoreType,
): number | null {
  if (key === 'aggy') return pairAggyScore(context, side, hole, scoreBasis);
  if (key === 'high_ball') return pairHighBallScore(context, side, hole, scoreBasis);
  return pairBestBallScore(context, side, hole, scoreBasis);
}

function winnerFromScores(a: number | null, b: number | null): RotationSixesWinner {
  if (a == null || b == null) return 'open';
  if (a < b) return 'a';
  if (b < a) return 'b';
  return 'push';
}

function componentResult(
  key: RotationSixesComponentKey,
  label: string,
  holes: RotationSixesHoleResult[],
): RotationSixesComponentResult {
  const components = holes.flatMap((hole) => hole.components.filter((component) => component.key === key));
  const sideAPoints = components.filter((component) => component.winnerSide === 'a').length;
  const sideBPoints = components.filter((component) => component.winnerSide === 'b').length;
  const pushed = components.filter((component) => component.winnerSide === 'push').length;
  const played = sideAPoints + sideBPoints + pushed;
  let winnerSide: RotationSixesWinner = 'open';
  if (played === components.length) {
    if (sideAPoints > sideBPoints) winnerSide = 'a';
    else if (sideBPoints > sideAPoints) winnerSide = 'b';
    else winnerSide = 'push';
  }
  return { key, label, sideAPoints, sideBPoints, pushed, played, winnerSide };
}

function matchLedger(
  match: RotationSixesMatch,
  winnerSide: RotationSixesWinner,
  stakePerPlayer: number,
): RotationSixesLedgerEntry[] {
  if (!stakePerPlayer || winnerSide === 'push' || winnerSide === 'open') return [];
  const winners = winnerSide === 'a' ? match.sideA : match.sideB;
  const losers = winnerSide === 'a' ? match.sideB : match.sideA;
  const amount = stakePerPlayer / winners.length;
  return losers.flatMap((fromPlayerId) =>
    winners.map((toPlayerId) => ({
      fromPlayerId,
      toPlayerId,
      amount,
      gameType: 'rotation_sixes' as const,
      matchId: match.id,
      reason: `${match.label}: ${winners.join(' + ')} beat ${losers.join(' + ')}`,
    })),
  );
}

function scoreMatch(
  config: RotationSixesConfig,
  match: RotationSixesMatch,
  context: ScoreContext,
): RotationSixesMatchResult {
  const [start, end] = match.holes;
  const componentDefs = COMPONENTS_BY_VARIANT[config.variant];
  const holeResults: RotationSixesHoleResult[] = [];

  for (let hole = start; hole < end; hole += 1) {
    const components = componentDefs.map(({ key, label }) => {
      const sideAScore = sideScore(key, context, match.sideA, hole, config.scoreBasis);
      const sideBScore = sideScore(key, context, match.sideB, hole, config.scoreBasis);
      return {
        key,
        label,
        sideAScore,
        sideBScore,
        winnerSide: winnerFromScores(sideAScore, sideBScore),
      };
    });
    holeResults.push({
      holeNumber: hole + 1,
      incomplete: components.some((component) => component.winnerSide === 'open'),
      components,
    });
  }

  const components = componentDefs.map(({ key, label }) => componentResult(key, label, holeResults));
  const sideAPoints = components.reduce((total, component) => total + component.sideAPoints, 0);
  const sideBPoints = components.reduce((total, component) => total + component.sideBPoints, 0);
  const holesPlayed = holeResults.filter((hole) => !hole.incomplete).length;
  const complete = holesPlayed === end - start;
  let winnerSide: RotationSixesWinner = 'open';
  if (complete) {
    if (sideAPoints > sideBPoints) winnerSide = 'a';
    else if (sideBPoints > sideAPoints) winnerSide = 'b';
    else winnerSide = 'push';
  }
  return {
    match,
    complete,
    holesPlayed,
    holeResults,
    components,
    sideAPoints,
    sideBPoints,
    winnerSide,
    ledgerEntries: matchLedger(match, winnerSide, config.stakePerPlayer),
  };
}

export function scoreRotationSixes(config: RotationSixesConfig, context: ScoreContext): RotationSixesResult {
  const validationError = validateConfig(config);
  if (validationError) {
    return {
      gameType: 'rotation_sixes',
      valid: false,
      validationError,
      variant: config.variant,
      scoreBasis: config.scoreBasis,
      stakePerPlayer: config.stakePerPlayer,
      matches: [],
      ledgerEntries: [],
    };
  }

  const matches = defaultRotationSixesMatches(config.players).map((match) => scoreMatch(config, match, context));
  return {
    gameType: 'rotation_sixes',
    valid: true,
    variant: config.variant,
    scoreBasis: config.scoreBasis,
    stakePerPlayer: config.stakePerPlayer,
    matches,
    ledgerEntries: matches.flatMap((match) => match.ledgerEntries),
  };
}
