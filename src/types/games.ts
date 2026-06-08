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

export interface PairMatchConfig {
  enabled: boolean;
  pointsPerHole: number;
  type: ScoreType;
}

export interface HeadToHeadConfig {
  enabled: boolean;
  perMatchup: number;
  type: ScoreType;
}

export interface StablefordPoints {
  double: number;
  bogey: number;
  par: number;
  birdie: number;
  eagle: number;
  albatross: number;
}

export interface StablefordConfig {
  enabled: boolean;
  buyIn: number;
  type: ScoreType;
  points: StablefordPoints;
}

export interface ThreeManNassauConfig {
  enabled: boolean;
  amount: number;
  type: ScoreType;
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

export interface GameConfig {
  skins: SkinsConfig;
  bestBall: BestBallConfig;
  pairMatch: PairMatchConfig;
  scramble4: MoneyNassauConfig;
  twoBall: MoneyNassauConfig;
  aggy: MoneyNassauConfig;
  h2h: HeadToHeadConfig;
  stableford: StablefordConfig;
  threeManNassau: ThreeManNassauConfig;
  wolf: WolfConfig;
  puttPoker: PuttPokerConfig;
}
