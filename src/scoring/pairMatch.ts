import { bestBallAggyHoleComponent } from '@/scoring/eventRound';
import { pairBestBallScore, type ScoreContext } from '@/scoring/round';
import type { PairMatch, ScoreType } from '@/types';

export interface PairMatchHole {
  hole: number;
  a: number | null;
  b: number | null;
  winner: 'a' | 'b' | 'tie' | null;
}

export interface PairMatchResultRow {
  idx: number;
  a: string[];
  b: string[];
  aPts: number;
  bPts: number;
  aWon: number;
  bWon: number;
  tied: number;
  played: number;
  holes: PairMatchHole[];
}

export interface PairMatchPlayResult {
  matches: PairMatchResultRow[];
  team1Points: number;
  team2Points: number;
  team1Holes: number;
  team2Holes: number;
  tiedHoles: number;
}

export interface PairMatchPlayOptions {
  pointsPerHole?: number;
  type?: ScoreType;
  useBestBallAggy?: boolean;
}

export function ensurePairMatches(pairMatches: PairMatch[] | null | undefined, team1: string[], team2: string[]): PairMatch[] {
  const valid = (pairMatches ?? [])
    .map((match) => ({
      a: (match.a ?? []).filter((player) => team1.includes(player)).slice(0, 2),
      b: (match.b ?? []).filter((player) => team2.includes(player)).slice(0, 2),
    }))
    .filter((match) => match.a.length > 0 || match.b.length > 0);

  if (valid.length) return valid;

  const count = Math.min(team1.length, team2.length);
  const generated: PairMatch[] = [];
  for (let index = 0; index < count; index += 2) {
    generated.push({
      a: team1.slice(index, index + 2),
      b: team2.slice(index, index + 2),
    });
  }

  return generated;
}

export function pairMatchups(pairMatches: PairMatch[] | null | undefined, team1: string[], team2: string[]) {
  return ensurePairMatches(pairMatches, team1, team2)
    .map((match, index) => ({
      idx: index + 1,
      a: (match.a ?? []).filter((player) => team1.includes(player)),
      b: (match.b ?? []).filter((player) => team2.includes(player)),
    }))
    .filter((match) => match.a.length > 0 && match.b.length > 0);
}

export function computePairMatchPlay(
  context: ScoreContext,
  pairMatches: PairMatch[] | null | undefined,
  team1: string[],
  team2: string[],
  options: PairMatchPlayOptions = {},
): PairMatchPlayResult {
  const pointsPerHole = Number(options.pointsPerHole || 1);
  const type = options.type ?? 'net';
  const matches = pairMatchups(pairMatches, team1, team2).map((match) => {
    let aPts = 0;
    let bPts = 0;
    let aWon = 0;
    let bWon = 0;
    let tied = 0;
    let played = 0;
    const holes: PairMatchHole[] = [];

    for (let hole = 0; hole < 18; hole += 1) {
      let a: number | null = null;
      let b: number | null = null;
      let winner: PairMatchHole['winner'] = null;

      if (options.useBestBallAggy) {
        const component = bestBallAggyHoleComponent(context, match.a, match.b, hole, 'net');
        a = component.team1;
        b = component.team2;
        if (component.winner !== 'open') {
          played += 1;
          if (component.winner === 'team1') {
            aPts += component.team1;
            aWon += 1;
            winner = 'a';
          } else if (component.winner === 'team2') {
            bPts += component.team2;
            bWon += 1;
            winner = 'b';
          } else {
            aPts += component.team1;
            bPts += component.team2;
            tied += 1;
            winner = 'tie';
          }
        }
      } else {
        a = pairBestBallScore(context, match.a, hole, type);
        b = pairBestBallScore(context, match.b, hole, type);
        if (a != null && b != null) {
          played += 1;
          if (a < b) {
            aPts += pointsPerHole;
            aWon += 1;
            winner = 'a';
          } else if (b < a) {
            bPts += pointsPerHole;
            bWon += 1;
            winner = 'b';
          } else {
            tied += 1;
            winner = 'tie';
          }
        }
      }

      holes.push({ hole: hole + 1, a, b, winner });
    }

    return { ...match, aPts, bPts, aWon, bWon, tied, played, holes };
  });

  return {
    matches,
    team1Points: matches.reduce((total, match) => total + match.aPts, 0),
    team2Points: matches.reduce((total, match) => total + match.bPts, 0),
    team1Holes: matches.reduce((total, match) => total + match.aWon, 0),
    team2Holes: matches.reduce((total, match) => total + match.bWon, 0),
    tiedHoles: matches.reduce((total, match) => total + match.tied, 0),
  };
}
