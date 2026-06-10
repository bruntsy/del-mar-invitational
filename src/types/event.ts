import type { PairMatch, PlayingGroup } from './round';

export type EventRoundFormat =
  | 'bestBallNassau'
  | 'twoManBestBallAggy'
  | 'scramble2v2Nassau'
  | 'fourManScramble'
  | 'custom';

export type EventScoringMode = 'matchPlay' | 'strokePlay';

export interface RyderPointEntry {
  roundIndex: number;
  matchIndex: number; // which pair match (0-based)
  gameType: string; // 'best_ball_aggy' | 'best_ball' | 'two_man_scramble' | 'scramble'
  component: string | null; // 'best_ball' | 'aggy' | null
  segment: 'front' | 'back' | 'overall';
  winningTeam: 'team1' | 'team2' | null;
  tiedTeams: ('team1' | 'team2')[] | null;
  points: { team1: number; team2: number };
}

export interface EventRoundConfig {
  name: string;
  format: EventRoundFormat;
  scoringMode: EventScoringMode;
  points: {
    front: number;
    back: number;
    total: number;
    // optional per-component overrides for combo games (BB+Aggy, HB/LB)
    bestBall?: { front: number; back: number; overall: number };
    aggy?: { front: number; back: number; overall: number };
  };
  skins: {
    enabled: boolean;
    pot: number;
    type: 'gross' | 'net';
  };
  puttPoker: {
    enabled: boolean;
    pot: number;
    scope?: 'playingGroup' | 'round';
  };
  bestBallBet: {
    front: number;
    back: number;
    total: number;
    type: 'gross' | 'net';
  };
  scrambleBet: {
    front: number;
    back: number;
    total: number;
    type: 'gross' | 'net';
  };
  pairMatches: PairMatch[];
  playingGroups: PlayingGroup[];
  roundId: string | null;
  pointsResult: {
    team1: number | null;
    team2: number | null;
  };
}

export interface EventConfig {
  teamNames: {
    team1: string;
    team2: string;
  };
  team1: string[];
  team2: string[];
  rounds: EventRoundConfig[];
  winPoints: number;
  tiebreaker: string;
}

export interface Event {
  id: string | null;
  groupId: string;
  name: string;
  status: 'active' | 'archived';
  config: EventConfig;
}
