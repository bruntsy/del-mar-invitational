import { defineStore } from 'pinia';
import { defaultEventConfig, eventWinPoints, normalizeEventConfig } from '@/domain/events';
import { hasSupabase, supabase } from '@/services/supabase';
import type { EventRow } from '@/types/db';
import type { Event } from '@/types/event';
import type { EventConfig } from '@/types/event';

const EVENT_COLUMNS = 'id,group_id,name,status,config,created_at,updated_at';

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
 * Round launch flow: call `setPendingRoundLink(roundIndex)` before navigating
 * to /setup; call `linkRound(roundId)` after the round is created to write the
 * ID back into `config.rounds[N].roundId`.
 */
export const useEventStore = defineStore('event', {
  state: () => ({
    event: null as Event | null,
    loading: false,
    error: '',
    loadedGroupId: null as string | null,
    pendingRoundLink: null as { roundIndex: number } | null,
  }),

  getters: {
    /** Total points per team summed over rounds that have a recorded result. */
    standings(state): { team1: number; team2: number } {
      const config = state.event?.config;
      if (!config) return { team1: 0, team2: 0 };
      return config.rounds.reduce(
        (acc, r) => ({
          team1: acc.team1 + (r.pointsResult?.team1 ?? 0),
          team2: acc.team2 + (r.pointsResult?.team2 ?? 0),
        }),
        { team1: 0, team2: 0 },
      );
    },

    roundsWithStatus(state) {
      return (state.event?.config.rounds ?? []).map((r, i) => ({
        ...r,
        index: i,
        linked: r.roundId != null,
      }));
    },
  },

  actions: {
    clear() {
      this.event = null;
      this.error = '';
      this.loadedGroupId = null;
      this.pendingRoundLink = null;
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
        return true;
      } catch {
        return false;
      }
    },

    /** Mark which round index is about to be launched; call before navigating to /setup. */
    setPendingRoundLink(roundIndex: number) {
      this.pendingRoundLink = { roundIndex };
    },

    clearPendingRoundLink() {
      this.pendingRoundLink = null;
    },

    /** Write a newly-created round ID into the pending event round slot, then save. */
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

    /** Update round points result and save (called after a round is scored). */
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
