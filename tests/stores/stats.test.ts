import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockSupabase, type MockResult } from '../helpers/mockSupabase';

const mockDb = createMockSupabase();
const mockState = { online: false };

vi.mock('@/services/supabase', () => ({
  get supabase() {
    return mockState.online ? mockDb.client : null;
  },
  hasSupabase: () => mockState.online,
}));

const { useStatsStore } = await import('@/stores/stats');

function goOnline(result: MockResult) {
  mockState.online = true;
  mockDb.reset();
  mockDb.set('rounds', result);
}

// All par-4s, slope 113, rating 72, par 72 — handicap index 0 → course hcp 0.
const course = {
  clubName: 'Del Mar',
  courseName: 'Championship',
  tee: { name: 'Blue', rating: 72, slope: 113, parTotal: 72 },
  par: Array(18).fill(4),
  si: Array.from({ length: 18 }, (_, i) => i + 1),
  yds: Array(18).fill(400),
};

function makeRow(id: string, playerScores: Record<string, number[]>) {
  const names = Object.keys(playerScores);
  return {
    id,
    code: id.toUpperCase(),
    completed_at: `2026-05-0${id}-T12:00:00Z`,
    state: {
      course,
      team1: names.slice(0, Math.ceil(names.length / 2)),
      team2: names.slice(Math.ceil(names.length / 2)),
      scores: Object.fromEntries(Object.entries(playerScores).map(([n, s]) => [n, s])),
      players: Object.fromEntries(names.map((n) => [n, { name: n, handicapIndex: 0 }])),
    },
  };
}

beforeEach(() => {
  setActivePinia(createPinia());
  mockDb.reset();
  mockState.online = false;
});

describe('stats store', () => {
  it('returns empty stats when offline', async () => {
    const store = useStatsStore();
    const result = await store.loadStats('g1');
    expect(result).toEqual([]);
    expect(store.stats).toEqual([]);
  });

  it('returns empty stats for null groupId', async () => {
    goOnline({ data: [], error: null });
    const store = useStatsStore();
    const result = await store.loadStats(null);
    expect(result).toEqual([]);
  });

  it('surfaces query errors and clears stats', async () => {
    goOnline({ data: null, error: { message: 'db error' } });
    const store = useStatsStore();
    await store.loadStats('g1');
    expect(store.stats).toEqual([]);
    expect(store.error).toBe('db error');
  });

  it('computes rounds played, avg gross, avg net, and total skins for a single round', async () => {
    // Amy shoots 72 (par), Bo shoots 90 (+18). No handicap → net = gross.
    const row = makeRow('1', { Amy: Array(18).fill(4), Bo: Array(18).fill(5) });
    goOnline({ data: [row], error: null });
    const store = useStatsStore();
    await store.loadStats('g1');

    expect(store.stats).toHaveLength(2);

    const amy = store.stats.find((p) => p.name === 'Amy')!;
    expect(amy.rounds).toBe(1);
    expect(amy.avgGross).toBe(72);
    expect(amy.avgNet).toBe(72);
    // Amy makes par on every hole — Bo makes bogey. Amy wins all 18 skins.
    expect(amy.totalSkins).toBe(18);

    const bo = store.stats.find((p) => p.name === 'Bo')!;
    expect(bo.rounds).toBe(1);
    expect(bo.avgGross).toBe(90);
    expect(bo.avgNet).toBe(90);
    expect(bo.totalSkins).toBe(0);
  });

  it('accumulates stats across multiple rounds', async () => {
    const row1 = makeRow('1', { Amy: Array(18).fill(4), Bo: Array(18).fill(5) }); // Amy 72, Bo 90
    const row2 = makeRow('2', { Amy: Array(18).fill(5), Bo: Array(18).fill(4) }); // Amy 90, Bo 72
    goOnline({ data: [row1, row2], error: null });
    const store = useStatsStore();
    await store.loadStats('g1');

    const amy = store.stats.find((p) => p.name === 'Amy')!;
    expect(amy.rounds).toBe(2);
    expect(amy.avgGross).toBe(81); // (72 + 90) / 2
    expect(amy.avgNet).toBe(81);

    const bo = store.stats.find((p) => p.name === 'Bo')!;
    expect(bo.rounds).toBe(2);
    expect(bo.avgGross).toBe(81);
  });

  it('skips rounds with no course data', async () => {
    const noCoursRow = { id: 'x', code: 'X', completed_at: null, state: { team1: ['Amy'], team2: [], scores: {}, players: {} } };
    const goodRow = makeRow('1', { Amy: Array(18).fill(4) });
    goOnline({ data: [noCoursRow, goodRow], error: null });
    const store = useStatsStore();
    await store.loadStats('g1');

    const amy = store.stats.find((p) => p.name === 'Amy')!;
    expect(amy.rounds).toBe(1);
  });

  it('sets loadedGroupId after a successful load', async () => {
    goOnline({ data: [], error: null });
    const store = useStatsStore();
    await store.loadStats('g42');
    expect(store.loadedGroupId).toBe('g42');
  });

  it('clear() resets all state', async () => {
    goOnline({ data: [makeRow('1', { Amy: Array(18).fill(4) })], error: null });
    const store = useStatsStore();
    await store.loadStats('g1');
    store.clear();
    expect(store.stats).toEqual([]);
    expect(store.loadedGroupId).toBeNull();
  });
});
