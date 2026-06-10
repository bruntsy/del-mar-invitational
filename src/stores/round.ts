import { defineStore } from 'pinia';
import { cloneDefaultGames, normalizeGames } from '@/domain/games';
import { generateCode } from '@/domain/group';
import { groupPlayerByName } from '@/domain/players';
import {
  ACTIVE_ROUND_COLUMNS,
  mergeRoundData,
  normalizeRoundRow,
  normalizeRoundState,
  roundForDb,
} from '@/domain/round';
import { hasSupabase, supabase } from '@/services/supabase';
import type { RoundRow } from '@/types/db';
import { scoreAt, writeCell } from '@/scoring/cells';
import { computeWHSCourseHcp, allocateNetStrokes } from '@/scoring/handicap';
import { playerRangeScore, type ScoreContext } from '@/scoring/round';
import {
  buildBestBallAggyConfig,
  scoreBestBallAggy,
  type BestBallAggyResult,
} from '@/scoring/bestBallAggy';
import {
  buildTwoManScrambleConfig,
  scoreTwoManScramble,
  twoManScrambleTeamKey,
  type TwoManScrambleResult,
} from '@/scoring/twoManScramble';
import { computeSkins, type SkinsResult } from '@/scoring/skins';
import {
  computePlayerPnL,
  computeSettlement,
  gamesHaveBets,
  type SettlementTransfer,
} from '@/scoring/settlement';
import { computePuttPoker, type PuttPokerResult } from '@/scoring/puttPoker';
import { computeTeamHoleStats, computeTeamTotals } from '@/scoring/teamGames';
import {
  defaultWolfHole,
  wolfHoleResult,
  wolfSegmentResults,
  wolfSegmentWinners,
  type WolfHoleConfig,
  type WolfHoleResult,
  type WolfMode,
  type WolfSegmentResult,
} from '@/scoring/wolf';
import type { PlayerMap, RoundState, ScoreMatrix, ScoreType } from '@/types';

const STORAGE_KEY = 'dmi_round';

type RealtimeClient = {
  channel: (name: string) => {
    on: (
      type: 'postgres_changes',
      filter: { event: string; schema: string; table: string; filter: string },
      callback: (payload: { eventType?: string; new?: RoundRow }) => void,
    ) => { subscribe: () => unknown };
  };
  removeChannel: (channel: unknown) => unknown;
};

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
  key: 'bestBall' | 'scramble4';
  label: string;
  type: ScoreType;
  team1: TeamRangeScores;
  team2: TeamRangeScores;
}

export interface ScorecardTeamFormatRow {
  key: 'bestBall';
  label: string;
  sublabel: string;
  holes: Array<number | null>;
  out: number | null;
  in: number | null;
  total: number | null;
}

export interface WolfHoleDisplayRow {
  hole: number;
  config: Required<WolfHoleConfig>;
  result: WolfHoleResult;
  resultLabel: string;
  pointsLabel: string;
}

export interface WolfStandingRow {
  player: string;
  points: number;
  leader: boolean;
}

export interface WolfDisplayResult {
  enabled: boolean;
  scoreType: ScoreType;
  nassau: boolean;
  amount: number;
  rows: WolfHoleDisplayRow[];
  standings: WolfStandingRow[];
  segments: WolfSegmentResult[];
  playedHoles: number;
}

export interface PuttPokerGroupResult {
  name: string;
  players: string[];
  result: PuttPokerResult;
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function wolfResultLabel(result: WolfHoleResult): string {
  if (!result.winner) return 'In progress';
  if (result.winner === 'tie') return 'Push';
  return result.winner === 'wolf' ? `${result.sideA.join(' + ')} wins` : 'Field wins';
}

function wolfPointsLabel(result: WolfHoleResult): string {
  const points = Object.entries(result.points)
    .filter(([, value]) => value > 0)
    .map(([player, value]) => `${player} +${value}`);
  return points.length ? points.join(', ') : '—';
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

export const useRoundStore = defineStore('round', {
  state: () => ({
    round: null as RoundState | null,
    players: {} as PlayerMap,
    groupChannel: null as unknown,
    syncTimer: null as ReturnType<typeof setTimeout> | null,
    pollTimer: null as ReturnType<typeof setInterval> | null,
    lastPushed: '',
    syncError: '',
    starting: false,
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
      return computeSkins(context, this.playerNames, this.games.skins.type);
    },

    /** Best Ball + Aggy results, one per pair match (empty if game disabled). */
    bestBallAggyResults(state): BestBallAggyResult[] {
      const context = this.scoreContext;
      if (!context || !state.round || !this.games.bestBallAggy?.enabled) return [];
      const pairMatches = state.round.pairMatches ?? [];
      return pairMatches.map((match) =>
        scoreBestBallAggy(buildBestBallAggyConfig(match, this.games.bestBallAggy), context),
      );
    },

    /** Two-Man Scramble results, one per pair match (empty if game disabled). */
    twoManScrambleResults(state): TwoManScrambleResult[] {
      if (!state.round || !this.games.twoManScramble?.enabled) return [];
      const pairMatches = state.round.pairMatches ?? [];
      const teamScores = state.round.teamScores ?? {};
      return pairMatches.map((match, index) => {
        const config = buildTwoManScrambleConfig(match, index, this.games.twoManScramble);
        const teamHoleScores = {
          [twoManScrambleTeamKey(index, 'a')]: teamScores[twoManScrambleTeamKey(index, 'a')],
          [twoManScrambleTeamKey(index, 'b')]: teamScores[twoManScrambleTeamKey(index, 'b')],
        };
        return scoreTwoManScramble(config, teamHoleScores);
      });
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
        twoManScrambleTeamScores: state.round.teamScores,
        team1: state.round.team1 || [],
        team2: state.round.team2 || [],
        players: this.playerNames,
        pairMatches: state.round.pairMatches ?? [],
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

      const pickBest = (t: import('@/scoring/teamGames').TeamTotals): TeamRangeScores => ({ front: t.bbOut, back: t.bbIn, total: t.bbTotal });
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
      return results;
    },

    wolfResult(state): WolfDisplayResult {
      const games = this.games;
      const empty: WolfDisplayResult = {
        enabled: games.wolf.enabled,
        scoreType: games.wolf.type,
        nassau: games.wolf.nassau,
        amount: Number(games.wolf.amount || 0),
        rows: [],
        standings: [],
        segments: [],
        playedHoles: 0,
      };
      const context = this.scoreContext;
      if (!context || !state.round || !games.wolf.enabled) return empty;
      const players = this.playerNames;
      const holes = (state.round.wolf?.holes || {}) as Record<string, WolfHoleConfig | undefined>;
      const rows: WolfHoleDisplayRow[] = Array.from({ length: 18 }, (_, hole) => {
        const config = {
          ...defaultWolfHole(players, hole),
          ...(holes[hole] || {}),
        } as Required<WolfHoleConfig>;
        const result = wolfHoleResult(context, players, hole, config, games.wolf.type);
        return {
          hole: hole + 1,
          config,
          result,
          resultLabel: wolfResultLabel(result),
          pointsLabel: wolfPointsLabel(result),
        };
      });
      const segments = wolfSegmentResults(context, players, holes, games.wolf.nassau, games.wolf.type);
      const overall = segments.find((segment) => segment.label === 'Overall')?.points ?? {};
      const leaders = wolfSegmentWinners(overall);
      return {
        ...empty,
        rows,
        segments,
        playedHoles: rows.filter((row) => row.result.winner != null).length,
        standings: Object.entries(overall)
          .map(([player, points]) => ({ player, points, leader: leaders.includes(player) }))
          .sort((a, b) => b.points - a.points || a.player.localeCompare(b.player)),
      };
    },

    /**
     * Per-playing-group putt poker results for the results screen, matching the
     * per-group layout in the legacy scorecard panel. Falls back to team rows
     * when no playing groups are defined, exactly as the scorecard does.
     */
    puttPokerGroups(state): PuttPokerGroupResult[] {
      if (!state.round || !this.games.puttPoker.enabled) return [];
      const putts = state.round.putts || {};
      const pot = this.games.puttPoker.pot || 0;
      const groups: Array<{ name: string; players: string[] }> = (() => {
        const defined = (state.round.playingGroups || []).filter((group) => group.players.length > 0);
        if (defined.length) return defined.map((group) => ({ name: group.name, players: group.players }));
        return [
          { name: state.round.teamNames.team1, players: state.round.team1 || [] },
          { name: state.round.teamNames.team2, players: state.round.team2 || [] },
        ];
      })();
      return groups.map((group) => ({
        ...group,
        result: computePuttPoker(putts, group.players, pot),
      }));
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

    /**
     * Fetch a group's latest incomplete round from Supabase and make it active
     * (legacy `loadActiveRound`). No-ops to `null` when offline or the group has
     * no active round, leaving any local round untouched.
     */
    async loadActiveRound(groupId: string | null): Promise<RoundState | null> {
      if (!groupId || !hasSupabase() || !supabase) return null;
      const { data, error } = await supabase
        .from('rounds')
        .select(ACTIVE_ROUND_COLUMNS)
        .eq('group_id', groupId)
        .eq('completed', false)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error || !data) return null;
      const { round, players } = normalizeRoundRow(data as RoundRow);
      this.setRound(round, players);
      return round;
    },

    scheduleSync(delay = 600) {
      if (!this.round?.id || !hasSupabase() || !supabase) return;
      if (this.syncTimer) clearTimeout(this.syncTimer);
      this.syncTimer = setTimeout(() => {
        this.syncTimer = null;
        void this.pushToSupabase();
      }, delay);
    },

    async pushToSupabase() {
      if (!this.round?.id || !hasSupabase() || !supabase) return;
      const { data } = await supabase
        .from('rounds')
        .select(ACTIVE_ROUND_COLUMNS)
        .eq('id', this.round.id)
        .single();
      if (data && this.round) {
        const { round: remote, players } = normalizeRoundRow(data as RoundRow);
        this.players = { ...players, ...this.players };
        this.round = mergeRoundData(this.round, remote, false);
        this.persist();
      }
      if (!this.round?.id) return;
      const state = roundForDb(this.round, this.players);
      this.lastPushed = JSON.stringify(state);
      const { error } = await supabase
        .from('rounds')
        .update({ state, completed: this.round.completed || false })
        .eq('id', this.round.id);
      this.syncError = error ? String(error.message || 'Sync failed') : '';
    },

    applyRemoteRound(remote: RoundState) {
      const before = JSON.stringify({ scores: this.round?.scores || {}, putts: this.round?.putts || {} });
      this.round = this.round ? mergeRoundData(this.round, remote, true) : normalizeRoundState(remote);
      const afterRemote = JSON.stringify({ scores: remote.scores || {}, putts: remote.putts || {} });
      const localHadExtra =
        before !== afterRemote &&
        JSON.stringify({ scores: this.round?.scores || {}, putts: this.round?.putts || {} }) !== afterRemote;
      this.persist();
      if (localHadExtra) this.scheduleSync();
    },

    subscribeToGroup(groupId: string | null) {
      this.stopGroupSubscription();
      if (!groupId || !hasSupabase() || !supabase) return;
      const realtime = supabase as unknown as RealtimeClient;
      this.groupChannel = realtime
        .channel(`group-${groupId}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'rounds', filter: `group_id=eq.${groupId}` },
          (payload: { eventType?: string; new?: RoundRow }) => {
            const row = payload.new;
            if (!row?.state) return;
            const incoming = typeof row.state === 'string' ? row.state : JSON.stringify(row.state);
            if (incoming === this.lastPushed) return;
            const { round, players } = normalizeRoundRow(row);
            this.players = { ...players, ...this.players };
            if (payload.eventType === 'INSERT' && !round.completed) {
              this.setRound(round, this.players);
              return;
            }
            if (this.round?.id && row.id === this.round.id) this.applyRemoteRound(round);
          },
        )
        .subscribe();
      this.startPolling();
    },

    stopGroupSubscription() {
      if (this.syncTimer) {
        clearTimeout(this.syncTimer);
        this.syncTimer = null;
      }
      if (this.pollTimer) {
        clearInterval(this.pollTimer);
        this.pollTimer = null;
      }
      if (this.groupChannel && hasSupabase() && supabase) {
        (supabase as unknown as RealtimeClient).removeChannel(this.groupChannel);
      }
      this.groupChannel = null;
      this.lastPushed = '';
    },

    startPolling() {
      if (this.pollTimer) clearInterval(this.pollTimer);
      this.pollTimer = setInterval(async () => {
        if (!this.round?.id || !hasSupabase() || !supabase) return;
        const { data } = await supabase
          .from('rounds')
          .select(ACTIVE_ROUND_COLUMNS)
          .eq('id', this.round.id)
          .single();
        if (data) {
          const { round, players } = normalizeRoundRow(data as RoundRow);
          this.players = { ...players, ...this.players };
          this.applyRemoteRound(round);
        }
      }, 10000);
      (this.pollTimer as { unref?: () => void } | null)?.unref?.();
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

    async startRound(round: RoundState, players: PlayerMap, groupId: string | null = null): Promise<RoundState> {
      const localRound = normalizeRoundState({
        ...round,
        groupId: groupId ?? round.groupId ?? null,
        completed: false,
      });
      this.starting = true;
      this.syncError = '';
      try {
        if (!groupId || !hasSupabase() || !supabase) {
          this.setRound(localRound, players);
          return this.round as RoundState;
        }

        const state = roundForDb(localRound, players);
        const { data, error } = await supabase
          .from('rounds')
          .insert({ group_id: groupId, code: generateCode(), state, completed: false })
          .select(ACTIVE_ROUND_COLUMNS)
          .single();

        if (error || !data) {
          this.syncError = 'Could not create an online round. Started locally instead.';
          this.setRound(localRound, players);
          return this.round as RoundState;
        }

        const { round: createdRound, players: embeddedPlayers } = normalizeRoundRow(data as RoundRow);
        this.setRound(createdRound, { ...players, ...embeddedPlayers });
        this.subscribeToGroup(groupId);
        return this.round as RoundState;
      } finally {
        this.starting = false;
      }
    },

    async updateRound(round: RoundState, players: PlayerMap): Promise<void> {
      if (!this.round?.id) return;
      const merged: RoundState = {
        ...this.round,
        course: round.course,
        team1: round.team1,
        team2: round.team2,
        teamNames: round.teamNames,
        matchups: round.matchups,
        pairMatches: round.pairMatches,
        playingGroups: round.playingGroups,
        games: round.games,
      };
      this.setPlayers({ ...this.players, ...players });
      this.setRound(merged, this.players);
      if (hasSupabase() && supabase && merged.groupId) {
        const state = roundForDb(merged, this.players);
        await supabase.from('rounds').update({ state }).eq('id', merged.id);
      }
    },

    setPlayers(players: PlayerMap) {
      this.players = players || {};
      this.persist();
      this.scheduleSync();
    },

    setGames(games: RoundState['games']) {
      if (!this.round) return;
      this.round.games = normalizeGames(games);
      this.persist();
      this.scheduleSync();
    },

    setWolfHole(hole: number, key: 'wolf' | 'mode' | 'partner', value: string) {
      if (!this.round || hole < 0 || hole > 17) return;
      const players = this.playerNames;
      const holes = { ...((this.round.wolf?.holes || {}) as Record<string, WolfHoleConfig | undefined>) };
      const existing = holes[hole] || defaultWolfHole(players, hole);
      const next: WolfHoleConfig = { ...existing };
      if (key === 'mode') {
        next.mode = value === 'solo' ? 'solo' : 'partner';
      } else {
        next[key] = value;
      }
      if (key === 'wolf') {
        const other = players.find((player) => player !== value) || '';
        if (next.partner === value) next.partner = other;
      }
      if (next.mode === 'solo') next.partner = next.partner || '';
      if (next.mode !== 'solo' && !next.partner) {
        next.partner = players.find((player) => player !== next.wolf) || '';
      }
      holes[hole] = {
        wolf: players.includes(next.wolf || '') ? next.wolf : '',
        mode: next.mode as WolfMode,
        partner: players.includes(next.partner || '') && next.partner !== next.wolf ? next.partner : '',
      };
      this.round.wolf = { holes };
      this.persist();
      this.scheduleSync();
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
      this.scheduleSync();
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
      this.scheduleSync();
    },

    reset() {
      this.stopGroupSubscription();
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

    scorecardPlayersFormatRows(players: string[], teamName = ''): ScorecardTeamFormatRow[] {
      const context = this.scoreContext;
      if (!context || !players.length) return [];
      const rows: ScorecardTeamFormatRow[] = [];
      const games = this.games;

      if (games.bestBall.enabled) {
        const totals = computeTeamTotals(context, players, games.bestBall.type);
        rows.push({
          key: 'bestBall',
          label: teamName ? `${teamName} Best Ball` : 'Best Ball',
          sublabel: `low ${games.bestBall.type} per hole`,
          holes: Array.from({ length: 18 }, (_, hole) =>
            computeTeamHoleStats(context, players, hole, games.bestBall.type).bestBall,
          ),
          out: totals.bbOut,
          in: totals.bbIn,
          total: totals.bbTotal,
        });
      }

      return rows;
    },
  },
});
