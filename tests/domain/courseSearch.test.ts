import { describe, expect, it } from 'vitest';
import { courseFromSearchTee, normalizeStrokeIndexes, selectableCourseTees, type CourseSearchResult } from '@/domain/courseSearch';

const course: CourseSearchResult = {
  id: 123,
  clubName: 'Del Mar Country Club',
  courseName: 'Del Mar',
  location: 'Del Mar, CA',
  tees: {
    female: [
      {
        name: 'Blue',
        gender: 'Women',
        rating: 72.1,
        slope: 125,
        yards: 6100,
        holes: Array.from({ length: 18 }, (_, index) => ({ par: 4, yardage: 330 + index, si: index + 1 })),
      },
    ],
    male: [
      {
        name: 'Blue',
        gender: 'Men',
        rating: 72.4,
        slope: 131,
        yards: 6100,
        holes: Array.from({ length: 18 }, (_, index) => ({ par: index === 1 ? 5 : 4, yardage: 340 + index, si: 18 - index })),
      },
      {
        name: 'Gold',
        gender: 'Men',
        rating: 70,
        slope: 120,
        yards: 5800,
        holes: Array.from({ length: 9 }, (_, index) => ({ par: 4, yardage: 300 + index, si: index + 1 })),
      },
    ],
  },
};

describe('course search mapper', () => {
  it('keeps selectable 18-hole tees and prefers men when duplicate tee sets exist', () => {
    const tees = selectableCourseTees(course);

    expect(tees).toHaveLength(1);
    expect(tees[0]).toMatchObject({ name: 'Blue', gender: 'Men', rating: 72.4, slope: 131 });
  });

  it('maps a selected tee into the round course shape', () => {
    const tee = selectableCourseTees(course)[0];
    const roundCourse = courseFromSearchTee(course, tee);

    expect(roundCourse).toMatchObject({
      id: '123',
      clubName: 'Del Mar Country Club',
      courseName: 'Del Mar',
      location: 'Del Mar, CA',
      tee: { name: 'Blue', gender: 'Men', rating: 72.4, slope: 131, parTotal: 73, yards: 6100 },
    });
    expect(roundCourse.par[1]).toBe(5);
    expect(roundCourse.si).toEqual(Array.from({ length: 18 }, (_, index) => 18 - index));
    expect(roundCourse.yds[0]).toBe(340);
  });

  it('repairs invalid stroke indexes', () => {
    expect(normalizeStrokeIndexes([1, 1, ...Array.from({ length: 16 }, (_, index) => index + 3)])).toEqual(
      Array.from({ length: 18 }, (_, index) => index + 1),
    );
  });
});
