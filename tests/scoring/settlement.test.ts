import { describe, expect, it } from 'vitest';
import { cloneDefaultGames } from '@/domain/games';
import { type ScoreContext } from '@/scoring/round';
import {
  computePlayerPnL,
  computeSettlement,
  gamesHaveBets,
  type SettlementInput,
} from '@/scoring/settlement';
import type { Course, GameConfig, ScoreMatrix } from '@/types';

const course: Course = {
  tee: { name: 'Test', rating: 72, slope: 113, parTotal: 72 },
  par: Array(18).fill(4),
  si: Array.from({ length: 18 }, (_, index) => index + 1),
  yds: Array(18).fill(400),
};

function matrix(players: string[]): ScoreMatrix {
  return Object.fromEntries(players.map((player) => [player, Array(18).fill(null)]));
}

function fill(scores: ScoreMatrix, player: string, value: number) {
  for (let hole = 0; hole < 18; hole += 1) scores[player][hole] = value;
}

function makeInput(
  players: string[],
  scores: ScoreMatrix,
  configure: (g: GameConfig) => void,
  extra: Partial<SettlementInput> = {},
): SettlementInput {
  const games = cloneDefaultGames();
  configure(games);
  const strokes = Object.fromEntries(players.map((p) => [p, 0]));
  const context: ScoreContext = { course, scores, strokes };
  const half = Math.ceil(players.length / 2);
  return {
    scoreContext: context,
    team1: players.slice(0, half),
    team2: players.slice(half),
    players,
    games,
    ...extra,
  };
}

describe('settlement P&L', () => {
  it('returns all zeros when no money games are enabled', () => {
    const players = ['A', 'B'];
    const scores = matrix(players);
    fill(scores, 'A', 4);
    fill(scores, 'B', 5);

    expect(computePlayerPnL(makeInput(players, scores, () => {}))).toEqual({ A: 0, B: 0 });
  });

  it('settles a best-ball Nassau team game across the two teams', () => {
    const players = ['A', 'B', 'C', 'D'];
    const scores = matrix(players);
    fill(scores, 'A', 4); // team1 best ball = 4
    fill(scores, 'B', 6);
    fill(scores, 'C', 5); // team2 best ball = 5
    fill(scores, 'D', 6);

    const pnl = computePlayerPnL(
      makeInput(players, scores, (g) => {
        g.bestBall.enabled = true;
        g.bestBall.type = 'gross';
        g.bestBall.front = 10;
        g.bestBall.back = 10;
        g.bestBall.total = 20;
      }),
    );

    // team1 wins front, back, and total -> +40 each, team2 -40 each
    expect(pnl).toEqual({ A: 40, B: 40, C: -40, D: -40 });
  });

  it('distributes the skins pot proportionally net of each buy-in', () => {
    const players = ['A', 'B'];
    const scores = matrix(players);
    fill(scores, 'A', 3); // wins every hole -> 18 skins
    fill(scores, 'B', 5);

    const pnl = computePlayerPnL(
      makeInput(players, scores, (g) => {
        g.skins.enabled = true;
        g.skins.pot = 10;
      }),
    );

    // pot = 20, A wins all -> +20-10 = +10, B -10
    expect(pnl.A).toBeCloseTo(10);
    expect(pnl.B).toBeCloseTo(-10);
  });

  it('settles Best Ball + Aggy across pair matches via ledger entries', () => {
    const players = ['A', 'B', 'C', 'D'];
    const scores = matrix(players);
    fill(scores, 'A', 4); // team1 best ball 4, aggy 8
    fill(scores, 'B', 4);
    fill(scores, 'C', 5); // team2 best ball 5, aggy 10
    fill(scores, 'D', 5);

    const pnl = computePlayerPnL(
      makeInput(
        players,
        scores,
        (g) => {
          g.bestBallAggy.enabled = true;
          g.bestBallAggy.scoreBasis = 'gross';
          g.bestBallAggy.scoringMode = 'stroke';
          g.bestBallAggy.stake = { front: 10, back: 10, overall: 10 };
        },
        { pairMatches: [{ a: ['A', 'B'], b: ['C', 'D'] }] },
      ),
    );

    // team1 wins all 6 segments (BB + Aggy x front/back/overall) at $10 each -> +60 / -60
    expect(pnl).toEqual({ A: 60, B: 60, C: -60, D: -60 });
  });

  it('settles Two-Man Scramble from the team-score matrix via pair matches', () => {
    const players = ['A', 'B', 'C', 'D'];
    const scores = matrix(players);
    const twoManScrambleTeamScores: ScoreMatrix = {
      match_0_a: Array(18).fill(4),
      match_0_b: Array(18).fill(5),
    };

    const pnl = computePlayerPnL(
      makeInput(
        players,
        scores,
        (g) => {
          g.twoManScramble.enabled = true;
          g.twoManScramble.scoringMode = 'stroke';
          g.twoManScramble.stake = { front: 10, back: 10, overall: 10 };
        },
        {
          pairMatches: [{ a: ['A', 'B'], b: ['C', 'D'] }],
          twoManScrambleTeamScores,
        },
      ),
    );

    // team1 wins front/back/overall at $10 each -> +30 / -30
    expect(pnl).toEqual({ A: 30, B: 30, C: -30, D: -30 });
  });

  it('settles scramble team scores from the team score matrix', () => {
    const players = ['A', 'B', 'C', 'D'];
    const scores = matrix(players);
    const teamScores: ScoreMatrix = { team1: Array(18).fill(4), team2: Array(18).fill(5) };

    const pnl = computePlayerPnL(
      makeInput(
        players,
        scores,
        (g) => {
          g.scramble4.enabled = true;
          g.scramble4.total = 30;
        },
        { teamScores },
      ),
    );

    // team1 lower total -> +30 each, team2 -30 each
    expect(pnl).toEqual({ A: 30, B: 30, C: -30, D: -30 });
  });
});

describe('settlement transfers', () => {
  it('produces minimal who-pays-who transfers from a P&L map', () => {
    const transfers = computeSettlement({ A: 40, B: 40, C: -40, D: -40 });

    expect(transfers).toEqual([
      { from: 'C', to: 'A', amount: 40 },
      { from: 'D', to: 'B', amount: 40 },
    ]);
  });

  it('returns no transfers when everyone is square', () => {
    expect(computeSettlement({ A: 0, B: 0 })).toEqual([]);
  });

  it('greedily matches the largest debtor to the largest creditor', () => {
    const transfers = computeSettlement({ A: 30, B: 10, C: -25, D: -15 });

    expect(transfers).toEqual([
      { from: 'C', to: 'A', amount: 25 },
      { from: 'D', to: 'A', amount: 5 },
      { from: 'D', to: 'B', amount: 10 },
    ]);
  });
});

describe('gamesHaveBets', () => {
  it('is false for default games and true once a stake exists', () => {
    const games = cloneDefaultGames();
    expect(gamesHaveBets(games)).toBe(false);

    games.puttPoker.enabled = true;
    games.puttPoker.pot = 5;
    expect(gamesHaveBets(games)).toBe(true);
  });

  it('ignores enabled games that have no stake', () => {
    const games = cloneDefaultGames();
    games.bestBall.enabled = true; // all amounts still zero
    expect(gamesHaveBets(games)).toBe(false);
  });

  it('detects stakes on bestBallAggy and twoManScramble', () => {
    const bba = cloneDefaultGames();
    bba.bestBallAggy.enabled = true;
    expect(gamesHaveBets(bba)).toBe(false);
    bba.bestBallAggy.stake.overall = 10;
    expect(gamesHaveBets(bba)).toBe(true);

    const tms = cloneDefaultGames();
    tms.twoManScramble.enabled = true;
    expect(gamesHaveBets(tms)).toBe(false);
    tms.twoManScramble.stake.front = 5;
    expect(gamesHaveBets(tms)).toBe(true);
  });
});
