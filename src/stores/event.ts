import { defineStore } from 'pinia';
import { normalizeGames } from '@/domain/games';
import { defaultEventConfig, eventWinPoints, normalizeEventConfig } from '@/domain/events';
import { normalizeRoundRow } from '@/domain/round';
import { buildScoreContext } from '@/composables/useEventLeaderboard';
import { computeEventRoundResult } from '@/scoring/eventRound';
import { hasSupabase, supabase } from '@/services/supabase';
import type { EventRow, RoundRow } from '@/types/db';
import type { Event, EventConfig } from '@/types/event';
import type { PlayerMap, RoundState } from '@/types';

const EVENT_COLUMNS = 'id,group_id,name,status,config,created_at,updated_at';
const LINKED_ROUND_COLUMNS = 'id,group_id,state,completed,completed_at';

type RealtimeClient = {
  channel: (name: string) => {
    on: (
      type: 'postgres_changes',
      filter: { event: string; schema: string; table: string; filter: string },
      callback: (payload: { eventType?: string; new?: EventRow }) => void,
    ) => { subscribe: () => unknown };
  };
  removeChannel: (channel: unknown) => unknown;
};

export interface CachedRound {
  round: RoundState;
  players: PlayerMap;
}

function normalizeEventRow(row: EventRow): Event {
  return {
    id: row.id,
    groupId: row.group_id,
    name: row.name,
    status: row.status,
    config: normalizeEventConfig(row.config),
  };
}

/**
 * Active-event store for a group. One event can be active at a time per group.
 *
 * Round launch flow: call `setPendingRoundLink(roundIndex)` before navigating
 * to /setup; call `linkRound(roundId)` after the round is created to write the
 * ID back into `config.rounds[N].roundId`.
 *
 * Leaderboard flow: call `loadLinkedRounds()` after loading the event to
 * populate `cachedRounds` with the state of each linked round. Call
 * `subscribeToEvent(groupId)` to stay current with remote config changes.
 */
export const useEventStore = defineStore('event', {
  state: () => ({
    event: null as Event | null,
    loading: false,
    error: '',
    loadedGroupId: null as string | null,
    pendingRoundLink: null as { roundIndex: number } | null,
    /** Round state cache keyed by round ID — populated by loadLinkedRounds. */
    cachedRounds: {} as Record<string, CachedRound>,
    eventChannel: null as unknown,
  }),

  getters: {
    /**
     * Total points per team summed over rounds. A manually entered
     * `pointsResult` override wins; otherwise points are derived from the
     * cached round's computed Ryder result when available.
     */
    standings(state): { team1: number; team2: number } {
      const config = state.event?.config;
      if (!config) return { team1: 0, team2: 0 };
      return config.rounds.reduce(
        (acc, r) => {
          // Manual override takes precedence (backward compat).
          if (r.pointsResult?.team1 != null || r.pointsResult?.team2 != null) {
            return {
              team1: acc.team1 + (r.pointsResult?.team1 ?? 0),
              team2: acc.team2 + (r.pointsResult?.team2 ?? 0),
            };
          }

          const cached = r.roundId ? state.cachedRounds[r.roundId] : undefined;
          if (cached) {
            const ctx = buildScoreContext(cached.round, cached.players);
            if (ctx) {
              const result = computeEventRoundResult({
                round: r,
                scoreContext: ctx,
                games: normalizeGames(cached.round.games),
                pairMatches: r.pairMatches,
                team1: config.team1,
                team2: config.team2,
                teamScores: cached.round.teamScores,
              });
              return { team1: acc.team1 + result.team1, team2: acc.team2 + result.team2 };
            }
          }

          return acc;
        },
        { team1: 0, team2: 0 },
      );
    },

    roundsWithStatus(state) {
      return (state.event?.config.rounds ?? []).map((r, i) => ({
        ...r,
        index: i,
        linked: r.roundId != null,
        cached: r.roundId != null && r.roundId in state.cachedRounds,
      }));
    },

    /** Round IDs referenced by the active event config. */
    linkedRoundIds(state): string[] {
      return (state.event?.config.rounds ?? [])
        .map((r) => r.roundId)
        .filter((id): id is string => id != null);
    },
  },

  actions: {
    clear() {
      this.stopEventSubscription();
      this.event = null;
      this.error = '';
      this.loadedGroupId = null;
      this.pendingRoundLink = null;
      this.cachedRounds = {};
    },

    async loadEvent(groupId: string | null): Promise<Event | null> {
      if (!groupId || !hasSupabase() || !supabase) {
        this.clear();
        return null;
      }
      this.loading = true;
      this.error = '';
      try {
        const { data, error } = await supabase
          .from('events')
          .select(EVENT_COLUMNS)
          .eq('group_id', groupId)
          .eq('status', 'active')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (error) {
          this.error = error.message;
          return null;
        }
        this.event = data ? normalizeEventRow(data as EventRow) : null;
        this.loadedGroupId = groupId;
        return this.event;
      } finally {
        this.loading = false;
      }
    },

    /**
     * Fetch round states for all linked round IDs and store them in
     * `cachedRounds`. Safe to call repeatedly — re-fetches all linked rounds.
     */
    async loadLinkedRounds(): Promise<void> {
      const ids = this.linkedRoundIds;
      if (!ids.length || !hasSupabase() || !supabase) return;
      const { data } = await supabase
        .from('rounds')
        .select(LINKED_ROUND_COLUMNS)
        .in('id', ids);
      if (!data) return;
      const next: Record<string, CachedRound> = { ...this.cachedRounds };
      for (const row of data) {
        const { round, players } = normalizeRoundRow(row as RoundRow);
        if (round.id) next[round.id] = { round, players };
      }
      this.cachedRounds = next;
    },

    /**
     * Subscribe to `events` table changes for the group. When the event config
     * is updated remotely (e.g. another device links a round or records a result),
     * the local event is refreshed.
     */
    subscribeToEvent(groupId: string | null) {
      this.stopEventSubscription();
      if (!groupId || !hasSupabase() || !supabase) return;
      const realtime = supabase as unknown as RealtimeClient;
      this.eventChannel = realtime
        .channel(`event-${groupId}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'events', filter: `group_id=eq.${groupId}` },
          (payload: { eventType?: string; new?: EventRow }) => {
            const row = payload.new;
            if (!row) return;
            if (row.status === 'archived') {
              if (this.event?.id === row.id) this.event = null;
              return;
            }
            const incoming = normalizeEventRow(row);
            if (!this.event || this.event.id === incoming.id) {
              this.event = incoming;
              void this.loadLinkedRounds();
            }
          },
        )
        .subscribe();
    },

    stopEventSubscription() {
      if (this.eventChannel && hasSupabase() && supabase) {
        (supabase as unknown as RealtimeClient).removeChannel(this.eventChannel);
      }
      this.eventChannel = null;
    },

    async createEvent(groupId: string, name: string, playerNames: string[]): Promise<Event | null> {
      if (!hasSupabase() || !supabase) {
        this.error = 'Online sync is required to create events.';
        return null;
      }
      this.loading = true;
      this.error = '';
      try {
        const config: EventConfig = defaultEventConfig(playerNames);
        const { data, error } = await supabase
          .from('events')
          .insert({ group_id: groupId, name: name.trim() || 'Del Mar Invitational', status: 'active', config })
          .select(EVENT_COLUMNS)
          .single();
        if (error || !data) {
          this.error = (error?.message) ?? 'Could not create event.';
          return null;
        }
        this.event = normalizeEventRow(data as EventRow);
        this.loadedGroupId = groupId;
        return this.event;
      } finally {
        this.loading = false;
      }
    },

    async saveEvent(): Promise<boolean> {
      if (!this.event?.id || !hasSupabase() || !supabase) return false;
      this.error = '';
      try {
        const { error } = await supabase
          .from('events')
          .update({ name: this.event.name, config: this.event.config })
          .eq('id', this.event.id);
        if (error) {
          this.error = error.message;
          return false;
        }
        return true;
      } catch {
        return false;
      }
    },

    async archiveEvent(): Promise<boolean> {
      if (!this.event?.id || !hasSupabase() || !supabase) return false;
      this.error = '';
      try {
        const { error } = await supabase
          .from('events')
          .update({ status: 'archived' })
          .eq('id', this.event.id);
        if (error) {
          this.error = error.message;
          return false;
        }
        this.event = null;
        this.cachedRounds = {};
        return true;
      } catch {
        return false;
      }
    },

    setPendingRoundLink(roundIndex: number) {
      this.pendingRoundLink = { roundIndex };
    },

    clearPendingRoundLink() {
      this.pendingRoundLink = null;
    },

    async linkRound(roundId: string): Promise<boolean> {
      if (!this.event || this.pendingRoundLink == null) return false;
      const { roundIndex } = this.pendingRoundLink;
      const rounds = [...this.event.config.rounds];
      if (!rounds[roundIndex]) return false;
      rounds[roundIndex] = { ...rounds[roundIndex], roundId };
      this.event.config = { ...this.event.config, rounds, winPoints: eventWinPoints(rounds) };
      this.pendingRoundLink = null;
      return this.saveEvent();
    },

    async updateRoundResult(roundIndex: number, team1: number, team2: number): Promise<boolean> {
      if (!this.event) return false;
      const rounds = [...this.event.config.rounds];
      if (!rounds[roundIndex]) return false;
      rounds[roundIndex] = { ...rounds[roundIndex], pointsResult: { team1, team2 } };
      this.event.config = { ...this.event.config, rounds };
      return this.saveEvent();
    },
  },
});
