import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';
import { isTimedCell } from '@/scoring/cells';
import { emptyRound, useRoundStore } from '@/stores/round';
import type { Course, PlayerMap, RoundState } from '@/types';

const course: Course = {
  tee: { name: 'Test', rating: 72, slope: 113, parTotal: 72 },
  par: Array(18).fill(4),
  si: Array.from({ length: 18 }, (_, index) => index + 1),
  yds: Array(18).fill(400),
};

const players: PlayerMap = {
  A: { name: 'A', handicapIndex: 10 },
  B: { name: 'B', handicapIndex: 5 },
  C: { name: 'C', handicapIndex: 5 },
  D: { name: 'D', handicapIndex: 0 },
};

function roundWithRoster(): RoundState {
  return {
    ...emptyRound('group-1'),
    course,
    team1: ['A', 'B'],
    team2: ['C', 'D'],
  };
}

beforeEach(() => {
  setActivePinia(createPinia());
  localStorage.clear();
});

describe('round store', () => {
  it('loadActiveRound is a no-op when offline or group-less', async () => {
    const store = useRoundStore();
    expect(await store.loadActiveRound(null)).toBeNull();
    // No Supabase credentials in the test env, so a group id still returns null.
    expect(await store.loadActiveRound('group-1')).toBeNull();
    expect(store.round).toBeNull();
  });

  it('starts empty', () => {
    const store = useRoundStore();
    expect(store.round).toBeNull();
    expect(store.playerNames).toEqual([]);
    expect(store.scoreContext).toBeNull();
  });

  it('builds a default round in the legacy shape', () => {
    expect(emptyRound('g')).toMatchObject({
      id: null,
      groupId: 'g',
      team1: [],
      team2: [],
      teamNames: { team1: 'Team 1', team2: 'Team 2' },
      wolf: { holes: {} },
      completed: false,
    });
  });

  it('orders players team1 then team2 and derives playing groups', () => {
    const store = useRoundStore();
    store.setRound(roundWithRoster(), players);

    expect(store.playerNames).toEqual(['A', 'B', 'C', 'D']);
    expect(store.round?.playingGroups.length).toBeGreaterThan(0);
  });

  it('computes course handicaps and relative strokes from player indexes', () => {
    const store = useRoundStore();
    store.setRound(roundWithRoster(), players);

    // slope 113 and rating === parTotal => course handicap equals the index
    expect(store.courseHandicaps).toEqual({ A: 10, B: 5, C: 5, D: 0 });
    // relative to the field minimum (D = 0)
    expect(store.strokes).toEqual({ A: 10, B: 5, C: 5, D: 0 });
  });

  it('exposes a score context for the pure scoring modules', () => {
    const store = useRoundStore();
    store.setRound(roundWithRoster(), players);

    const context = store.scoreContext;
    expect(context).not.toBeNull();
    expect(context?.course).toEqual(course);
    expect(context?.strokes).toEqual({ A: 10, B: 5, C: 5, D: 0 });
  });

  it('writes timestamped score and putt cells and reads them back', () => {
    const store = useRoundStore();
    store.setRound(roundWithRoster(), players);

    store.setScore('A', 0, 4);
    store.setPutt('A', 0, 3);

    const scoreCell = store.round?.scores.A?.[0];
    expect(isTimedCell(scoreCell)).toBe(true);
    expect(store.readScore('A', 0)).toBe(4);
    expect(store.round?.scores.A).toHaveLength(18);

    const puttPoker = store.puttPokerFor(['A', 'B']);
    expect(puttPoker.coinHolder).toBe('A');
    expect(puttPoker.threePuttCount.A).toBe(1);
  });

  it('ignores out-of-range holes', () => {
    const store = useRoundStore();
    store.setRound(roundWithRoster(), players);

    store.setScore('A', 18, 4);
    expect(store.round?.scores.A).toBeUndefined();
  });

  it('wires the settlement getter through the pure aggregator', () => {
    const store = useRoundStore();
    store.setRound(roundWithRoster(), players);

    // square with no bets
    expect(store.settlement.transfers).toEqual([]);

    // enable a gross best-ball total bet, then make team1 win every hole
    const games = { ...store.games, bestBall: { ...store.games.bestBall, enabled: true, type: 'gross' as const, total: 20 } };
    store.setGames(games);
    for (let hole = 0; hole < 18; hole += 1) {
      store.setScore('A', hole, 4);
      store.setScore('B', hole, 6);
      store.setScore('C', hole, 5);
      store.setScore('D', hole, 6);
    }

    expect(store.hasBets).toBe(true);
    expect(store.settlement.pnl).toEqual({ A: 20, B: 20, C: -20, D: -20 });
    expect(store.settlement.transfers).toEqual([
      { from: 'C', to: 'A', amount: 20 },
      { from: 'D', to: 'B', amount: 20 },
    ]);
  });

  it('persists to localStorage and reloads with repair', () => {
    const store = useRoundStore();
    store.setRound(roundWithRoster(), players);
    store.setScore('A', 0, 4);

    // a fresh store instance should rehydrate from storage
    setActivePinia(createPinia());
    const reloaded = useRoundStore();
    expect(reloaded.round).toBeNull();
    expect(reloaded.load()).toBe(true);
    expect(reloaded.playerNames).toEqual(['A', 'B', 'C', 'D']);
    expect(reloaded.readScore('A', 0)).toBe(4);
    expect(reloaded.courseHandicaps).toEqual({ A: 10, B: 5, C: 5, D: 0 });
  });

  it('reset clears the round and storage', () => {
    const store = useRoundStore();
    store.setRound(roundWithRoster(), players);
    store.reset();

    expect(store.round).toBeNull();
    expect(localStorage.getItem('dmi_round')).toBeNull();
  });

  it('builds a leaderboard sorted by net with team labels', () => {
    const store = useRoundStore();
    store.setRound(roundWithRoster(), players);
    // par-4 every hole, SI 1..18 -> course hcp == index (A10 B5 C5 D0)
    for (let hole = 0; hole < 18; hole += 1) {
      for (const player of ['A', 'B', 'C', 'D']) store.setScore(player, hole, 4);
    }

    const board = store.leaderboard;
    expect(board.map((r) => r.player)).toEqual(['A', 'B', 'C', 'D']);
    // gross 72 each; net = gross minus relative strokes
    expect(board[0]).toMatchObject({ player: 'A', team: 'Team 1', gross: 72, strokes: 10, net: 62 });
    expect(board.find((r) => r.player === 'D')).toMatchObject({ team: 'Team 2', strokes: 0, net: 72 });
  });

  it('pushes incomplete players to the bottom of the leaderboard', () => {
    const store = useRoundStore();
    store.setRound(roundWithRoster(), players);
    // only A has a full card
    for (let hole = 0; hole < 18; hole += 1) store.setScore('A', hole, 4);

    const board = store.leaderboard;
    expect(board[0].player).toBe('A');
    expect(board.slice(1).every((r) => r.net == null)).toBe(true);
  });

  it('sums team net totals only when every member is complete', () => {
    const store = useRoundStore();
    store.setRound(roundWithRoster(), players);

    expect(store.teamNetTotals).toEqual({ team1: null, team2: null });

    for (let hole = 0; hole < 18; hole += 1) {
      for (const player of ['A', 'B', 'C', 'D']) store.setScore(player, hole, 4);
    }
    // team1 = A(62) + B(67); team2 = C(67) + D(72)
    expect(store.teamNetTotals).toEqual({ team1: 129, team2: 139 });
  });

  it('exposes enabled team-game breakdowns', () => {
    const store = useRoundStore();
    store.setRound(roundWithRoster(), players);
    store.setGames({ ...store.games, bestBall: { ...store.games.bestBall, enabled: true, type: 'gross' } });
    for (let hole = 0; hole < 18; hole += 1) {
      for (const player of ['A', 'B', 'C', 'D']) store.setScore(player, hole, 4);
    }

    const results = store.teamGameResults;
    expect(results.map((r) => r.key)).toEqual(['bestBall']);
    // gross best ball = min team gross (4) per hole -> 36/36/72 for both teams
    expect(results[0].team1).toEqual({ front: 36, back: 36, total: 72 });
    expect(results[0].team2).toEqual({ front: 36, back: 36, total: 72 });
  });

  it('builds scorecard team format rows for best ball and 2-ball', () => {
    const store = useRoundStore();
    store.setRound(roundWithRoster(), players);
    store.setGames({
      ...store.games,
      bestBall: { ...store.games.bestBall, enabled: true, type: 'gross' },
      twoBall: { ...store.games.twoBall, enabled: true, type: 'gross' },
    });
    for (let hole = 0; hole < 18; hole += 1) {
      store.setScore('A', hole, 4);
      store.setScore('B', hole, 5);
      store.setScore('C', hole, 6);
      store.setScore('D', hole, 7);
    }

    const rows = store.scorecardTeamRowsFor('team1');
    expect(rows.map((row) => row.key)).toEqual(['bestBall', 'twoBall']);
    expect(rows[0]).toMatchObject({ label: 'Best Ball', holes: Array(18).fill(4), out: 36, in: 36, total: 72 });
    expect(rows[1]).toMatchObject({ label: '2-Ball', holes: Array(18).fill(9), out: 81, in: 81, total: 162 });
  });

  it('derives pair match play results from configured pairings', () => {
    const store = useRoundStore();
    const round = roundWithRoster();
    round.pairMatches = [{ a: ['A', 'B'], b: ['C', 'D'] }];
    store.setRound(round, players);
    store.setGames({ ...store.games, pairMatch: { enabled: true, pointsPerHole: 1, type: 'gross' } });

    store.setScore('A', 0, 4);
    store.setScore('B', 0, 5);
    store.setScore('C', 0, 6);
    store.setScore('D', 0, 6);
    store.setScore('A', 1, 6);
    store.setScore('B', 1, 6);
    store.setScore('C', 1, 4);
    store.setScore('D', 1, 5);

    const result = store.pairMatchResult;
    expect(result.enabled).toBe(true);
    expect(result.matches).toHaveLength(1);
    expect(result.team1Holes).toBe(1);
    expect(result.team2Holes).toBe(1);
    expect(result.matches[0].front).toMatchObject({ team1: 1, team2: 1, played: 2, label: 'All Square' });
  });

  it('derives and updates wolf results from stored hole configuration', () => {
    const store = useRoundStore();
    store.setRound(roundWithRoster(), players);
    store.setGames({ ...store.games, wolf: { enabled: true, amount: 5, type: 'gross', nassau: true } });
    store.setWolfHole(0, 'wolf', 'A');
    store.setWolfHole(0, 'mode', 'solo');

    store.setScore('A', 0, 4);
    store.setScore('B', 0, 5);
    store.setScore('C', 0, 6);
    store.setScore('D', 0, 6);

    const result = store.wolfResult;
    expect(result.enabled).toBe(true);
    expect(result.playedHoles).toBe(1);
    expect(result.rows[0]).toMatchObject({
      resultLabel: 'A wins',
      pointsLabel: 'A +2',
    });
    expect(result.standings[0]).toMatchObject({ player: 'A', points: 2, leader: true });
    expect(result.segments.map((segment) => segment.label)).toEqual(['Front', 'Back', 'Overall']);
  });

  it('derives stableford rows sorted best-first with a leader flag', () => {
    const store = useRoundStore();
    store.setRound(roundWithRoster(), players);
    store.setGames({ ...store.games, stableford: { ...store.games.stableford, enabled: true, type: 'gross' } });

    // par is 4 on every hole; default points: par 2, birdie 3, bogey 1
    store.setScore('A', 0, 3); // birdie -> 3
    store.setScore('B', 0, 4); // par -> 2
    store.setScore('C', 0, 5); // bogey -> 1
    // D has no scores -> 0 points, 0 holes

    const result = store.stablefordResult;
    expect(result.enabled).toBe(true);
    expect(result.scoreType).toBe('gross');
    expect(result.rows.map((row) => row.player)).toEqual(['A', 'B', 'C', 'D']);
    expect(result.rows[0]).toMatchObject({ player: 'A', points: 3, holes: 1, leader: true });
    expect(result.rows[1]).toMatchObject({ player: 'B', points: 2, holes: 1, leader: false });
    expect(result.rows.find((row) => row.player === 'D')).toMatchObject({ points: 0, holes: 0, leader: false });
  });

  it('returns invalid three-man nassau result when roster is not exactly 3 players', () => {
    const store = useRoundStore();
    store.setRound(roundWithRoster(), players); // 4-player roster
    store.setGames({ ...store.games, threeManNassau: { ...store.games.threeManNassau, enabled: true, type: 'gross' } });

    const result = store.threeManNassauResult;
    expect(result.enabled).toBe(true);
    expect(result.valid).toBe(false);
    expect(result.rows).toHaveLength(0);
  });

  it('derives three-man nassau rows with result labels for a 3-player round', () => {
    const store = useRoundStore();
    const threePlayers: PlayerMap = { A: { name: 'A', handicapIndex: 0 }, B: { name: 'B', handicapIndex: 0 }, C: { name: 'C', handicapIndex: 0 } };
    store.setRound(
      { ...emptyRound(), course, team1: ['A', 'B'], team2: ['C'] },
      threePlayers,
    );
    store.setGames({ ...store.games, threeManNassau: { enabled: true, amount: 10, type: 'gross' } });

    // par-4 course; A birdies front 9 solo, side best-balls a par
    for (let hole = 0; hole < 9; hole += 1) {
      store.setScore('A', hole, 3); // birdie
      store.setScore('B', hole, 4); // par
      store.setScore('C', hole, 5); // bogey
    }

    const result = store.threeManNassauResult;
    expect(result.valid).toBe(true);
    expect(result.amount).toBe(10);
    expect(result.rows).toHaveLength(9); // 3 players × 3 segments

    const aFront = result.rows.find((row) => row.solo === 'A' && row.label === 'Front');
    expect(aFront).toMatchObject({ soloScore: 27, sideScore: 36, winner: 'solo', resultLabel: 'A wins' });

    const bFront = result.rows.find((row) => row.solo === 'B' && row.label === 'Front');
    expect(bFront).toMatchObject({ winner: 'side', resultLabel: 'A / C wins' });
  });

  it('derives putt poker groups using playing groups or team fallback', () => {
    const store = useRoundStore();
    store.setRound(roundWithRoster(), players);
    store.setGames({ ...store.games, puttPoker: { enabled: true, pot: 5 } });

    // 4-player roster → auto playing group of 4; 2 starting cards each
    const groups = store.puttPokerGroups;
    expect(groups).toHaveLength(1);
    expect(groups[0].players).toEqual(['A', 'B', 'C', 'D']);
    expect(groups[0].result.cards['A']).toBe(2);
    expect(groups[0].result.pot).toBe(20); // 5/player × 4 players

    // enter a 3-putt for A on hole 0 — coin moves, pot goes up $1
    store.setPutt('A', 0, 3);
    const updated = store.puttPokerGroups;
    expect(updated[0].result.coinHolder).toBe('A');
    expect(updated[0].result.pot).toBe(21);
    expect(updated[0].result.threePuttCount['A']).toBe(1);
  });

  it('marks a round complete and reopens it', () => {
    const store = useRoundStore();
    store.setRound(roundWithRoster(), players);

    expect(store.round?.completed).toBe(false);
    store.setCompleted(true);
    expect(store.round?.completed).toBe(true);
    store.setCompleted(false);
    expect(store.round?.completed).toBe(false);
  });
});
