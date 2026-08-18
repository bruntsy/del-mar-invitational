import { defineStore } from 'pinia';
import { HISTORY_ROUND_COLUMNS, normalizeRoundRow } from '@/domain/round';
import { hasSupabase, supabase } from '@/services/supabase';
import { playerRangeScore } from '@/scoring/round';
import { computeWHSCourseHcp, allocateNetStrokes } from '@/scoring/handicap';
import { groupPlayerByName } from '@/domain/players';
import { computeSkins } from '@/scoring/skins';
import type { RoundRow } from '@/types/db';

/** Aggregate stats for a single player across all completed rounds in a group. */
export interface PlayerStats {
  name: string;
  rounds: number;
  avgGross: number | null;
  avgNet: number | null;
  totalSkins: number;
}

export const useStatsStore = defineStore('stats', {
  state: () => ({
    stats: [] as PlayerStats[],
    loading: false,
    error: '',
    loadedGroupId: null as string | null,
  }),

  actions: {
    clear() {
      this.stats = [];
      this.error = '';
      this.loadedGroupId = null;
    },

    async loadStats(groupId: string | null): Promise<PlayerStats[]> {
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
          this.stats = [];
          return [];
        }

        // Accumulate per-player totals across all completed rounds.
        const totals = new Map<string, { grossSum: number; netSum: number; skins: number; rounds: number }>();

        for (const row of data ?? []) {
          const { round, players } = normalizeRoundRow(row as RoundRow);
          const course = round.course;
          if (!course) continue;
          const names = [...(round.team1 || []), ...(round.team2 || [])];

          const courseHandicaps = Object.fromEntries(
            names.map((name) => {
              const index = Number(groupPlayerByName(players, name)?.handicapIndex ?? 0);
              return [name, computeWHSCourseHcp(index, course.tee?.slope, course.tee?.rating, course.tee?.parTotal)];
            }),
          );
          const context = { course, scores: round.scores || {}, strokes: allocateNetStrokes(courseHandicaps) };
          const skinsByPlayer = computeSkins(context, names).skinsByPlayer;

          for (const name of names) {
            const gross = playerRangeScore(context, name, 0, 18, 'gross');
            const net = playerRangeScore(context, name, 0, 18, 'net');
            if (gross == null || net == null) continue;

            const entry = totals.get(name) ?? { grossSum: 0, netSum: 0, skins: 0, rounds: 0 };
            entry.grossSum += gross;
            entry.netSum += net;
            entry.skins += skinsByPlayer[name] ?? 0;
            entry.rounds += 1;
            totals.set(name, entry);
          }
        }

        this.stats = [...totals.entries()]
          .map(([name, t]) => ({
            name,
            rounds: t.rounds,
            avgGross: t.rounds > 0 ? Math.round((t.grossSum / t.rounds) * 10) / 10 : null,
            avgNet: t.rounds > 0 ? Math.round((t.netSum / t.rounds) * 10) / 10 : null,
            totalSkins: t.skins,
          }))
          .sort((a, b) => (a.avgNet ?? 999) - (b.avgNet ?? 999));

        this.loadedGroupId = groupId;
        return this.stats;
      } finally {
        this.loading = false;
      }
    },
  },
});
