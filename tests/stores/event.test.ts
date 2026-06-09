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

const { useEventStore } = await import('@/stores/event');

function goOnline(table: string, result: MockResult) {
  mockState.online = true;
  mockDb.reset();
  mockDb.set(table, result);
}

const playerNames = ['Ann', 'Bea', 'Cal', 'Dan'];

function makeEventRow(id = 'e1', overrides: Record<string, unknown> = {}) {
  return {
    id,
    group_id: 'g1',
    name: 'Del Mar Invitational',
    status: 'active',
    created_at: '2026-05-01T00:00:00Z',
    config: {
      teamNames: { team1: 'Team A', team2: 'Team B' },
      team1: ['Ann', 'Bea'],
      team2: ['Cal', 'Dan'],
      rounds: [
        {
          name: 'Round 1',
          format: 'bestBallNassau',
          scoringMode: 'matchPlay',
          points: { front: 1, back: 1, total: 1 },
          skins: { enabled: false, pot: 0, type: 'net' },
          puttPoker: { enabled: false, pot: 0, scope: 'playingGroup' },
          bestBallBet: { front: 0, back: 0, total: 0, type: 'net' },
          scrambleBet: { front: 0, back: 0, total: 0, type: 'gross' },
          pairMatches: [{ a: ['Ann'], b: ['Cal'] }],
          playingGroups: [],
          roundId: null,
          pointsResult: { team1: null, team2: null },
        },
      ],
      winPoints: 1.5,
      tiebreaker: '',
    },
    ...overrides,
  };
}

beforeEach(() => {
  setActivePinia(createPinia());
  mockDb.reset();
  mockState.online = false;
});

describe('event store', () => {
  describe('loadEvent', () => {
    it('returns null and clears when offline', async () => {
      const store = useEventStore();
      const result = await store.loadEvent('g1');
      expect(result).toBeNull();
      expect(store.event).toBeNull();
    });

    it('returns null and clears when groupId is null', async () => {
      goOnline('events', { data: null, error: null });
      const store = useEventStore();
      const result = await store.loadEvent(null);
      expect(result).toBeNull();
    });

    it('sets event to null when no active event found', async () => {
      goOnline('events', { data: null, error: null });
      const store = useEventStore();
      await store.loadEvent('g1');
      expect(store.event).toBeNull();
      expect(store.loadedGroupId).toBe('g1');
    });

    it('normalizes and stores an active event row', async () => {
      goOnline('events', { data: makeEventRow(), error: null });
      const store = useEventStore();
      const result = await store.loadEvent('g1');
      expect(result).not.toBeNull();
      expect(store.event?.id).toBe('e1');
      expect(store.event?.name).toBe('Del Mar Invitational');
      expect(store.event?.status).toBe('active');
      expect(store.event?.config.team1).toEqual(['Ann', 'Bea']);
      expect(store.loadedGroupId).toBe('g1');
    });

    it('surfaces DB errors', async () => {
      goOnline('events', { data: null, error: { message: 'db error' } });
      const store = useEventStore();
      await store.loadEvent('g1');
      expect(store.error).toBe('db error');
      expect(store.event).toBeNull();
    });
  });

  describe('createEvent', () => {
    it('returns null when offline', async () => {
      const store = useEventStore();
      const result = await store.createEvent('g1', 'My Event', playerNames);
      expect(result).toBeNull();
      expect(store.error).toBeTruthy();
    });

    it('creates event with defaultEventConfig and stores result', async () => {
      goOnline('events', { data: makeEventRow('e2', { name: 'My Event' }), error: null });
      const store = useEventStore();
      const result = await store.createEvent('g1', 'My Event', playerNames);
      expect(result?.id).toBe('e2');
      expect(store.event?.name).toBe('My Event');
    });

    it('surfaces insert error', async () => {
      goOnline('events', { data: null, error: { message: 'insert failed' } });
      const store = useEventStore();
      const result = await store.createEvent('g1', 'X', playerNames);
      expect(result).toBeNull();
      expect(store.error).toBe('insert failed');
    });
  });

  describe('archiveEvent', () => {
    it('returns false when no event is loaded', async () => {
      const store = useEventStore();
      const ok = await store.archiveEvent();
      expect(ok).toBe(false);
    });

    it('clears the event on success', async () => {
      goOnline('events', { data: makeEventRow(), error: null });
      const store = useEventStore();
      await store.loadEvent('g1');
      mockDb.set('events', { data: null, error: null });
      const ok = await store.archiveEvent();
      expect(ok).toBe(true);
      expect(store.event).toBeNull();
    });
  });

  describe('pending round link', () => {
    it('setPendingRoundLink stores the index', () => {
      const store = useEventStore();
      store.setPendingRoundLink(2);
      expect(store.pendingRoundLink).toEqual({ roundIndex: 2 });
    });

    it('clearPendingRoundLink resets to null', () => {
      const store = useEventStore();
      store.setPendingRoundLink(1);
      store.clearPendingRoundLink();
      expect(store.pendingRoundLink).toBeNull();
    });

    it('linkRound writes roundId and clears the pending link', async () => {
      goOnline('events', { data: makeEventRow(), error: null });
      const store = useEventStore();
      await store.loadEvent('g1');
      mockDb.set('events', { data: null, error: null });
      store.setPendingRoundLink(0);
      const ok = await store.linkRound('round-abc');
      expect(ok).toBe(true);
      expect(store.event?.config.rounds[0].roundId).toBe('round-abc');
      expect(store.pendingRoundLink).toBeNull();
    });

    it('linkRound returns false when no pending link', async () => {
      goOnline('events', { data: makeEventRow(), error: null });
      const store = useEventStore();
      await store.loadEvent('g1');
      const ok = await store.linkRound('r1');
      expect(ok).toBe(false);
    });
  });

  describe('standings getter', () => {
    it('returns zero-zero when no event', () => {
      const store = useEventStore();
      expect(store.standings).toEqual({ team1: 0, team2: 0 });
    });

    it('sums pointsResult across rounds', async () => {
      const row = makeEventRow('e1', {
        config: {
          teamNames: { team1: 'A', team2: 'B' },
          team1: ['Ann'],
          team2: ['Bea'],
          winPoints: 4,
          tiebreaker: '',
          rounds: [
            { name: 'R1', format: 'bestBallNassau', scoringMode: 'matchPlay', points: { front: 1, back: 1, total: 1 }, skins: { enabled: false, pot: 0, type: 'net' }, puttPoker: { enabled: false, pot: 0, scope: 'playingGroup' }, bestBallBet: { front: 0, back: 0, total: 0, type: 'net' }, scrambleBet: { front: 0, back: 0, total: 0, type: 'gross' }, pairMatches: [], playingGroups: [], roundId: null, pointsResult: { team1: 2, team2: 1 } },
            { name: 'R2', format: 'bestBallNassau', scoringMode: 'matchPlay', points: { front: 1, back: 1, total: 1 }, skins: { enabled: false, pot: 0, type: 'net' }, puttPoker: { enabled: false, pot: 0, scope: 'playingGroup' }, bestBallBet: { front: 0, back: 0, total: 0, type: 'net' }, scrambleBet: { front: 0, back: 0, total: 0, type: 'gross' }, pairMatches: [], playingGroups: [], roundId: null, pointsResult: { team1: 0, team2: 3 } },
          ],
        },
      });
      goOnline('events', { data: row, error: null });
      const store = useEventStore();
      await store.loadEvent('g1');
      expect(store.standings).toEqual({ team1: 2, team2: 4 });
    });
  });

  describe('updateRoundResult', () => {
    it('updates pointsResult and saves', async () => {
      goOnline('events', { data: makeEventRow(), error: null });
      const store = useEventStore();
      await store.loadEvent('g1');
      mockDb.set('events', { data: null, error: null });
      const ok = await store.updateRoundResult(0, 2.5, 0.5);
      expect(ok).toBe(true);
      expect(store.event?.config.rounds[0].pointsResult).toEqual({ team1: 2.5, team2: 0.5 });
    });
  });

  describe('clear', () => {
    it('resets all state', async () => {
      goOnline('events', { data: makeEventRow(), error: null });
      const store = useEventStore();
      await store.loadEvent('g1');
      store.setPendingRoundLink(1);
      store.clear();
      expect(store.event).toBeNull();
      expect(store.loadedGroupId).toBeNull();
      expect(store.pendingRoundLink).toBeNull();
    });
  });
});
