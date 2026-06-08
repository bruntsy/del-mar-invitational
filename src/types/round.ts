import type { Course } from './course';
import type { GameConfig } from './games';

export type LegacyCellValue = number | null;

export interface TimedCellValue {
  v: number | null;
  t: string;
}

export type ScoreCell = LegacyCellValue | TimedCellValue;
export type ScoreRow = ScoreCell[];
export type ScoreMatrix = Record<string, ScoreRow>;

export interface PairMatch {
  a: string[];
  b: string[];
}

export interface PlayingGroup {
  name: string;
  players: string[];
}

export interface RoundState {
  id: string | null;
  groupId: string | null;
  course: Course | null;
  team1: string[];
  team2: string[];
  teamNames: {
    team1: string;
    team2: string;
  };
  pairMatches: PairMatch[];
  playingGroups: PlayingGroup[];
  matchups: Array<{ t1: string; t2: string }>;
  games: GameConfig;
  scores: ScoreMatrix;
  putts: ScoreMatrix;
  teamScores?: ScoreMatrix;
  wolf: {
    holes: Record<string, unknown>;
  };
  completed: boolean;
}
