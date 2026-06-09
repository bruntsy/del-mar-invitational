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

export interface GameConfig {
  skins: SkinsConfig;
  bestBall: BestBallConfig;
  scramble4: MoneyNassauConfig;
  wolf: WolfConfig;
  puttPoker: PuttPokerConfig;
}
