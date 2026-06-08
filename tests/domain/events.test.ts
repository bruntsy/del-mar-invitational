import { describe, expect, it } from 'vitest';
import {
  defaultEventConfig,
  eventDefaultRound,
  eventFormatLabel,
  eventRoundAvailablePoints,
  eventScoringModeLabel,
  normalizeEventConfig,
} from '@/domain/events';

describe('event config helpers', () => {
  it('labels event formats and scoring modes', () => {
    expect(eventFormatLabel('twoManBestBallAggy')).toContain('Best Ball + Aggy');
    expect(eventScoringModeLabel('strokePlay')).toBe('Stroke total');
    expect(eventScoringModeLabel('matchPlay')).toBe('Match play');
  });

  it('builds default rounds with expected formats and pairings', () => {
    const round0 = eventDefaultRound(0, ['A', 'B', 'C', 'D'], ['E', 'F', 'G', 'H']);
    const round1 = eventDefaultRound(1, ['A', 'B'], ['E', 'F']);

    expect(round0.format).toBe('bestBallNassau');
    expect(round0.pairMatches).toEqual([
      { a: ['A', 'B'], b: ['E', 'F'] },
      { a: ['C', 'D'], b: ['G', 'H'] },
    ]);
    expect(round1.format).toBe('scramble2v2Nassau');
  });

  it('creates a default three-round event and win target from available points', () => {
    const config = defaultEventConfig(['A', 'B', 'C', 'D']);

    expect(config.team1).toEqual(['A', 'B']);
    expect(config.team2).toEqual(['C', 'D']);
    expect(config.rounds).toHaveLength(3);
    expect(config.winPoints).toBe(5);
  });

  it('calculates available points for best-ball and aggy formats', () => {
    expect(eventRoundAvailablePoints(eventDefaultRound(0, ['A', 'B'], ['C', 'D']))).toBe(3);
    expect(
      eventRoundAvailablePoints({
        ...eventDefaultRound(0, ['A', 'B'], ['C', 'D']),
        format: 'twoManBestBallAggy',
      }),
    ).toBe(36);
  });

  it('normalizes teams by removing duplicate team assignments and adding group players', () => {
    const config = normalizeEventConfig(
      {
        team1: ['A', 'B'],
        team2: ['B', 'C'],
        rounds: [],
      },
      ['A', 'B', 'C', 'D'],
    );

    expect(config.team1).toEqual(['A', 'B']);
    expect(config.team2).toEqual(['C', 'D']);
  });

  it('pulls pair-match players into event teams when missing', () => {
    const config = normalizeEventConfig(
      {
        team1: ['A'],
        team2: ['C'],
        rounds: [{ ...eventDefaultRound(0), pairMatches: [{ a: ['B'], b: ['D'] }] }],
      },
      [],
    );

    expect(config.team1).toEqual(['A', 'B']);
    expect(config.team2).toEqual(['C', 'D']);
  });

  it('limits normalized events to 12 rounds', () => {
    const sourceRounds = Array.from({ length: 20 }, (_, index) => eventDefaultRound(index));

    expect(normalizeEventConfig({ rounds: sourceRounds }, []).rounds).toHaveLength(12);
  });

  it('repairs pair matches to valid event teams', () => {
    const config = normalizeEventConfig(
      {
        team1: ['A', 'B'],
        team2: ['C', 'D'],
        rounds: [
          {
            ...eventDefaultRound(0),
            pairMatches: [{ a: ['A', 'C', 'B'], b: ['D', 'A'] }],
          },
        ],
      },
      [],
    );

    expect(config.rounds[0].pairMatches).toEqual([{ a: ['A', 'B'], b: ['D'] }]);
  });
});
