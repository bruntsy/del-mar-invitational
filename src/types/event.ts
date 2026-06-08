import type { PairMatch, PlayingGroup } from './round';

export type EventRoundFormat =
  | 'bestBallNassau'
  | 'twoManBestBallAggy'
  | 'scramble2v2Nassau'
  | 'fourManScramble'
  | 'custom';

export type EventScoringMode = 'matchPlay' | 'strokePlay';

export interface EventRoundConfig {
  name: string;
  format: EventRoundFormat;
  scoringMode: EventScoringMode;
  points: {
    front: number;
    back: number;
    total: number;
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
