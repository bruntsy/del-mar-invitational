export type ScoreType = 'gross' | 'net';

export interface MoneyNassauConfig {
  enabled: boolean;
  front: number;
  back: number;
  total: number;
  type: ScoreType;
}

export interface SkinsConfig {
  enabled: boolean;
  pot: number;
  type: ScoreType;
  carry: boolean;
}

export interface BestBallConfig extends MoneyNassauConfig {
  balls: number;
}

export interface WolfConfig {
  enabled: boolean;
  amount: number;
  type: ScoreType;
  nassau: boolean;
}

export interface PuttPokerConfig {
  enabled: boolean;
  pot: number;
}

export interface BestBallAggyGameConfig {
  enabled: boolean;
  scoreBasis: ScoreType;
  scoringMode: 'stroke' | 'match';
  stake: { front: number; back: number; overall: number };
}

export interface TwoManScrambleGameConfig {
  enabled: boolean;
  scoringMode: 'stroke' | 'match';
  stake: { front: number; back: number; overall: number };
}

export interface GameConfig {
  skins: SkinsConfig;
  bestBall: BestBallConfig;
  bestBallAggy: BestBallAggyGameConfig;
  twoManScramble: TwoManScrambleGameConfig;
  scramble4: MoneyNassauConfig;
  wolf: WolfConfig;
  puttPoker: PuttPokerConfig;
}
