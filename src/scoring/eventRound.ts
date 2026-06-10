import {
  pairAggyScore,
  pairBestBallScore,
  pairMatchRangeWins,
  pairRangeScore,
  type PairSegmentWins,
  type ScoreContext,
} from '@/scoring/round';
import type { EventRoundConfig, PairMatch, RyderPointEntry, ScoreMatrix, ScoreType } from '@/types';

export type EventWinner = 'team1' | 'team2' | 'tie' | 'open';

export interface EventComponent {
  label: string;
  a: number | string | null;
  b: number | string | null;
  points: number;
  team1: number;
  team2: number;
  winner: EventWinner;
  unit: string;
  detail?: unknown;
}

export interface EventRoundRow {
  label: string;
  aPlayers: string[];
  bPlayers: string[];
  components: EventComponent[];
}

export interface EventRoundResult {
  round: EventRoundConfig;
  idx: number;
  team1: number;
  team2: number;
  complete: boolean;
  rows: EventRoundRow[];
  ryderPoints: RyderPointEntry[];
  note?: string;
}

export interface EventRoundInput {
  round: EventRoundConfig;
  roundIndex?: number;
  scoreContext: ScoreContext;
  pairMatches: PairMatch[];
  team1: string[];
  team2: string[];
  teamScores?: ScoreMatrix;
}

export function scorePoint(
  a: number | null,
  b: number | null,
  points: number,
  highWins = false,
): { team1: number; team2: number; winner: EventWinner } {
  if (a == null || b == null) return { team1: 0, team2: 0, winner: 'open' };
  if (a === b) return { team1: points / 2, team2: points / 2, winner: 'tie' };

  const team1Wins = highWins ? a > b : a < b;
  return team1Wins
    ? { team1: points, team2: 0, winner: 'team1' }
    : { team1: 0, team2: points, winner: 'team2' };
}

export function eventComponent(
  label: string,
  a: number | null,
  b: number | null,
  points: number,
  highWins = false,
  unit = 'strokes',
  detail?: unknown,
): EventComponent {
  const scored = scorePoint(a, b, Number(points || 0), highWins);

  return {
    label,
    a,
    b,
    points: Number(points || 0),
    team1: scored.team1,
    team2: scored.team2,
    winner: scored.winner,
    unit,
    detail,
  };
}

export function bestBallAggyHoleComponent(
  context: ScoreContext,
  aPlayers: string[],
  bPlayers: string[],
  hole: number,
  type: ScoreType = 'net',
): EventComponent {
  const bbA = pairBestBallScore(context, aPlayers, hole, type);
  const bbB = pairBestBallScore(context, bPlayers, hole, type);
  const agA = pairAggyScore(context, aPlayers, hole, type);
  const agB = pairAggyScore(context, bPlayers, hole, type);
  const bestBall = scorePoint(bbA, bbB, 1);
  const aggy = scorePoint(agA, agB, 1);
  const team1 = bestBall.team1 + aggy.team1;
  const team2 = bestBall.team2 + aggy.team2;
  const winner =
    bestBall.winner === 'open' || aggy.winner === 'open'
      ? 'open'
      : team1 === team2
        ? 'tie'
        : team1 > team2
          ? 'team1'
          : 'team2';

  return {
    label: `Hole ${hole + 1}`,
    a: `BB ${bbA ?? '-'} / Aggy ${agA ?? '-'}`,
    b: `BB ${bbB ?? '-'} / Aggy ${agB ?? '-'}`,
    points: 2,
    team1,
    team2,
    winner,
    unit: 'hole pts',
    detail: {
      kind: 'bestBallAggy',
      bb: { winner: bestBall.winner, a: bbA, b: bbB },
      aggy: { winner: aggy.winner, a: agA, b: agB },
    },
  };
}

function teamScoreRange(teamScores: ScoreMatrix | undefined, teamKey: string, start: number, end: number): number | null {
  let total = 0;
  let any = false;

  for (let hole = start; hole < end; hole += 1) {
    const value = teamScores?.[teamKey]?.[hole];
    const score = typeof value === 'object' && value !== null ? value.v : value;
    if (score != null) {
      total += Number(score);
      any = true;
    }
  }

  return any ? total : null;
}

function teamMatchRangeWins(
  teamScores: ScoreMatrix | undefined,
  teamA: string,
  teamB: string,
  start: number,
  end: number,
): PairSegmentWins | null {
  let a = 0;
  let b = 0;
  let tied = 0;

  for (let hole = start; hole < end; hole += 1) {
    const aRaw = teamScores?.[teamA]?.[hole];
    const bRaw = teamScores?.[teamB]?.[hole];
    const aScore = typeof aRaw === 'object' && aRaw !== null ? aRaw.v : aRaw;
    const bScore = typeof bRaw === 'object' && bRaw !== null ? bRaw.v : bRaw;

    if (aScore == null || bScore == null) return null;
    if (aScore < bScore) a += 1;
    else if (bScore < aScore) b += 1;
    else tied += 1;
  }

  return { a, b, tied, played: end - start };
}

export function computeEventRoundResult(input: EventRoundInput): EventRoundResult {
  const { round, scoreContext, pairMatches, team1: inputTeam1, team2: inputTeam2, teamScores } = input;
  const rows: EventRoundRow[] = [];
  const matchPlay = round.scoringMode !== 'strokePlay';
  let team1 = 0;
  let team2 = 0;
  let complete = true;

  const addComponent = (component: EventComponent) => {
    team1 += component.team1;
    team2 += component.team2;
    if (component.winner === 'open') complete = false;
  };

  const addMatch = (label: string, aPlayers: string[], bPlayers: string[], type: ScoreType = 'net') => {
    const component = (componentLabel: string, start: number, end: number, points: number) => {
      if (matchPlay) {
        const wins = pairMatchRangeWins(scoreContext, aPlayers, bPlayers, start, end, type);
        return eventComponent(componentLabel, wins?.a ?? null, wins?.b ?? null, points, true, 'holes', wins ?? undefined);
      }

      return eventComponent(
        componentLabel,
        pairRangeScore(scoreContext, aPlayers, start, end, type),
        pairRangeScore(scoreContext, bPlayers, start, end, type),
        points,
        false,
        'strokes',
      );
    };

    const components = [
      component('Front', 0, 9, round.points.front),
      component('Back', 9, 18, round.points.back),
      component('Overall', 0, 18, round.points.total),
    ];

    components.forEach(addComponent);
    rows.push({ label, aPlayers, bPlayers, components });
  };

  if (round.format === 'twoManBestBallAggy') {
    pairMatches.forEach((match, index) => {
      const components = Array.from({ length: 18 }, (_, hole) =>
        bestBallAggyHoleComponent(scoreContext, match.a ?? [], match.b ?? [], hole, 'net'),
      );

      components.forEach(addComponent);
      rows.push({ label: `Match ${index + 1}`, aPlayers: match.a ?? [], bPlayers: match.b ?? [], components });
    });
  } else if (round.format === 'fourManScramble') {
    const component = (label: string, start: number, end: number, points: number) => {
      if (matchPlay) {
        const wins = teamMatchRangeWins(teamScores, 'team1', 'team2', start, end);
        return eventComponent(label, wins?.a ?? null, wins?.b ?? null, points, true, 'holes', wins ?? undefined);
      }

      return eventComponent(
        label,
        teamScoreRange(teamScores, 'team1', start, end),
        teamScoreRange(teamScores, 'team2', start, end),
        points,
        false,
        'strokes',
      );
    };
    const components = [
      component('Front', 0, 9, round.points.front),
      component('Back', 9, 18, round.points.back),
      component('Overall', 0, 18, round.points.total),
    ];

    components.forEach(addComponent);
    rows.push({ label: '4-Man Scramble', aPlayers: inputTeam1, bPlayers: inputTeam2, components });
  } else {
    const type = round.format === 'bestBallNassau' ? 'net' : 'gross';
    pairMatches.forEach((match, index) => addMatch(`Match ${index + 1}`, match.a ?? [], match.b ?? [], type));
  }

  return {
    round,
    idx: input.roundIndex ?? 0,
    team1,
    team2,
    complete,
    rows,
    ryderPoints: [],
    note:
      round.format === 'scramble2v2Nassau'
        ? 'Two-man scramble uses the pair scorecard currently available for this round.'
        : undefined,
  };
}
