import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { scoreAt } from '@/scoring/cells';
import type { RoundState, ScoreMatrix } from '@/types';
import { createMockSupabase } from '../helpers/mockSupabase';

const mockDb = createMockSupabase();
const mockState = { online: true };

vi.mock('@/services/supabase', () => ({
  get supabase() {
    return mockState.online ? mockDb.client : null;
  },
  hasSupabase: () => mockState.online,
}));

const { emptyRound, useRoundStore } = await import('@/stores/round');

function activeRoundRow(state: Partial<RoundState> = {}) {
  return {
    id: 'r1',
    group_id: 'g1',
    completed: false,
    state: {
      ...emptyRound('g1'),
      id: 'r1',
      groupId: 'g1',
      team1: ['Amy'],
      team2: ['Bo'],
      ...state,
    } as RoundState,
  };
}

beforeEach(() => {
  setActivePinia(createPinia());
  localStorage.clear();
  mockState.online = true;
  mockDb.reset();
});

afterEach(() => {
  useRoundStore().stopGroupSubscription();
  vi.useRealTimers();
});

describe('round realtime sync', () => {
  it('debounces local score writes into a Supabase round update', async () => {
    vi.useFakeTimers();
    mockDb.set('rounds', { data: activeRoundRow(), error: null });
    const store = useRoundStore();
    store.setRound(activeRoundRow().state, { Amy: { name: 'Amy', handicapIndex: 7 } });

    store.setScore('Amy', 0, 4);
    expect(mockDb.operations.some((op) => op.method === 'update')).toBe(false);

    await vi.advanceTimersByTimeAsync(600);

    const update = mockDb.operations.find((op) => op.table === 'rounds' && op.method === 'update');
    expect(update).toBeTruthy();
    const payload = update?.args[0] as { state: { scores: ScoreMatrix; players: unknown } };
    expect(scoreAt(payload.state.scores, 'Amy', 0)).toBe(4);
    expect(payload.state.players).toEqual({ Amy: { name: 'Amy', handicapIndex: 7 } });
  });

  it('applies realtime updates for the active round without erasing local extra cells', () => {
    const store = useRoundStore();
    store.setRound(activeRoundRow({ scores: { Amy: [4] } }).state);
    store.subscribeToGroup('g1');

    mockDb.emit('group-g1', {
      eventType: 'UPDATE',
      new: activeRoundRow({ scores: { Amy: [null, 3], Bo: [5] } }),
    });

    expect(store.readScore('Amy', 0)).toBe(4);
    expect(store.readScore('Amy', 1)).toBe(3);
    expect(store.readScore('Bo', 0)).toBe(5);
  });

  it('opens and stops the group channel cleanly', () => {
    const store = useRoundStore();
    store.subscribeToGroup('g1');
    expect(mockDb.hasChannel('group-g1')).toBe(true);

    store.stopGroupSubscription();
    expect(mockDb.hasChannel('group-g1')).toBe(false);
  });
});
