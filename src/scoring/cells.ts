import type { ScoreCell, ScoreMatrix, ScoreRow, TimedCellValue } from '@/types';

const ISO_DATE_PREFIX = /^\d{4}-\d{2}-\d{2}T/;

export function isTimedCell(cell: ScoreCell | undefined): cell is TimedCellValue {
  return (
    typeof cell === 'object' &&
    cell !== null &&
    'v' in cell &&
    't' in cell &&
    typeof cell.t === 'string'
  );
}

export function cellValue(cell: ScoreCell | undefined): number | null {
  if (cell == null) return null;
  if (isTimedCell(cell)) return cell.v == null ? null : Number(cell.v);
  return Number(cell);
}

export function cellTimestamp(cell: ScoreCell | undefined): string | null {
  if (!isTimedCell(cell)) return null;
  return ISO_DATE_PREFIX.test(cell.t) ? cell.t : null;
}

export function writeCell(value: number | null, now = new Date()): TimedCellValue {
  return {
    v: value,
    t: now.toISOString(),
  };
}

export function scoreAt(matrix: ScoreMatrix, player: string, hole: number): number | null {
  return cellValue(matrix[player]?.[hole]);
}

export function normalizeScoreRow(row: ScoreRow | undefined, now = new Date()): TimedCellValue[] {
  const values = Array.isArray(row) ? row : [];

  return Array.from({ length: 18 }, (_, hole) => {
    const cell = values[hole];

    if (isTimedCell(cell)) {
      return {
        v: cell.v == null ? null : Number(cell.v),
        t: cellTimestamp(cell) ?? now.toISOString(),
      };
    }

    return writeCell(cell == null ? null : Number(cell), now);
  });
}

export function normalizeScoreMatrix(matrix: ScoreMatrix = {}, now = new Date()): Record<string, TimedCellValue[]> {
  return Object.fromEntries(
    Object.entries(matrix).map(([player, row]) => [player, normalizeScoreRow(row, now)]),
  );
}
