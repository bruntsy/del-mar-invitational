import type { GameConfig } from '@/types';

export const DEFAULT_GAMES: GameConfig = {
  skins: { enabled: false, pot: 0, type: 'net', carry: false },
  bestBall: { enabled: false, front: 0, back: 0, total: 0, balls: 1, type: 'net' },
  pairMatch: { enabled: false, pointsPerHole: 1, type: 'net' },
  scramble4: { enabled: false, front: 0, back: 0, total: 0, type: 'gross' },
  twoBall: { enabled: false, front: 0, back: 0, total: 0, type: 'net' },
  aggy: { enabled: false, front: 0, back: 0, total: 0, type: 'net' },
  h2h: { enabled: false, perMatchup: 0, type: 'net' },
  stableford: {
    enabled: false,
    buyIn: 0,
    type: 'net',
    points: { double: 0, bogey: 1, par: 2, birdie: 3, eagle: 4, albatross: 5 },
  },
  threeManNassau: { enabled: false, amount: 0, type: 'net' },
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
    pairMatch: { ...DEFAULT_GAMES.pairMatch, ...games?.pairMatch },
    scramble4: { ...DEFAULT_GAMES.scramble4, ...games?.scramble4 },
    twoBall: { ...DEFAULT_GAMES.twoBall, ...games?.twoBall },
    aggy: { ...DEFAULT_GAMES.aggy, ...games?.aggy },
    h2h: { ...DEFAULT_GAMES.h2h, ...games?.h2h },
    stableford: {
      ...DEFAULT_GAMES.stableford,
      ...games?.stableford,
      points: {
        ...DEFAULT_GAMES.stableford.points,
        ...games?.stableford?.points,
      },
    },
    threeManNassau: { ...DEFAULT_GAMES.threeManNassau, ...games?.threeManNassau },
    wolf: { ...DEFAULT_GAMES.wolf, ...games?.wolf },
    puttPoker: { ...DEFAULT_GAMES.puttPoker, ...games?.puttPoker },
  };
}
