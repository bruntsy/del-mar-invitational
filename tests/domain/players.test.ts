import { describe, expect, it } from 'vitest';
import {
  groupPlayerByName,
  groupPlayerNames,
  normalizedGroupPlayers,
  sortedGroupPlayers,
} from '@/domain/players';
import type { PlayerMap } from '@/types';

describe('player normalization', () => {
  const players: PlayerMap = {
    Robbie: { name: 'Robbie', handicapIndex: 7.4 },
    legacyString: 'Michael',
    Cole: { name: '', handicapIndex: 10 },
    Empty: '',
  };

  it('normalizes modern player objects and legacy string values', () => {
    expect(normalizedGroupPlayers(players)).toEqual([
      { name: 'Robbie', handicapIndex: 7.4 },
      { name: 'Michael', handicapIndex: 0 },
      { name: 'Cole', handicapIndex: 10 },
    ]);
  });

  it('returns player names in source order', () => {
    expect(groupPlayerNames(players)).toEqual(['Robbie', 'Michael', 'Cole']);
  });

  it('sorts players by display name', () => {
    expect(sortedGroupPlayers(players).map((player) => player.name)).toEqual([
      'Cole',
      'Michael',
      'Robbie',
    ]);
  });

  it('finds a player by normalized name', () => {
    expect(groupPlayerByName(players, 'Michael')).toEqual({ name: 'Michael', handicapIndex: 0 });
    expect(groupPlayerByName(players, 'Missing')).toBeNull();
  });
});
