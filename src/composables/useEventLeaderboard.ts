import { computed } from 'vue';
import { normalizeGames } from '@/domain/games';
import { computeEventRoundResult, type EventRoundResult } from '@/scoring/eventRound';
import { computeWHSCourseHcp, allocateNetStrokes } from '@/scoring/handicap';
import { groupPlayerByName } from '@/domain/players';
import type { EventConfig, EventRoundConfig } from '@/types/event';
import type { CachedRound } from '@/stores/event';
import type { ScoreContext } from '@/scoring/round';
import type { RoundState, PlayerMap } from '@/types';

export interface EventLeaderboardRound {
  result: EventRoundResult;
  roundIndex: number;
  hasData: boolean;
}

export interface EventLeaderboard {
  rounds: EventLeaderboardRound[];
  team1Total: number;
  team2Total: number;
  team1Name: string;
  team2Name: string;
  winPoints: number;
}

export function buildScoreContext(round: RoundState, players: PlayerMap): ScoreContext | null {
  const course = round.course;
  if (!course) return null;
  const names = [...(round.team1 || []), ...(round.team2 || [])];
  const courseHandicaps = Object.fromEntries(
    names.map((name) => {
      const index = Number(groupPlayerByName(players, name)?.handicapIndex ?? 0);
      return [name, computeWHSCourseHcp(index, course.tee?.slope, course.tee?.rating, course.tee?.parTotal)];
    }),
  );
  return { course, scores: round.scores || {}, strokes: allocateNetStrokes(courseHandicaps) };
}

function emptyResult(roundConfig: EventRoundConfig, idx: number): EventRoundResult {
  return {
    round: roundConfig,
    idx,
    team1: 0,
    team2: 0,
    complete: false,
    rows: [],
    ryderPoints: [],
    note: 'No round data yet.',
  };
}

/**
 * Reactive event leaderboard. Computes per-round results using:
 * - `activeRound` + `activePlayers` for whichever linked round is currently
 *   open in the round store (live updates as scores are entered)
 * - `cachedRounds` for all other linked rounds (fetched on mount)
 *
 * Falls back to an empty result for rounds with no data.
 */
export function useEventLeaderboard(
  config: () => EventConfig | null | undefined,
  cachedRounds: () => Record<string, CachedRound>,
  activeRound: () => RoundState | null,
  activePlayers: () => PlayerMap,
) {
  const rounds = computed((): EventLeaderboardRound[] => {
    const cfg = config();
    if (!cfg) return [];
    const cached = cachedRounds();
    const live = activeRound();
    const liveId = live?.id ?? null;
    const livePlayers = activePlayers();

    return cfg.rounds.map((roundConfig, roundIndex) => {
      const rid = roundConfig.roundId;

      // Prefer the live round store when its ID matches.
      if (rid && liveId && rid === liveId) {
        const ctx = buildScoreContext(live!, livePlayers);
        if (ctx) {
          const result = computeEventRoundResult({
            round: roundConfig,
            roundIndex,
            scoreContext: ctx,
            games: normalizeGames(live!.games),
            pairMatches: roundConfig.pairMatches,
            team1: cfg.team1,
            team2: cfg.team2,
            teamScores: live!.teamScores,
          });
          return { result, roundIndex, hasData: true };
        }
      }

      // Fall back to cached round state.
      if (rid && cached[rid]) {
        const { round, players } = cached[rid];
        const ctx = buildScoreContext(round, players);
        if (ctx) {
          const result = computeEventRoundResult({
            round: roundConfig,
            roundIndex,
            scoreContext: ctx,
            games: normalizeGames(round.games),
            pairMatches: roundConfig.pairMatches,
            team1: cfg.team1,
            team2: cfg.team2,
            teamScores: round.teamScores,
          });
          return { result, roundIndex, hasData: true };
        }
      }

      return { result: emptyResult(roundConfig, roundIndex), roundIndex, hasData: false };
    });
  });

  const leaderboard = computed((): EventLeaderboard => {
    const cfg = config();
    const rs = rounds.value;
    // Use stored pointsResult when available (persisted), live result otherwise.
    const team1Total = cfg?.rounds.reduce((sum, r, i) => {
      const stored = r.pointsResult?.team1;
      return sum + (stored != null ? stored : (rs[i]?.result.team1 ?? 0));
    }, 0) ?? 0;
    const team2Total = cfg?.rounds.reduce((sum, r, i) => {
      const stored = r.pointsResult?.team2;
      return sum + (stored != null ? stored : (rs[i]?.result.team2 ?? 0));
    }, 0) ?? 0;

    return {
      rounds: rs,
      team1Total,
      team2Total,
      team1Name: cfg?.teamNames.team1 ?? 'Team 1',
      team2Name: cfg?.teamNames.team2 ?? 'Team 2',
      winPoints: cfg?.winPoints ?? 0,
    };
  });

  return { leaderboard, rounds };
}
