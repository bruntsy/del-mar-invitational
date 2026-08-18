import { describe, expect, it } from 'vitest';
import { finalMatchStatus, runningMatchStatus, type HoleWinner } from '@/scoring/matchStatus';

describe('runningMatchStatus', () => {
  it('marks leading pending holes before any result', () => {
    const status = runningMatchStatus([null, null, null]);
    expect(status.map((s) => s.label)).toEqual(['Pending', 'Pending', 'Pending']);
    expect(status.every((s) => s.leader === null && !s.decided)).toBe(true);
  });

  it('counts a win for side a as N Up', () => {
    const status = runningMatchStatus(['a', 'a', 'b']);
    expect(status.map((s) => s.label)).toEqual(['1 Up', '2 Up', '1 Up']);
    expect(status[1].leader).toBe('a');
    expect(status[2].leader).toBe('a');
  });

  it('returns All Square for ties and offsetting wins', () => {
    const status = runningMatchStatus(['tie', 'a', 'b']);
    expect(status.map((s) => s.label)).toEqual(['All Square', '1 Up', 'All Square']);
  });

  it('carries the standing across an unscored hole', () => {
    const status = runningMatchStatus(['a', null, 'a']);
    expect(status.map((s) => s.label)).toEqual(['1 Up', '1 Up', '2 Up']);
    expect(status[1].leader).toBe('a');
  });

  it('tracks lead changes', () => {
    const status = runningMatchStatus(['b', 'b', 'a', 'a', 'a']);
    expect(status.map((s) => s.label)).toEqual(['1 Up', '2 Up', '1 Up', 'All Square', '1 Up']);
    expect(status[0].leader).toBe('b');
    expect(status[4].leader).toBe('a');
  });

  it('closes out the match with a dormie-beating lead (3 & 2)', () => {
    // 18-hole contest: 3 up after 16 holes, only 2 remain -> closed.
    const winners: HoleWinner[] = [
      'a', 'a', 'a', 'tie', 'tie', 'tie', 'tie', 'tie',
      'tie', 'tie', 'tie', 'tie', 'tie', 'tie', 'tie', 'tie',
      null, null,
    ];
    const status = runningMatchStatus(winners, { closeout: true });
    expect(status[15].label).toBe('3 & 2');
    expect(status[15].decided).toBe(true);
    // Subsequent holes stay closed.
    expect(status[16].label).toBe('3 & 2');
    expect(status[17].decided).toBe(true);
  });

  it('does not phantom-close on trailing unscored holes', () => {
    // 2 up after 5 of 18 holes; the rest are unplayed -> still 2 Up, not closed.
    const winners: HoleWinner[] = [
      'a', 'tie', 'a', 'tie', 'tie',
      null, null, null, null, null, null, null, null,
      null, null, null, null, null,
    ];
    const status = runningMatchStatus(winners, { closeout: true });
    expect(status[4].label).toBe('2 Up');
    expect(status.some((s) => s.decided)).toBe(false);
    expect(status[17].label).toBe('2 Up');
  });

  it('does not close when the lead only equals holes remaining (dormie)', () => {
    const winners: HoleWinner[] = ['a', 'a', null, null];
    const status = runningMatchStatus(winners, { closeout: true });
    expect(status[1].label).toBe('2 Up');
    expect(status[1].decided).toBe(false);
  });
});

describe('finalMatchStatus', () => {
  it('returns the last standing', () => {
    expect(finalMatchStatus(['a', 'a', 'b']).label).toBe('1 Up');
  });

  it('returns Pending for an empty contest', () => {
    expect(finalMatchStatus([]).label).toBe('Pending');
  });
});
