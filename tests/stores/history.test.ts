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

const { useHistoryStore } = await import('@/stores/history');

function goOnline(result: MockResult) {
  mockState.online = true;
  mockDb.reset();
  mockDb.set('rounds', result);
}

const completedRow = {
  id: 'r1',
  code: 'ABCD',
  completed_at: '2026-05-01T12:00:00.000Z',
  state: {
    course: {
      clubName: 'Del Mar',
      courseName: 'Championship',
      tee: { name: 'Blue', rating: 72, slope: 113, parTotal: 72 },
      par: Array(18).fill(4),
      si: Array.from({ length: 18 }, (_, i) => i + 1),
      yds: Array(18).fill(400),
    },
    team1: ['Amy'],
    team2: ['Bo'],
    scores: { Amy: Array(18).fill(4), Bo: Array(18).fill(5) },
    players: { Amy: { name: 'Amy', handicapIndex: 0 }, Bo: { name: 'Bo', handicapIndex: 0 } },
  },
};

beforeEach(() => {
  setActivePinia(createPinia());
  mockDb.reset();
  mockState.online = false;
});

describe('history store', () => {
  it('returns no history when offline', async () => {
    const store = useHistoryStore();
    const rounds = await store.loadHistory('g1');

    expect(rounds).toEqual([]);
    expect(store.rounds).toEqual([]);
  });

  it('maps completed rows into per-round summaries', async () => {
    goOnline({ data: [completedRow], error: null });
    const store = useHistoryStore();
    const rounds = await store.loadHistory('g1');

    expect(rounds).toHaveLength(1);
    expect(store.loadedGroupId).toBe('g1');
    expect(rounds[0]).toMatchObject({
      id: 'r1',
      courseName: 'Del Mar — Championship',
      completedAt: '2026-05-01T12:00:00.000Z',
    });
    expect(rounds[0].players).toEqual([
      { name: 'Amy', team: 'T1', gross: 72, net: 72, skins: 18 },
      { name: 'Bo', team: 'T2', gross: 90, net: 90, skins: 0 },
    ]);
  });

  it('surfaces a query error and clears the list', async () => {
    goOnline({ data: null, error: { message: 'boom' } });
    const store = useHistoryStore();
    const rounds = await store.loadHistory('g1');

    expect(rounds).toEqual([]);
    expect(store.error).toBe('boom');
  });

  it('clears state on demand', async () => {
    goOnline({ data: [completedRow], error: null });
    const store = useHistoryStore();
    await store.loadHistory('g1');
    store.clear();

    expect(store.rounds).toEqual([]);
    expect(store.loadedGroupId).toBeNull();
  });
});
