import { describe, expect, it } from 'vitest';
import { allocateNetStrokes, computeWHSCourseHcp, getsStroke } from '@/scoring/handicap';

describe('handicap helpers', () => {
  it('computes WHS course handicap using index, slope, rating, and par', () => {
    expect(computeWHSCourseHcp(10.2, 130, 72.5, 72)).toBe(12);
  });

  it('defaults missing slope to 113 and missing rating to par', () => {
    expect(computeWHSCourseHcp(14, undefined, undefined, 72)).toBe(14);
  });

  it('determines whether a player receives a stroke on a hole', () => {
    expect(getsStroke(8, 1)).toBe(true);
    expect(getsStroke(8, 8)).toBe(true);
    expect(getsStroke(8, 9)).toBe(false);
  });

  it('allocates net strokes relative to the lowest course handicap', () => {
    expect(allocateNetStrokes({ A: 7, B: 10, C: 14 })).toEqual({ A: 0, B: 3, C: 7 });
  });

  it('handles empty stroke allocation input', () => {
    expect(allocateNetStrokes({})).toEqual({});
  });
});
