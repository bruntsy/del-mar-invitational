<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { eventFormatLabel, gamesFromEventRound } from '@/domain/events';
import { buildScoreContext } from '@/composables/useEventLeaderboard';
import { getsStroke } from '@/scoring/handicap';
import { playerHoleScore } from '@/scoring/round';
import { puttPenaltyNote } from '@/scoring/puttPoker';
import { runningMatchStatus, type HoleWinner } from '@/scoring/matchStatus';
import { computeEventRoundResult, type EventComponent, type EventRoundRow } from '@/scoring/eventRound';
import { buildBestBallAggyConfig, scoreBestBallAggy, type BestBallAggyResult, type BestBallAggySegmentResult } from '@/scoring/bestBallAggy';
import { buildHighBallLowBallConfig, scoreHighBallLowBall, type HighBallLowBallResult, type HighBallLowBallSegmentResult } from '@/scoring/highBallLowBall';
import { buildTwoManScrambleConfig, scoreTwoManScramble, twoManScrambleTeamKey, type TwoManScrambleResult, type TwoManScrambleSegmentResult } from '@/scoring/twoManScramble';
import type { RotationSixesMatchResult, RotationSixesResult, RotationSixesWinner } from '@/scoring/rotationSixes';
import { useEventStore } from '@/stores/event';
import { useRoundStore } from '@/stores/round';
import type { SkinHoleResult } from '@/scoring/skins';

const store = useRoundStore();
const eventStore = useEventStore();
const router = useRouter();

onMounted(() => {
  if (!store.round) store.load();
  if (store.round?.groupId && !eventStore.event) {
    void eventStore.loadEvent(store.round.groupId).then(() => eventStore.loadLinkedRounds());
  }
  if (typeof window.matchMedia === 'function' && window.matchMedia('(max-width: 760px)').matches) {
    holeView.value = true;
    if (playingGroups.value.length > 1) selectedGroupIndex.value = 0;
  }
  loadMobileHole();
});

const HOLES = Array.from({ length: 18 }, (_, hole) => hole);
const FRONT = HOLES.slice(0, 9);
const BACK = HOLES.slice(9);

const expandedPutts = reactive<Record<string, boolean>>({});
function togglePutts(player: string) {
  expandedPutts[player] = !expandedPutts[player];
}
const skinsDrawerOpen = ref(false);

const course = computed(() => store.course);
const par = computed(() => course.value?.par ?? []);
const si = computed(() => course.value?.si ?? []);
const outPar = computed(() => par.value.slice(0, 9).reduce((a, b) => a + b, 0));
const inPar = computed(() => par.value.slice(9).reduce((a, b) => a + b, 0));

const courseTitle = computed(() => {
  const c = course.value;
  if (!c) return '';
  const club = c.clubName?.trim();
  const courseName = c.courseName?.trim();
  if (club && courseName && club.toLowerCase() !== courseName.toLowerCase()) return `${club} — ${courseName}`;
  return courseName || club || 'Course';
});
const courseSub = computed(() => {
  const c = course.value;
  if (!c) return '';
  return [c.location, c.tee?.name ? `${c.tee.name} tees` : '', roundTypeLabel.value].filter(Boolean).join(' · ');
});

const scorecardTitle = computed(() => {
  const eventRound = activeEventRound.value;
  return eventRound ? `Event Round ${eventRound.index + 1}` : courseTitle.value;
});

const scorecardSub = computed(() => {
  const eventRound = activeEventRound.value;
  if (!eventRound) return courseSub.value;
  return [eventRound.config.name, courseTitle.value, courseSub.value].filter(Boolean).join(' · ');
});

const eventTeamNames = computed(() => {
  const config = activeEventRound.value?.eventConfig;
  return {
    team1: config?.teamNames.team1 || store.round?.teamNames.team1 || 'Team A',
    team2: config?.teamNames.team2 || store.round?.teamNames.team2 || 'Team B',
  };
});

const eventRoundScore = computed(() => {
  const result = activeEventResult.value;
  if (!result) return null;
  return {
    label: 'Round points',
    team1Name: eventTeamNames.value.team1,
    team2Name: eventTeamNames.value.team2,
    team1: result.team1,
    team2: result.team2,
  };
});

const enabledGameLabels = computed(() => {
  const games = store.games;
  const labels: string[] = [];
  if (games.bestBall.enabled) labels.push('Best Ball');
  if (games.bestBallAggy.enabled) labels.push('Best Ball + Aggy');
  if (games.highBallLowBall.enabled) labels.push('High Ball / Low Ball');
  if (games.rotationSixes.enabled) labels.push('Rotation Sixes');
  if (games.twoManScramble.enabled) labels.push('Two-Man Scramble');
  if (games.scramble4.enabled) labels.push('4-Man Scramble');
  if (games.skins.enabled) labels.push('Skins');
  if (games.wolf.enabled) labels.push('Wolf');
  if (games.puttPoker.enabled) labels.push('Putt Poker');
  return labels;
});

const roundTypeLabel = computed(() => {
  const eventRound = activeEventRound.value;
  if (eventRound) return eventFormatLabel(eventRound.config.format);
  return enabledGameLabels.value.slice(0, 2).join(' / ') || 'Ad hoc round';
});

interface TeamRow {
  key: 'team1' | 'team2';
  label: string;
  players: string[];
}
const teamRows = computed<TeamRow[]>(() => {
  const r = store.round;
  if (!r) return [];
  return (['team1', 'team2'] as const)
    .map((key) => ({ key, label: r.teamNames[key], players: r[key] || [] }))
    .filter((team) => team.players.length > 0);
});

function scoreColorClass(gross: number | null, holePar: number): string {
  if (gross == null) return '';
  const diff = gross - holePar;
  if (diff <= -2) return 'score-eagle';
  if (diff === -1) return 'score-birdie';
  if (diff === 0) return 'score-par';
  if (diff === 1) return 'score-bogey';
  return 'score-double';
}

function getsStrokeHere(player: string, hole: number): boolean {
  return getsStroke(store.strokes[player], si.value[hole]);
}

function dash(value: number | null | undefined): string {
  return value == null ? '—' : String(value);
}

function onScoreInput(player: string, hole: number, raw: string) {
  if (raw === '') {
    store.setScore(player, hole, null);
    return;
  }
  const value = Number.parseInt(raw, 10);
  if (Number.isNaN(value)) return;
  store.setScore(player, hole, value);
}

function onPuttInput(player: string, hole: number, raw: string) {
  if (raw === '') {
    store.setPutt(player, hole, null);
    return;
  }
  const value = Number.parseInt(raw, 10);
  if (Number.isNaN(value) || value < 0) return;
  store.setPutt(player, hole, value);
}

function onTeamScoreInput(teamKey: string, hole: number, raw: string) {
  if (raw === '') {
    store.setTeamScore(teamKey, hole, null);
    return;
  }
  const value = Number.parseInt(raw, 10);
  if (Number.isNaN(value) || value < 1) return;
  store.setTeamScore(teamKey, hole, value);
}

function teamScoreSum(teamKey: string, start: number, end: number): number | null {
  let total = 0;
  let any = false;
  for (let hole = start; hole < end; hole += 1) {
    const value = store.readTeamScore(teamKey, hole);
    if (value != null) {
      total += value;
      any = true;
    }
  }
  return any ? total : null;
}

// 0-1 putts read as green, 2 neutral, 3+ red, matching the legacy putt cells.
function puttColorClass(putts: number | null): string {
  if (putts == null) return '';
  if (putts <= 1) return 'putt-good';
  if (putts === 2) return 'putt-ok';
  return 'putt-bad';
}

function puttSum(player: string, start: number, end: number): number | null {
  let total = 0;
  let any = false;
  for (let hole = start; hole < end; hole += 1) {
    const value = store.readPutt(player, hole);
    if (value != null) {
      total += value;
      any = true;
    }
  }
  return any ? total : null;
}

function cardCountLabel(cards: number): string {
  return `${cards} card${cards === 1 ? '' : 's'}`;
}

function puttPokerStateLabel(coinHolder: string | null): string {
  return coinHolder ? `Coin is with ${coinHolder}` : 'No 3 putts yet';
}

function puttPokerPotLabel(pot: number): string {
  return `Pot is $${pot}`;
}

const puttPokerEnabled = computed(() => store.games.puttPoker.enabled);
const scrambleEnabled = computed(() => store.games.scramble4.enabled);
const twoManScrambleEnabled = computed(() => store.games.twoManScramble.enabled);
const rotationSixesEnabled = computed(() => store.games.rotationSixes.enabled);
const skinsEnabled = computed(() => store.games.skins.enabled);
const skinBasisLabel = computed(() => (store.games.skins.type === 'gross' ? 'Gross' : 'Net'));
const skinHoles = computed(() => store.skins.holeResults);
const skinsSummary = computed(() =>
  Object.entries(store.skins.skinsByPlayer)
    .filter(([, skins]) => skins > 0)
    .sort(([, a], [, b]) => b - a),
);
const skinsSummaryText = computed(() => {
  if (!skinHoles.value.length) return 'No completed holes yet';
  if (!skinsSummary.value.length) return 'No skins won yet';
  return skinsSummary.value.map(([player, skins]) => `${player} ${skins}`).join(' · ');
});
const skinRows = computed(() => [
  { label: 'Front 9', holes: skinHoles.value.filter((hole) => hole.hole <= 9) },
  { label: 'Back 9', holes: skinHoles.value.filter((hole) => hole.hole > 9) },
]);

/** One entry per pair match, each with its two team-score rows (keys + labels). */
const twoManScrambleMatches = computed(() => {
  const round = store.round;
  if (!round) return [];
  return (round.pairMatches ?? []).map((match, index) => ({
    index,
    label: `Match ${index + 1}`,
    teams: [
      { key: twoManScrambleTeamKey(index, 'a'), name: (match.a ?? []).join(' + ') || 'Team A', players: match.a ?? [] },
      { key: twoManScrambleTeamKey(index, 'b'), name: (match.b ?? []).join(' + ') || 'Team B', players: match.b ?? [] },
    ],
  }));
});

function holeWinnerClass(_hole: number): string {
  return '';
}

function skinPar(hole: number): number | null {
  return par.value[hole - 1] ?? null;
}

function skinScoreToPar(hole: SkinHoleResult): string {
  const holePar = skinPar(hole.hole);
  if (hole.tied || !hole.winner || holePar == null) return 'No skin';
  const score = hole.effectiveScores[hole.winner];
  if (score == null) return 'Skin won';
  const diff = score - holePar;
  const scoreWord =
    diff <= -3 ? 'albatross' :
    diff === -2 ? 'eagle' :
    diff === -1 ? 'birdie' :
    diff === 0 ? 'par' :
    diff === 1 ? 'bogey' :
    diff === 2 ? 'double bogey' :
    `${diff} over`;
  return `${skinBasisLabel.value} ${scoreWord}`;
}

function skinDetailLabel(hole: SkinHoleResult): string {
  const holePar = skinPar(hole.hole);
  return [holePar == null ? null : `Par ${holePar}`, skinScoreToPar(hole)].filter(Boolean).join(' · ');
}

// ── Match-play visibility (BB+Aggy, High/Low, Two-Man Scramble) ───────────────
// Read-only per-hole derived team scores + hole winners + running match status,
// driven by the existing scoring-module holeResults.

interface MpHole {
  hole: number;
  a: number | null;
  b: number | null;
  winner: HoleWinner;
  status: string;
  leader: 'a' | 'b' | null;
  diff: number;
  matchLabel: string;
  matchShort: string;
}
interface MpContest {
  name: string;
  holes: MpHole[];
  finalLabel: string;
  segments: Array<{
    label: string;
    a: number | null;
    b: number | null;
    status: string;
    resultLabel: string;
    leaderLabel: string;
    scoreLabel: string;
  }>;
}
interface MpMatch {
  label: string;
  sideA: string;
  sideB: string;
  contests: MpContest[];
}
interface MpPanel {
  gameLabel: string;
  basis: string;
  matches: MpMatch[];
}

function toSide(winnerId: string | undefined, tied: boolean, incomplete: boolean, aId: string): HoleWinner {
  if (incomplete) return null;
  if (tied) return 'tie';
  if (winnerId === aId) return 'a';
  if (winnerId != null) return 'b';
  return null;
}

function buildContest<T extends { holeNumber: number; incomplete: boolean }>(
  name: string,
  holeResults: T[],
  sideA: string,
  sideB: string,
  getScore: (hr: T, side: 'a' | 'b') => number | null,
  getWinner: (hr: T) => HoleWinner,
  segments: MpContest['segments'] = [],
): MpContest {
  const winners = holeResults.map(getWinner);
  const status = runningMatchStatus(winners, { closeout: true });
  return {
    name,
    holes: holeResults.map((hr, i) => {
      const s = status[i];
      const side = s?.leader;
      const lead = side ? `${sideInitials(side === 'a' ? sideA : sideB)} +${s.diff}` : 'AS';
      const matchLabel = !s || s.label === 'Pending' ? '–' : s.leader === null ? 'AS' : lead;
      return {
        hole: hr.holeNumber,
        a: getScore(hr, 'a'),
        b: getScore(hr, 'b'),
        winner: winners[i],
        status: s?.label ?? 'Pending',
        leader: s?.leader ?? null,
        diff: s?.diff ?? 0,
        matchLabel,
        matchShort: matchLabel,
      };
    }),
    finalLabel: status.length ? status[status.length - 1].label : 'Pending',
    segments,
  };
}

type SegmentResult = BestBallAggySegmentResult | HighBallLowBallSegmentResult | TwoManScrambleSegmentResult;

const SEGMENT_DISPLAY_RANGES: Record<string, [number, number]> = {
  Front: [0, 9],
  Back: [9, 18],
  Overall: [0, 18],
};

function liveSegmentStanding(
  label: string,
  winners: HoleWinner[],
  aLabel: string,
  bLabel: string,
): Pick<MpContest['segments'][number], 'status' | 'leaderLabel' | 'scoreLabel' | 'resultLabel'> | null {
  const [start, end] = SEGMENT_DISPLAY_RANGES[label] ?? [0, winners.length];
  const segmentWinners = winners.slice(start, end);
  const played = segmentWinners.filter((winner) => winner != null).length;
  if (!played) return null;
  const a = segmentWinners.filter((winner) => winner === 'a').length;
  const b = segmentWinners.filter((winner) => winner === 'b').length;
  if (a === b) {
    return {
      status: 'push',
      leaderLabel: 'All square',
      scoreLabel: `AS thru ${played}`,
      resultLabel: `All square thru ${played}`,
    };
  }
  const side = a > b ? 'a' : 'b';
  const leaderLabel = side === 'a' ? aLabel : bLabel;
  const diff = Math.abs(a - b);
  return {
    status: side,
    leaderLabel,
    scoreLabel: `${diff} up thru ${played}`,
    resultLabel: `${leaderLabel} ${diff} up thru ${played}`,
  };
}

function segmentChips(
  results: Array<{ label: string; result: SegmentResult }>,
  aId: string,
  bId: string,
  aLabel: string,
  bLabel: string,
  mode: 'stroke' | 'match',
  liveWinners: Record<string, HoleWinner[]> = {},
): MpContest['segments'] {
  return results.map(({ label, result }) => {
    const map = mode === 'stroke' ? result.teamScores : result.teamHolesWon;
    const a = result.incomplete || !map ? null : map[aId] ?? null;
    const b = result.incomplete || !map ? null : map[bId] ?? null;
    const live = result.incomplete && mode === 'match'
      ? liveSegmentStanding(label, liveWinners[label] ?? [], aLabel, bLabel)
      : null;
    const status = result.incomplete ? 'open' : result.pushed ? 'push' : result.winnerTeamId === aId ? 'a' : result.winnerTeamId === bId ? 'b' : 'open';
    const resultLabel =
      live?.resultLabel ??
      (a == null || b == null
        ? 'Open'
        : status === 'a'
          ? `${aLabel} ${a}-${b}`
          : status === 'b'
            ? `${bLabel} ${b}-${a}`
            : status === 'push'
              ? `Push ${a}-${b}`
              : `${a}-${b}`);
    const leaderLabel =
      live?.leaderLabel ??
      status === 'a'
        ? aLabel
        : status === 'b'
          ? bLabel
            : status === 'push'
              ? 'Push'
              : 'Open';
    const scoreLabel = live?.scoreLabel ?? (a == null || b == null ? 'Open' : status === 'push' ? `${a}-${b}` : `${Math.max(a, b)}-${Math.min(a, b)}`);
    return { label, a, b, status: live?.status ?? status, resultLabel, leaderLabel, scoreLabel };
  });
}

function panelsFromBestBallAggyResults(results: BestBallAggyResult[], basis: string): MpPanel | null {
  if (!results.length) return null;
  return {
    gameLabel: 'Best Ball + Aggy',
    basis,
    matches: results.map((res, mi) => {
      const [tA, tB] = res.teams;
      const id = (side: 'a' | 'b') => (side === 'a' ? tA.id : tB.id);
      const bestBallWinners = res.holeResults.map((hr) => toSide(hr.bestBallWinnerTeamId, hr.bestBallTied, hr.incomplete, tA.id));
      const aggyWinners = res.holeResults.map((hr) => toSide(hr.aggyWinnerTeamId, hr.aggyTied, hr.incomplete, tA.id));
      return {
        label: `Match ${mi + 1}`,
        sideA: tA.players.join(' + '),
        sideB: tB.players.join(' + '),
        contests: [
          buildContest('Best Ball', res.holeResults,
            tA.players.join(' + '), tB.players.join(' + '),
            (hr, s) => hr.teamScores[id(s)]?.bestBallScore ?? null,
            (hr) => toSide(hr.bestBallWinnerTeamId, hr.bestBallTied, hr.incomplete, tA.id),
            segmentChips([
              { label: 'Front', result: res.segmentResults.bestBall.front },
              { label: 'Back', result: res.segmentResults.bestBall.back },
              { label: 'Overall', result: res.segmentResults.bestBall.overall },
            ], tA.id, tB.id, tA.players.join(' + '), tB.players.join(' + '), res.scoringMode, {
              Front: bestBallWinners,
              Back: bestBallWinners,
              Overall: bestBallWinners,
            })),
          buildContest('Aggregate', res.holeResults,
            tA.players.join(' + '), tB.players.join(' + '),
            (hr, s) => hr.teamScores[id(s)]?.aggyScore ?? null,
            (hr) => toSide(hr.aggyWinnerTeamId, hr.aggyTied, hr.incomplete, tA.id),
            segmentChips([
              { label: 'Front', result: res.segmentResults.aggy.front },
              { label: 'Back', result: res.segmentResults.aggy.back },
              { label: 'Overall', result: res.segmentResults.aggy.overall },
            ], tA.id, tB.id, tA.players.join(' + '), tB.players.join(' + '), res.scoringMode, {
              Front: aggyWinners,
              Back: aggyWinners,
              Overall: aggyWinners,
            })),
        ],
      };
    }),
  };
}

function panelsFromHighLowResults(results: HighBallLowBallResult[], basis: string): MpPanel | null {
  if (!results.length) return null;
  return {
    gameLabel: 'High Ball / Low Ball',
    basis,
    matches: results.map((res, mi) => {
      const [tA, tB] = res.teams;
      const id = (side: 'a' | 'b') => (side === 'a' ? tA.id : tB.id);
      const lowBallWinners = res.holeResults.map((hr) => toSide(hr.lowBallWinnerTeamId, hr.lowBallTied, hr.incomplete, tA.id));
      const highBallWinners = res.holeResults.map((hr) => toSide(hr.highBallWinnerTeamId, hr.highBallTied, hr.incomplete, tA.id));
      return {
        label: `Match ${mi + 1}`,
        sideA: tA.players.join(' + '),
        sideB: tB.players.join(' + '),
        contests: [
          buildContest('Low Ball', res.holeResults,
            tA.players.join(' + '), tB.players.join(' + '),
            (hr, s) => hr.teamScores[id(s)]?.lowBallScore ?? null,
            (hr) => toSide(hr.lowBallWinnerTeamId, hr.lowBallTied, hr.incomplete, tA.id),
            segmentChips([
              { label: 'Front', result: res.segmentResults.lowBall.front },
              { label: 'Back', result: res.segmentResults.lowBall.back },
              { label: 'Overall', result: res.segmentResults.lowBall.overall },
            ], tA.id, tB.id, tA.players.join(' + '), tB.players.join(' + '), res.scoringMode, {
              Front: lowBallWinners,
              Back: lowBallWinners,
              Overall: lowBallWinners,
            })),
          buildContest('High Ball', res.holeResults,
            tA.players.join(' + '), tB.players.join(' + '),
            (hr, s) => hr.teamScores[id(s)]?.highBallScore ?? null,
            (hr) => toSide(hr.highBallWinnerTeamId, hr.highBallTied, hr.incomplete, tA.id),
            segmentChips([
              { label: 'Front', result: res.segmentResults.highBall.front },
              { label: 'Back', result: res.segmentResults.highBall.back },
              { label: 'Overall', result: res.segmentResults.highBall.overall },
            ], tA.id, tB.id, tA.players.join(' + '), tB.players.join(' + '), res.scoringMode, {
              Front: highBallWinners,
              Back: highBallWinners,
              Overall: highBallWinners,
            })),
        ],
      };
    }),
  };
}

function panelsFromTwoManScrambleResults(results: TwoManScrambleResult[]): MpPanel | null {
  if (!results.length) return null;
  return {
    gameLabel: 'Two-Man Scramble',
    basis: 'gross',
    matches: results.map((res, mi) => {
      const [tA, tB] = res.teams;
      const id = (side: 'a' | 'b') => (side === 'a' ? tA.id : tB.id);
      const scrambleWinners = res.holeResults.map((hr) => toSide(hr.winnerTeamId, hr.tied, hr.incomplete, tA.id));
      return {
        label: `Match ${mi + 1}`,
        sideA: tA.players.join(' + '),
        sideB: tB.players.join(' + '),
        contests: [
          buildContest('Scramble', res.holeResults,
            tA.players.join(' + '), tB.players.join(' + '),
            (hr, s) => hr.teamScores[id(s)]?.scrambleScore ?? null,
            (hr) => toSide(hr.winnerTeamId, hr.tied, hr.incomplete, tA.id),
            segmentChips([
              { label: 'Front', result: res.segmentResults.front },
              { label: 'Back', result: res.segmentResults.back },
              { label: 'Overall', result: res.segmentResults.overall },
            ], tA.id, tB.id, tA.players.join(' + '), tB.players.join(' + '), res.scoringMode, {
              Front: scrambleWinners,
              Back: scrambleWinners,
              Overall: scrambleWinners,
            })),
        ],
      };
    }),
  };
}

function rotationVariantLabel(variant: RotationSixesResult['variant']): string {
  if (variant === 'high_low') return 'High / Low';
  if (variant === 'best_ball_aggy') return 'Best Ball + Aggy';
  return 'Best Ball';
}

function titleCase(value: string): string {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : value;
}

function rotationWinnerToHoleWinner(winner: RotationSixesWinner): HoleWinner {
  if (winner === 'a' || winner === 'b') return winner;
  if (winner === 'push') return 'tie';
  return null;
}

function rotationMatchLabel(match: RotationSixesMatchResult): string {
  if (!match.holesPlayed) return 'Open';
  const sideA = match.match.sideA.join(' + ');
  const sideB = match.match.sideB.join(' + ');
  if (!match.complete) {
    if (match.sideAPoints === match.sideBPoints) return `All square thru ${match.holesPlayed}`;
    const leader = match.sideAPoints > match.sideBPoints ? sideA : sideB;
    return `${leader} leads ${Math.max(match.sideAPoints, match.sideBPoints)}-${Math.min(match.sideAPoints, match.sideBPoints)} thru ${match.holesPlayed}`;
  }
  if (match.winnerSide === 'push') return `Push ${match.sideAPoints}-${match.sideBPoints}`;
  const winner = match.winnerSide === 'a' ? sideA : sideB;
  return `${winner} wins ${Math.max(match.sideAPoints, match.sideBPoints)}-${Math.min(match.sideAPoints, match.sideBPoints)}`;
}

const currentRotationMatch = computed(() => {
  if (!rotationSixesEnabled.value) return null;
  const result = store.rotationSixesResult;
  if (!result?.valid) return null;
  return result.matches.find((match) => {
    const [start, end] = match.match.holes;
    return mobileHole.value >= start && mobileHole.value < end;
  }) ?? null;
});

const mobileRotationContext = computed(() => {
  const match = currentRotationMatch.value;
  if (!match) return null;
  return {
    label: match.match.label,
    matchup: `${match.match.sideA.join(' + ')} vs ${match.match.sideB.join(' + ')}`,
    basis: `${titleCase(store.games.rotationSixes.scoreBasis)} ${rotationVariantLabel(store.games.rotationSixes.variant)}`,
    status: rotationMatchLabel(match),
  };
});

function panelsFromRotationSixesResult(result: RotationSixesResult | null): MpPanel | null {
  if (!result?.valid || !result.matches.length) return null;
  return {
    gameLabel: 'Rotation Sixes',
    basis: `${titleCase(result.scoreBasis)} ${rotationVariantLabel(result.variant)}`,
    matches: result.matches.map((match) => {
      const sideA = match.match.sideA.join(' + ');
      const sideB = match.match.sideB.join(' + ');
      return {
        label: match.match.label,
        sideA,
        sideB,
        contests: match.components.map((component) => ({
          name: component.label,
          finalLabel: rotationMatchLabel(match),
          holes: match.holeResults.map((hole) => {
            const detail = hole.components.find((entry) => entry.key === component.key);
            return {
              hole: hole.holeNumber,
              a: detail?.sideAScore ?? null,
              b: detail?.sideBScore ?? null,
              winner: rotationWinnerToHoleWinner(detail?.winnerSide ?? 'open'),
              status: detail?.winnerSide === 'open' ? 'Pending' : detail?.winnerSide === 'push' ? 'Push' : detail?.winnerSide === 'a' ? `${sideA} wins hole` : `${sideB} wins hole`,
              leader: null,
              diff: 0,
              matchLabel: detail?.winnerSide === 'open' ? '–' : detail?.winnerSide === 'push' ? '½' : sideInitials(detail?.winnerSide === 'a' ? sideA : sideB),
              matchShort: detail?.winnerSide === 'open' ? '–' : detail?.winnerSide === 'push' ? '½' : sideInitials(detail?.winnerSide === 'a' ? sideA : sideB),
            };
          }),
          segments: [{
            label: 'Match',
            a: match.sideAPoints,
            b: match.sideBPoints,
            status: match.winnerSide === 'open' ? 'open' : match.winnerSide === 'push' ? 'push' : match.winnerSide,
            resultLabel: rotationMatchLabel(match),
            leaderLabel: match.winnerSide === 'open'
              ? 'Open'
              : match.winnerSide === 'push'
                ? 'Push'
                : match.winnerSide === 'a'
                  ? sideA
                  : sideB,
            scoreLabel: match.complete
              ? `${match.sideAPoints}-${match.sideBPoints}`
              : `${match.sideAPoints}-${match.sideBPoints} thru ${match.holesPlayed}`,
          }],
        })),
      };
    }),
  };
}

const matchPlayPanels = computed<MpPanel[]>(() => {
  const panels: MpPanel[] = [];
  const eventRound = activeEventRound.value;
  const eventScoreContext = eventRound && store.round ? buildScoreContext(store.round, store.players) : null;

  if (eventRound && eventScoreContext && store.round) {
    const games = gamesFromEventRound(eventRound.config);
    if (eventRound.config.format === 'twoManBestBallAggy') {
      const panel = panelsFromBestBallAggyResults(
        eventRound.config.pairMatches.map((match) =>
          scoreBestBallAggy(buildBestBallAggyConfig(match, games.bestBallAggy), eventScoreContext),
        ),
        games.bestBallAggy.scoreBasis,
      );
      if (panel) panels.push(panel);
    } else if (eventRound.config.format === 'twoManHighBallLowBall') {
      const panel = panelsFromHighLowResults(
        eventRound.config.pairMatches.map((match) =>
          scoreHighBallLowBall(buildHighBallLowBallConfig(match, games.highBallLowBall), eventScoreContext),
        ),
        games.highBallLowBall.scoreBasis,
      );
      if (panel) panels.push(panel);
    } else if (eventRound.config.format === 'scramble2v2Nassau') {
      const panel = panelsFromTwoManScrambleResults(
        eventRound.config.pairMatches.map((match, index) => {
          const config = buildTwoManScrambleConfig(match, index, games.twoManScramble);
          return scoreTwoManScramble(config, {
            [twoManScrambleTeamKey(index, 'a')]: store.round?.teamScores?.[twoManScrambleTeamKey(index, 'a')],
            [twoManScrambleTeamKey(index, 'b')]: store.round?.teamScores?.[twoManScrambleTeamKey(index, 'b')],
          });
        }),
      );
      if (panel) panels.push(panel);
    }

    if (panels.length) return panels;
  }

  const aggy = store.bestBallAggyResults;
  const aggyPanel = panelsFromBestBallAggyResults(aggy, store.games.bestBallAggy.scoreBasis);
  if (aggyPanel) panels.push(aggyPanel);

  const highLow = store.highBallLowBallResults;
  const highLowPanel = panelsFromHighLowResults(highLow, store.games.highBallLowBall.scoreBasis);
  if (highLowPanel) panels.push(highLowPanel);

  const scramble = store.twoManScrambleResults;
  const scramblePanel = panelsFromTwoManScrambleResults(scramble);
  if (scramblePanel) panels.push(scramblePanel);

  const rotationPanel = panelsFromRotationSixesResult(store.rotationSixesResult);
  if (rotationPanel) panels.push(rotationPanel);

  return panels;
});

const hasMatchPlayPanels = computed(() => matchPlayPanels.value.length > 0);

const activeEventRound = computed(() => {
  const roundId = store.round?.id;
  const event = eventStore.event;
  if (!roundId || !event) return null;
  const index = event.config.rounds.findIndex((round) => round.roundId === roundId);
  if (index < 0) return null;
  return { index, config: event.config.rounds[index], eventConfig: event.config };
});

const activeEventResult = computed(() => {
  const eventRound = activeEventRound.value;
  const round = store.round;
  if (!eventRound || !round) return null;
  const ctx = buildScoreContext(round, store.players);
  if (!ctx) return null;
  return computeEventRoundResult({
    round: eventRound.config,
    roundIndex: eventRound.index,
    scoreContext: ctx,
    games: gamesFromEventRound(eventRound.config),
    pairMatches: eventRound.config.pairMatches,
    team1: eventRound.eventConfig.team1,
    team2: eventRound.eventConfig.team2,
    teamScores: round.teamScores,
  });
});

function eventRowTotals(row: EventRoundRow): { team1: number; team2: number } {
  return row.components.reduce(
    (acc, component) => ({ team1: acc.team1 + component.team1, team2: acc.team2 + component.team2 }),
    { team1: 0, team2: 0 },
  );
}

function eventMatchLeader(row: EventRoundRow): string {
  const totals = eventRowTotals(row);
  if (totals.team1 === 0 && totals.team2 === 0) return 'Open';
  if (totals.team1 === totals.team2) return 'All square';
  return totals.team1 > totals.team2 ? `${row.aPlayers.join(' + ')} leads` : `${row.bPlayers.join(' + ')} leads`;
}

function eventComponentClass(component: EventComponent): string {
  if (component.winner === 'team1') return 'event-chip-team1';
  if (component.winner === 'team2') return 'event-chip-team2';
  if (component.winner === 'tie') return 'event-chip-tie';
  return 'event-chip-open';
}

function eventComponentLabel(component: EventComponent, row: EventRoundRow): string {
  if (component.winner === 'open') return `${component.label}: open`;
  if (component.winner === 'team1') return `${component.label}: ${row.aPlayers.join(' + ')} ${component.team1}-${component.team2}`;
  if (component.winner === 'team2') return `${component.label}: ${row.bPlayers.join(' + ')} ${component.team2}-${component.team1}`;
  return `${component.label}: Push ${component.team1}-${component.team2}`;
}

function sideInitials(label: string): string {
  return label
    .split(/\s+\+\s+|\s+\/\s+/)
    .map((part) => part.trim()[0])
    .filter(Boolean)
    .join('+');
}

function holeMark(winner: HoleWinner, match: MpMatch): string {
  if (winner === 'a') return sideInitials(match.sideA);
  if (winner === 'b') return sideInitials(match.sideB);
  if (winner === 'tie') return '½';
  return '·';
}

// C1 Part B: which player contributed the best ball score for a team on a hole
const bestBallEnabled = computed(() => store.games.bestBall.enabled);

function bestBallContributor(teamPlayers: string[], hole: number): string | null {
  if (!bestBallEnabled.value) return null;
  const context = store.scoreContext;
  if (!context) return null;
  const type = store.games.bestBall.type ?? 'net';
  let best: string | null = null;
  let bestScore = Infinity;
  for (const player of teamPlayers) {
    const score = playerHoleScore(context, player, hole, type);
    if (score == null) continue;
    if (score < bestScore) { bestScore = score; best = player; }
  }
  return best;
}

const wolf = computed(() => store.wolfResult);
const wolfVisible = computed(() => wolf.value.enabled && wolf.value.rows.length > 0);
interface PuttGroup {
  name: string;
  players: string[];
}
const puttGroups = computed<PuttGroup[]>(() => {
  const r = store.round;
  if (!r) return [];
  const groups = (r.playingGroups || []).filter((group) => group.players.length > 0);
  if (groups.length) return groups.map((group) => ({ name: group.name, players: group.players }));
  return teamRows.value.map((team) => ({ name: team.label, players: team.players }));
});

function loadDemo() {
  // imported lazily to keep the demo fixture out of the production-critical path
  void import('@/fixtures/demoRound').then(({ demoRound }) => {
    const { round, players } = demoRound();
    store.setRound(round, players);
  });
}

function goGroup() {
  void router.push('/group');
}

function goResults() {
  void router.push('/results');
}

function wolfField(row: (typeof wolf.value.rows)[number]): string {
  return row.result.sideB.join(' + ') || '—';
}

// ── Playing group filter ──────────────────────────────────────────────────────

const playingGroups = computed(() => {
  const r = store.round;
  if (!r) return [];
  const defined = (r.playingGroups || []).filter((g) => g.players.length > 0);
  if (defined.length) return defined;
  if (rotationSixesEnabled.value) return [];
  return teamRows.value.map((t) => ({ name: t.label, players: t.players }));
});

const selectedGroupIndex = ref(-1); // -1 = show all

const activeGroupPlayers = computed<Set<string>>(() => {
  if (selectedGroupIndex.value < 0) return new Set(store.playerNames);
  return new Set(playingGroups.value[selectedGroupIndex.value]?.players ?? []);
});

const visibleTwoManScrambleMatches = computed(() =>
  twoManScrambleMatches.value.filter((match) =>
    match.teams.some((team) => team.players.some((player) => activeGroupPlayers.value.has(player))),
  ),
);

const activeMobileGroup = computed(() => {
  if (!holeView.value || playingGroups.value.length <= 1) return null;
  const index = selectedGroupIndex.value >= 0 ? selectedGroupIndex.value : 0;
  return playingGroups.value[index] ?? null;
});

const mobileEventGroupContext = computed(() => {
  const round = store.round;
  const group = activeMobileGroup.value;
  if (!round || !group || !activeEventRound.value) return null;
  const team1 = group.players.filter((player) => (round.team1 || []).includes(player));
  const team2 = group.players.filter((player) => (round.team2 || []).includes(player));
  return {
    groupName: group.name,
    team1Name: eventTeamNames.value.team1,
    team2Name: eventTeamNames.value.team2,
    team1,
    team2,
  };
});

const filteredTeamRows = computed(() =>
  teamRows.value
    .map((team) => ({ ...team, players: team.players.filter((p) => activeGroupPlayers.value.has(p)) }))
    .filter((team) => team.players.length > 0),
);

// Group mode: when playing groups exist, render by group instead of by team.
const groupModeActive = computed(() => playingGroups.value.length > 1);

interface DisplaySection {
  key: string;
  type: 'groupHeader' | 'teamSection';
  name: string;
  teamKey: 'team1' | 'team2' | null;
  players: string[];
}

const displaySections = computed<DisplaySection[]>(() => {
  const round = store.round;
  if (!round) return [];

  if (rotationSixesEnabled.value) {
    return [{
      key: 'rotation-sixes-roster',
      type: 'teamSection' as const,
      name: 'Rotation Sixes golfers',
      teamKey: null,
      players: store.playerNames.slice(0, 4),
    }];
  }

  if (!groupModeActive.value) {
    return filteredTeamRows.value.map((team) => ({
      key: team.key,
      type: 'teamSection' as const,
      name: team.label,
      teamKey: team.key,
      players: team.players,
    }));
  }

  const visibleGroups = selectedGroupIndex.value < 0
    ? playingGroups.value
    : [playingGroups.value[selectedGroupIndex.value]].filter(Boolean);

  const team1Set = new Set(round.team1 || []);
  const team2Set = new Set(round.team2 || []);
  const sections: DisplaySection[] = [];

  for (const [gi, group] of visibleGroups.entries()) {
    sections.push({ key: `gh-${gi}`, type: 'groupHeader', name: group.name, teamKey: null, players: [] });
    const t1 = group.players.filter((p) => team1Set.has(p));
    const t2 = group.players.filter((p) => team2Set.has(p));
    if (t1.length) sections.push({ key: `gs-${gi}-t1`, type: 'teamSection', name: round.teamNames.team1, teamKey: 'team1', players: t1 });
    if (t2.length) sections.push({ key: `gs-${gi}-t2`, type: 'teamSection', name: round.teamNames.team2, teamKey: 'team2', players: t2 });
  }

  return sections;
});

// ── Mobile hole-by-hole mode ──────────────────────────────────────────────────

const mobileHoleKey = computed(() => `dmi_mobile_hole_${store.round?.id ?? 'local'}`);
const holeView = ref(false);
const fullScorecardOpen = ref(false);
const mobileHole = ref(0);
const openMobileMatchKey = ref<string | null>(null);

function loadMobileHole() {
  try {
    const saved = localStorage.getItem(mobileHoleKey.value);
    if (saved != null) mobileHole.value = Math.min(17, Math.max(0, Number(saved)));
  } catch { /* ignore */ }
}

watch(mobileHole, (hole) => {
  try { localStorage.setItem(mobileHoleKey.value, String(hole)); } catch { /* ignore */ }
});

function prevHole() { if (mobileHole.value > 0) mobileHole.value -= 1; }

function nextIncompleteHole(fromHole = mobileHole.value) {
  for (let hole = fromHole + 1; hole < 18; hole += 1) {
    if (!mobileHoleComplete(hole)) return hole;
  }
  return null;
}

function nextHole() {
  const nextOpen = nextIncompleteHole();
  if (nextOpen != null) {
    mobileHole.value = nextOpen;
    return;
  }
  if (mobileHole.value < 17) mobileHole.value += 1;
}

function adjustScore(player: string, delta: number) {
  const current = store.readScore(player, mobileHole.value) ?? par.value[mobileHole.value] ?? 0;
  const next = Math.max(1, current + delta);
  store.setScore(player, mobileHole.value, next);
}

function adjustTeamScore(teamKey: string, delta: number) {
  const current = store.readTeamScore(teamKey, mobileHole.value) ?? par.value[mobileHole.value] ?? 0;
  const next = Math.max(1, current + delta);
  store.setTeamScore(teamKey, mobileHole.value, next);
}

function adjustPutt(player: string, delta: number) {
  const current = store.readPutt(player, mobileHole.value) ?? 2;
  const next = Math.max(0, current + delta);
  store.setPutt(player, mobileHole.value, next);
}

function fillMissingMobileScoresWithPar(hole = mobileHole.value) {
  const holePar = par.value[hole];
  if (!holePar) return;
  if (twoManScrambleEnabled.value) {
    for (const team of mobileScrambleTeams.value) {
      if (store.readTeamScore(team.key, hole) == null) store.setTeamScore(team.key, hole, holePar);
    }
    return;
  }
  for (const player of mobilePlayers.value) {
    if (store.readScore(player, hole) == null) store.setScore(player, hole, holePar);
  }
}

function fillMissingMobilePutts(hole = mobileHole.value) {
  if (twoManScrambleEnabled.value) return;
  for (const player of mobilePlayers.value) {
    if (store.readPutt(player, hole) == null) store.setPutt(player, hole, 2);
  }
}

const mobilePlayers = computed(() => {
  const mobileGroup = activeMobileGroup.value;
  if (mobileGroup) return mobileGroup.players;
  if (selectedGroupIndex.value >= 0) {
    return playingGroups.value[selectedGroupIndex.value]?.players ?? store.playerNames;
  }
  return store.playerNames;
});

const mobileScrambleTeams = computed(() =>
  visibleTwoManScrambleMatches.value.flatMap((match) =>
    match.teams.filter((team) => team.players.some((player) => activeGroupPlayers.value.has(player))),
  ),
);

function mobileHoleMissingLabels(hole: number) {
  if (twoManScrambleEnabled.value) {
    return mobileScrambleTeams.value
      .filter((team) => store.readTeamScore(team.key, hole) == null)
      .map((team) => team.name);
  }
  return mobilePlayers.value.filter((player) => store.readScore(player, hole) == null);
}

function mobileHoleComplete(hole: number) {
  return mobileHoleMissingLabels(hole).length === 0;
}

const mobileCurrentMissing = computed(() => mobileHoleMissingLabels(mobileHole.value));
const mobileHoleStatus = computed(() => {
  if (!mobilePlayers.value.length && !mobileScrambleTeams.value.length) return 'No players';
  return mobileCurrentMissing.value.length
    ? `Missing ${mobileCurrentMissing.value.length}`
    : 'Hole complete';
});
const mobileEntryCount = computed(() => (twoManScrambleEnabled.value ? mobileScrambleTeams.value.length : mobilePlayers.value.length));
const mobileNextOpenLabel = computed(() => {
  const nextOpen = nextIncompleteHole();
  return nextOpen == null ? 'Next hole' : `Next open: ${nextOpen + 1}`;
});
const mobileFillParDisabled = computed(() => mobileCurrentMissing.value.length === 0);
const mobileFillParLabel = computed(() => `Fill missing par ${par.value[mobileHole.value] ?? ''}`.trim());
const mobileStatusDetail = computed(() => {
  if (mobileCurrentMissing.value.length) return mobileCurrentMissing.value.join(' · ');
  if (!mobileEntryCount.value) return '';
  return `${mobileEntryCount.value} of ${mobileEntryCount.value} entered`;
});

function mobileContestLabel(game: string, contest: string): string {
  if (game === 'High Ball / Low Ball') return contest;
  if (game === 'Best Ball + Aggy') return contest;
  if (game === 'Two-Man Scramble') return 'Scramble';
  return contest || game;
}

function mobileMatchKey(game: string, match: string, contest: string) {
  return `${game}-${match}-${contest}`;
}

const mobileMatchSummaries = computed(() =>
  matchPlayPanels.value.flatMap((panel) =>
    panel.matches
      .filter((match) => {
        if (selectedGroupIndex.value < 0) return true;
        const active = activeGroupPlayers.value;
        const matchPlayers = [...match.sideA.split(' + '), ...match.sideB.split(' + ')];
        return matchPlayers.some((player) => active.has(player));
      })
      .flatMap((match) =>
        match.contests.map((contest) => {
        const hole = contest.holes.find((h) => h.hole === mobileHole.value + 1);
        if (!hole) return null;
        return {
          key: mobileMatchKey(panel.gameLabel, match.label, contest.name),
          game: mobileContestLabel(panel.gameLabel, contest.name),
          match: `${match.sideA} vs ${match.sideB}`,
          holeScore: hole ? `${hole.a ?? '–'}-${hole.b ?? '–'}` : '–',
          standing: hole?.matchShort ?? 'Open',
          status: hole?.status && hole.status !== 'Pending' ? hole.status : 'Open',
          leader: hole?.leader ?? null,
        };
      }),
    ),
  ).filter((summary): summary is NonNullable<typeof summary> => !!summary?.status),
);

const mobileOpenMatchDetail = computed(() => {
  const key = openMobileMatchKey.value;
  if (!key) return null;
  for (const panel of matchPlayPanels.value) {
    for (const match of panel.matches) {
      for (const contest of match.contests) {
        if (mobileMatchKey(panel.gameLabel, match.label, contest.name) === key) {
          return { panel, match, contest };
        }
      }
    }
  }
  return null;
});

function toggleMobileMatchDetail(key: string) {
  openMobileMatchKey.value = openMobileMatchKey.value === key ? null : key;
}

function ensureMobileHoleDefaults() {
  if (!holeView.value) return;
  fillMissingMobileScoresWithPar(mobileHole.value);
  fillMissingMobilePutts(mobileHole.value);
}

watch(
  () => [
    holeView.value,
    mobileHole.value,
    twoManScrambleEnabled.value,
    par.value[mobileHole.value],
    mobilePlayers.value.join('|'),
    mobileScrambleTeams.value.map((team) => team.key).join('|'),
  ],
  () => ensureMobileHoleDefaults(),
  { immediate: true, flush: 'post' },
);
</script>

<template>
  <main class="sc-shell">
    <template v-if="store.round && course">
      <header class="sc-topbar">
        <div>
          <p v-if="activeEventRound" class="sc-kicker">Team event scorecard</p>
          <h1 class="sc-title">{{ scorecardTitle }}</h1>
          <p class="sc-sub">{{ scorecardSub }}</p>
          <div class="sync-status" :class="{ error: store.syncError }" role="status">
            <span>{{ store.syncStatusLabel }}</span>
            <button v-if="store.syncError && store.round?.id" type="button" @click="store.retrySync()">Retry</button>
          </div>
          <div v-if="eventRoundScore" class="event-score-banner" aria-label="Event round score">
            <span>{{ eventRoundScore.label }}</span>
            <strong>{{ eventRoundScore.team1Name }} {{ eventRoundScore.team1 }} - {{ eventRoundScore.team2 }} {{ eventRoundScore.team2Name }}</strong>
          </div>
        </div>
        <div class="sc-topbar-actions">
          <button class="btn-primary" type="button" @click="goResults">Results →</button>
          <button class="btn-ghost" type="button" @click="router.push('/setup?edit=1')">Edit round</button>
          <button class="btn-ghost" type="button" @click="goGroup">
            {{ activeEventRound ? 'Back to event' : 'Back to group' }}
          </button>
        </div>
      </header>

      <!-- Group filter (shown when more than one playing group exists) -->
      <div v-if="playingGroups.length > 1" class="group-filter">
        <span class="group-filter-label">Playing group</span>
        <button
          v-if="!holeView"
          class="gf-btn"
          :class="{ active: selectedGroupIndex === -1 }"
          type="button"
          @click="selectedGroupIndex = -1"
        >All</button>
        <button
          v-for="(group, gi) in playingGroups"
          :key="group.name"
          class="gf-btn"
          :class="{ active: selectedGroupIndex === gi }"
          type="button"
          @click="selectedGroupIndex = gi"
        >{{ group.name }}</button>
      </div>

      <!-- Mobile hole-by-hole card -->
      <div v-if="holeView" class="mobile-card">
        <div class="mobile-hole-nav">
          <button class="btn-ghost" type="button" :disabled="mobileHole === 0" @click="prevHole">←</button>
          <div class="mobile-hole-info">
            <span class="mobile-hole-num">Hole {{ mobileHole + 1 }}</span>
            <span class="mobile-hole-par">Par {{ par[mobileHole] }}</span>
            <span class="mobile-hole-si">Hcp {{ si[mobileHole] }}</span>
            <span class="mobile-hole-course">{{ courseTitle }} · {{ course?.tee?.name ?? 'Tee' }} tees</span>
          </div>
          <button class="btn-ghost mobile-next-hole" type="button" :disabled="mobileHole === 17" @click="nextHole">
            <span>→</span>
            <small>{{ mobileNextOpenLabel }}</small>
          </button>
        </div>

        <div class="mobile-hole-utility">
          <div class="mobile-hole-status" :class="{ complete: mobileCurrentMissing.length === 0 }">
            <strong>{{ mobileHoleStatus }}</strong>
            <span>{{ mobileStatusDetail }}</span>
          </div>
          <button
            v-if="!mobileFillParDisabled"
            class="btn-ghost mobile-fill-par"
            type="button"
            @click="() => fillMissingMobileScoresWithPar()"
          >
            {{ mobileFillParLabel }}
          </button>
        </div>

        <div v-if="mobileEventGroupContext" class="mobile-event-context">
          <div>
            <span class="mobile-event-label">{{ mobileEventGroupContext.groupName }}</span>
            <strong class="mobile-event-matchup">
              {{ mobileEventGroupContext.team1Name }} vs {{ mobileEventGroupContext.team2Name }}
            </strong>
          </div>
          <div v-if="eventRoundScore" class="mobile-event-score">
            <span>Round total</span>
            <strong>{{ eventRoundScore.team1Name }} {{ eventRoundScore.team1 }} - {{ eventRoundScore.team2 }} {{ eventRoundScore.team2Name }}</strong>
          </div>
        </div>

        <div v-else-if="mobileRotationContext" class="mobile-event-context mobile-rotation-context">
          <div>
            <span class="mobile-event-label">{{ mobileRotationContext.label }}</span>
            <strong class="mobile-event-matchup">{{ mobileRotationContext.matchup }}</strong>
            <small>{{ mobileRotationContext.basis }}</small>
          </div>
          <div class="mobile-event-score">
            <span>Match score</span>
            <strong>{{ mobileRotationContext.status }}</strong>
          </div>
        </div>

        <div v-if="mobileMatchSummaries.length" class="mobile-match-status">
          <div v-for="summary in mobileMatchSummaries" :key="summary.key" class="mobile-match-row">
            <div>
              <span>{{ summary.game }}</span>
              <em>{{ summary.match }}</em>
              <small>Hole {{ mobileHole + 1 }}: {{ summary.holeScore }}</small>
            </div>
            <strong :class="`mobile-match-${summary.leader ?? 'open'}`">{{ summary.standing }}</strong>
            <button class="mobile-match-open" type="button" @click="toggleMobileMatchDetail(summary.key)">
              {{ openMobileMatchKey === summary.key ? 'Close' : 'Open' }}
            </button>
          </div>
        </div>

        <div class="mobile-score-key" :title="twoManScrambleEnabled ? 'Two-Man Scramble uses one gross team score per side.' : 'Dot means stroke received. Green marks birdie or better. Red marks bogey or worse.'">
          <template v-if="twoManScrambleEnabled">
            <span>Team score per side</span>
          </template>
          <template v-else>
            <span><i class="mobile-stroke-dot">●</i> Stroke</span>
          </template>
          <span>Green birdie</span>
          <span>Red bogey+</span>
        </div>

        <div v-if="twoManScrambleEnabled" class="mobile-players">
          <div v-for="team in mobileScrambleTeams" :key="team.key" class="mobile-player-row mobile-scramble-row">
            <div class="mobile-player-meta">
              <div class="mobile-player-name">{{ team.name }}</div>
              <div class="mobile-player-hcp">Scramble team</div>
            </div>
            <div class="mobile-score-block">
              <div class="mobile-field-label">Team score</div>
              <div class="mobile-stepper" :class="scoreColorClass(store.readTeamScore(team.key, mobileHole), par[mobileHole])">
                <button class="stepper-btn" type="button" @click="adjustTeamScore(team.key, -1)">−</button>
                <input
                  type="number"
                  inputmode="numeric"
                  min="1"
                  max="20"
                  class="mobile-score-input"
                  :value="store.readTeamScore(team.key, mobileHole) ?? ''"
                  @input="onTeamScoreInput(team.key, mobileHole, ($event.target as HTMLInputElement).value)"
                  @focus="($event.target as HTMLInputElement).select()"
                />
                <button class="stepper-btn" type="button" @click="adjustTeamScore(team.key, 1)">+</button>
              </div>
              <div v-if="store.readTeamScore(team.key, mobileHole) == null" class="mobile-field-error">Missing</div>
            </div>
          </div>
        </div>

        <div v-else class="mobile-players">
          <div class="mobile-entry-header" aria-hidden="true">
            <span></span>
            <span>Score</span>
            <span>Putts</span>
          </div>
          <div
            v-for="player in mobilePlayers"
            :key="player"
            class="mobile-player-row mobile-player-row-putts"
          >
            <div class="mobile-player-meta">
              <div class="mobile-player-name">{{ player }}</div>
              <div class="mobile-player-hcp">
                Hcp {{ store.courseHandicaps[player] }}
                <span v-if="getsStrokeHere(player, mobileHole)" class="mobile-stroke-dot">●</span>
              </div>
            </div>
            <div class="mobile-entry-controls">
              <div class="mobile-score-block">
                <div class="mobile-stepper" :class="scoreColorClass(store.readScore(player, mobileHole), par[mobileHole])">
                  <button class="stepper-btn" type="button" @click="adjustScore(player, -1)">−</button>
                  <input
                    type="number"
                    inputmode="numeric"
                    min="1"
                    max="20"
                    class="mobile-score-input"
                    :aria-label="`${player} score`"
                    :value="store.readScore(player, mobileHole) ?? ''"
                    @input="onScoreInput(player, mobileHole, ($event.target as HTMLInputElement).value)"
                    @focus="($event.target as HTMLInputElement).select()"
                  />
                  <button class="stepper-btn" type="button" @click="adjustScore(player, 1)">+</button>
                </div>
                <div v-if="store.readScore(player, mobileHole) == null" class="mobile-field-error">Missing</div>
              </div>
              <div class="mobile-score-block">
                <div class="mobile-stepper" :class="puttColorClass(store.readPutt(player, mobileHole))">
                  <button class="stepper-btn" type="button" @click="adjustPutt(player, -1)">−</button>
                  <input
                    type="number"
                    inputmode="numeric"
                    min="0"
                    max="9"
                    class="mobile-score-input"
                    :aria-label="`${player} putts`"
                    :value="store.readPutt(player, mobileHole) ?? ''"
                    @input="onPuttInput(player, mobileHole, ($event.target as HTMLInputElement).value)"
                    @focus="($event.target as HTMLInputElement).select()"
                  />
                  <button class="stepper-btn" type="button" @click="adjustPutt(player, 1)">+</button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Hole strip for quick navigation -->
        <div class="mobile-hole-strip">
          <button
            v-for="h in HOLES"
            :key="`strip-${h}`"
            class="strip-btn"
            :class="{
              active: mobileHole === h,
              filled: twoManScrambleEnabled
                ? mobileScrambleTeams.some(team => store.readTeamScore(team.key, h) != null)
                : mobilePlayers.some(p => store.readScore(p, h) != null)
            }"
            type="button"
            @click="mobileHole = h"
          >{{ h + 1 }}</button>
        </div>

        <div class="mobile-card-actions">
          <button class="btn-ghost mobile-full-toggle" type="button" @click="fullScorecardOpen = !fullScorecardOpen">
            {{ fullScorecardOpen ? 'Hide full scorecard' : 'View full scorecard' }}
          </button>
          <button class="btn-primary mobile-results-action" type="button" @click="goResults">Results →</button>
        </div>
      </div>

      <div v-if="mobileOpenMatchDetail" class="mobile-dialog-backdrop" role="presentation" @click.self="openMobileMatchKey = null">
        <section class="mobile-match-dialog" role="dialog" aria-modal="true" aria-label="Match scorecard">
          <div class="mobile-dialog-head">
            <div>
              <span>{{ mobileOpenMatchDetail.panel.gameLabel }}</span>
              <strong>{{ mobileOpenMatchDetail.contest.name }}</strong>
              <em>{{ mobileOpenMatchDetail.match.sideA }} vs {{ mobileOpenMatchDetail.match.sideB }}</em>
            </div>
            <button class="btn-ghost sm" type="button" @click="openMobileMatchKey = null">Close</button>
          </div>
          <div v-if="mobileOpenMatchDetail.contest.segments.length" class="mp-segments mp-bet-status">
            <div
              v-for="segment in mobileOpenMatchDetail.contest.segments"
              :key="`mobile-${segment.label}`"
              class="mp-segment-card"
              :class="`mp-segment-${segment.status}`"
            >
              <span>{{ segment.label }}</span>
              <strong>{{ segment.leaderLabel }}</strong>
              <em>{{ segment.scoreLabel }}</em>
            </div>
          </div>
          <div class="sc-table-wrap mobile-dialog-table">
            <table class="sc-table mp-table">
              <thead>
                <tr class="row-holes">
                  <th class="col-name">Hole</th>
                  <th v-for="hole in mobileOpenMatchDetail.contest.holes" :key="`mh-${hole.hole}`">{{ hole.hole }}</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td class="name-cell">{{ mobileOpenMatchDetail.match.sideA }}</td>
                  <td v-for="hole in mobileOpenMatchDetail.contest.holes" :key="`ma-${hole.hole}`" class="mp-score" :class="{ 'mp-win': hole.winner === 'a' }">{{ hole.a ?? '–' }}</td>
                </tr>
                <tr>
                  <td class="name-cell">{{ mobileOpenMatchDetail.match.sideB }}</td>
                  <td v-for="hole in mobileOpenMatchDetail.contest.holes" :key="`mb-${hole.hole}`" class="mp-score" :class="{ 'mp-win': hole.winner === 'b' }">{{ hole.b ?? '–' }}</td>
                </tr>
                <tr>
                  <td class="name-cell">Result</td>
                  <td v-for="hole in mobileOpenMatchDetail.contest.holes" :key="`mr-${hole.hole}`" class="mp-result" :class="`mp-w-${hole.winner ?? 'pending'}`">{{ holeMark(hole.winner, mobileOpenMatchDetail.match) }}</td>
                </tr>
                <tr>
                  <td class="name-cell">Match</td>
                  <td v-for="hole in mobileOpenMatchDetail.contest.holes" :key="`ms-${hole.hole}`" class="mp-thru" :class="`mp-lead-${hole.leader ?? 'none'}`" :title="hole.status">{{ hole.matchShort }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <div v-if="!holeView || fullScorecardOpen" class="score-legend" aria-label="Scorecard key">
        <span><i class="legend-dot eagle"></i>Eagle or better</span>
        <span><i class="legend-dot birdie"></i>Green = birdie</span>
        <span><i class="legend-dot bogey"></i>Red = bogey or worse</span>
        <span><i class="legend-best-ball">U</i> Underline = best ball contributor</span>
        <span><i class="mobile-stroke-dot">●</i> Dot = stroke received</span>
        <span><strong>SKN</strong> = skins won</span>
      </div>

      <section v-if="skinsEnabled && (!holeView || fullScorecardOpen)" class="skins-drawer">
        <button class="skins-drawer-toggle" type="button" @click="skinsDrawerOpen = !skinsDrawerOpen">
          <span>
            <strong>Skins</strong>
            <em>{{ skinsSummaryText }}</em>
          </span>
          <b>{{ skinsDrawerOpen ? 'Hide' : 'View' }}</b>
        </button>
        <div v-if="skinsDrawerOpen" class="skins-drawer-body" aria-label="Scorecard skins breakdown">
          <p v-if="!skinHoles.length" class="skins-empty">No completed holes yet.</p>
          <template v-else>
            <div v-for="row in skinRows" :key="row.label" class="skins-drawer-row">
              <h2>{{ row.label }}</h2>
              <div class="skins-drawer-grid">
                <div v-for="hole in row.holes" :key="hole.hole" class="skins-drawer-tile" :class="{ tied: hole.tied }">
                  <span>Hole {{ hole.hole }}</span>
                  <strong>{{ hole.tied ? 'Tied' : hole.winner }}</strong>
                  <em>{{ skinDetailLabel(hole) }}</em>
                </div>
              </div>
            </div>
          </template>
        </div>
      </section>

      <div v-if="!holeView || fullScorecardOpen" class="sc-table-wrap">
        <table class="sc-table">
          <thead>
            <tr class="row-holes">
              <th class="col-name">Player</th>
              <th v-for="h in FRONT" :key="`fh-${h}`">{{ h + 1 }}</th>
              <th class="col-out">OUT</th>
              <th v-for="h in BACK" :key="`bh-${h}`">{{ h + 1 }}</th>
              <th class="col-in">IN</th>
              <th>TOT</th>
              <th>NET</th>
              <th>SKN</th>
            </tr>
            <tr class="row-par">
              <th>Par</th>
              <th v-for="h in FRONT" :key="`fp-${h}`">{{ par[h] }}</th>
              <th class="col-out">{{ outPar }}</th>
              <th v-for="h in BACK" :key="`bp-${h}`">{{ par[h] }}</th>
              <th class="col-in">{{ inPar }}</th>
              <th>{{ outPar + inPar }}</th>
              <th>—</th>
              <th>—</th>
            </tr>
            <tr class="row-si">
              <th>Hcp</th>
              <th v-for="h in HOLES" :key="`si-${h}`">{{ si[h] }}</th>
              <th></th>
              <th></th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <template v-if="twoManScrambleEnabled">
              <template v-for="match in visibleTwoManScrambleMatches" :key="`tms-main-${match.index}`">
                <tr class="row-team-divider">
                  <td :colspan="24">{{ match.label }} — Two-Man Scramble</td>
                </tr>
                <tr v-for="team in match.teams" :key="team.key" class="row-format">
                  <td class="name-cell">
                    <div class="fmt-row-label">{{ team.name }}</div>
                    <div class="fmt-row-sub">Scramble team score</div>
                  </td>
                  <template v-for="h in FRONT" :key="`tms-main-f-${team.key}-${h}`">
                    <td class="score-cell" :class="scoreColorClass(store.readTeamScore(team.key, h), par[h])">
                      <div class="sc-cell-inner">
                        <input
                          type="number"
                          inputmode="numeric"
                          min="1"
                          max="20"
                          :value="store.readTeamScore(team.key, h) ?? ''"
                          @input="onTeamScoreInput(team.key, h, ($event.target as HTMLInputElement).value)"
                          @focus="($event.target as HTMLInputElement).select()"
                        />
                      </div>
                    </td>
                  </template>
                  <td class="sum-cell out-col">{{ dash(teamScoreSum(team.key, 0, 9)) }}</td>
                  <template v-for="h in BACK" :key="`tms-main-b-${team.key}-${h}`">
                    <td class="score-cell" :class="scoreColorClass(store.readTeamScore(team.key, h), par[h])">
                      <div class="sc-cell-inner">
                        <input
                          type="number"
                          inputmode="numeric"
                          min="1"
                          max="20"
                          :value="store.readTeamScore(team.key, h) ?? ''"
                          @input="onTeamScoreInput(team.key, h, ($event.target as HTMLInputElement).value)"
                          @focus="($event.target as HTMLInputElement).select()"
                        />
                      </div>
                    </td>
                  </template>
                  <td class="sum-cell in-col">{{ dash(teamScoreSum(team.key, 9, 18)) }}</td>
                  <td class="sum-cell total-col">{{ dash(teamScoreSum(team.key, 0, 18)) }}</td>
                  <td class="sum-cell net-col">—</td>
                  <td class="sum-cell skins-col">—</td>
                </tr>
              </template>
            </template>
            <template v-else>
            <template v-for="section in displaySections" :key="section.key">
              <!-- Group header (group mode only) -->
              <tr v-if="section.type === 'groupHeader'" class="row-group-divider">
                <td :colspan="24">{{ section.name }}</td>
              </tr>

              <!-- Team section: players + format rows -->
              <template v-if="section.type === 'teamSection'">
              <tr class="row-team-divider" :class="{ 'row-team-divider-sub': groupModeActive }">
                <td :colspan="24">{{ section.name }} — {{ section.players.join(' · ') }}</td>
              </tr>
              <tr v-if="scrambleEnabled && section.teamKey" class="row-format">
                <td class="name-cell">
                  <div class="fmt-row-label">{{ section.name }}</div>
                  <div class="fmt-row-sub">4-man scramble</div>
                </td>
                <template v-for="h in FRONT" :key="`scrf-${section.teamKey}-${h}`">
                  <td class="score-cell" :class="[scoreColorClass(store.readTeamScore(section.teamKey!, h), par[h]), holeWinnerClass(h)]">
                    <div class="sc-cell-inner">
                      <input
                        type="number"
                        inputmode="numeric"
                        min="1"
                        max="20"
                        :value="store.readTeamScore(section.teamKey!, h) ?? ''"
                        @input="onTeamScoreInput(section.teamKey!, h, ($event.target as HTMLInputElement).value)"
                        @focus="($event.target as HTMLInputElement).select()"
                      />
                    </div>
                  </td>
                </template>
                <td class="sum-cell out-col">{{ dash(teamScoreSum(section.teamKey!, 0, 9)) }}</td>
                <template v-for="h in BACK" :key="`scrb-${section.teamKey}-${h}`">
                  <td class="score-cell" :class="[scoreColorClass(store.readTeamScore(section.teamKey!, h), par[h]), holeWinnerClass(h)]">
                    <div class="sc-cell-inner">
                      <input
                        type="number"
                        inputmode="numeric"
                        min="1"
                        max="20"
                        :value="store.readTeamScore(section.teamKey!, h) ?? ''"
                        @input="onTeamScoreInput(section.teamKey!, h, ($event.target as HTMLInputElement).value)"
                        @focus="($event.target as HTMLInputElement).select()"
                      />
                    </div>
                  </td>
                </template>
                <td class="sum-cell in-col">{{ dash(teamScoreSum(section.teamKey!, 9, 18)) }}</td>
                <td class="sum-cell total-col">{{ dash(teamScoreSum(section.teamKey!, 0, 18)) }}</td>
                <td class="sum-cell net-col">—</td>
                <td class="sum-cell skins-col">—</td>
              </tr>
              <template v-if="!scrambleEnabled">
              <template v-for="player in section.players" :key="player">
              <tr class="row-player">
                <td class="name-cell">
                  <div class="name-head">
                    <div class="cell-pname">{{ player }}</div>
                    <button
                      v-if="puttPokerEnabled"
                      class="putt-toggle"
                      type="button"
                      :title="`Toggle putt tracking for ${player}`"
                      @click="togglePutts(player)"
                    >
                      {{ expandedPutts[player] ? '▲' : '▼' }}
                    </button>
                  </div>
                  <div class="cell-hcp">
                    Hcp {{ store.courseHandicaps[player] }} · +{{ store.strokes[player] }}
                  </div>
                </td>
                <template v-for="h in FRONT" :key="`${player}-${h}`">
                  <td class="score-cell" :class="[scoreColorClass(store.readScore(player, h), par[h]), { 'is-best-ball': bestBallContributor(section.players, h) === player }]">
                    <div class="sc-cell-inner">
                      <input
                        type="number"
                        inputmode="numeric"
                        min="1"
                        max="20"
                        :value="store.readScore(player, h) ?? ''"
                        @input="onScoreInput(player, h, ($event.target as HTMLInputElement).value)"
                        @focus="($event.target as HTMLInputElement).select()"
                      />
                      <span v-if="getsStrokeHere(player, h)" class="stroke-dot">●</span>
                    </div>
                  </td>
                </template>
                <td class="sum-cell out-col">{{ dash(store.playerTotals[player].out) }}</td>
                <template v-for="h in BACK" :key="`${player}-${h}`">
                  <td class="score-cell" :class="[scoreColorClass(store.readScore(player, h), par[h]), { 'is-best-ball': bestBallContributor(section.players, h) === player }]">
                    <div class="sc-cell-inner">
                      <input
                        type="number"
                        inputmode="numeric"
                        min="1"
                        max="20"
                        :value="store.readScore(player, h) ?? ''"
                        @input="onScoreInput(player, h, ($event.target as HTMLInputElement).value)"
                        @focus="($event.target as HTMLInputElement).select()"
                      />
                      <span v-if="getsStrokeHere(player, h)" class="stroke-dot">●</span>
                    </div>
                  </td>
                </template>
                <td class="sum-cell in-col">{{ dash(store.playerTotals[player].in) }}</td>
                <td class="sum-cell total-col">{{ dash(store.playerTotals[player].total) }}</td>
                <td class="sum-cell net-col">{{ dash(store.playerTotals[player].net) }}</td>
                <td class="sum-cell skins-col">
                  {{ store.playerTotals[player].skins > 0 ? store.playerTotals[player].skins : '—' }}
                </td>
              </tr>
              <tr v-if="puttPokerEnabled && expandedPutts[player]" class="row-putts">
                <td class="name-cell putt-label">Putts</td>
                <td v-for="h in FRONT" :key="`pf-${player}-${h}`" class="putt-cell">
                  <input
                    type="number"
                    inputmode="numeric"
                    min="0"
                    max="9"
                    :class="puttColorClass(store.readPutt(player, h))"
                    :value="store.readPutt(player, h) ?? ''"
                    @input="onPuttInput(player, h, ($event.target as HTMLInputElement).value)"
                    @focus="($event.target as HTMLInputElement).select()"
                  />
                </td>
                <td class="sum-cell out-col putt-sum">{{ dash(puttSum(player, 0, 9)) }}</td>
                <td v-for="h in BACK" :key="`pb-${player}-${h}`" class="putt-cell">
                  <input
                    type="number"
                    inputmode="numeric"
                    min="0"
                    max="9"
                    :class="puttColorClass(store.readPutt(player, h))"
                    :value="store.readPutt(player, h) ?? ''"
                    @input="onPuttInput(player, h, ($event.target as HTMLInputElement).value)"
                    @focus="($event.target as HTMLInputElement).select()"
                  />
                </td>
                <td class="sum-cell in-col putt-sum">{{ dash(puttSum(player, 9, 18)) }}</td>
                <td class="sum-cell total-col putt-sum">{{ dash(puttSum(player, 0, 18)) }}</td>
                <td class="sum-cell"></td>
                <td class="sum-cell"></td>
              </tr>
              </template>
              </template><!-- end v-if="!scrambleEnabled" -->
              <tr v-for="format in store.scorecardPlayersFormatRows(section.players, section.name)" :key="`${section.key}-${format.key}`" class="row-format">
                <td class="name-cell">
                  <div class="fmt-row-label">{{ format.label }}</div>
                  <div class="fmt-row-sub">{{ format.sublabel }}</div>
                </td>
                <td v-for="h in FRONT" :key="`${section.key}-${format.key}-fh-${h}`" class="fmt-cell" :class="holeWinnerClass(h)">
                  {{ dash(format.holes[h]) }}
                </td>
                <td class="sum-cell out-col">{{ dash(format.out) }}</td>
                <td v-for="h in BACK" :key="`${section.key}-${format.key}-bh-${h}`" class="fmt-cell" :class="holeWinnerClass(h)">
                  {{ dash(format.holes[h]) }}
                </td>
                <td class="sum-cell in-col">{{ dash(format.in) }}</td>
                <td class="sum-cell total-col">{{ dash(format.total) }}</td>
                <td class="sum-cell net-col">—</td>
                <td class="sum-cell skins-col">—</td>
              </tr>
              </template><!-- end teamSection -->
            </template><!-- end displaySections loop -->
            </template>
          </tbody>
        </table>
      </div><!-- end sc-table-wrap -->

      <section v-if="activeEventResult" class="event-live">
        <div class="event-live-head">
          <div>
            <p class="event-live-kicker">Event Round {{ activeEventResult.idx + 1 }}</p>
            <h2>{{ activeEventResult.round.name }}</h2>
            <p>{{ eventFormatLabel(activeEventResult.round.format) }}</p>
          </div>
          <div class="event-live-score">
            <strong>{{ activeEventResult.team1 }}-{{ activeEventResult.team2 }}</strong>
            <span>event pts</span>
          </div>
        </div>

        <div class="event-match-list">
          <div v-for="row in activeEventResult.rows" :key="row.label" class="event-match-card">
            <div class="event-match-top">
              <div>
                <strong>{{ row.label }}</strong>
                <span>{{ row.aPlayers.join(' + ') }} vs {{ row.bPlayers.join(' + ') }}</span>
              </div>
              <div class="event-match-status">
                <strong>{{ eventRowTotals(row).team1 }}-{{ eventRowTotals(row).team2 }}</strong>
                <span>{{ eventMatchLeader(row) }}</span>
              </div>
            </div>
            <div class="event-chip-row">
              <span
                v-for="component in row.components"
                :key="`${row.label}-${component.label}`"
                class="event-chip"
                :class="eventComponentClass(component)"
              >
                {{ eventComponentLabel(component, row) }}
              </span>
            </div>
          </div>
        </div>
      </section>

      <section v-if="hasMatchPlayPanels && !holeView" class="mp-live">
        <div v-for="panel in matchPlayPanels" :key="panel.gameLabel" class="mp-panel">
          <div class="mp-panel-title">
            <span>{{ panel.gameLabel }}</span>
            <span class="mp-basis">{{ panel.basis }}</span>
          </div>
          <div v-for="match in panel.matches" :key="`${panel.gameLabel}-${match.label}`" class="mp-match">
            <div class="mp-match-head">
              <strong>{{ match.label }}</strong>
              <span class="mp-vs">{{ match.sideA }} <em>vs</em> {{ match.sideB }}</span>
            </div>
            <div v-for="contest in match.contests" :key="contest.name" class="mp-contest">
              <div class="mp-contest-head">
                <span class="mp-contest-name">{{ contest.name }}</span>
                <span class="mp-final" :class="{ pending: contest.finalLabel === 'Pending' }">{{ contest.finalLabel }}</span>
              </div>
              <div v-if="contest.segments.length" class="mp-segments mp-bet-status">
                <div
                  v-for="segment in contest.segments"
                  :key="`${contest.name}-${segment.label}`"
                  class="mp-segment-card"
                  :class="`mp-segment-${segment.status}`"
                >
                  <span>{{ segment.label }}</span>
                  <strong>{{ segment.leaderLabel }}</strong>
                  <em>{{ segment.scoreLabel }}</em>
                </div>
              </div>
              <div class="sc-table-wrap">
                <table class="sc-table mp-table">
                  <thead>
                    <tr class="row-holes">
                      <th class="col-name">Hole</th>
                      <th v-for="hole in contest.holes" :key="`h-${hole.hole}`">{{ hole.hole }}</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td class="name-cell">{{ match.sideA }}</td>
                      <td v-for="hole in contest.holes" :key="`a-${hole.hole}`" class="mp-score" :class="{ 'mp-win': hole.winner === 'a' }">{{ hole.a ?? '–' }}</td>
                    </tr>
                    <tr>
                      <td class="name-cell">{{ match.sideB }}</td>
                      <td v-for="hole in contest.holes" :key="`b-${hole.hole}`" class="mp-score" :class="{ 'mp-win': hole.winner === 'b' }">{{ hole.b ?? '–' }}</td>
                    </tr>
                    <tr>
                      <td class="name-cell">Result</td>
                      <td v-for="hole in contest.holes" :key="`r-${hole.hole}`" class="mp-result" :class="`mp-w-${hole.winner ?? 'pending'}`">{{ holeMark(hole.winner, match) }}</td>
                    </tr>
                    <tr>
                      <td class="name-cell">Match</td>
                      <td v-for="hole in contest.holes" :key="`s-${hole.hole}`" class="mp-thru" :class="`mp-lead-${hole.leader ?? 'none'}`" :title="hole.status">{{ hole.matchLabel }}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section v-if="wolfVisible" class="wolf-live">
        <div class="wolf-live-title">
          <span>Wolf</span>
          <span class="wolf-live-total">{{ wolf.playedHoles }} hole{{ wolf.playedHoles === 1 ? '' : 's' }} settled</span>
        </div>
        <div class="wolf-table-wrap">
          <table class="wolf-table">
            <thead>
              <tr>
                <th>Hole</th>
                <th>Wolf</th>
                <th>Choice</th>
                <th>Partner</th>
                <th>Field</th>
                <th>Result</th>
                <th>Pts</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in wolf.rows" :key="row.hole">
                <td class="wolf-hole">{{ row.hole }}</td>
                <td>
                  <select
                    class="wolf-select"
                    :value="row.config.wolf"
                    @change="store.setWolfHole(row.hole - 1, 'wolf', ($event.target as HTMLSelectElement).value)"
                  >
                    <option v-for="player in store.playerNames" :key="`wolf-${row.hole}-${player}`" :value="player">
                      {{ player }}
                    </option>
                  </select>
                </td>
                <td>
                  <select
                    class="wolf-select sm"
                    :value="row.config.mode === 'solo' ? 'solo' : 'partner'"
                    @change="store.setWolfHole(row.hole - 1, 'mode', ($event.target as HTMLSelectElement).value)"
                  >
                    <option value="partner">Partner</option>
                    <option value="solo">Solo</option>
                  </select>
                </td>
                <td>
                  <select
                    class="wolf-select"
                    :disabled="row.config.mode === 'solo'"
                    :value="row.config.partner"
                    @change="store.setWolfHole(row.hole - 1, 'partner', ($event.target as HTMLSelectElement).value)"
                  >
                    <option value="">None</option>
                    <option
                      v-for="player in store.playerNames.filter((player) => player !== row.config.wolf)"
                      :key="`partner-${row.hole}-${player}`"
                      :value="player"
                    >
                      {{ player }}
                    </option>
                  </select>
                </td>
                <td>{{ wolfField(row) }}</td>
                <td class="wolf-result">{{ row.resultLabel }}</td>
                <td class="wolf-points">{{ row.pointsLabel }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section v-if="puttPokerEnabled" class="sc-puttpoker">
        <h2 class="sc-section-hdr">Putt Poker</h2>
        <div class="pp-groups">
          <div v-for="group in puttGroups" :key="group.name" class="pp-group">
            <div class="pp-group-hdr">{{ group.name }}</div>
            <template v-for="result in [store.puttPokerFor(group.players)]" :key="group.name">
              <div class="pp-state-grid">
                <div class="pp-state-card">
                  <span>Pot</span>
                  <strong>{{ puttPokerPotLabel(result.pot) }}</strong>
                </div>
                <div class="pp-state-card">
                  <span>Coin state</span>
                  <strong :class="{ 'pp-coin-none': !result.coinHolder }">{{ puttPokerStateLabel(result.coinHolder) }}</strong>
                </div>
              </div>
              <div class="pp-token-label">Cards</div>
              <div class="pp-cards">
                <div v-for="p in group.players" :key="p" class="pp-player">
                  <div class="pp-player-name">{{ p }}</div>
                  <div class="pp-card-count">{{ cardCountLabel(result.cards[p]) }}</div>
                  <div
                    v-if="puttPenaltyNote(result.threePuttCount[p], result.fourPuttCount[p])"
                    class="pp-note"
                  >
                    {{ puttPenaltyNote(result.threePuttCount[p], result.fourPuttCount[p]) }}
                  </div>
                </div>
              </div>
            </template>
          </div>
        </div>
      </section>

    </template>

    <section v-else class="panel sc-empty">
      <p class="eyebrow">Scorecard</p>
      <h1>No active round</h1>
      <p class="lede">Start a demo round to score live with the new engine.</p>
      <div class="sc-empty-actions">
        <button class="btn-primary" type="button" @click="loadDemo">Load demo round</button>
        <button class="btn-ghost" type="button" @click="goGroup">Back to group</button>
      </div>
    </section>
  </main>
</template>

<style scoped>
.sc-shell {
  max-width: 1100px;
  margin: 0 auto;
  padding: 20px 16px 48px;
}

.sc-topbar {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 16px;
  border-bottom: 1px solid #e4ddcd;
  padding-bottom: 14px;
}

.sc-topbar-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.sc-title {
  margin: 0;
  font-size: 1.4rem;
  color: #24362c;
}

.sc-kicker {
  margin: 0 0 4px;
  color: #7a8a7f;
  font-size: 0.72rem;
  font-weight: 800;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.sc-sub {
  margin: 4px 0 0;
  color: #6a7a6f;
  font-size: 0.85rem;
}

.sync-status {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin-top: 7px;
  color: #4f6658;
  font-size: 0.75rem;
  font-weight: 700;
}

.sync-status.error { color: #a33b32; }
.sync-status button {
  border: 1px solid currentColor;
  border-radius: 999px;
  background: transparent;
  color: inherit;
  padding: 2px 8px;
  font: inherit;
  cursor: pointer;
}

.event-score-banner {
  display: inline-flex;
  gap: 8px;
  align-items: baseline;
  margin-top: 10px;
  border: 1px solid #c8d4bc;
  border-radius: 8px;
  background: #f3f7ef;
  padding: 7px 10px;
}

.event-score-banner span {
  color: #6a7a6f;
  font-size: 0.75rem;
  font-weight: 800;
  text-transform: uppercase;
}

.event-score-banner strong {
  color: #2f5d43;
  font-size: 0.95rem;
}

.sc-table-wrap {
  overflow-x: auto;
  overflow-y: auto;
  max-height: min(72vh, 760px);
  border: 1px solid #d7cebd;
  border-radius: 8px;
  background: #fdfbf4;
  max-width: 100%;
}

.sc-table {
  border-collapse: collapse;
  width: 100%;
  font-size: 0.8rem;
}

.sc-table th,
.sc-table td {
  border: 1px solid #e4ddcd;
  padding: 2px 5px;
  text-align: center;
  white-space: nowrap;
}

.sc-table thead th {
  position: sticky;
  top: 0;
  z-index: 3;
}

.row-holes th,
.row-par th,
.row-si th {
  background: #efe9da;
  font-weight: 700;
  color: #4a5a4f;
}

.row-si th {
  font-weight: 500;
  color: #8a9489;
  font-size: 0.72rem;
}

.col-name {
  position: sticky;
  left: 0;
  z-index: 4;
  background: #fdfbf4;
  text-align: left;
}

.row-group-divider td {
  background: #1e3d2b;
  color: #f3efe2;
  text-align: left;
  font-weight: 800;
  letter-spacing: 0.06em;
  font-size: 0.82rem;
  text-transform: uppercase;
}

.row-team-divider td {
  background: #2f5d43;
  color: #f3efe2;
  text-align: left;
  font-weight: 700;
  letter-spacing: 0.04em;
  font-size: 0.74rem;
  padding: 4px 8px;
}

.row-team-divider-sub td {
  background: #4a7c5f;
  font-size: 0.74rem;
  font-weight: 700;
  letter-spacing: 0.02em;
}

.row-format td {
  background: #fbf7ed;
}

.fmt-cell {
  color: #2f5d43;
  font-weight: 700;
}

.name-cell {
  position: sticky;
  left: 0;
  z-index: 2;
  background: #fdfbf4;
  text-align: left;
  min-width: 120px;
}

.row-format .name-cell,
.row-putts .name-cell {
  background: #fbf7ed;
}

.fmt-row-label {
  font-weight: 800;
  color: #283b30;
}

.fmt-row-sub {
  color: #8a9489;
  font-size: 0.68rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.name-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 4px;
}

.cell-pname {
  font-weight: 700;
  color: #283b30;
}

.putt-toggle {
  border: none;
  background: transparent;
  color: #8a672f;
  cursor: pointer;
  font-size: 0.6rem;
  padding: 2px 4px;
  line-height: 1;
}

.putt-toggle:hover {
  background: #efe3cb;
  border-radius: 4px;
}

.cell-hcp {
  color: #8a9489;
  font-size: 0.68rem;
}

.row-putts td {
  background: #f3efe2;
  border-top: none;
}

.putt-label {
  font-size: 0.6rem;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: #8a672f;
}

.putt-cell {
  padding: 0;
}

.putt-cell input {
  width: 30px;
  border: none;
  background: transparent;
  text-align: center;
  padding: 5px 0;
  font-weight: 700;
  color: #9aa49a;
}

.putt-cell input:focus {
  outline: 2px solid #c37a32;
  outline-offset: -2px;
}

.putt-good { color: #27ae60; }
.putt-ok { color: #5a6a5f; }
.putt-bad { color: #c0392b; background: rgb(192 57 43 / 10%); }

.putt-sum {
  color: #8a9489;
  font-weight: 600;
}

.score-cell {
  padding: 0;
}

.sc-cell-inner {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
}

.sc-cell-inner input {
  width: 34px;
  border: none;
  background: transparent;
  text-align: center;
  padding: 6px 0;
  font-weight: 700;
  color: inherit;
  cursor: pointer;
}

.sc-cell-inner input:focus {
  outline: 2px solid #2f8f58;
  outline-offset: -2px;
}

.stroke-dot {
  position: absolute;
  top: 1px;
  right: 2px;
  font-size: 0.4rem;
  color: #b1462f;
}

.hole-win-team1 { background: rgba(47, 93, 67, 0.10); }
.hole-win-team2 { background: rgba(180, 71, 58, 0.10); }

.event-live {
  margin-top: 20px;
  border: 1px solid #d7cebd;
  border-radius: 8px;
  background: #f8f4ea;
  padding: 16px 18px;
}

.event-live-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 14px;
}

.event-live-kicker {
  margin: 0 0 2px;
  color: #7a8a7f;
  font-size: 0.72rem;
  font-weight: 800;
  text-transform: uppercase;
}

.event-live h2 {
  margin: 0;
  color: #24362c;
  font-size: 1.05rem;
}

.event-live p {
  margin: 3px 0 0;
  color: #6a7a6f;
  font-size: 0.86rem;
}

.event-live-score {
  text-align: right;
  color: #2f5d43;
}

.event-live-score strong {
  display: block;
  font-size: 1.35rem;
}

.event-live-score span,
.event-match-status span {
  color: #6a7a6f;
  font-size: 0.76rem;
  font-weight: 700;
}

.event-match-list {
  display: grid;
  gap: 10px;
}

.event-match-card {
  border-top: 1px solid #e4ddcd;
  padding-top: 10px;
}

.event-match-card:first-child {
  border-top: 0;
  padding-top: 0;
}

.event-match-top {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: baseline;
}

.event-match-top strong,
.event-match-status strong {
  color: #24362c;
}

.event-match-top span {
  display: block;
  margin-top: 2px;
  color: #4a5a4f;
}

.event-match-status {
  text-align: right;
  white-space: nowrap;
}

.event-chip-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
}

.event-chip {
  border-radius: 999px;
  padding: 3px 9px;
  font-size: 0.76rem;
  font-weight: 800;
  line-height: 1.25;
  background: #ece8da;
  color: #4a5a4f;
}

.event-chip-team1 {
  background: #dfeadc;
  color: #2f5d43;
}

.event-chip-team2 {
  background: #f0dfd9;
  color: #9b3d30;
}

.event-chip-tie {
  background: #eadfca;
  color: #8a672f;
}

.event-chip-open {
  color: #7a8a7f;
}

/* Match-play panels (BB+Aggy, High/Low, Two-Man Scramble) */
.mp-live {
  display: grid;
  gap: 18px;
  margin-top: 20px;
}

.mp-panel {
  border: 1px solid #d7cebd;
  border-radius: 8px;
  background: #fdfbf4;
  padding: 14px 16px 16px;
}

.mp-panel-title {
  display: flex;
  align-items: baseline;
  gap: 10px;
  font-size: 1rem;
  font-weight: 800;
  color: #2f5d43;
  margin-bottom: 12px;
}

.mp-basis {
  font-size: 0.7rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #8a672f;
}

.mp-match {
  border-top: 1px solid #e4ddcd;
  padding-top: 12px;
  margin-bottom: 16px;
}

.mp-match:first-of-type {
  border-top: 0;
  padding-top: 0;
}

.mp-match-head {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 8px;
  margin-bottom: 6px;
}

.mp-vs {
  font-size: 0.82rem;
  color: #4a5a4f;
}

.mp-vs em {
  color: #8a9489;
  font-style: normal;
  font-weight: 700;
  padding: 0 2px;
}

.mp-contest {
  margin-bottom: 14px;
  border: 1px solid #eee5d5;
  border-radius: 8px;
  background: #fffdf7;
  padding: 10px;
}

.mp-contest-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 4px;
}

.mp-segments {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 0 0 6px;
}

.mp-bet-status {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}

.mp-segment-chip {
  border-radius: 999px;
  background: #ece8da;
  color: #6a7a6f;
  padding: 2px 8px;
  font-size: 0.72rem;
  font-weight: 800;
  line-height: 1.25;
}

.mp-segment-card {
  display: grid;
  min-width: 0;
  gap: 2px;
  border: 1px solid #e4ddcd;
  border-radius: 8px;
  background: #f8f4ea;
  padding: 7px 8px;
}

.mp-segment-card span {
  color: #8a672f;
  font-size: 0.62rem;
  font-weight: 900;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.mp-segment-card strong {
  overflow: hidden;
  color: #24362c;
  font-size: 0.78rem;
  line-height: 1.1;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mp-segment-card em {
  color: #5a6a5f;
  font-size: 0.72rem;
  font-style: normal;
  font-weight: 850;
  line-height: 1.1;
}

.mp-segment-a {
  background: #dfeadc;
  color: #2f5d43;
}

.mp-segment-b {
  background: #f0dfd9;
  color: #9b3d30;
}

.mp-segment-push {
  background: #eadfca;
  color: #8a672f;
}

.mp-contest-name {
  font-size: 0.8rem;
  font-weight: 700;
  color: #283b30;
}

.mp-final {
  font-size: 0.78rem;
  font-weight: 800;
  color: #2f5d43;
  background: #e8f0e8;
  border-radius: 999px;
  padding: 2px 8px;
}

.mp-final.pending {
  background: #ece8da;
  color: #8a9489;
}

.mp-table {
  background: #fdfbf4;
}

.mp-table .mp-score,
.mp-table .mp-result,
.mp-table .mp-thru {
  text-align: center;
}

.mp-table .mp-win {
  font-weight: 800;
  background: rgba(47, 93, 67, 0.12);
}

.mp-w-a { background: rgba(47, 93, 67, 0.16); font-weight: 800; }
.mp-w-b { background: rgba(180, 71, 58, 0.16); font-weight: 800; }
.mp-w-tie { color: #8a672f; }
.mp-w-pending { color: #b8c0b8; }

.mp-thru {
  font-size: 0.68rem;
  font-weight: 800;
  color: #6a7a6f;
  min-width: 46px;
  white-space: nowrap;
}

.mp-lead-a {
  color: #2f5d43;
}

.mp-lead-b {
  color: #9b3d30;
}

.mp-lead-none {
  color: #6a7a6f;
}

.is-best-ball input { font-weight: 900; text-decoration: underline; }

.score-eagle { background: #f6d365; }
.score-birdie { background: #cdeccd; }
.score-par { background: transparent; }
.score-bogey { background: #f3dede; }
.score-double { background: #e6c4c4; }

.sum-cell {
  font-weight: 700;
  background: #f4efe2;
}

.net-col { color: #2f5d43; }
.skins-col { color: #8a672f; }

.sc-puttpoker,
.pair-live,
.wolf-live {
  margin-top: 24px;
  border: 1px solid #d7cebd;
  border-radius: 8px;
  background: #f8f4ea;
  padding: 16px 20px;
}

.pair-live-title {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  font-weight: 800;
  color: #24362c;
  margin-bottom: 12px;
}

.pair-live-total {
  color: #8a672f;
}

.pair-live-grid {
  display: grid;
  gap: 12px;
}

.pair-live-card {
  border: 1px solid #e4ddcd;
  border-radius: 8px;
  background: #fdfbf4;
  overflow: hidden;
}

.pair-live-head {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
}

.pair-live-side {
  text-align: center;
}

.pair-live-side.win .pair-live-name {
  color: #b08416;
}

.pair-live-name {
  color: #283b30;
  font-weight: 800;
}

.pair-live-meta {
  color: #8a9489;
  font-size: 0.7rem;
}

.pair-live-score {
  color: #24362c;
  font-weight: 900;
}

.pair-live-holes {
  display: grid;
  grid-template-columns: repeat(18, minmax(28px, 1fr));
  border-top: 1px solid #e4ddcd;
  overflow-x: auto;
}

.pair-live-hole {
  display: grid;
  gap: 1px;
  justify-items: center;
  border-right: 1px solid #e4ddcd;
  padding: 4px 1px;
  font-weight: 800;
}

.pair-live-hole:last-child {
  border-right: none;
}

.pair-live-hole-num {
  color: #8a9489;
  font-size: 0.58rem;
}

.pair-live-hole-result {
  color: #4a5a4f;
  font-size: 0.66rem;
}

.pair-live-hole.side-a {
  background: #e7f2e8;
}

.pair-live-hole.side-b {
  background: #f1e3d6;
}

.pair-live-hole.tie {
  background: #efe9da;
}

.pair-live-hole.pending {
  background: #fbf7ed;
}

.pair-live-splits {
  display: flex;
  justify-content: center;
  gap: 16px;
  flex-wrap: wrap;
  border-top: 1px solid #e4ddcd;
  padding: 8px 12px;
  color: #6a7a6f;
  font-size: 0.76rem;
  font-weight: 700;
}

.wolf-live-title {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  font-weight: 800;
  color: #24362c;
  margin-bottom: 12px;
}

.wolf-live-total {
  color: #8a672f;
}

.wolf-table-wrap {
  overflow-x: auto;
}

.wolf-table {
  width: 100%;
  min-width: 760px;
  border-collapse: collapse;
  font-size: 0.78rem;
}

.wolf-table th,
.wolf-table td {
  border-bottom: 1px solid #e4ddcd;
  padding: 6px 8px;
  text-align: left;
}

.wolf-table th {
  color: #6a7a6f;
  font-size: 0.68rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.wolf-hole {
  color: #8a672f;
  font-weight: 800;
}

.wolf-select {
  width: 110px;
  border: 1px solid #cdbf9f;
  border-radius: 6px;
  background: #fdfbf4;
  color: #283b30;
  padding: 5px 7px;
}

.wolf-select.sm {
  width: 94px;
}

.wolf-select:disabled {
  color: #9aa49a;
  background: #f3efe2;
}

.wolf-result {
  color: #283b30;
  font-weight: 700;
}

.wolf-points {
  color: #2f5d43;
  font-weight: 800;
}

.pp-groups {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
}

.pp-group {
  border: 1px solid #e4ddcd;
  border-radius: 8px;
  background: #fdfbf4;
  padding: 14px 16px;
  min-width: 240px;
}

.pp-group-hdr {
  font-weight: 700;
  color: #2f5d43;
  margin-bottom: 6px;
}

.pp-state-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  margin-bottom: 12px;
}

.pp-state-card {
  border: 1px solid #e4ddcd;
  border-radius: 6px;
  background: #fffdf7;
  padding: 9px 10px;
}

.pp-state-card span,
.pp-token-label {
  display: block;
  color: #8a9489;
  font-size: 0.68rem;
  font-weight: 800;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.pp-state-card strong {
  display: block;
  margin-top: 3px;
  color: #24362c;
  font-size: 0.86rem;
  line-height: 1.2;
}

.pp-state-card strong.pp-coin-none { color: #5a6a5f; }

.pp-token-label {
  margin-bottom: 8px;
  color: #8a672f;
}

.pp-cards {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}

.pp-player {
  text-align: center;
  min-width: 56px;
}

.pp-player-name {
  font-weight: 700;
  color: #283b30;
  font-size: 0.82rem;
}

.pp-card-count {
  font-size: 0.82rem;
  color: #4a5a4f;
  font-weight: 700;
}

.pp-note {
  font-size: 0.62rem;
  color: #c0392b;
  margin-top: 2px;
}

.sc-section-hdr {
  margin: 0 0 12px;
  font-size: 0.95rem;
  color: #24362c;
}

/* Group filter bar */
.group-filter {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin-bottom: 12px;
}

.group-filter-label {
  color: #6a7a6f;
  font-size: 0.75rem;
  font-weight: 800;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

.gf-btn {
  border: 1px solid #cdbf9f;
  border-radius: 20px;
  background: transparent;
  color: #4a5a4f;
  padding: 5px 14px;
  font-size: 0.78rem;
  font-weight: 700;
  cursor: pointer;
}

.gf-btn.active {
  background: #2f5d43;
  border-color: #2f5d43;
  color: #f3efe2;
}

/* Mobile hole card */
.mobile-card {
  box-sizing: border-box;
  width: 100%;
  max-width: 100%;
  border: 1px solid #d7cebd;
  border-radius: 10px;
  background: #f8f4ea;
  padding: 16px;
  margin-bottom: 16px;
}

.mobile-event-context {
  display: grid;
  grid-template-columns: minmax(0, 0.75fr) minmax(0, 1.25fr);
  gap: 10px;
  align-items: center;
  border: 1px solid #d7cebd;
  border-radius: 8px;
  background: #fffdf7;
  padding: 7px 10px;
  margin: 0 0 8px;
}

.mobile-event-context strong {
  display: block;
  min-width: 0;
  overflow: hidden;
  color: #24362c;
  font-size: 0.78rem;
  line-height: 1.15;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mobile-event-label,
.mobile-event-score span {
  color: #8a672f;
  font-size: 0.7rem;
  font-weight: 800;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.mobile-event-matchup {
  margin-top: 2px;
}

.mobile-rotation-context small {
  display: block;
  margin-top: 2px;
  overflow: hidden;
  color: #66766b;
  font-size: 0.68rem;
  font-weight: 800;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mobile-event-score {
  border-left: 1px solid #e4ddcd;
  padding-left: 8px;
  text-align: right;
}

.mobile-event-score strong {
  color: #2f5d43;
  font-size: 0.86rem;
  white-space: nowrap;
}

.score-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 12px;
  margin: 0 0 14px;
  border: 1px solid #e4ddcd;
  border-radius: 8px;
  background: #fffdf7;
  padding: 9px 10px;
  color: #5e6d63;
  font-size: 0.72rem;
  font-weight: 700;
}

.score-legend span {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}

.skins-drawer {
  margin: -4px 0 14px;
  border: 1px solid #d7cebd;
  border-radius: 8px;
  background: #fdfbf4;
  overflow: hidden;
}

.skins-drawer-toggle {
  display: flex;
  width: 100%;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  border: 0;
  background: #fffdf7;
  padding: 10px 12px;
  color: #24362c;
  text-align: left;
  cursor: pointer;
}

.skins-drawer-toggle span {
  display: grid;
  min-width: 0;
  gap: 2px;
}

.skins-drawer-toggle strong {
  color: #8a672f;
  font-size: 0.78rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.skins-drawer-toggle em {
  color: #4a5a4f;
  font-size: 0.86rem;
  font-style: normal;
  font-weight: 800;
  line-height: 1.25;
}

.skins-drawer-toggle b {
  flex: 0 0 auto;
  border: 1px solid #d7cebd;
  border-radius: 999px;
  background: #f8f4ea;
  color: #2f5d43;
  padding: 4px 10px;
  font-size: 0.74rem;
}

.skins-drawer-body {
  display: grid;
  gap: 14px;
  border-top: 1px solid #e4ddcd;
  padding: 12px;
}

.skins-empty {
  margin: 0;
  color: #6a7a6f;
  font-size: 0.82rem;
  font-weight: 700;
}

.skins-drawer-row h2 {
  margin: 0 0 8px;
  color: #24362c;
  font-size: 0.84rem;
}

.skins-drawer-grid {
  display: grid;
  grid-template-columns: repeat(9, minmax(74px, 1fr));
  gap: 7px;
}

.skins-drawer-tile {
  display: grid;
  align-content: center;
  min-height: 78px;
  border: 1px solid #d7cebd;
  border-radius: 6px;
  background: #fffdf7;
  padding: 7px;
  text-align: center;
}

.skins-drawer-tile.tied {
  background: #f4efe4;
  opacity: 0.76;
}

.skins-drawer-tile span {
  color: #9aa49a;
  font-size: 0.6rem;
  font-weight: 800;
}

.skins-drawer-tile strong {
  color: #2f5d43;
  font-size: 0.8rem;
  line-height: 1.2;
}

.skins-drawer-tile.tied strong {
  color: #8a672f;
}

.skins-drawer-tile em {
  margin-top: 3px;
  color: #6a7a6f;
  font-size: 0.66rem;
  font-style: normal;
  font-weight: 700;
  line-height: 1.18;
}

.legend-dot {
  width: 10px;
  height: 10px;
  border-radius: 999px;
  border: 1px solid #d7cebd;
  background: #fdfbf4;
}

.legend-dot.eagle { background: #f6d365; }
.legend-dot.birdie { background: #cdeccd; }
.legend-dot.par { background: #fdfbf4; }
.legend-dot.bogey { background: #ffe4c2; }

.legend-best-ball {
  display: inline-flex;
  width: 16px;
  height: 16px;
  align-items: center;
  justify-content: center;
  color: #2f5d43;
  font-size: 0.68rem;
  font-style: normal;
  font-weight: 900;
  text-decoration: underline;
}

.mobile-hole-nav {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 10px;
}

.mobile-hole-info {
  text-align: center;
  min-width: 0;
  flex: 1;
}

.mobile-hole-num {
  display: block;
  font-size: 1.5rem;
  font-weight: 900;
  color: #24362c;
  line-height: 1;
}

.mobile-hole-par,
.mobile-hole-si {
  display: inline-block;
  font-size: 0.8rem;
  color: #6a7a6f;
  margin: 4px 6px 0;
  font-weight: 600;
}

.mobile-hole-course {
  display: block;
  margin-top: 5px;
  color: #8a672f;
  font-size: 0.78rem;
  font-weight: 700;
}

.mobile-next-hole {
  display: grid;
  align-content: center;
  justify-items: center;
  gap: 1px;
  min-width: 76px;
  min-height: 48px;
  padding: 5px 8px;
  line-height: 1;
}

.mobile-next-hole span {
  font-size: 1rem;
  font-weight: 900;
}

.mobile-next-hole small {
  max-width: 64px;
  overflow: hidden;
  color: #6a7a6f;
  font-size: 0.58rem;
  font-weight: 850;
  line-height: 1.05;
  text-overflow: ellipsis;
  text-transform: uppercase;
  white-space: nowrap;
}

.mobile-hole-utility {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px;
  align-items: stretch;
  margin: 0 0 12px;
}

.mobile-hole-status {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 6px;
  align-items: center;
  border: 1px solid #e0c4c0;
  border-radius: 999px;
  background: #f9eeec;
  color: #9b3d30;
  min-height: 34px;
  padding: 5px 10px;
}

.mobile-hole-status.complete {
  border-color: #c8d8c8;
  background: #edf5ed;
  color: #2f5d43;
}

.mobile-hole-status strong {
  font-size: 0.72rem;
  font-weight: 900;
  text-transform: uppercase;
}

.mobile-hole-status span {
  min-width: 0;
  overflow: hidden;
  color: #5a6a5f;
  font-size: 0.68rem;
  font-weight: 800;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mobile-fill-par {
  min-height: 34px;
  padding: 5px 10px;
  color: #2f5d43;
  font-size: 0.72rem;
  font-weight: 900;
  white-space: nowrap;
}

.mobile-fill-par:disabled {
  color: #8a9489;
}

.mobile-match-status {
  display: grid;
  gap: 4px;
  margin: 0 0 8px;
}

.mobile-match-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  gap: 6px;
  align-items: center;
  border: 1px solid #e4ddcd;
  border-radius: 8px;
  background: #fffdf7;
  padding: 6px 8px;
}

.mobile-match-row span {
  display: block;
  color: #8a672f;
  font-size: 0.68rem;
  font-weight: 800;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  line-height: 1.15;
}

.mobile-match-row strong {
  min-width: 44px;
  border: 1px solid #d7cebd;
  border-radius: 999px;
  background: #f8f4ea;
  color: #24362c;
  font-size: 0.82rem;
  font-weight: 900;
  padding: 3px 7px;
  text-align: center;
  white-space: nowrap;
}

.mobile-match-row strong.mobile-match-a {
  border-color: #b8d4c0;
  background: #e8f0e8;
  color: #2f5d43;
}

.mobile-match-row strong.mobile-match-b {
  border-color: #e0c4c0;
  background: #f8e8e3;
  color: #9b3d30;
}

.mobile-match-row strong.mobile-match-tie {
  border-color: #dfcfaa;
  background: #f4ead4;
  color: #8a672f;
}

.mobile-match-row em {
  display: block;
  overflow: hidden;
  color: #5a6a5f;
  font-size: 0.66rem;
  font-style: normal;
  font-weight: 750;
  line-height: 1.2;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mobile-match-row small {
  display: block;
  margin-top: 1px;
  color: #8a9489;
  font-size: 0.58rem;
  font-weight: 800;
  letter-spacing: 0.04em;
  line-height: 1.1;
  text-transform: uppercase;
}

.mobile-match-open {
  border-radius: 999px;
  border: 0;
  background: #edf2ec;
  color: #2f5d43;
  cursor: pointer;
  font-size: 0.66rem;
  font-weight: 900;
  line-height: 1;
  padding: 5px 7px;
  white-space: nowrap;
}

.mobile-score-key {
  display: flex;
  flex-wrap: wrap;
  gap: 5px 8px;
  margin: 0 0 8px;
  color: #6a7a6f;
  font-size: 0.64rem;
  font-weight: 700;
}

.mobile-score-key span {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.mobile-players {
  display: grid;
  gap: 8px;
  margin-bottom: 12px;
}

.mobile-entry-header {
  display: grid;
  grid-template-columns: minmax(70px, 0.7fr) repeat(2, minmax(0, 1.15fr));
  gap: 8px;
  align-items: end;
  margin: -2px 10px -2px;
  color: #8a9489;
  font-size: 0.62rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-align: center;
  text-transform: uppercase;
}

.mobile-player-row {
  box-sizing: border-box;
  width: 100%;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  border: 1px solid #e4ddcd;
  border-radius: 8px;
  background: #fdfbf4;
  padding: 8px 10px;
}

.mobile-player-row-putts {
  display: grid;
  grid-template-columns: minmax(70px, 0.7fr) minmax(0, 2.3fr);
  align-items: center;
  gap: 8px;
}

.mobile-player-meta {
  flex: 1;
  min-width: 80px;
}

.mobile-player-name {
  font-weight: 800;
  color: #283b30;
  font-size: 1rem;
}

.mobile-player-hcp {
  font-size: 0.72rem;
  color: #8a9489;
  margin-top: 2px;
}

.mobile-stroke-dot {
  color: #b1462f;
  font-size: 0.55rem;
  margin-left: 3px;
  vertical-align: middle;
}

.mobile-score-block {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
}

.mobile-entry-controls {
  min-width: 0;
  width: 100%;
  display: flex;
  align-items: flex-start;
  justify-content: flex-end;
  gap: 8px;
}

.mobile-player-row-putts .mobile-entry-controls {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px;
}

.mobile-player-row-putts .mobile-score-block {
  min-width: 0;
}

.mobile-player-row-putts .mobile-stepper {
  width: 100%;
  justify-content: space-between;
}

.mobile-player-row-putts .stepper-btn {
  min-width: 36px;
  padding-inline: 8px;
}

.mobile-player-row-putts .mobile-score-input {
  width: 36px;
}

.mobile-field-label {
  font-size: 0.65rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #8a9489;
}

.mobile-stepper {
  display: flex;
  align-items: center;
  border: 1px solid #cdbf9f;
  border-radius: 8px;
  overflow: hidden;
  background: #fdfbf4;
}

.stepper-btn {
  border: none;
  background: transparent;
  color: #2f5d43;
  font-size: 1.2rem;
  font-weight: 700;
  min-width: 44px;
  min-height: 44px;
  padding: 6px 12px;
  cursor: pointer;
  line-height: 1;
}

.stepper-btn:active {
  background: #e8f0e8;
}

.mobile-score-input {
  width: 48px;
  min-height: 44px;
  border: none;
  background: transparent;
  text-align: center;
  font-size: 1.3rem;
  font-weight: 900;
  color: inherit;
  padding: 4px 0;
}

.mobile-field-error {
  color: #b1462f;
  font-size: 0.68rem;
  font-weight: 800;
}

.mobile-score-input:focus {
  outline: 2px solid #2f8f58;
  outline-offset: -2px;
}

/* Inherit score color classes on stepper */
.mobile-stepper.score-eagle .mobile-score-input { color: #8a672f; }
.mobile-stepper.score-birdie { background: #cdeccd; }
.mobile-stepper.score-bogey { background: #f3dede; }
.mobile-stepper.score-double { background: #e6c4c4; }

@media (max-width: 360px) {
  .mobile-player-row-putts {
    grid-template-columns: 1fr;
  }

  .mobile-player-row-putts .mobile-entry-controls {
    width: 100%;
  }
}

.mobile-hole-strip {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  justify-content: center;
}

.strip-btn {
  border: 1px solid #cdbf9f;
  border-radius: 6px;
  background: transparent;
  color: #6a7a6f;
  font-size: 0.72rem;
  font-weight: 700;
  min-width: 44px;
  min-height: 44px;
  padding: 4px 6px;
  cursor: pointer;
}

.strip-btn.active {
  background: #2f5d43;
  border-color: #2f5d43;
  color: #f3efe2;
}

.strip-btn.filled {
  border-color: #8a9489;
  color: #283b30;
}

.mobile-full-toggle {
  min-height: 44px;
}

.mobile-card-actions {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(112px, 0.72fr);
  gap: 8px;
  margin-top: 12px;
}

.mobile-card-actions .btn-ghost,
.mobile-card-actions .btn-primary {
  width: 100%;
  min-height: 44px;
  padding-inline: 10px;
}

.mobile-dialog-backdrop {
  position: fixed;
  inset: 0;
  z-index: 40;
  display: grid;
  align-items: end;
  background: rgb(36 54 44 / 42%);
  padding: 18px 10px;
}

.mobile-match-dialog {
  display: grid;
  gap: 10px;
  max-height: 82vh;
  overflow: hidden;
  border: 1px solid #d7cebd;
  border-radius: 10px;
  background: #fdfbf4;
  padding: 12px;
  box-shadow: 0 18px 46px rgb(36 54 44 / 28%);
}

.mobile-dialog-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}

.mobile-dialog-head div {
  display: grid;
  min-width: 0;
  gap: 2px;
}

.mobile-dialog-head span {
  color: #8a672f;
  font-size: 0.68rem;
  font-weight: 900;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.mobile-dialog-head strong {
  color: #24362c;
  font-size: 1rem;
  line-height: 1.1;
}

.mobile-dialog-head em {
  overflow: hidden;
  color: #4a5a4f;
  font-size: 0.78rem;
  font-style: normal;
  font-weight: 750;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mobile-dialog-table {
  max-height: 58vh;
  margin: 0;
  overflow: auto;
}

.sc-empty {
  margin: 48px auto 0;
}

.sc-empty-actions {
  display: flex;
  gap: 12px;
  margin-top: 20px;
}

@media (max-width: 760px) {
  .sc-shell {
    padding: 16px 16px 40px;
  }

  .sc-topbar {
    flex-direction: column;
    align-items: stretch;
  }

  .sc-title {
    font-size: 1.55rem;
    line-height: 1.08;
  }

  .event-score-banner {
    display: grid;
    gap: 3px;
    align-items: stretch;
    width: 100%;
  }

  .sc-topbar-actions {
    display: grid;
    grid-template-columns: 1fr;
    width: 100%;
  }

  .group-filter {
    flex-wrap: nowrap;
    overflow-x: auto;
    padding-bottom: 4px;
  }

  .group-filter-label,
  .gf-btn {
    flex: 0 0 auto;
  }

  .mobile-event-score {
    min-width: 92px;
  }

  .pp-groups {
    display: grid;
  }

  .pp-group {
    min-width: 0;
  }

  .skins-drawer-toggle {
    align-items: flex-start;
  }

  .skins-drawer-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .skins-drawer-tile {
    min-height: 82px;
  }

  .sc-topbar-actions .btn-primary,
  .sc-topbar-actions .btn-ghost {
    width: 100%;
    min-height: 44px;
  }

}

.btn-primary,
.btn-ghost {
  border-radius: 6px;
  padding: 8px 16px;
  min-height: 40px;
  font-weight: 700;
  cursor: pointer;
}

.btn-primary {
  border: 1px solid #2f5d43;
  background: #2f5d43;
  color: #f3efe2;
}

.btn-ghost {
  border: 1px solid #cdbf9f;
  background: transparent;
  color: #4a5a4f;
}
</style>
