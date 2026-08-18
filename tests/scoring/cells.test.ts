import { describe, expect, it } from 'vitest';
import {
  cellTimestamp,
  cellValue,
  normalizeScoreMatrix,
  normalizeScoreRow,
  scoreAt,
  writeCell,
} from '@/scoring/cells';
import type { ScoreMatrix } from '@/types';

describe('score cell compatibility', () => {
  const now = new Date('2026-06-08T15:00:00.000Z');

  it('reads legacy scalar cells and timestamped cells', () => {
    expect(cellValue(5)).toBe(5);
    expect(cellValue(null)).toBeNull();
    expect(cellValue({ v: 4, t: now.toISOString() })).toBe(4);
  });

  it('writes timestamped cells through one helper', () => {
    expect(writeCell(3, now)).toEqual({ v: 3, t: '2026-06-08T15:00:00.000Z' });
    expect(writeCell(null, now)).toEqual({ v: null, t: '2026-06-08T15:00:00.000Z' });
  });

  it('reads scores from mixed matrix formats', () => {
    const matrix: ScoreMatrix = {
      Robbie: [5, { v: 4, t: now.toISOString() }, null],
    };

    expect(scoreAt(matrix, 'Robbie', 0)).toBe(5);
    expect(scoreAt(matrix, 'Robbie', 1)).toBe(4);
    expect(scoreAt(matrix, 'Robbie', 2)).toBeNull();
    expect(scoreAt(matrix, 'Missing', 0)).toBeNull();
  });

  it('normalizes legacy rows into 18 timestamped cells', () => {
    const row = normalizeScoreRow([5, 4, null], now);

    expect(row).toHaveLength(18);
    expect(row[0]).toEqual({ v: 5, t: '2026-06-08T15:00:00.000Z' });
    expect(row[2]).toEqual({ v: null, t: '2026-06-08T15:00:00.000Z' });
    expect(row[17]).toEqual({ v: null, t: '2026-06-08T15:00:00.000Z' });
  });

  it('keeps valid timestamps and repairs invalid ones', () => {
    const row = normalizeScoreRow(
      [
        { v: 4, t: '2026-06-08T14:00:00.000Z' },
        { v: 5, t: 'bad timestamp' },
      ],
      now,
    );

    expect(cellTimestamp(row[0])).toBe('2026-06-08T14:00:00.000Z');
    expect(row[1]).toEqual({ v: 5, t: '2026-06-08T15:00:00.000Z' });
  });

  it('normalizes every player row in a matrix', () => {
    const normalized = normalizeScoreMatrix({ A: [4], B: [{ v: 5, t: now.toISOString() }] }, now);

    expect(normalized.A).toHaveLength(18);
    expect(normalized.B[0]).toEqual({ v: 5, t: '2026-06-08T15:00:00.000Z' });
  });
});
