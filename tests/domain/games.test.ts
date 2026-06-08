import { describe, expect, it } from 'vitest';
import { DEFAULT_GAMES, cloneDefaultGames, normalizeGames } from '@/domain/games';

describe('game config normalization', () => {
  it('clones defaults without sharing nested references', () => {
    const first = cloneDefaultGames();
    const second = cloneDefaultGames();

    first.stableford.points.eagle = 8;

    expect(second.stableford.points.eagle).toBe(DEFAULT_GAMES.stableford.points.eagle);
  });

  it('fills missing game configs with defaults', () => {
    const normalized = normalizeGames({
      skins: { enabled: true, pot: 20 },
    });

    expect(normalized.skins).toEqual({ enabled: true, pot: 20, type: 'net', carry: false });
    expect(normalized.bestBall.balls).toBe(1);
    expect(normalized.stableford.points.par).toBe(2);
  });

  it('preserves configured nested stableford points', () => {
    const normalized = normalizeGames({
      stableford: {
        enabled: true,
        buyIn: 10,
        type: 'gross',
        points: { double: -1, bogey: 0, par: 2, birdie: 4, eagle: 6, albatross: 8 },
      },
    });

    expect(normalized.stableford.enabled).toBe(true);
    expect(normalized.stableford.points.eagle).toBe(6);
  });

  it('returns defaults for empty inputs', () => {
    expect(normalizeGames(undefined)).toEqual(DEFAULT_GAMES);
    expect(normalizeGames(null)).toEqual(DEFAULT_GAMES);
  });
});
