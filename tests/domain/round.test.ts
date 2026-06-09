import { describe, expect, it } from 'vitest';
import {
  courseDisplayName,
  mergeRoundData,
  normalizeRoundRow,
  roundForDb,
  summarizeRound,
} from '@/domain/round';
import type { RoundRow } from '@/types/db';
import type { Course } from '@/types/course';
import type { RoundState } from '@/types';

const par4 = (): Course => ({
  clubName: 'Del Mar',
  courseName: 'Championship',
  tee: { name: 'Blue', rating: 72, slope: 113, parTotal: 72 },
  par: Array(18).fill(4),
  si: Array.from({ length: 18 }, (_, i) => i + 1),
  yds: Array(18).fill(400),
});

/** Two-player round; Amy shoots all 4s (gross 72), Bo all 5s (gross 90). */
function evenMatchState(): Partial<RoundState> {
  return {
    course: par4(),
    team1: ['Amy'],
    team2: ['Bo'],
    scores: {
      Amy: Array(18).fill(4),
      Bo: Array(18).fill(5),
    },
  };
}

describe('normalizeRoundRow', () => {
  it('parses a string state column and applies row id/group/completed', () => {
    const row = {
      id: 'r1',
      group_id: 'g1',
      completed: true,
      state: JSON.stringify({ id: 'stale', groupId: 'stale', completed: false, team1: ['Amy'], team2: ['Bo'] }),
    } as unknown as RoundRow;

    const { round } = normalizeRoundRow(row);
    expect(round.id).toBe('r1');
    expect(round.groupId).toBe('g1');
    expect(round.completed).toBe(true);
    // Backfilled structures from normalizeRoundState.
    expect(round.wolf).toEqual({ holes: {} });
    expect(round.teamNames).toEqual({ team1: 'Team 1', team2: 'Team 2' });
    expect(Array.isArray(round.pairMatches)).toBe(true);
  });

  it('extracts the embedded players handicap map', () => {
    const row = {
      id: 'r2',
      group_id: 'g2',
      completed: false,
      state: { team1: ['Amy'], team2: [], players: { Amy: { name: 'Amy', handicapIndex: 7 } } },
    } as unknown as RoundRow;

    const { players } = normalizeRoundRow(row);
    expect(players).toEqual({ Amy: { name: 'Amy', handicapIndex: 7 } });
  });

  it('tolerates a missing state blob', () => {
    const row = { id: 'r3', group_id: 'g3', completed: false } as unknown as RoundRow;
    const { round, players } = normalizeRoundRow(row);
    expect(round.id).toBe('r3');
    expect(players).toEqual({});
  });
});

describe('roundForDb and mergeRoundData', () => {
  it('embeds the active player map in the persisted state payload', () => {
    const { round } = normalizeRoundRow({
      id: 'r-db',
      group_id: 'g-db',
      completed: false,
      state: { team1: ['Amy'], team2: [] },
    } as unknown as RoundRow);

    expect(roundForDb(round, { Amy: { name: 'Amy', handicapIndex: 7 } })).toMatchObject({
      id: 'r-db',
      groupId: 'g-db',
      players: { Amy: { name: 'Amy', handicapIndex: 7 } },
    });
  });

  it('merges score cells without letting remote nulls wipe local values', () => {
    const local = normalizeRoundRow({
      id: 'r1',
      group_id: 'g1',
      completed: false,
      state: { team1: ['Amy'], team2: ['Bo'], scores: { Amy: [4], Bo: [null, 5] } },
    } as unknown as RoundRow).round;
    const remote = normalizeRoundRow({
      id: 'r1',
      group_id: 'g1',
      completed: false,
      state: { team1: ['Amy'], team2: ['Bo'], scores: { Amy: [null, 3], Bo: [6, null] } },
    } as unknown as RoundRow).round;

    const merged = mergeRoundData(local, remote, true);
    expect(merged.scores.Amy[0]).toBe(4);
    expect(merged.scores.Amy[1]).toBe(3);
    expect(merged.scores.Bo[0]).toBe(6);
    expect(merged.scores.Bo[1]).toBe(5);
  });
});

describe('summarizeRound', () => {
  it('computes per-player net and skins, sorted by net', () => {
    const { round } = normalizeRoundRow({
      id: 'r1',
      group_id: 'g1',
      completed: true,
      state: evenMatchState(),
    } as unknown as RoundRow);

    const summary = summarizeRound(round, {
      Amy: { name: 'Amy', handicapIndex: 0 },
      Bo: { name: 'Bo', handicapIndex: 0 },
    });

    expect(summary.courseName).toBe('Del Mar — Championship');
    expect(summary.players).toEqual([
      { name: 'Amy', team: 'T1', net: 72, skins: 18 },
      { name: 'Bo', team: 'T2', net: 90, skins: 0 },
    ]);
  });

  it('drops players with no recorded score and handles a course-less round', () => {
    const { round } = normalizeRoundRow({
      id: 'r9',
      group_id: 'g1',
      completed: true,
      state: { team1: ['Amy'], team2: ['Bo'] },
    } as unknown as RoundRow);

    expect(summarizeRound(round, {}).players).toEqual([]);
  });
});

describe('courseDisplayName', () => {
  it('joins club and course names, falling back gracefully', () => {
    expect(courseDisplayName(par4())).toBe('Del Mar — Championship');
    expect(courseDisplayName(null)).toBe('Unknown course');
    expect(
      courseDisplayName({ courseName: 'Solo', tee: { name: 'X', rating: 72, slope: 113, parTotal: 72 }, par: [], si: [], yds: [] }),
    ).toBe('Solo');
  });
});
