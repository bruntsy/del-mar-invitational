import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { scoreAt } from '@/scoring/cells';
import type { PlayerMap, RoundState, ScoreMatrix } from '@/types';
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

const players: PlayerMap = {
  Amy: { name: 'Amy', handicapIndex: 7 },
  Bo: { name: 'Bo', handicapIndex: 12 },
};

function activeRoundRow(state: Partial<RoundState> & { players?: PlayerMap } = {}) {
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

function draftRound(state: Partial<RoundState> = {}): RoundState {
  return {
    ...emptyRound(),
    team1: ['Amy'],
    team2: ['Bo'],
    ...state,
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
  it('inserts a Supabase round when starting inside an online group', async () => {
    mockDb.set('rounds', { data: activeRoundRow({ players }), error: null });
    const store = useRoundStore();

    await store.startRound(draftRound(), players, 'g1');

    expect(store.round?.id).toBe('r1');
    expect(store.round?.groupId).toBe('g1');
    expect(store.players).toEqual(players);
    expect(mockDb.operations.find((op) => op.table === 'rounds' && op.method === 'insert')).toBeTruthy();
    expect(mockDb.hasChannel('group-g1')).toBe(true);
  });

  it('starts locally when online round insert fails', async () => {
    mockDb.set('rounds', { data: null, error: { message: 'insert failed' } });
    const store = useRoundStore();

    await store.startRound(draftRound(), players, 'g1');

    expect(store.round?.id).toBeNull();
    expect(store.round?.groupId).toBe('g1');
    expect(store.players).toEqual(players);
    expect(store.syncError).toContain('Started locally');
  });

  it('starts locally without Supabase when there is no online group id', async () => {
    const store = useRoundStore();

    await store.startRound(draftRound(), players, null);

    expect(store.round?.id).toBeNull();
    expect(store.round?.groupId).toBeNull();
    expect(mockDb.operations.find((op) => op.table === 'rounds' && op.method === 'insert')).toBeFalsy();
  });

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
