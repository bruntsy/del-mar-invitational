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

  it('keeps the scorer in setup when online round insert fails', async () => {
    mockDb.set('rounds', { data: null, error: { message: 'insert failed' } });
    const store = useRoundStore();

    const created = await store.startRound(draftRound(), players, 'g1');

    expect(created).toBeNull();
    expect(store.round).toBeNull();
    expect(store.syncError).toContain('retry');
  });

  it('recovers the exact round when an insert commits but its response is lost', async () => {
    let releaseInsert!: (result: { data: unknown; error: unknown }) => void;
    const lostResponse = new Promise<{ data: unknown; error: unknown }>((resolve) => {
      releaseInsert = resolve;
    });
    mockDb.enqueue('rounds', [lostResponse]);
    const store = useRoundStore();

    const starting = store.startRound(draftRound(), players, 'g1');
    const insert = mockDb.operations.find((op) => op.table === 'rounds' && op.method === 'insert');
    const startId = (insert?.args[0] as { id: string }).id;
    expect(startId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);

    mockDb.enqueue('rounds', [{ data: { ...activeRoundRow({ players }), id: startId }, error: null }]);
    releaseInsert({ data: null, error: { message: 'response lost' } });

    const created = await starting;
    expect(created?.id).toBe(startId);
    expect(store.syncError).toBe('');
    expect(store.pendingStartId).toBeNull();
    const recoveryFilters = mockDb.operations.filter((op) => op.method === 'eq');
    expect(recoveryFilters).toContainEqual(expect.objectContaining({ args: ['id', startId] }));
    expect(mockDb.operations.filter((op) => op.method === 'insert')).toHaveLength(1);
  });

  it('reuses the same client round id when the scorer retries setup', async () => {
    mockDb.set('rounds', { data: null, error: { message: 'offline' } });
    const store = useRoundStore();

    expect(await store.startRound(draftRound(), players, 'g1')).toBeNull();
    const firstInsert = mockDb.operations.find((op) => op.method === 'insert');
    const firstId = (firstInsert?.args[0] as { id: string }).id;

    mockDb.set('rounds', { data: activeRoundRow({ players }), error: null });
    expect(await store.startRound(draftRound(), players, 'g1')).not.toBeNull();
    const inserts = mockDb.operations.filter((op) => op.method === 'insert');
    const secondId = (inserts[1].args[0] as { id: string }).id;

    expect(secondId).toBe(firstId);
    expect(store.pendingStartId).toBeNull();
  });

  it('uses a new id for a fresh setup session after an abandoned failure', async () => {
    mockDb.set('rounds', { data: null, error: { message: 'offline' } });
    const store = useRoundStore();

    await store.startRound(draftRound(), players, 'g1');
    const firstId = store.pendingStartId;
    store.beginRoundSetup();
    await store.startRound(draftRound(), players, 'g1');

    expect(firstId).not.toBeNull();
    expect(store.pendingStartId).not.toBe(firstId);
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

  it('retries a failed score sync and clears the error after recovery', async () => {
    vi.useFakeTimers();
    const store = useRoundStore();
    store.setRound(activeRoundRow().state, players);
    mockDb.set('rounds', { data: null, error: { message: 'network down' } });

    store.setScore('Amy', 0, 4);
    await vi.advanceTimersByTimeAsync(600);
    expect(store.syncError).toContain('network down');
    expect(store.syncPending).toBe(true);

    mockDb.set('rounds', { data: activeRoundRow(), error: null });
    await vi.advanceTimersByTimeAsync(1000);
    expect(store.syncError).toBe('');
    expect(store.lastSyncedAt).not.toBe('');
  });

  it('stops automatic retries after the bounded retry limit', async () => {
    vi.useFakeTimers();
    const store = useRoundStore();
    store.setRound(activeRoundRow().state, players);
    mockDb.set('rounds', { data: null, error: { message: 'network down' } });

    store.setScore('Amy', 0, 4);
    await vi.advanceTimersByTimeAsync(40_000);

    const reads = mockDb.operations.filter((op) => op.table === 'rounds' && op.method === 'select');
    expect(reads).toHaveLength(6); // initial attempt plus five retries
    expect(store.retryAttempt).toBe(5);
    expect(store.syncPending).toBe(false);
    expect(store.syncStatusLabel).toBe('Sync failed — saved on this device');
  });

  it('queues an edit made during an in-flight sync instead of overlapping writes', async () => {
    vi.useFakeTimers();
    let releaseRead!: (result: { data: unknown; error: unknown }) => void;
    const delayedRead = new Promise<{ data: unknown; error: unknown }>((resolve) => { releaseRead = resolve; });
    const success = { data: activeRoundRow(), error: null };
    mockDb.enqueue('rounds', [delayedRead, success, success, success]);
    const store = useRoundStore();
    store.setRound(activeRoundRow().state, players);

    store.setScore('Amy', 0, 4);
    await vi.advanceTimersByTimeAsync(600);
    expect(store.syncing).toBe(true);

    store.setScore('Amy', 1, 5);
    expect(store.syncPending).toBe(true);
    expect(mockDb.operations.filter((op) => op.method === 'update')).toHaveLength(0);

    releaseRead(success);
    await Promise.resolve();
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(0);
    await Promise.resolve();

    const updates = mockDb.operations.filter((op) => op.table === 'rounds' && op.method === 'update');
    expect(updates).toHaveLength(2);
    const finalState = updates[1].args[0] as { state: { scores: ScoreMatrix } };
    expect(scoreAt(finalState.state.scores, 'Amy', 0)).toBe(4);
    expect(scoreAt(finalState.state.scores, 'Amy', 1)).toBe(5);
  });

  it('flushes a pending score in the confirmed completion write', async () => {
    vi.useFakeTimers();
    mockDb.set('rounds', { data: activeRoundRow(), error: null });
    const store = useRoundStore();
    store.setRound(activeRoundRow().state, players);

    store.setScore('Amy', 0, 4);
    expect(await store.setCompleted(true)).toBe(true);

    const updates = mockDb.operations.filter((op) => op.table === 'rounds' && op.method === 'update');
    expect(updates).toHaveLength(1);
    const payload = updates[0].args[0] as { completed: boolean; state: { scores: ScoreMatrix } };
    expect(payload.completed).toBe(true);
    expect(scoreAt(payload.state.scores, 'Amy', 0)).toBe(4);
  });

  it('reverts completion when the server does not confirm it', async () => {
    const store = useRoundStore();
    store.setRound(activeRoundRow().state, players);
    mockDb.set('rounds', { data: null, error: { message: 'network down' } });

    expect(await store.setCompleted(true)).toBe(false);
    expect(store.round?.completed).toBe(false);
    expect(store.syncError).toContain('network down');
  });

  it('refuses to reset a server-backed round', () => {
    const store = useRoundStore();
    store.setRound(activeRoundRow().state, players);

    expect(store.reset()).toBe(false);
    expect(store.round?.id).toBe('r1');
    expect(store.syncError).toContain('cannot be reset');
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

  it('keeps newer local score and putt cells when a stale realtime update arrives', () => {
    const store = useRoundStore();
    store.setRound(activeRoundRow({
      scores: { Amy: [{ v: 6, t: '2026-06-23T17:00:10.000Z' }] },
      putts: { Amy: [{ v: 3, t: '2026-06-23T17:00:10.000Z' }] },
      teamScores: { 'pair-1-a': [{ v: 5, t: '2026-06-23T17:00:10.000Z' }] },
    }).state);
    store.subscribeToGroup('g1');

    mockDb.emit('group-g1', {
      eventType: 'UPDATE',
      new: activeRoundRow({
        scores: { Amy: [{ v: 5, t: '2026-06-23T17:00:00.000Z' }] },
        putts: { Amy: [{ v: 2, t: '2026-06-23T17:00:00.000Z' }] },
        teamScores: { 'pair-1-a': [{ v: 4, t: '2026-06-23T17:00:00.000Z' }] },
      }),
    });

    expect(store.readScore('Amy', 0)).toBe(6);
    expect(store.readPutt('Amy', 0)).toBe(3);
    expect(store.readTeamScore('pair-1-a', 0)).toBe(5);
  });

  it('applies newer realtime score and putt cells over older local cells', () => {
    const store = useRoundStore();
    store.setRound(activeRoundRow({
      scores: { Amy: [{ v: 5, t: '2026-06-23T17:00:00.000Z' }] },
      putts: { Amy: [{ v: 2, t: '2026-06-23T17:00:00.000Z' }] },
      teamScores: { 'pair-1-a': [{ v: 4, t: '2026-06-23T17:00:00.000Z' }] },
    }).state);
    store.subscribeToGroup('g1');

    mockDb.emit('group-g1', {
      eventType: 'UPDATE',
      new: activeRoundRow({
        scores: { Amy: [{ v: 6, t: '2026-06-23T17:00:10.000Z' }] },
        putts: { Amy: [{ v: 3, t: '2026-06-23T17:00:10.000Z' }] },
        teamScores: { 'pair-1-a': [{ v: 5, t: '2026-06-23T17:00:10.000Z' }] },
      }),
    });

    expect(store.readScore('Amy', 0)).toBe(6);
    expect(store.readPutt('Amy', 0)).toBe(3);
    expect(store.readTeamScore('pair-1-a', 0)).toBe(5);
  });

  it('opens and stops the group channel cleanly', () => {
    const store = useRoundStore();
    store.subscribeToGroup('g1');
    expect(mockDb.hasChannel('group-g1')).toBe(true);

    store.stopGroupSubscription();
    expect(mockDb.hasChannel('group-g1')).toBe(false);
  });
});
