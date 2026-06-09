/**
 * Tests for the useEventLeaderboard composable.
 * Uses ref() wrappers to drive reactive updates and verifies leaderboard output.
 */
import { ref } from 'vue';
import { describe, expect, it } from 'vitest';
import { useEventLeaderboard } from '@/composables/useEventLeaderboard';
import type { EventConfig, EventRoundConfig } from '@/types/event';
import type { CachedRound } from '@/stores/event';
import type { RoundState, PlayerMap } from '@/types';

const course = {
  clubName: 'Del Mar',
  courseName: 'Champ',
  tee: { name: 'Blue', rating: 72, slope: 113, parTotal: 72 },
  par: Array(18).fill(4),
  si: Array.from({ length: 18 }, (_, i) => i + 1),
  yds: Array(18).fill(400),
};

const players: PlayerMap = {
  Ann: { name: 'Ann', handicapIndex: 0 },
  Bea: { name: 'Bea', handicapIndex: 0 },
  Cal: { name: 'Cal', handicapIndex: 0 },
  Dan: { name: 'Dan', handicapIndex: 0 },
};

function makeRoundConfig(overrides: Partial<EventRoundConfig> = {}): EventRoundConfig {
  return {
    name: 'Round 1',
    format: 'bestBallNassau',
    scoringMode: 'matchPlay',
    points: { front: 1, back: 1, total: 1 },
    skins: { enabled: false, pot: 0, type: 'net' },
    puttPoker: { enabled: false, pot: 0, scope: 'playingGroup' },
    bestBallBet: { front: 0, back: 0, total: 0, type: 'net' },
    scrambleBet: { front: 0, back: 0, total: 0, type: 'gross' },
    pairMatches: [{ a: ['Ann', 'Bea'], b: ['Cal', 'Dan'] }],
    playingGroups: [],
    roundId: null,
    pointsResult: { team1: null, team2: null },
    ...overrides,
  };
}

function makeConfig(overrides: Partial<EventConfig> = {}): EventConfig {
  return {
    teamNames: { team1: 'Team A', team2: 'Team B' },
    team1: ['Ann', 'Bea'],
    team2: ['Cal', 'Dan'],
    rounds: [makeRoundConfig()],
    winPoints: 1.5,
    tiebreaker: '',
    ...overrides,
  };
}

function makeRound(id: string, scores: Record<string, number[]>): RoundState {
  return {
    id,
    groupId: 'g1',
    course,
    team1: ['Ann', 'Bea'],
    team2: ['Cal', 'Dan'],
    teamNames: { team1: 'Team A', team2: 'Team B' },
    pairMatches: [{ a: ['Ann', 'Bea'], b: ['Cal', 'Dan'] }],
    playingGroups: [],
    matchups: [],
    games: {} as never,
    scores,
    putts: {},
    teamScores: {},
    wolf: { holes: {} },
    completed: false,
  };
}

describe('useEventLeaderboard', () => {
  it('returns empty rounds when no config', () => {
    const { leaderboard } = useEventLeaderboard(
      () => null,
      () => ({}),
      () => null,
      () => ({}),
    );
    expect(leaderboard.value.rounds).toHaveLength(0);
    expect(leaderboard.value.team1Total).toBe(0);
  });

  it('marks rounds with no data as hasData=false', () => {
    const config = ref(makeConfig({ rounds: [makeRoundConfig({ roundId: null })] }));
    const { leaderboard } = useEventLeaderboard(
      () => config.value,
      () => ({}),
      () => null,
      () => ({}),
    );
    expect(leaderboard.value.rounds[0].hasData).toBe(false);
  });

  it('uses live round store data when round ID matches', () => {
    const liveRound = makeRound('r1', {
      Ann: Array(18).fill(3),
      Bea: Array(18).fill(4),
      Cal: Array(18).fill(5),
      Dan: Array(18).fill(5),
    });
    const config = ref(makeConfig({ rounds: [makeRoundConfig({ roundId: 'r1' })] }));

    const { leaderboard } = useEventLeaderboard(
      () => config.value,
      () => ({}),
      () => liveRound,
      () => players,
    );

    const r = leaderboard.value.rounds[0];
    expect(r.hasData).toBe(true);
    // Ann/Bea shoot 3s/4s; Cal/Dan shoot 5s — Team A dominates all holes.
    expect(r.result.team1).toBeGreaterThan(r.result.team2);
  });

  it('uses cached round data when active round does not match', () => {
    const cachedRound = makeRound('r2', {
      Ann: Array(18).fill(3),
      Bea: Array(18).fill(4),
      Cal: Array(18).fill(5),
      Dan: Array(18).fill(5),
    });
    const cached: Record<string, CachedRound> = { r2: { round: cachedRound, players } };
    const config = ref(makeConfig({ rounds: [makeRoundConfig({ roundId: 'r2' })] }));

    const { leaderboard } = useEventLeaderboard(
      () => config.value,
      () => cached,
      () => null,
      () => ({}),
    );

    const r = leaderboard.value.rounds[0];
    expect(r.hasData).toBe(true);
    expect(r.result.team1).toBeGreaterThan(r.result.team2);
  });

  it('prefers stored pointsResult over computed for totals', () => {
    // Cached round would give Team A a win, but stored result says 0-3.
    const cachedRound = makeRound('r3', {
      Ann: Array(18).fill(3),
      Bea: Array(18).fill(4),
      Cal: Array(18).fill(5),
      Dan: Array(18).fill(5),
    });
    const cached: Record<string, CachedRound> = { r3: { round: cachedRound, players } };
    const config = ref(
      makeConfig({
        rounds: [makeRoundConfig({ roundId: 'r3', pointsResult: { team1: 0, team2: 3 } })],
      }),
    );

    const { leaderboard } = useEventLeaderboard(
      () => config.value,
      () => cached,
      () => null,
      () => ({}),
    );

    // Stored result overrides computed total.
    expect(leaderboard.value.team1Total).toBe(0);
    expect(leaderboard.value.team2Total).toBe(3);
  });

  it('sums stored pointsResult across multiple rounds', () => {
    const config = ref(
      makeConfig({
        rounds: [
          makeRoundConfig({ roundId: null, pointsResult: { team1: 2, team2: 1 } }),
          makeRoundConfig({ name: 'Round 2', roundId: null, pointsResult: { team1: 1, team2: 2 } }),
        ],
      }),
    );

    const { leaderboard } = useEventLeaderboard(
      () => config.value,
      () => ({}),
      () => null,
      () => ({}),
    );

    expect(leaderboard.value.team1Total).toBe(3);
    expect(leaderboard.value.team2Total).toBe(3);
  });

  it('exposes team names and winPoints from config', () => {
    const config = ref(makeConfig({ winPoints: 4.5 }));
    const { leaderboard } = useEventLeaderboard(
      () => config.value,
      () => ({}),
      () => null,
      () => ({}),
    );
    expect(leaderboard.value.team1Name).toBe('Team A');
    expect(leaderboard.value.team2Name).toBe('Team B');
    expect(leaderboard.value.winPoints).toBe(4.5);
  });

  it('reacts to config changes', () => {
    const config = ref(makeConfig({ rounds: [makeRoundConfig({ pointsResult: { team1: 1, team2: 2 } })] }));
    const { leaderboard } = useEventLeaderboard(
      () => config.value,
      () => ({}),
      () => null,
      () => ({}),
    );
    expect(leaderboard.value.team1Total).toBe(1);

    // Update stored result
    config.value = makeConfig({ rounds: [makeRoundConfig({ pointsResult: { team1: 3, team2: 0 } })] });
    expect(leaderboard.value.team1Total).toBe(3);
  });
});
