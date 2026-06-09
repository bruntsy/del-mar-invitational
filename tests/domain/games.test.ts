import { describe, expect, it } from 'vitest';
import { DEFAULT_GAMES, cloneDefaultGames, normalizeGames } from '@/domain/games';

describe('game config normalization', () => {
  it('clones defaults without sharing nested references', () => {
    const first = cloneDefaultGames();
    const second = cloneDefaultGames();

    first.skins.pot = 999;

    expect(second.skins.pot).toBe(DEFAULT_GAMES.skins.pot);
  });

  it('fills missing game configs with defaults', () => {
    const normalized = normalizeGames({
      skins: { enabled: true, pot: 20 },
    });

    expect(normalized.skins).toEqual({ enabled: true, pot: 20, type: 'net', carry: false });
    expect(normalized.bestBall.balls).toBe(1);
    expect(normalized.wolf.nassau).toBe(false);
  });

  it('preserves configured bestBall settings', () => {
    const normalized = normalizeGames({
      bestBall: { enabled: true, front: 5, back: 5, total: 10, type: 'gross', balls: 1 },
    });

    expect(normalized.bestBall.enabled).toBe(true);
    expect(normalized.bestBall.front).toBe(5);
  });

  it('returns defaults for empty inputs', () => {
    expect(normalizeGames(undefined)).toEqual(DEFAULT_GAMES);
    expect(normalizeGames(null)).toEqual(DEFAULT_GAMES);
  });
});
