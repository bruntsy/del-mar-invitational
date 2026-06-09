import type { GameConfig } from '@/types';

export const DEFAULT_GAMES: GameConfig = {
  skins: { enabled: false, pot: 0, type: 'net', carry: false },
  bestBall: { enabled: false, front: 0, back: 0, total: 0, balls: 1, type: 'net' },
  bestBallAggy: {
    enabled: false,
    scoreBasis: 'net',
    scoringMode: 'match',
    stake: { front: 0, back: 0, overall: 0 },
  },
  twoManScramble: {
    enabled: false,
    scoringMode: 'match',
    stake: { front: 0, back: 0, overall: 0 },
  },
  scramble4: { enabled: false, front: 0, back: 0, total: 0, type: 'gross' },
  wolf: { enabled: false, amount: 0, type: 'net', nassau: false },
  puttPoker: { enabled: false, pot: 0 },
};

type PartialGameConfig = {
  [K in keyof GameConfig]?: Partial<GameConfig[K]>;
};

export function cloneDefaultGames(): GameConfig {
  return structuredClone(DEFAULT_GAMES);
}

export function normalizeGames(games: PartialGameConfig | null | undefined): GameConfig {
  return {
    skins: { ...DEFAULT_GAMES.skins, ...games?.skins },
    bestBall: { ...DEFAULT_GAMES.bestBall, ...games?.bestBall },
    bestBallAggy: {
      ...DEFAULT_GAMES.bestBallAggy,
      ...games?.bestBallAggy,
      stake: { ...DEFAULT_GAMES.bestBallAggy.stake, ...games?.bestBallAggy?.stake },
    },
    twoManScramble: {
      ...DEFAULT_GAMES.twoManScramble,
      ...games?.twoManScramble,
      stake: { ...DEFAULT_GAMES.twoManScramble.stake, ...games?.twoManScramble?.stake },
    },
    scramble4: { ...DEFAULT_GAMES.scramble4, ...games?.scramble4 },
    wolf: { ...DEFAULT_GAMES.wolf, ...games?.wolf },
    puttPoker: { ...DEFAULT_GAMES.puttPoker, ...games?.puttPoker },
  };
}
