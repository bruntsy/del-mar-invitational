import { describe, expect, it } from 'vitest';
import { eventDefaultRound, normalizeEventConfig } from '@/domain/events';
import { computeEventRoundResult, bestBallAggyHoleComponent } from '@/scoring/eventRound';
import type { Course, EventRoundConfig, EventRoundFormat, PairMatch, ScoreMatrix } from '@/types';

const course: Course = {
  tee: { name: 'Test', rating: 72, slope: 113, parTotal: 72 },
  par: Array(18).fill(4),
  si: Array.from({ length: 18 }, (_, index) => index + 1),
  yds: Array(18).fill(400),
};

function matrix(players: string[]): ScoreMatrix {
  return Object.fromEntries(players.map((player) => [player, Array(18).fill(null)]));
}

function setHole(scores: ScoreMatrix, hole: number, values: Record<string, number>) {
  for (const [player, score] of Object.entries(values)) {
    scores[player][hole] = score;
  }
}

function inputFor(
  pairMatches: PairMatch[] = [{ a: ['A', 'B'], b: ['C', 'D'] }],
  options: {
    format?: EventRoundFormat;
    scoringMode?: EventRoundConfig['scoringMode'];
    points?: EventRoundConfig['points'];
    teamScores?: ScoreMatrix;
  } = {},
) {
  const team1 = [...new Set(pairMatches.flatMap((match) => match.a))];
  const team2 = [...new Set(pairMatches.flatMap((match) => match.b))];
  const players = [...team1, ...team2];
  const format = options.format ?? 'twoManBestBallAggy';
  const config = normalizeEventConfig(
    {
      teamNames: { team1: 'Team One', team2: 'Team Two' },
      team1,
      team2,
      rounds: [
        {
          ...eventDefaultRound(0, team1, team2),
          format,
          scoringMode: options.scoringMode ?? 'matchPlay',
          points: options.points ?? { front: 1, back: 1, total: 1 },
          pairMatches,
        },
      ],
    },
    players,
  );

  return {
    round: config.rounds[0] as EventRoundConfig,
    scoreContext: {
      course,
      scores: matrix(players),
      strokes: Object.fromEntries(players.map((player) => [player, 0])),
    },
    pairMatches,
    team1,
    team2,
    teamScores: options.teamScores,
  };
}

/** Fill every hole in [start, end) with the same per-player scores. */
function fillRange(scores: ScoreMatrix, start: number, end: number, values: Record<string, number>) {
  for (let hole = start; hole < end; hole += 1) setHole(scores, hole, values);
}

describe('event round scoring (twoManBestBallAggy, segment-based)', () => {
  it('awards all six segment points when one side sweeps best ball and aggy', () => {
    const input = inputFor();
    // team1 wins best ball (4<5) and aggy (9<11) on every hole
    fillRange(input.scoreContext.scores, 0, 18, { A: 4, B: 5, C: 5, D: 6 });

    const result = computeEventRoundResult(input);

    // 6 components (BB + Aggy x front/back/overall) at 1pt each
    expect(result.team1).toBe(6);
    expect(result.team2).toBe(0);
    expect(result.rows[0].components).toHaveLength(6);
    expect(result.rows[0].components.map((c) => c.label)).toEqual([
      'Best Ball Front',
      'Best Ball Back',
      'Best Ball Overall',
      'Aggy Front',
      'Aggy Back',
      'Aggy Overall',
    ]);
    expect(result.complete).toBe(true);
    expect(result.ryderPoints).toHaveLength(6);
    expect(result.ryderPoints.every((r) => r.winningTeam === 'team1')).toBe(true);
    expect(result.ryderPoints[0]).toMatchObject({
      gameType: 'best_ball_aggy',
      component: 'best_ball',
      segment: 'front',
      winningTeam: 'team1',
      matchIndex: 0,
    });
  });

  it('splits best ball to one side and aggy to the other', () => {
    const input = inputFor();
    // team1: BB 4 (4,7), Aggy 11; team2: BB 5 (5,5), Aggy 10 -> team1 wins BB, team2 wins Aggy
    fillRange(input.scoreContext.scores, 0, 18, { A: 4, B: 7, C: 5, D: 5 });

    const result = computeEventRoundResult(input);

    // 3 BB segments to team1, 3 Aggy segments to team2
    expect(result.team1).toBe(3);
    expect(result.team2).toBe(3);
  });

  it('keeps a segment open until all its holes are scored', () => {
    const input = inputFor();
    setHole(input.scoreContext.scores, 0, { A: 4, B: 5, C: 5, D: 6 });

    const result = computeEventRoundResult(input);

    // only hole 1 scored -> every segment incomplete -> no points awarded
    expect(result.team1).toBe(0);
    expect(result.team2).toBe(0);
    expect(result.complete).toBe(false);
    expect(result.rows[0].components.every((c) => c.winner === 'open')).toBe(true);
    expect(result.ryderPoints.every((r) => r.winningTeam === null && r.tiedTeams === null)).toBe(true);
  });

  it('resolves the back segment even when the front is incomplete', () => {
    const input = inputFor();
    fillRange(input.scoreContext.scores, 9, 18, { A: 4, B: 5, C: 5, D: 6 }); // back complete, team1 sweeps

    const result = computeEventRoundResult(input);

    // back BB + back Aggy -> 2 points to team1; front and overall still open
    expect(result.team1).toBe(2);
    expect(result.team2).toBe(0);
    expect(result.complete).toBe(false);
    const back = result.rows[0].components.filter((c) => c.label.endsWith('Back'));
    expect(back.map((c) => c.winner)).toEqual(['team1', 'team1']);
  });

  it('honours per-component point overrides in stroke play', () => {
    const input = inputFor([{ a: ['A', 'B'], b: ['C', 'D'] }], {
      scoringMode: 'strokePlay',
      points: {
        front: 1,
        back: 1,
        total: 1,
        bestBall: { front: 2, back: 2, overall: 4 },
        aggy: { front: 1, back: 1, overall: 2 },
      },
    });
    fillRange(input.scoreContext.scores, 0, 18, { A: 4, B: 5, C: 5, D: 6 }); // team1 lower everywhere

    const result = computeEventRoundResult(input);

    // BB: 2+2+4 = 8, Aggy: 1+1+2 = 4 -> team1 12
    expect(result.team1).toBe(12);
    expect(result.team2).toBe(0);
  });

  it('accumulates multiple matches at the segment level', () => {
    const input = inputFor([
      { a: ['A', 'B'], b: ['C', 'D'] },
      { a: ['E', 'F'], b: ['G', 'H'] },
    ]);
    // match 1: team1 sweeps; match 2: team2 sweeps
    fillRange(input.scoreContext.scores, 0, 18, { A: 4, B: 5, C: 5, D: 6, E: 6, F: 6, G: 4, H: 5 });

    const result = computeEventRoundResult(input);

    expect(result.team1).toBe(6);
    expect(result.team2).toBe(6);
    expect(result.rows).toHaveLength(2);
    expect(result.ryderPoints).toHaveLength(12);
  });

  it('builds best-ball-aggy component details', () => {
    const input = inputFor();
    setHole(input.scoreContext.scores, 0, { A: 4, B: 5, C: 5, D: 6 });

    const component = bestBallAggyHoleComponent(input.scoreContext, ['A', 'B'], ['C', 'D'], 0);

    expect(component.detail).toEqual({
      kind: 'bestBallAggy',
      bb: { winner: 'team1', a: 4, b: 5 },
      aggy: { winner: 'team1', a: 9, b: 11 },
    });
  });

  it('scores best-ball Nassau match play by front, back, and overall hole wins', () => {
    const input = inputFor([{ a: ['A', 'B'], b: ['C', 'D'] }], {
      format: 'bestBallNassau',
      scoringMode: 'matchPlay',
      points: { front: 2, back: 3, total: 5 },
    });

    for (let hole = 0; hole < 18; hole += 1) {
      setHole(input.scoreContext.scores, hole, { A: 4, B: 5, C: 5, D: 6 });
    }

    const result = computeEventRoundResult(input);

    expect(result.team1).toBe(10);
    expect(result.team2).toBe(0);
    expect(result.rows[0].components.map((component) => component.a)).toEqual([9, 9, 18]);
    expect(result.rows[0].components.map((component) => component.unit)).toEqual([
      'holes',
      'holes',
      'holes',
    ]);
  });

  it('scores best-ball Nassau stroke play by lower range totals', () => {
    const input = inputFor([{ a: ['A', 'B'], b: ['C', 'D'] }], {
      format: 'bestBallNassau',
      scoringMode: 'strokePlay',
      points: { front: 1, back: 1, total: 2 },
    });

    for (let hole = 0; hole < 9; hole += 1) {
      setHole(input.scoreContext.scores, hole, { A: 4, B: 5, C: 5, D: 6 });
    }
    for (let hole = 9; hole < 18; hole += 1) {
      setHole(input.scoreContext.scores, hole, { A: 6, B: 7, C: 4, D: 5 });
    }

    const result = computeEventRoundResult(input);

    expect(result.team1).toBe(1);
    expect(result.team2).toBe(3);
    expect(result.rows[0].components.map((component) => component.winner)).toEqual([
      'team1',
      'team2',
      'team2',
    ]);
    expect(result.rows[0].components.map((component) => component.unit)).toEqual([
      'strokes',
      'strokes',
      'strokes',
    ]);
  });

  it('scores four-man scramble match play from team score rows', () => {
    const input = inputFor([{ a: ['A', 'B'], b: ['C', 'D'] }], {
      format: 'fourManScramble',
      scoringMode: 'matchPlay',
      points: { front: 1, back: 1, total: 1 },
      teamScores: { team1: Array(18).fill(null), team2: Array(18).fill(null) },
    });

    for (let hole = 0; hole < 18; hole += 1) {
      input.teamScores!.team1[hole] = hole < 9 ? 4 : 5;
      input.teamScores!.team2[hole] = hole < 9 ? 5 : 4;
    }

    const result = computeEventRoundResult(input);

    expect(result.team1).toBe(1.5);
    expect(result.team2).toBe(1.5);
    expect(result.rows[0].label).toBe('4-Man Scramble');
    expect(result.rows[0].components.map((component) => component.winner)).toEqual([
      'team1',
      'team2',
      'tie',
    ]);
  });

  it('scores four-man scramble stroke play from team score totals', () => {
    const input = inputFor([{ a: ['A', 'B'], b: ['C', 'D'] }], {
      format: 'fourManScramble',
      scoringMode: 'strokePlay',
      points: { front: 1, back: 1, total: 1 },
      teamScores: { team1: Array(18).fill(null), team2: Array(18).fill(null) },
    });

    for (let hole = 0; hole < 18; hole += 1) {
      input.teamScores!.team1[hole] = 4;
      input.teamScores!.team2[hole] = 5;
    }

    const result = computeEventRoundResult(input);

    expect(result.team1).toBe(3);
    expect(result.team2).toBe(0);
    expect(result.rows[0].components.map((component) => component.a)).toEqual([36, 36, 72]);
    expect(result.rows[0].components.map((component) => component.b)).toEqual([45, 45, 90]);
  });
});
