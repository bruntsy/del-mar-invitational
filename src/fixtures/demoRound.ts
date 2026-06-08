import { cloneDefaultGames } from '@/domain/games';
import { emptyRound } from '@/stores/round';
import type { Course, PlayerMap, RoundState } from '@/types';

const PAR = [4, 5, 3, 4, 4, 3, 5, 4, 4, 4, 4, 3, 5, 4, 4, 3, 5, 4];
const SI = [7, 1, 15, 5, 11, 17, 3, 9, 13, 8, 2, 16, 4, 12, 10, 18, 6, 14];
const YDS = [410, 540, 175, 430, 395, 165, 560, 420, 405, 415, 440, 185, 555, 425, 400, 160, 545, 410];

const demoCourse: Course = {
  clubName: 'Del Mar Country Club',
  courseName: 'Championship',
  location: 'Del Mar, CA',
  tee: { name: 'Blue', gender: 'M', rating: 72.4, slope: 131, parTotal: 72 },
  par: PAR,
  si: SI,
  yds: YDS,
};

/**
 * A ready-to-score sample round used by the rewrite UI so the scorecard is
 * reachable before the full setup flow is built. Two teams of two, a couple of
 * money games enabled, and no scores entered yet.
 */
export function demoRound(): { round: RoundState; players: PlayerMap } {
  const games = cloneDefaultGames();
  games.skins.enabled = true;
  games.skins.pot = 5;
  games.bestBall.enabled = true;
  games.bestBall.type = 'net';
  games.bestBall.front = 10;
  games.bestBall.back = 10;
  games.bestBall.total = 20;
  games.puttPoker.enabled = true;
  games.puttPoker.pot = 2;

  const round: RoundState = {
    ...emptyRound('demo-group'),
    id: 'demo-round',
    course: demoCourse,
    team1: ['Wes', 'Aaron'],
    team2: ['Tito', 'Q'],
    teamNames: { team1: 'Bay Cats', team2: 'Hill Dogs' },
    matchups: [
      { t1: 'Wes', t2: 'Tito' },
      { t1: 'Aaron', t2: 'Q' },
    ],
    games,
  };

  const players: PlayerMap = {
    Wes: { name: 'Wes', handicapIndex: 8.2 },
    Aaron: { name: 'Aaron', handicapIndex: 14.5 },
    Tito: { name: 'Tito', handicapIndex: 4.1 },
    Q: { name: 'Q', handicapIndex: 21.0 },
  };

  return { round, players };
}
