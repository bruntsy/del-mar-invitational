import { playerRangeScore, type ScoreContext } from '@/scoring/round';
import type { ScoreType } from '@/types';

export interface HeadToHeadMatchup {
  t1: string;
  t2: string;
}

export interface HeadToHeadResultRow {
  index: number;
  t1: string;
  t2: string;
  t1Score: number | null;
  t2Score: number | null;
  winner: string | 'tie' | null;
}

export function computeHeadToHead(
  context: ScoreContext,
  matchups: HeadToHeadMatchup[],
  type: ScoreType = 'net',
): HeadToHeadResultRow[] {
  return matchups.map((matchup, index) => {
    const t1Score = playerRangeScore(context, matchup.t1, 0, 18, type);
    const t2Score = playerRangeScore(context, matchup.t2, 0, 18, type);
    let winner: HeadToHeadResultRow['winner'] = null;

    if (t1Score != null && t2Score != null) {
      if (t1Score < t2Score) winner = matchup.t1;
      else if (t2Score < t1Score) winner = matchup.t2;
      else winner = 'tie';
    }

    return {
      index: index + 1,
      t1: matchup.t1,
      t2: matchup.t2,
      t1Score,
      t2Score,
      winner,
    };
  });
}
