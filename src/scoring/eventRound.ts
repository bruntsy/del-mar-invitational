import {
  buildBestBallAggyConfig,
  scoreBestBallAggy,
  type BbaContest,
  type BbaSegment,
} from '@/scoring/bestBallAggy';
import { buildHighBallLowBallConfig, scoreHighBallLowBall } from '@/scoring/highBallLowBall';
import {
  pairAggyScore,
  pairBestBallScore,
  pairMatchRangeWins,
  pairRangeScore,
  type PairSegmentWins,
  type ScoreContext,
} from '@/scoring/round';
import {
  buildTwoManScrambleConfig,
  scoreTwoManScramble,
  twoManScrambleTeamKey,
  type TmsSegment,
} from '@/scoring/twoManScramble';
import type {
  EventRoundConfig,
  GameConfig,
  PairMatch,
  RyderPointEntry,
  ScoreMatrix,
  ScoreType,
} from '@/types';

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
  games?: GameConfig;
  pairMatches: PairMatch[];
  team1: string[];
  team2: string[];
  teamScores?: ScoreMatrix;
}

const SEGMENTS: BbaSegment[] = ['front', 'back', 'overall'];
const SEGMENT_LABEL: Record<BbaSegment, string> = {
  front: 'Front',
  back: 'Back',
  overall: 'Overall',
};

export type ComboContest = BbaContest | 'low_ball' | 'high_ball';

/** Resolve the point value for a component/segment, honouring per-component overrides. */
export function getPointValue(
  points: EventRoundConfig['points'],
  component: ComboContest | null,
  segment: BbaSegment,
): number {
  const override =
    component === 'best_ball'
      ? points.bestBall
      : component === 'aggy'
        ? points.aggy
        : component === 'low_ball'
          ? points.lowBall
          : component === 'high_ball'
            ? points.highBall
            : undefined;
  if (override) return Number(override[segment] || 0);
  const fallback = { front: points.front, back: points.back, overall: points.total };
  return Number(fallback[segment] || 0);
}

/** Derive a Ryder point entry from a scored event component (a = team1 side). */
function ryderFromComponent(
  component: EventComponent,
  roundIndex: number,
  matchIndex: number,
  gameType: string,
  contest: ComboContest | null,
  segment: BbaSegment,
): RyderPointEntry {
  const winningTeam =
    component.winner === 'team1' ? 'team1' : component.winner === 'team2' ? 'team2' : null;
  const tiedTeams = component.winner === 'tie' ? (['team1', 'team2'] as ('team1' | 'team2')[]) : null;
  return {
    roundIndex,
    matchIndex,
    gameType,
    component: contest,
    segment,
    winningTeam,
    tiedTeams,
    points: { team1: component.team1, team2: component.team2 },
  };
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
  const { round, scoreContext, games, pairMatches, team1: inputTeam1, team2: inputTeam2, teamScores } = input;
  const rows: EventRoundRow[] = [];
  const ryderPoints: RyderPointEntry[] = [];
  const roundIndex = input.roundIndex ?? 0;
  const matchPlay = round.scoringMode !== 'strokePlay';
  let team1 = 0;
  let team2 = 0;
  let complete = true;

  const addComponent = (component: EventComponent) => {
    team1 += component.team1;
    team2 += component.team2;
    if (component.winner === 'open') complete = false;
  };

  const addMatch = (
    label: string,
    aPlayers: string[],
    bPlayers: string[],
    matchIndex: number,
    gameType: string,
    type: ScoreType = 'net',
  ) => {
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
    SEGMENTS.forEach((segment, i) =>
      ryderPoints.push(ryderFromComponent(components[i], roundIndex, matchIndex, gameType, null, segment)),
    );
    rows.push({ label, aPlayers, bPlayers, components });
  };

  if (round.format === 'twoManBestBallAggy') {
    const game = games?.bestBallAggy ?? {
      enabled: true,
      scoreBasis: 'net' as ScoreType,
      scoringMode: matchPlay ? ('match' as const) : ('stroke' as const),
      stake: { front: 0, back: 0, overall: 0 },
    };
    pairMatches.forEach((match, index) => {
      const config = buildBestBallAggyConfig(match, {
        ...game,
        // event round scoring mode is authoritative for how segments resolve
        scoringMode: matchPlay ? 'match' : 'stroke',
      });
      const result = scoreBestBallAggy(config, scoreContext);
      const [aId, bId] = [config.teams[0].id, config.teams[1].id];
      const contests: { contest: BbaContest; key: 'bestBall' | 'aggy'; label: string }[] = [
        { contest: 'best_ball', key: 'bestBall', label: 'Best Ball' },
        { contest: 'aggy', key: 'aggy', label: 'Aggy' },
      ];

      const components: EventComponent[] = [];
      for (const { contest, key, label } of contests) {
        for (const segment of SEGMENTS) {
          const seg = result.segmentResults[key][segment];
          const points = getPointValue(round.points, contest, segment);
          const map = matchPlay ? seg.teamHolesWon : seg.teamScores;
          const a = seg.incomplete || !map ? null : map[aId] ?? null;
          const b = seg.incomplete || !map ? null : map[bId] ?? null;
          const component = eventComponent(
            `${label} ${SEGMENT_LABEL[segment]}`,
            a,
            b,
            points,
            matchPlay,
            matchPlay ? 'holes' : 'strokes',
            { kind: 'bestBallAggySegment', contest, segment },
          );
          components.push(component);
          addComponent(component);
          ryderPoints.push(ryderFromComponent(component, roundIndex, index, 'best_ball_aggy', contest, segment));
        }
      }

      rows.push({ label: `Match ${index + 1}`, aPlayers: match.a ?? [], bPlayers: match.b ?? [], components });
    });
  } else if (round.format === 'twoManHighBallLowBall') {
    const game = games?.highBallLowBall ?? {
      enabled: true,
      scoreBasis: 'net' as ScoreType,
      scoringMode: matchPlay ? ('match' as const) : ('stroke' as const),
      stake: { front: 0, back: 0, overall: 0 },
    };
    pairMatches.forEach((match, index) => {
      const config = buildHighBallLowBallConfig(match, {
        ...game,
        scoringMode: matchPlay ? 'match' : 'stroke',
      });
      const result = scoreHighBallLowBall(config, scoreContext);
      const [aId, bId] = [config.teams[0].id, config.teams[1].id];
      const contests: { contest: ComboContest; key: 'lowBall' | 'highBall'; label: string }[] = [
        { contest: 'low_ball', key: 'lowBall', label: 'Low Ball' },
        { contest: 'high_ball', key: 'highBall', label: 'High Ball' },
      ];

      const components: EventComponent[] = [];
      for (const { contest, key, label } of contests) {
        for (const segment of SEGMENTS) {
          const seg = result.segmentResults[key][segment];
          const points = getPointValue(round.points, contest, segment);
          const map = matchPlay ? seg.teamHolesWon : seg.teamScores;
          const a = seg.incomplete || !map ? null : map[aId] ?? null;
          const b = seg.incomplete || !map ? null : map[bId] ?? null;
          const component = eventComponent(
            `${label} ${SEGMENT_LABEL[segment]}`,
            a,
            b,
            points,
            matchPlay,
            matchPlay ? 'holes' : 'strokes',
            { kind: 'highBallLowBallSegment', contest, segment },
          );
          components.push(component);
          addComponent(component);
          ryderPoints.push(ryderFromComponent(component, roundIndex, index, 'high_ball_low_ball', contest, segment));
        }
      }

      rows.push({ label: `Match ${index + 1}`, aPlayers: match.a ?? [], bPlayers: match.b ?? [], components });
    });
  } else if (round.format === 'scramble2v2Nassau') {
    const game = games?.twoManScramble ?? {
      enabled: true,
      scoringMode: matchPlay ? ('match' as const) : ('stroke' as const),
      stake: { front: 0, back: 0, overall: 0 },
    };
    pairMatches.forEach((match, index) => {
      const config = buildTwoManScrambleConfig(match, index, {
        ...game,
        scoringMode: matchPlay ? 'match' : 'stroke',
      });
      const teamHoleScores = {
        [twoManScrambleTeamKey(index, 'a')]: teamScores?.[twoManScrambleTeamKey(index, 'a')],
        [twoManScrambleTeamKey(index, 'b')]: teamScores?.[twoManScrambleTeamKey(index, 'b')],
      };
      const result = scoreTwoManScramble(config, teamHoleScores);
      const [aId, bId] = [config.teams[0].id, config.teams[1].id];

      const components: EventComponent[] = [];
      for (const segment of SEGMENTS as TmsSegment[]) {
        const seg = result.segmentResults[segment];
        const points = getPointValue(round.points, null, segment);
        const map = matchPlay ? seg.teamHolesWon : seg.teamScores;
        const a = seg.incomplete || !map ? null : map[aId] ?? null;
        const b = seg.incomplete || !map ? null : map[bId] ?? null;
        const component = eventComponent(
          SEGMENT_LABEL[segment],
          a,
          b,
          points,
          matchPlay,
          matchPlay ? 'holes' : 'strokes',
          { kind: 'twoManScrambleSegment', segment },
        );
        components.push(component);
        addComponent(component);
        ryderPoints.push(ryderFromComponent(component, roundIndex, index, 'two_man_scramble', null, segment));
      }

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
    SEGMENTS.forEach((segment, i) =>
      ryderPoints.push(ryderFromComponent(components[i], roundIndex, 0, 'scramble', null, segment)),
    );
    rows.push({ label: '4-Man Scramble', aPlayers: inputTeam1, bPlayers: inputTeam2, components });
  } else {
    const type = round.format === 'bestBallNassau' ? 'net' : 'gross';
    const gameType = round.format === 'bestBallNassau' ? 'best_ball' : 'custom';
    pairMatches.forEach((match, index) =>
      addMatch(`Match ${index + 1}`, match.a ?? [], match.b ?? [], index, gameType, type),
    );
  }

  return {
    round,
    idx: input.roundIndex ?? 0,
    team1,
    team2,
    complete,
    rows,
    ryderPoints,
    note:
      round.format === 'scramble2v2Nassau'
        ? 'Two-man scramble uses team-level scramble scores entered on the round scorecard.'
        : undefined,
  };
}
