import { describe, expect, it } from 'vitest';
import {
  autoPlayingGroups,
  autoPlayingGroupsForTeams,
  autoPlayingGroupsFromPairMatches,
  normalizePlayingGroups,
} from '@/domain/playingGroups';

describe('playing group helpers', () => {
  it('chunks players into fours', () => {
    expect(autoPlayingGroups(['A', 'B', 'C', 'D', 'E'])).toEqual([
      { name: 'Group 1', players: ['A', 'B', 'C', 'D'] },
      { name: 'Group 2', players: ['E'] },
    ]);
  });

  it('interleaves team rosters for automatic groups', () => {
    expect(autoPlayingGroupsForTeams(['A1', 'A2', 'A3'], ['B1', 'B2'])).toEqual([
      { name: 'Group 1', players: ['A1', 'B1', 'A2', 'B2'] },
      { name: 'Group 2', players: ['A3'] },
    ]);
  });

  it('builds groups from pair matches and appends missing players', () => {
    expect(
      autoPlayingGroupsFromPairMatches(
        [{ a: ['A', 'B'], b: ['C', 'D'] }],
        ['A', 'B', 'C', 'D', 'E'],
        ['A', 'B', 'E'],
        ['C', 'D'],
      ),
    ).toEqual([
      { name: 'Group 1', players: ['A', 'B', 'C', 'D'] },
      { name: 'Group 2', players: ['E'] },
    ]);
  });

  it('falls back to team interleaving when pair matches are empty', () => {
    expect(autoPlayingGroupsFromPairMatches([], ['A', 'B', 'C', 'D'], ['A', 'B'], ['C', 'D'])).toEqual([
      { name: 'Group 1', players: ['A', 'C', 'B', 'D'] },
    ]);
  });

  it('repairs group player lists by removing invalid players and adding missing players', () => {
    expect(
      normalizePlayingGroups(
        [{ name: 'Custom', players: ['A', 'Ghost'] }],
        ['A', 'B', 'C'],
      ),
    ).toEqual([{ name: 'Custom', players: ['A', 'B', 'C'] }]);
  });

  it('auto-builds groups when no usable groups are provided', () => {
    expect(normalizePlayingGroups([], ['A', 'B'])).toEqual([
      { name: 'Group 1', players: ['A', 'B'] },
    ]);
  });
});
