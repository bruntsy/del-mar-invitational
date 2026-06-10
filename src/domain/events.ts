import { autoPlayingGroupsFromPairMatches, normalizePlayingGroups } from '@/domain/playingGroups';
import type { EventConfig, EventRoundConfig, EventRoundFormat, PairMatch } from '@/types';

export function eventFormatLabel(format: EventRoundFormat): string {
  return (
    {
      bestBallNassau: '2v2 Net Best Ball Nassau',
      twoManBestBallAggy: '2v2 Best Ball + Aggy',
      twoManHighBallLowBall: '2v2 High Ball / Low Ball',
      scramble2v2Nassau: '2v2 Two-Man Scramble Nassau',
      fourManScramble: '4-Man Scramble',
      custom: 'Custom Round',
    } satisfies Record<EventRoundFormat, string>
  )[format];
}

export function eventScoringModeLabel(mode: EventRoundConfig['scoringMode']): string {
  return mode === 'strokePlay' ? 'Stroke total' : 'Match play';
}

export function eventDefaultRound(index: number, team1: string[] = [], team2: string[] = []): EventRoundConfig {
  const defaultPairs: PairMatch[] = [
    { a: team1.slice(0, 2), b: team2.slice(0, 2) },
    { a: team1.slice(2, 4), b: team2.slice(2, 4) },
  ].filter((match) => match.a.length > 0 || match.b.length > 0);

  return {
    name: `Round ${index + 1}`,
    format: index === 1 ? 'scramble2v2Nassau' : 'bestBallNassau',
    scoringMode: 'matchPlay',
    points: { front: 1, back: 1, total: 1 },
    skins: { enabled: false, pot: 0, type: 'net' },
    puttPoker: { enabled: false, pot: 0, scope: 'playingGroup' },
    bestBallBet: { front: 0, back: 0, total: 0, type: 'net' },
    scrambleBet: { front: 0, back: 0, total: 0, type: 'gross' },
    pairMatches: defaultPairs,
    playingGroups: autoPlayingGroupsFromPairMatches(defaultPairs, [...team1, ...team2], team1, team2),
    roundId: null,
    pointsResult: { team1: null, team2: null },
  };
}

export function eventRoundAvailablePoints(round: Pick<EventRoundConfig, 'format' | 'points' | 'pairMatches'>): number {
  const matchCount = Math.max(1, round.pairMatches?.length || 1);
  const points = round.points ?? { front: 0, back: 0, total: 0 };
  const base = Number(points.front || 0) + Number(points.back || 0) + Number(points.total || 0);

  // Combo games (BB+Aggy, HB/LB) score two contests x three segments per match.
  // Available points are the sum of the six per-component values, falling back to
  // the base front/back/total when a component override is absent.
  if (round.format === 'twoManBestBallAggy' || round.format === 'twoManHighBallLowBall') {
    const components =
      round.format === 'twoManBestBallAggy'
        ? [points.bestBall, points.aggy]
        : [points.lowBall, points.highBall];
    const comboTotal = components.reduce(
      (sum, c) =>
        sum + (c ? Number(c.front || 0) + Number(c.back || 0) + Number(c.overall || 0) : base),
      0,
    );
    return comboTotal * matchCount;
  }

  return base * matchCount;
}

export function defaultEventConfig(groupPlayerNames: string[]): EventConfig {
  const split = Math.ceil(groupPlayerNames.length / 2);
  const team1 = groupPlayerNames.slice(0, split);
  const team2 = groupPlayerNames.slice(split);
  const rounds = Array.from({ length: 3 }, (_, index) => eventDefaultRound(index, team1, team2));

  return {
    teamNames: { team1: 'Team A', team2: 'Team B' },
    team1,
    team2,
    rounds,
    winPoints: eventWinPoints(rounds),
    tiebreaker: '',
  };
}

export function eventWinPoints(rounds: Array<Pick<EventRoundConfig, 'format' | 'points' | 'pairMatches'>>): number {
  return rounds.reduce((total, round) => total + eventRoundAvailablePoints(round), 0) / 2 + 0.5;
}

export function normalizeEventConfig(
  config: Partial<EventConfig> | null | undefined,
  groupPlayerNames: string[] = [],
): EventConfig {
  const base = defaultEventConfig(groupPlayerNames);
  const team1 = [...(config?.team1 ?? [])];
  const team2 = (config?.team2 ?? []).filter((player) => !team1.includes(player));

  for (const round of config?.rounds ?? []) {
    for (const match of round.pairMatches ?? []) {
      for (const player of match.a ?? []) {
        if (player && !team1.includes(player) && !team2.includes(player)) team1.push(player);
      }
      for (const player of match.b ?? []) {
        if (player && !team2.includes(player) && !team1.includes(player)) team2.push(player);
      }
    }
  }

  const assigned = new Set([...team1, ...team2]);
  for (const player of groupPlayerNames) {
    if (!assigned.has(player)) {
      (team1.length <= team2.length ? team1 : team2).push(player);
      assigned.add(player);
    }
  }

  const teamNames = {
    team1: config?.teamNames?.team1 || base.teamNames.team1,
    team2: config?.teamNames?.team2 || base.teamNames.team2,
  };
  const requestedRoundCount = config?.rounds?.length || base.rounds.length;
  const roundCount = Math.max(1, Math.min(12, Number(requestedRoundCount)));
  const rounds: EventRoundConfig[] = [];

  for (let index = 0; index < roundCount; index += 1) {
    const fallback = eventDefaultRound(index, team1, team2);
    const source = config?.rounds?.[index] ?? fallback;
    const validPlayers = [...team1, ...team2];

    const pairMatches = (source.pairMatches?.length ? source.pairMatches : fallback.pairMatches)
      .map((match) => ({
        a: (match.a ?? []).filter((player) => team1.includes(player)).slice(0, 2),
        b: (match.b ?? []).filter((player) => team2.includes(player)).slice(0, 2),
      }))
      .filter((match) => match.a.length > 0 || match.b.length > 0);

    const round: EventRoundConfig = {
      ...fallback,
      ...source,
      name: source.name || fallback.name,
      format: source.format || fallback.format,
      scoringMode: source.scoringMode || fallback.scoringMode,
      points: { ...fallback.points, ...source.points },
      skins: { ...fallback.skins, ...source.skins },
      puttPoker: { ...fallback.puttPoker, ...source.puttPoker },
      bestBallBet: { ...fallback.bestBallBet, ...source.bestBallBet },
      scrambleBet: { ...fallback.scrambleBet, ...source.scrambleBet },
      pairMatches,
      playingGroups: normalizePlayingGroups(source.playingGroups || fallback.playingGroups, validPlayers),
      pointsResult: {
        team1: source.pointsResult?.team1 ?? null,
        team2: source.pointsResult?.team2 ?? null,
      },
      roundId: source.roundId ?? null,
    };

    rounds.push(round);
  }

  return {
    teamNames,
    team1,
    team2,
    rounds,
    winPoints: config?.winPoints || eventWinPoints(rounds),
    tiebreaker: config?.tiebreaker || '',
  };
}
