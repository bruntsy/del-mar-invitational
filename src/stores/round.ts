import { defineStore } from 'pinia';
import { cloneDefaultGames, normalizeGames } from '@/domain/games';
import { normalizePlayingGroups } from '@/domain/playingGroups';
import { groupPlayerByName } from '@/domain/players';
import { scoreAt, writeCell } from '@/scoring/cells';
import { computeWHSCourseHcp, allocateNetStrokes } from '@/scoring/handicap';
import { playerRangeScore, type ScoreContext } from '@/scoring/round';
import { computeSkins, type SkinsResult } from '@/scoring/skins';
import {
  computePlayerPnL,
  computeSettlement,
  gamesHaveBets,
  type SettlementTransfer,
} from '@/scoring/settlement';
import { computePuttPoker, type PuttPokerResult } from '@/scoring/puttPoker';
import { computeTeamHoleStats, computeTeamTotals, type TeamTotals } from '@/scoring/teamGames';
import type { WolfHoleConfig } from '@/scoring/wolf';
import type { PlayerMap, RoundState, ScoreMatrix, ScoreType } from '@/types';

const STORAGE_KEY = 'dmi_round';

interface PersistedRound {
  round: RoundState | null;
  players: PlayerMap;
}

export interface PlayerTotals {
  out: number | null;
  in: number | null;
  total: number | null;
  net: number | null;
  skins: number;
}

/** One row of the results-screen individual leaderboard. */
export interface LeaderboardRow {
  player: string;
  team: string;
  gross: number | null;
  strokes: number;
  net: number | null;
  skins: number;
}

interface TeamRangeScores {
  front: number | null;
  back: number | null;
  total: number | null;
}

/** A single team-game's front/back/total breakdown for both teams. */
export interface TeamGameResult {
  key: 'bestBall' | 'scramble4' | 'twoBall' | 'aggy';
  label: string;
  type: ScoreType;
  team1: TeamRangeScores;
  team2: TeamRangeScores;
}

export interface ScorecardTeamFormatRow {
  key: 'bestBall' | 'twoBall';
  label: string;
  sublabel: string;
  holes: Array<number | null>;
  out: number | null;
  in: number | null;
  total: number | null;
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function hasLocalStorage(): boolean {
  return typeof localStorage !== 'undefined';
}

/**
 * A fresh, empty round matching the legacy default shape created in
 * `index.html` (`ROUND={ id:null, ... games:cloneDefaultGames() ... }`).
 */
export function emptyRound(groupId: string | null = null): RoundState {
  return {
    id: null,
    groupId,
    course: null,
    team1: [],
    team2: [],
    teamNames: { team1: 'Team 1', team2: 'Team 2' },
    pairMatches: [],
    playingGroups: [],
    matchups: [],
    games: cloneDefaultGames(),
    scores: {},
    putts: {},
    teamScores: {},
    wolf: { holes: {} },
    completed: false,
  };
}

/**
 * Repairs a round loaded from storage/db the way legacy `loadState()` and
 * `normalizeRound()` do: normalize games, backfill missing structures, and
 * re-derive playing groups from the current roster.
 */
function normalizeRoundState(round: RoundState): RoundState {
  const team1 = Array.isArray(round.team1) ? round.team1 : [];
  const team2 = Array.isArray(round.team2) ? round.team2 : [];
  const players = [...team1, ...team2];

  return {
    ...round,
    team1,
    team2,
    games: normalizeGames(round.games),
    wolf: round.wolf?.holes ? round.wolf : { holes: {} },
    teamNames: round.teamNames || { team1: 'Team 1', team2: 'Team 2' },
    pairMatches: Array.isArray(round.pairMatches) ? round.pairMatches : [],
    playingGroups: normalizePlayingGroups(round.playingGroups, players),
    scores: round.scores || {},
    putts: round.putts || {},
    teamScores: round.teamScores || {},
  };
}

export const useRoundStore = defineStore('round', {
  state: () => ({
    round: null as RoundState | null,
    players: {} as PlayerMap,
  }),

  getters: {
    /** Roster in scoring order: team1 then team2, matching legacy `currentPlayers()`. */
    playerNames(state): string[] {
      if (!state.round) return [];
      return [...(state.round.team1 || []), ...(state.round.team2 || [])];
    },

    course(state) {
      return state.round?.course ?? null;
    },

    games(state) {
      return normalizeGames(state.round?.games);
    },

    /** Per-player WHS course handicap, matching legacy `getCourseHandicap()`. */
    courseHandicaps(): Record<string, number> {
      const course = this.course;
      if (!course) return {};
      const parTotal = course.tee?.parTotal || sum(course.par || []);

      return Object.fromEntries(
        this.playerNames.map((player) => {
          const index = Number(groupPlayerByName(this.players, player)?.handicapIndex ?? 0);
          return [player, computeWHSCourseHcp(index, course.tee?.slope, course.tee?.rating, parTotal)];
        }),
      );
    },

    /** Relative net strokes (course handicap minus the field minimum). */
    strokes(): Record<string, number> {
      return allocateNetStrokes(this.courseHandicaps);
    },

    /** Bundled input for the pure scoring modules. */
    scoreContext(state): ScoreContext | null {
      if (!state.round?.course) return null;
      return {
        course: state.round.course,
        scores: state.round.scores || {},
        strokes: this.strokes,
      };
    },

    skins(): SkinsResult {
      const context = this.scoreContext;
      if (!context) return { skinsByPlayer: {}, holeResults: [], pendingPot: 0 };
      return computeSkins(context, this.playerNames);
    },

    /**
     * Per-player gross out/in/total plus net total and skins won, matching the
     * legacy scorecard summary columns.
     */
    playerTotals(): Record<string, PlayerTotals> {
      const context = this.scoreContext;
      const { skinsByPlayer } = this.skins;
      return Object.fromEntries(
        this.playerNames.map((player) => {
          if (!context) {
            return [player, { out: null, in: null, total: null, net: null, skins: 0 }];
          }
          const out = playerRangeScore(context, player, 0, 9, 'gross');
          const inn = playerRangeScore(context, player, 9, 18, 'gross');
          const total = out == null && inn == null ? null : (out ?? 0) + (inn ?? 0);
          const net = playerRangeScore(context, player, 0, 18, 'net');
          return [player, { out, in: inn, total, net, skins: skinsByPlayer[player] || 0 }];
        }),
      );
    },

    hasBets(): boolean {
      return gamesHaveBets(this.games);
    },

    /** Settlement P&L plus minimized who-pays-who transfers. */
    settlement(state): { pnl: Record<string, number>; transfers: SettlementTransfer[] } {
      const context = this.scoreContext;
      if (!context || !state.round) {
        return { pnl: Object.fromEntries(this.playerNames.map((p) => [p, 0])), transfers: [] };
      }
      const pnl = computePlayerPnL({
        scoreContext: context,
        teamScores: state.round.teamScores,
        team1: state.round.team1 || [],
        team2: state.round.team2 || [],
        players: this.playerNames,
        matchups: state.round.matchups || [],
        games: this.games,
        wolfHoles: state.round.wolf?.holes as Record<string, WolfHoleConfig | undefined> | undefined,
      });
      return { pnl, transfers: computeSettlement(pnl) };
    },

    /**
     * Individual leaderboard rows sorted by net (best first, incomplete last),
     * matching the legacy `renderResults()` board.
     */
    leaderboard(state): LeaderboardRow[] {
      if (!state.round) return [];
      const totals = this.playerTotals;
      const strokes = this.strokes;
      const team1 = state.round.team1 || [];
      const names = state.round.teamNames;
      const rows: LeaderboardRow[] = this.playerNames.map((player) => ({
        player,
        team: team1.includes(player) ? names.team1 : names.team2,
        gross: totals[player].total,
        strokes: strokes[player] || 0,
        net: totals[player].net,
        skins: totals[player].skins,
      }));
      return rows.sort((a, b) => (a.net == null ? 1 : b.net == null ? -1 : a.net - b.net));
    },

    /**
     * Team net totals, null until every member has a complete net total, matching
     * the legacy `team1HasAll`/`team2HasAll` gate on the Team Scores section.
     */
    teamNetTotals(state): { team1: number | null; team2: number | null } {
      const totals = this.playerTotals;
      const sumTeam = (members: string[]): number | null => {
        if (!members.length) return null;
        let total = 0;
        for (const player of members) {
          const net = totals[player]?.net;
          if (net == null) return null;
          total += net;
        }
        return total;
      };
      return {
        team1: sumTeam(state.round?.team1 || []),
        team2: sumTeam(state.round?.team2 || []),
      };
    },

    /**
     * Front/back/total breakdowns for every enabled team game, matching the
     * legacy `renderFormatResults()` boxes. Best ball / two-ball / aggy derive
     * from individual scores; the scramble uses the manually entered team row.
     */
    teamGameResults(state): TeamGameResult[] {
      const context = this.scoreContext;
      if (!context || !state.round) return [];
      const g = this.games;
      const team1 = state.round.team1 || [];
      const team2 = state.round.team2 || [];
      const results: TeamGameResult[] = [];

      const pickBest = (t: TeamTotals): TeamRangeScores => ({ front: t.bbOut, back: t.bbIn, total: t.bbTotal });
      const pickTwo = (t: TeamTotals): TeamRangeScores => ({ front: t.tbOut, back: t.tbIn, total: t.tbTotal });
      const pickAggy = (t: TeamTotals): TeamRangeScores => ({ front: t.agOut, back: t.agIn, total: t.agTotal });
      const teamRange = (teamKey: 'team1' | 'team2', start: number, end: number): number | null => {
        const matrix = state.round?.teamScores;
        if (!matrix) return null;
        let total = 0;
        let any = false;
        for (let hole = start; hole < end; hole += 1) {
          const value = scoreAt(matrix, teamKey, hole);
          if (value != null) {
            total += value;
            any = true;
          }
        }
        return any ? total : null;
      };

      if (g.bestBall.enabled) {
        results.push({
          key: 'bestBall',
          label: 'Best Ball',
          type: g.bestBall.type,
          team1: pickBest(computeTeamTotals(context, team1, g.bestBall.type)),
          team2: pickBest(computeTeamTotals(context, team2, g.bestBall.type)),
        });
      }
      if (g.scramble4.enabled) {
        results.push({
          key: 'scramble4',
          label: '4-Man Scramble',
          type: g.scramble4.type,
          team1: { front: teamRange('team1', 0, 9), back: teamRange('team1', 9, 18), total: teamRange('team1', 0, 18) },
          team2: { front: teamRange('team2', 0, 9), back: teamRange('team2', 9, 18), total: teamRange('team2', 0, 18) },
        });
      }
      if (g.twoBall.enabled) {
        results.push({
          key: 'twoBall',
          label: '2-Ball',
          type: g.twoBall.type,
          team1: pickTwo(computeTeamTotals(context, team1, g.twoBall.type)),
          team2: pickTwo(computeTeamTotals(context, team2, g.twoBall.type)),
        });
      }
      if (g.aggy.enabled) {
        results.push({
          key: 'aggy',
          label: 'Aggy',
          type: g.aggy.type,
          team1: pickAggy(computeTeamTotals(context, team1, g.aggy.type)),
          team2: pickAggy(computeTeamTotals(context, team2, g.aggy.type)),
        });
      }

      return results;
    },
  },

  actions: {
    /** Load round + player handicap map from localStorage, repairing as legacy does. */
    load(): boolean {
      if (!hasLocalStorage()) return false;
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return false;
        const parsed = JSON.parse(raw) as PersistedRound;
        this.players = parsed.players || {};
        this.round = parsed.round ? normalizeRoundState(parsed.round) : null;
        return !!this.round;
      } catch {
        return false;
      }
    },

    persist() {
      if (!hasLocalStorage()) return;
      if (this.round) {
        const payload: PersistedRound = { round: this.round, players: this.players };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
      } else {
        localStorage.removeItem(STORAGE_KEY);
      }
    },

    setRound(round: RoundState, players?: PlayerMap) {
      this.players = players ?? this.players ?? {};
      this.round = normalizeRoundState(round);
      this.persist();
    },

    setPlayers(players: PlayerMap) {
      this.players = players || {};
      this.persist();
    },

    setGames(games: RoundState['games']) {
      if (!this.round) return;
      this.round.games = normalizeGames(games);
      this.persist();
    },

    /** Writes a timestamped score cell, growing the player row to 18 holes. */
    setScore(player: string, hole: number, value: number | null) {
      this.writeMatrixCell('scores', player, hole, value);
    },

    setPutt(player: string, hole: number, value: number | null) {
      this.writeMatrixCell('putts', player, hole, value);
    },

    setTeamScore(teamKey: string, hole: number, value: number | null) {
      this.writeMatrixCell('teamScores', teamKey, hole, value);
    },

    writeMatrixCell(
      key: 'scores' | 'putts' | 'teamScores',
      row: string,
      hole: number,
      value: number | null,
    ) {
      if (!this.round || hole < 0 || hole > 17) return;
      const matrix = (this.round[key] ?? {}) as ScoreMatrix;
      if (!Array.isArray(matrix[row]) || matrix[row].length !== 18) {
        matrix[row] = Array.from({ length: 18 }, (_, h) => matrix[row]?.[h] ?? null);
      }
      matrix[row][hole] = writeCell(value);
      this.round[key] = matrix;
      this.persist();
    },

    /** Putt poker results for a playing group, matching legacy `computePuttPoker()`. */
    puttPokerFor(groupPlayers: string[]): PuttPokerResult {
      const putts = this.round?.putts || {};
      return computePuttPoker(putts, groupPlayers, this.games.puttPoker.pot || 0);
    },

    /** Marks the round complete (or reopens it), matching legacy `completeRound()`. */
    setCompleted(value: boolean) {
      if (!this.round) return;
      this.round.completed = value;
      this.persist();
    },

    reset() {
      this.round = null;
      this.persist();
    },

    readScore(player: string, hole: number): number | null {
      if (!this.round) return null;
      return scoreAt(this.round.scores || {}, player, hole);
    },

    readPutt(player: string, hole: number): number | null {
      if (!this.round) return null;
      return scoreAt(this.round.putts || {}, player, hole);
    },

    readTeamScore(teamKey: string, hole: number): number | null {
      if (!this.round) return null;
      return scoreAt(this.round.teamScores || {}, teamKey, hole);
    },

    scorecardTeamRowsFor(teamKey: 'team1' | 'team2'): ScorecardTeamFormatRow[] {
      const context = this.scoreContext;
      const round = this.round;
      if (!context || !round) return [];
      const teamPlayers = round[teamKey] || [];
      const rows: ScorecardTeamFormatRow[] = [];
      const games = this.games;

      if (games.bestBall.enabled) {
        const totals = computeTeamTotals(context, teamPlayers, games.bestBall.type);
        rows.push({
          key: 'bestBall',
          label: 'Best Ball',
          sublabel: `low ${games.bestBall.type} per hole`,
          holes: Array.from({ length: 18 }, (_, hole) =>
            computeTeamHoleStats(context, teamPlayers, hole, games.bestBall.type).bestBall,
          ),
          out: totals.bbOut,
          in: totals.bbIn,
          total: totals.bbTotal,
        });
      }

      if (games.twoBall.enabled) {
        const totals = computeTeamTotals(context, teamPlayers, games.twoBall.type);
        rows.push({
          key: 'twoBall',
          label: '2-Ball',
          sublabel: `sum of 2 low ${games.twoBall.type}`,
          holes: Array.from({ length: 18 }, (_, hole) =>
            computeTeamHoleStats(context, teamPlayers, hole, games.twoBall.type).twoBall,
          ),
          out: totals.tbOut,
          in: totals.tbIn,
          total: totals.tbTotal,
        });
      }

      return rows;
    },
  },
});
