import { normalizeGames } from '@/domain/games';
import { groupPlayerByName } from '@/domain/players';
import { normalizePlayingGroups } from '@/domain/playingGroups';
import { computeWHSCourseHcp, allocateNetStrokes } from '@/scoring/handicap';
import { playerRangeScore, type ScoreContext } from '@/scoring/round';
import { computeSkins } from '@/scoring/skins';
import type { RoundRow } from '@/types/db';
import type { Course } from '@/types/course';
import type { PlayerMap, RoundState } from '@/types';

/** Columns selected for the active (latest incomplete) round (legacy `loadActiveRound`). */
export const ACTIVE_ROUND_COLUMNS = 'id,group_id,state,completed,created_at';

/** Columns selected for the completed-rounds history list (legacy `showHistory`). */
export const HISTORY_ROUND_COLUMNS = 'id,code,state,completed_at,created_at';

/**
 * A `rounds` row carries the full round in its JSON `state` column plus an
 * embedded `players` handicap map (legacy `roundForDb()` spreads
 * `players:{ ...GROUP.players }` into the state). Loading is the only place we
 * read that embedded map back out.
 */
type RoundStatePayload = RoundState & { players?: PlayerMap };

/** A normalized round paired with the handicap map embedded in its DB state. */
export interface NormalizedRound {
  round: RoundState;
  players: PlayerMap;
}

/** Round JSON persisted in the `rounds.state` column (legacy `roundForDb`). */
export function roundForDb(round: RoundState, players: PlayerMap = {}): RoundStatePayload {
  return { ...round, id: round.id, groupId: round.groupId, players: { ...(players || {}) } };
}

/**
 * Repairs a round loaded from storage/db the way legacy `loadState()` and
 * `normalizeRound()` do: normalize games, backfill missing structures, and
 * re-derive playing groups from the current roster. Shared by the round store's
 * local load and the DB row mappers below.
 */
export function normalizeRoundState(round: RoundState): RoundState {
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

/**
 * Map a DB `rounds` row to a normalized round plus its embedded handicap map
 * (legacy `normalizeRound`). The `state` column may arrive as a JSON string or
 * an already-parsed object; the row's `id`/`group_id`/`completed` win over any
 * stale copies inside the state blob.
 */
export function normalizeRoundRow(row: RoundRow): NormalizedRound {
  const rawState = row.state as RoundStatePayload | string | null | undefined;
  const state: RoundStatePayload =
    typeof rawState === 'string'
      ? (JSON.parse(rawState) as RoundStatePayload)
      : ((rawState ?? {}) as RoundStatePayload);

  const merged: RoundState = {
    ...state,
    id: row.id ?? state.id ?? null,
    groupId: row.group_id ?? state.groupId ?? null,
    completed: row.completed ?? state.completed ?? false,
  };

  return { round: normalizeRoundState(merged), players: state.players ?? {} };
}

function mergeCellMatrix(
  base: RoundState['scores'] = {},
  incoming: RoundState['scores'] = {},
  preferIncoming = false,
): RoundState['scores'] {
  const merged = { ...base };
  Object.keys(incoming || {}).forEach((player) => {
    const baseRow = Array.isArray(merged[player]) ? [...merged[player]] : new Array(18).fill(null);
    const incomingRow = Array.isArray(incoming[player]) ? incoming[player] : [];
    for (let hole = 0; hole < 18; hole += 1) {
      if (incomingRow[hole] == null) continue;
      if (baseRow[hole] == null || preferIncoming) baseRow[hole] = incomingRow[hole];
    }
    merged[player] = baseRow;
  });
  return merged;
}

function mergeWolfData(
  base: RoundState['wolf'] = { holes: {} },
  incoming: RoundState['wolf'] = { holes: {} },
  preferIncoming = false,
): RoundState['wolf'] {
  const baseHoles = { ...(base.holes || {}) };
  const incomingHoles = { ...(incoming.holes || {}) };
  return { holes: preferIncoming ? { ...baseHoles, ...incomingHoles } : { ...incomingHoles, ...baseHoles } };
}

function mergePairMatches(
  localRound: Partial<RoundState> = {},
  remoteRound: Partial<RoundState> = {},
  preferRemote = false,
): RoundState['pairMatches'] {
  const local = Array.isArray(localRound.pairMatches) ? localRound.pairMatches : null;
  const remote = Array.isArray(remoteRound.pairMatches) ? remoteRound.pairMatches : null;
  if (preferRemote) return remote || local || [];
  return local || remote || [];
}

/**
 * Merge a remote round into a local round using legacy realtime semantics:
 * score/putt cells reconcile per-cell, and remote nulls do not erase local
 * non-null values unless the caller explicitly prefers the remote round.
 */
export function mergeRoundData(
  localRound: RoundState,
  remoteRound: RoundState | null,
  preferRemote = false,
): RoundState {
  if (!remoteRound) return normalizeRoundState(localRound);
  const merged = { ...remoteRound, ...localRound };
  merged.scores = mergeCellMatrix(remoteRound.scores || {}, localRound.scores || {}, !preferRemote);
  merged.putts = mergeCellMatrix(remoteRound.putts || {}, localRound.putts || {}, !preferRemote);
  merged.teamScores = mergeCellMatrix(remoteRound.teamScores || {}, localRound.teamScores || {}, !preferRemote);
  merged.games = normalizeGames(preferRemote ? (remoteRound.games || localRound.games) : (localRound.games || remoteRound.games));
  merged.playingGroups = normalizePlayingGroups(
    preferRemote ? (remoteRound.playingGroups || localRound.playingGroups) : (localRound.playingGroups || remoteRound.playingGroups),
    [...(merged.team1 || []), ...(merged.team2 || [])],
  );
  merged.wolf = mergeWolfData(remoteRound.wolf || { holes: {} }, localRound.wolf || { holes: {} }, !preferRemote);
  merged.pairMatches = mergePairMatches(localRound, remoteRound, preferRemote);
  if (preferRemote) {
    merged.scores = mergeCellMatrix(merged.scores, remoteRound.scores || {}, true);
    merged.putts = mergeCellMatrix(merged.putts, remoteRound.putts || {}, true);
    merged.teamScores = mergeCellMatrix(merged.teamScores || {}, remoteRound.teamScores || {}, true);
    merged.wolf = mergeWolfData(merged.wolf || { holes: {} }, remoteRound.wolf || { holes: {} }, true);
  }
  return normalizeRoundState(merged);
}

/** Best-effort display name for a round's course, matching the scorecard header. */
export function courseDisplayName(course: Course | null): string {
  if (!course) return 'Unknown course';
  return (
    [course.clubName, course.courseName].filter(Boolean).join(' — ') ||
    course.courseName ||
    course.clubName ||
    'Course'
  );
}

/** A single player's line in a completed-round summary card. */
export interface RoundSummaryPlayer {
  name: string;
  team: 'T1' | 'T2';
  net: number;
  skins: number;
}

/** A completed round reduced to the per-player net/skins shown in history. */
export interface RoundSummary {
  id: string | null;
  courseName: string;
  completedAt: string | null;
  players: RoundSummaryPlayer[];
}

/**
 * Build the scoring context for a bare round state, deriving relative net
 * strokes from the handicap map embedded in the round (legacy `_stateStrokes`).
 */
function roundScoreContext(round: RoundState, players: PlayerMap): ScoreContext | null {
  const course = round.course;
  if (!course) return null;
  const names = [...(round.team1 || []), ...(round.team2 || [])];
  const courseHandicaps = Object.fromEntries(
    names.map((name) => {
      const index = Number(groupPlayerByName(players, name)?.handicapIndex ?? 0);
      return [name, computeWHSCourseHcp(index, course.tee?.slope, course.tee?.rating, course.tee?.parTotal)];
    }),
  );
  return { course, scores: round.scores || {}, strokes: allocateNetStrokes(courseHandicaps) };
}

/**
 * Reduce a completed round to its per-player net + skins, sorted by net
 * (legacy `renderHistory`). Players without a recorded score are dropped.
 */
export function summarizeRound(round: RoundState, players: PlayerMap): RoundSummary {
  const team1 = round.team1 || [];
  const names = [...team1, ...(round.team2 || [])];
  const context = roundScoreContext(round, players);
  const skinsByPlayer = context ? computeSkins(context, names).skinsByPlayer : {};

  const rows: RoundSummaryPlayer[] = names
    .map((name) => ({
      name,
      team: team1.includes(name) ? ('T1' as const) : ('T2' as const),
      net: context ? playerRangeScore(context, name, 0, 18, 'net') : null,
      skins: skinsByPlayer[name] || 0,
    }))
    .filter((row): row is RoundSummaryPlayer => row.net != null)
    .sort((a, b) => a.net - b.net);

  return {
    id: round.id,
    courseName: courseDisplayName(round.course),
    completedAt: null,
    players: rows,
  };
}
