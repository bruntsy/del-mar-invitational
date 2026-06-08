import { defineStore } from 'pinia';
import {
  HISTORY_ROUND_COLUMNS,
  normalizeRoundRow,
  summarizeRound,
  type RoundSummary,
} from '@/domain/round';
import { hasSupabase, supabase } from '@/services/supabase';
import type { RoundRow } from '@/types/db';

/**
 * Completed-round history for the active group. Ports the legacy `showHistory`
 * query into Pinia: load every completed `rounds` row for a group, newest
 * first, and reduce each to the per-player net/skins summary shown on the
 * history cards.
 *
 * Online-only: with no Supabase credentials there is no shared history, so
 * `loadHistory` clears the list rather than throwing (mirrors the group store's
 * offline fallback).
 */
export const useHistoryStore = defineStore('history', {
  state: () => ({
    rounds: [] as RoundSummary[],
    loading: false,
    error: '',
    loadedGroupId: null as string | null,
  }),

  actions: {
    clear() {
      this.rounds = [];
      this.error = '';
      this.loadedGroupId = null;
    },

    /** Load a group's completed rounds (legacy `showHistory`). */
    async loadHistory(groupId: string | null): Promise<RoundSummary[]> {
      if (!groupId || !hasSupabase() || !supabase) {
        this.clear();
        return [];
      }
      this.loading = true;
      this.error = '';
      try {
        const { data, error } = await supabase
          .from('rounds')
          .select(HISTORY_ROUND_COLUMNS)
          .eq('group_id', groupId)
          .eq('completed', true)
          .order('completed_at', { ascending: false });
        if (error) {
          this.error = error.message;
          this.rounds = [];
          return [];
        }
        this.rounds = (data ?? []).map((row) => {
          const { round, players } = normalizeRoundRow(row as RoundRow);
          return { ...summarizeRound(round, players), completedAt: row.completed_at ?? null };
        });
        this.loadedGroupId = groupId;
        return this.rounds;
      } finally {
        this.loading = false;
      }
    },
  },
});
