import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockSupabase, type MockResult } from '../helpers/mockSupabase';

// Mutable mock client so individual tests can toggle online/offline and program
// per-table Supabase responses. Prefixed `mock*` so vitest allows it inside the
// hoisted factory.
const mockDb = createMockSupabase();
const mockState = { online: false };

vi.mock('@/services/supabase', () => ({
  get supabase() {
    return mockState.online ? mockDb.client : null;
  },
  hasSupabase: () => mockState.online,
}));

// Imported after the mock is registered.
const { useGroupStore } = await import('@/stores/group');
const { useRoundStore } = await import('@/stores/round');

function goOffline() {
  mockState.online = false;
}

/** Bring the client online; `result` programs the `groups` table response. */
function goOnline(result: MockResult) {
  mockState.online = true;
  mockDb.reset();
  mockDb.set('groups', result);
}

beforeEach(() => {
  setActivePinia(createPinia());
  localStorage.clear();
  mockDb.reset();
  goOffline();
});

describe('group store — offline (no Supabase)', () => {
  it('creates a local group with a 4-char code and no DB id', async () => {
    const store = useGroupStore();
    const ok = await store.createGroup('Cushman Cup');

    expect(ok).toBe(true);
    expect(store.group?.id).toBeNull();
    expect(store.group?.name).toBe('Cushman Cup');
    expect(store.groupCode).toMatch(/^[A-Z2-9]{4}$/);
    expect(store.recentGroups[0]?.roomCode).toBe(store.groupCode);
    // Persisted to localStorage.
    expect(localStorage.getItem('dmi_group')).toContain(store.groupCode);
  });

  it('refuses to join a remote group when sync is unavailable', async () => {
    const store = useGroupStore();
    const ok = await store.joinGroup('ABCD');

    expect(ok).toBe(false);
    expect(store.statusError).toBe(true);
    expect(store.group).toBeNull();
  });

  it('rejects a code that is not 4 characters', async () => {
    const store = useGroupStore();
    const ok = await store.joinGroup('AB');

    expect(ok).toBe(false);
    expect(store.statusError).toBe(true);
  });
});

describe('group store — online (mocked Supabase)', () => {
  it('creates a group from the inserted row', async () => {
    goOnline({ data: { id: 'g1', room_code: 'WXYZ', name: 'Test', players: {} }, error: null });
    const store = useGroupStore();
    const ok = await store.createGroup('Test');

    expect(ok).toBe(true);
    expect(store.group).toEqual({ id: 'g1', roomCode: 'WXYZ', name: 'Test', players: {} });
    expect(store.status).toBe('');
  });

  it('joins an existing group by code', async () => {
    goOnline({ data: { id: 'g2', room_code: 'JOIN', name: 'Joined', players: {} }, error: null });
    const store = useGroupStore();
    const ok = await store.joinGroup('join');

    expect(ok).toBe(true);
    expect(store.group?.id).toBe('g2');
    expect(store.groupCode).toBe('JOIN');
  });

  it('reports group-not-found', async () => {
    goOnline({ data: null, error: { message: 'no rows' } });
    const store = useGroupStore();
    const ok = await store.joinGroup('NOPE');

    expect(ok).toBe(false);
    expect(store.statusError).toBe(true);
    expect(store.group).toBeNull();
  });

  it('pulls the active round into the round store on join', async () => {
    goOnline({ data: { id: 'g3', room_code: 'ACTV', name: 'Active', players: {} }, error: null });
    mockDb.set('rounds', {
      data: { id: 'r1', group_id: 'g3', state: { team1: ['Amy'], team2: ['Bo'] }, completed: false },
      error: null,
    });
    const store = useGroupStore();
    const round = useRoundStore();

    const ok = await store.joinGroup('actv');
    expect(ok).toBe(true);
    expect(round.round?.id).toBe('r1');
    expect(round.round?.groupId).toBe('g3');
    expect(round.playerNames).toEqual(['Amy', 'Bo']);
  });
});

describe('group store — recents and persistence', () => {
  it('remembers and forgets recent groups', async () => {
    const store = useGroupStore();
    await store.createGroup('First');
    const code = store.groupCode;

    expect(store.recentGroups.some((g) => g.roomCode === code)).toBe(true);

    store.forgetRecentGroup(code);
    expect(store.recentGroups.some((g) => g.roomCode === code)).toBe(false);
  });

  it('leaves the group and clears it from storage', async () => {
    const store = useGroupStore();
    await store.createGroup('Bye');
    store.leaveGroup();

    expect(store.group).toBeNull();
    expect(localStorage.getItem('dmi_group')).toBeNull();
  });

  it('reloads a persisted group from localStorage', async () => {
    const store = useGroupStore();
    await store.createGroup('Persisted');
    const code = store.groupCode;

    // Fresh store instance loading from storage.
    setActivePinia(createPinia());
    const reloaded = useGroupStore();
    expect(reloaded.load()).toBe(true);
    expect(reloaded.groupCode).toBe(code);
    expect(reloaded.recentGroups.some((g) => g.roomCode === code)).toBe(true);
  });
});
