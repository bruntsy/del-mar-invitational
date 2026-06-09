import type { Course } from '@/types';

export interface CourseSearchHole {
  par?: number | string | null;
  yardage?: number | string | null;
  si?: number | string | null;
}

export interface CourseSearchTee {
  name?: string | null;
  gender?: string | null;
  rating?: number | string | null;
  slope?: number | string | null;
  parTotal?: number | string | null;
  yards?: number | string | null;
  holes?: CourseSearchHole[];
}

export interface CourseSearchResult {
  id?: string | number | null;
  clubName?: string | null;
  courseName?: string | null;
  location?: string | null;
  tees?: {
    male?: CourseSearchTee[];
    female?: CourseSearchTee[];
  };
}

export function normalizeStrokeIndexes(si: Array<number | string | null | undefined>): number[] {
  const values = si.map((value) => Number(value));
  const seen = new Set(values);
  if (values.length === 18 && seen.size === 18 && Math.min(...values) >= 1 && Math.max(...values) <= 18) {
    return values;
  }
  return Array.from({ length: 18 }, (_, index) => index + 1);
}

export function selectableCourseTees(course: CourseSearchResult): CourseSearchTee[] {
  const bySet = new Map<string, CourseSearchTee>();
  const add = (tee: CourseSearchTee, gender: 'Men' | 'Women') => {
    const name = String(tee.name || 'Tee');
    const yards = Number(tee.yards || 0);
    const normalized = { ...tee, name, gender, yards };
    const holes = normalized.holes || [];
    if (holes.length < 18 || !Number(normalized.rating) || !Number(normalized.slope)) return;

    const key = `${name.toLowerCase()}|${yards}`;
    const existing = bySet.get(key);
    if (!existing || existing.gender !== 'Men') bySet.set(key, normalized);
  };

  (course.tees?.female || []).forEach((tee) => add(tee, 'Women'));
  (course.tees?.male || []).forEach((tee) => add(tee, 'Men'));

  return [...bySet.values()].sort((a, b) => Number(b.yards || 0) - Number(a.yards || 0));
}

export function courseFromSearchTee(course: CourseSearchResult, tee: CourseSearchTee): Course {
  const holes = (tee.holes || []).slice(0, 18);
  const par = holes.map((hole) => Number(hole.par || 4));
  const yds = holes.map((hole) => Number(hole.yardage || 0));
  const parTotal = Number(tee.parTotal || par.reduce((sum, value) => sum + value, 0));
  const yards = Number(tee.yards || yds.reduce((sum, value) => sum + value, 0));

  return {
    id: course.id == null ? undefined : String(course.id),
    clubName: course.clubName || undefined,
    courseName: course.courseName || course.clubName || 'Course',
    location: course.location || undefined,
    tee: {
      name: String(tee.name || 'Tee'),
      gender: tee.gender || undefined,
      rating: Number(tee.rating) || 72,
      slope: Number(tee.slope) || 113,
      parTotal,
      yards,
    },
    par,
    si: normalizeStrokeIndexes(holes.map((hole, index) => hole.si ?? index + 1)),
    yds,
  };
}
