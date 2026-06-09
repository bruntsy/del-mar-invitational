/**
 * End-to-end online flow tests using mocked Supabase.
 * No DOM mounting — exercises group + round stores directly.
 * Covers: create group → add roster → start round → score → putt →
 *         complete → two-client realtime merge → polling fallback.
 */
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { scoreAt } from '@/scoring/cells';
import type { PlayerMap, RoundState } from '@/types';
import { createMockSupabase } from '../helpers/mockSupabase';

const mockDb = createMockSupabase();
const mockState = { online: false };

vi.mock('@/services/supabase', () => ({
  get supabase() {
    return mockState.online ? mockDb.client : null;
  },
  hasSupabase: () => mockState.online,
}));

const { useGroupStore } = await import('@/stores/group');
const { emptyRound, useRoundStore } = await import('@/stores/round');

const players: PlayerMap = {
  Ann: { name: 'Ann', handicapIndex: 10 },
  Bea: { name: 'Bea', handicapIndex: 12 },
  Cal: { name: 'Cal', handicapIndex: 6 },
  Dan: { name: 'Dan', handicapIndex: 20 },
};

function roundRow(id: string, groupId: string, stateOverride: Partial<RoundState> = {}) {
  return {
    id,
    group_id: groupId,
    completed: false,
    state: {
      ...emptyRound(groupId),
      id,
      groupId,
      team1: ['Ann', 'Bea'],
      team2: ['Cal', 'Dan'],
      players,
      ...stateOverride,
    } as RoundState,
  };
}

function draftState(): RoundState {
  return {
    ...emptyRound('g1'),
    team1: ['Ann', 'Bea'],
    team2: ['Cal', 'Dan'],
  };
}

beforeEach(() => {
  setActivePinia(createPinia());
  localStorage.clear();
  mockDb.reset();
  mockState.online = false;
});

afterEach(() => {
  useRoundStore().stopGroupSubscription();
  vi.useRealTimers();
});

describe('online flow: group create → roster → round start → score → complete', () => {
  it('creates a group online and records the DB id', async () => {
    mockState.online = true;
    mockDb.set('groups', { data: { id: 'g1', room_code: 'ABCD', name: 'Test', players: {} }, error: null });

    const group = useGroupStore();
    expect(await group.createGroup('Test')).toBe(true);
    expect(group.group?.id).toBe('g1');
    expect(group.groupCode).toBe('ABCD');
  });

  it('adds a roster player and pushes the update to Supabase', async () => {
    mockState.online = true;
    mockDb.set('groups', { data: { id: 'g1', room_code: 'ABCD', name: 'Test', players: {} }, error: null });
    const group = useGroupStore();
    await group.createGroup('Test');

    expect(await group.addPlayer('Ann', '10')).toBe(true);

    const update = mockDb.operations.find((op) => op.table === 'groups' && op.method === 'update');
    expect(update?.args[0]).toMatchObject({ players: { Ann: { name: 'Ann', handicapIndex: 10 } } });
  });

  it('starts a round online: inserts a row, subscribes, and reflects the DB id', async () => {
    vi.useFakeTimers();
    mockState.online = true;
    mockDb.set('rounds', { data: roundRow('r1', 'g1'), error: null });

    const round = useRoundStore();
    await round.startRound(draftState(), players, 'g1');

    expect(round.round?.id).toBe('r1');
    expect(round.round?.groupId).toBe('g1');
    expect(mockDb.operations.find((op) => op.table === 'rounds' && op.method === 'insert')).toBeTruthy();
    expect(mockDb.hasChannel('group-g1')).toBe(true);
  });

  it('debounces score writes and syncs the score payload to Supabase', async () => {
    vi.useFakeTimers();
    mockState.online = true;
    mockDb.set('rounds', { data: roundRow('r1', 'g1'), error: null });

    const round = useRoundStore();
    await round.startRound(draftState(), players, 'g1');
    mockDb.reset();
    mockDb.set('rounds', { data: roundRow('r1', 'g1'), error: null });

    round.setScore('Ann', 0, 5);
    // no update yet — debounce window
    expect(mockDb.operations.filter((op) => op.method === 'update' && op.table === 'rounds')).toHaveLength(0);

    await vi.advanceTimersByTimeAsync(700);

    const update = mockDb.operations.find((op) => op.table === 'rounds' && op.method === 'update');
    expect(update).toBeTruthy();
    const payload = update!.args[0] as { state: { scores: Record<string, number[]> } };
    expect(scoreAt(payload.state.scores, 'Ann', 0)).toBe(5);
  });

  it('debounces putt writes and includes putts in the sync payload', async () => {
    vi.useFakeTimers();
    mockState.online = true;
    mockDb.set('rounds', { data: roundRow('r1', 'g1'), error: null });

    const round = useRoundStore();
    await round.startRound(draftState(), players, 'g1');
    mockDb.reset();
    mockDb.set('rounds', { data: roundRow('r1', 'g1'), error: null });

    round.setPutt('Ann', 0, 3);

    await vi.advanceTimersByTimeAsync(700);

    const update = mockDb.operations.find((op) => op.table === 'rounds' && op.method === 'update');
    expect(update).toBeTruthy();
    const payload = update!.args[0] as { state: { putts: Record<string, number[]> } };
    expect(scoreAt(payload.state.putts, 'Ann', 0)).toBe(3);
  });

  it('syncs round completion to Supabase', async () => {
    vi.useFakeTimers();
    mockState.online = true;
    mockDb.set('rounds', { data: roundRow('r1', 'g1'), error: null });

    const round = useRoundStore();
    await round.startRound(draftState(), players, 'g1');
    mockDb.reset();
    mockDb.set('rounds', { data: roundRow('r1', 'g1'), error: null });

    round.setCompleted(true);
    expect(round.round?.completed).toBe(true);

    await vi.advanceTimersByTimeAsync(700);

    const update = mockDb.operations.find((op) => op.table === 'rounds' && op.method === 'update');
    expect(update).toBeTruthy();
    expect((update!.args[0] as { completed: boolean }).completed).toBe(true);
  });
});

describe('online flow: two-client realtime merge', () => {
  it('preserves local hole when remote sends a different hole', () => {
    mockState.online = true;
    const round = useRoundStore();
    round.setRound(
      { ...emptyRound('g1'), id: 'r1', groupId: 'g1', team1: ['Ann', 'Bea'], team2: ['Cal', 'Dan'] } as RoundState,
      players,
    );
    round.setScore('Ann', 0, 4);
    round.subscribeToGroup('g1');

    mockDb.emit('group-g1', {
      eventType: 'UPDATE',
      new: roundRow('r1', 'g1', { scores: { Ann: [null, 5, 3] as unknown as number[], Bea: [6] as unknown as number[] } }),
    });

    expect(round.readScore('Ann', 0)).toBe(4);
    expect(round.readScore('Ann', 1)).toBe(5);
    expect(round.readScore('Ann', 2)).toBe(3);
    expect(round.readScore('Bea', 0)).toBe(6);
  });

  it('applies remote putt data during merge', () => {
    mockState.online = true;
    const round = useRoundStore();
    round.setRound(
      { ...emptyRound('g1'), id: 'r1', groupId: 'g1', team1: ['Ann'], team2: ['Cal'] } as RoundState,
      players,
    );
    round.subscribeToGroup('g1');

    mockDb.emit('group-g1', {
      eventType: 'UPDATE',
      new: roundRow('r1', 'g1', { putts: { Ann: [2] as unknown as number[] } }),
    });

    expect(round.readPutt('Ann', 0)).toBe(2);
  });

  it('INSERT event for a new round replaces the active round (group follow-the-leader)', () => {
    mockState.online = true;
    const round = useRoundStore();
    round.setRound(
      { ...emptyRound('g1'), id: 'r1', groupId: 'g1', team1: ['Ann'], team2: ['Cal'] } as RoundState,
      players,
    );
    round.subscribeToGroup('g1');

    mockDb.emit('group-g1', {
      eventType: 'INSERT',
      new: roundRow('r2', 'g1'),
    });

    // All group members follow the new round when someone inserts one.
    expect(round.round?.id).toBe('r2');
  });

  it('UPDATE for a different round id is ignored', () => {
    mockState.online = true;
    const round = useRoundStore();
    round.setRound(
      { ...emptyRound('g1'), id: 'r1', groupId: 'g1', team1: ['Ann'], team2: ['Cal'] } as RoundState,
      players,
    );
    round.setScore('Ann', 0, 4);
    round.subscribeToGroup('g1');

    mockDb.emit('group-g1', {
      eventType: 'UPDATE',
      new: roundRow('r99', 'g1', { scores: { Ann: [9] as unknown as number[] } }),
    });

    expect(round.readScore('Ann', 0)).toBe(4);
  });
});

describe('online flow: polling fallback', () => {
  it('polls Supabase every 10 seconds and merges remote scores', async () => {
    vi.useFakeTimers();
    mockState.online = true;

    const round = useRoundStore();
    round.setRound(
      { ...emptyRound('g1'), id: 'r1', groupId: 'g1', team1: ['Ann'], team2: ['Cal'] } as RoundState,
      players,
    );

    mockDb.set('rounds', { data: roundRow('r1', 'g1', { scores: { Ann: [5] as unknown as number[] } }), error: null });
    round.startPolling();

    expect(round.readScore('Ann', 0)).toBeNull();

    await vi.advanceTimersByTimeAsync(10001);

    expect(round.readScore('Ann', 0)).toBe(5);
  });

  it('polling preserves local extra cells not in the polled response', async () => {
    vi.useFakeTimers();
    mockState.online = true;

    const round = useRoundStore();
    round.setRound(
      { ...emptyRound('g1'), id: 'r1', groupId: 'g1', team1: ['Ann'], team2: ['Cal'] } as RoundState,
      players,
    );
    round.setScore('Ann', 2, 7);

    mockDb.set('rounds', { data: roundRow('r1', 'g1', { scores: { Ann: [5] as unknown as number[] } }), error: null });
    round.startPolling();

    await vi.advanceTimersByTimeAsync(10001);

    expect(round.readScore('Ann', 0)).toBe(5);
    expect(round.readScore('Ann', 2)).toBe(7);
  });
});

describe('online flow: join group and resume active round', () => {
  it('joining a group with an active round populates the round store', async () => {
    mockState.online = true;
    mockDb.set('groups', { data: { id: 'g1', room_code: 'JOIN', name: 'Joined', players: {} }, error: null });
    mockDb.set('rounds', {
      data: roundRow('r1', 'g1', { scores: { Ann: [4] as unknown as number[] } }),
      error: null,
    });

    const group = useGroupStore();
    const round = useRoundStore();
    expect(await group.joinGroup('join')).toBe(true);

    expect(round.round?.id).toBe('r1');
    expect(round.playerNames).toContain('Ann');
    expect(round.readScore('Ann', 0)).toBe(4);
  });

  it('joining a group with no active round leaves the round store empty', async () => {
    mockState.online = true;
    mockDb.set('groups', { data: { id: 'g2', room_code: 'EMPT', name: 'Empty', players: {} }, error: null });
    mockDb.set('rounds', { data: null, error: { message: 'no rows' } });

    const group = useGroupStore();
    const round = useRoundStore();
    await group.joinGroup('empt');

    expect(round.round).toBeNull();
  });
});
