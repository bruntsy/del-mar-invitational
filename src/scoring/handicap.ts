export function computeWHSCourseHcp(
  index: number | string | null | undefined,
  slope: number | string | null | undefined,
  rating: number | string | null | undefined,
  par: number | string | null | undefined,
): number {
  const numericSlope = Number(slope || 113);
  const numericPar = Number(par || 0);
  const numericRating = Number(rating || numericPar);

  return Math.round((Number(index || 0) * numericSlope) / 113 + numericRating - numericPar);
}

export function getsStroke(playerStrokes: number | string | null | undefined, strokeIndex: number): boolean {
  return Number(strokeIndex) <= Number(playerStrokes || 0);
}

export function allocateNetStrokes(courseHandicaps: Record<string, number>): Record<string, number> {
  const values = Object.values(courseHandicaps);
  if (!values.length) return {};

  const min = Math.min(...values);

  return Object.fromEntries(
    Object.entries(courseHandicaps).map(([player, handicap]) => [player, handicap - min]),
  );
}
