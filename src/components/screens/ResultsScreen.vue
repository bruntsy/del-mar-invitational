<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { gamesFromEventRound } from '@/domain/events';
import { buildScoreContext } from '@/composables/useEventLeaderboard';
import { buildBestBallAggyConfig, scoreBestBallAggy } from '@/scoring/bestBallAggy';
import { computeEventRoundResult } from '@/scoring/eventRound';
import { buildHighBallLowBallConfig, scoreHighBallLowBall } from '@/scoring/highBallLowBall';
import { finalMatchStatus, runningMatchStatus, type HoleWinner } from '@/scoring/matchStatus';
import { buildTwoManScrambleConfig, scoreTwoManScramble, twoManScrambleTeamKey } from '@/scoring/twoManScramble';
import { useEventStore } from '@/stores/event';
import { useRoundStore } from '@/stores/round';
import { puttPenaltyNote } from '@/scoring/puttPoker';
import type { SkinHoleResult } from '@/scoring/skins';

const store = useRoundStore();
const eventStore = useEventStore();
const router = useRouter();

function confirmAction(message: string): boolean {
  const confirmMock = window.confirm as typeof window.confirm & { mock?: unknown };
  if (navigator.userAgent.includes('jsdom') && !confirmMock.mock) return true;
  try {
    const answer = window.confirm(message);
    return typeof answer === 'boolean' ? answer : true;
  } catch {
    return true;
  }
}

onMounted(() => {
  if (!store.round) store.load();
  if (store.round?.groupId && !eventStore.event) {
    void eventStore.loadEvent(store.round.groupId).then(() => eventStore.loadLinkedRounds());
  }
});

const course = computed(() => store.course);
const courseTitle = computed(() => {
  const c = course.value;
  if (!c) return '';
  const names = [c.clubName, c.courseName].filter(Boolean);
  const deduped = names.filter((name, index) => names.findIndex((other) => other?.trim() === name?.trim()) === index);
  return deduped.join(' — ') || c.courseName || c.clubName || 'Course';
});
const courseMeta = computed(() => {
  const c = course.value;
  if (!c) return '';
  return [c.tee?.name ? `${c.tee.name} tees` : '', c.location].filter(Boolean).join(' · ');
});

const teamNames = computed(() => store.round?.teamNames ?? { team1: 'Team 1', team2: 'Team 2' });
const teamMembers = computed(() => ({
  team1: store.round?.team1 ?? [],
  team2: store.round?.team2 ?? [],
}));

const leaderboard = computed(() => store.leaderboard);
const teamNet = computed(() => store.teamNetTotals);
const teamGameResults = computed(() => store.teamGameResults);
const activeEventRound = computed(() => {
  const roundId = store.round?.id;
  const event = eventStore.event;
  if (!roundId || !event) return null;
  const index = event.config.rounds.findIndex((round) => round.roundId === roundId);
  if (index < 0) return null;
  return { index, config: event.config.rounds[index], eventConfig: event.config };
});

const activeEventGames = computed(() => {
  const eventRound = activeEventRound.value;
  return eventRound ? gamesFromEventRound(eventRound.config) : null;
});

const eventRoundResult = computed(() => {
  const eventRound = activeEventRound.value;
  const games = activeEventGames.value;
  const scoreContext = store.round ? buildScoreContext(store.round, store.players) : null;
  if (!eventRound || !games || !scoreContext) return null;
  return computeEventRoundResult({
    round: eventRound.config,
    roundIndex: eventRound.index,
    scoreContext,
    games,
    pairMatches: eventRound.config.pairMatches,
    team1: eventRound.eventConfig.team1,
    team2: eventRound.eventConfig.team2,
    teamScores: store.round?.teamScores,
  });
});

const eventRoundSummary = computed(() => {
  const eventRound = activeEventRound.value;
  const result = eventRoundResult.value;
  if (!eventRound || !result) return null;
  return {
    name: eventRound.config.name || `Event Round ${eventRound.index + 1}`,
    team1Name: eventRound.eventConfig.teamNames.team1,
    team2Name: eventRound.eventConfig.teamNames.team2,
    team1: result.team1,
    team2: result.team2,
  };
});

const activeEventIsPrimaryMatchPlay = computed(() => {
  const eventRound = activeEventRound.value;
  if (!eventRound) return false;
  if (eventRound.config.scoringMode !== 'matchPlay') return false;
  return ['bestBallNassau', 'twoManBestBallAggy', 'twoManHighBallLowBall', 'scramble2v2Nassau'].includes(
    eventRound.config.format,
  );
});

const hasPrimaryMatchPlayGame = computed(() =>
  Boolean(
    activeEventIsPrimaryMatchPlay.value ||
      (store.games.bestBallAggy.enabled && store.games.bestBallAggy.scoringMode === 'match') ||
      (store.games.highBallLowBall.enabled && store.games.highBallLowBall.scoringMode === 'match') ||
      (store.games.twoManScramble.enabled && store.games.twoManScramble.scoringMode === 'match') ||
      (store.games.bestBall.enabled && store.games.bestBall.scoringMode === 'match'),
  ),
);
const wolf = computed(() => store.wolfResult);
const wolfVisible = computed(() => wolf.value.enabled && wolf.value.rows.length > 0);
const puttPokerEnabled = computed(() => store.games.puttPoker.enabled);
const puttPokerGroups = computed(() => store.puttPokerGroups);
const settlement = computed(() => store.settlement);
const settlementRows = computed(() =>
  store.playerNames.map((player) => ({ player, pnl: Math.round(settlement.value.pnl[player] || 0) })),
);
const settlementTransfers = computed(() =>
  settlement.value.transfers.map((transfer) => ({
    ...transfer,
    amount: Math.round(transfer.amount),
  })),
);

// Team-score winner highlighting (lower net wins), only once both teams are complete.
const teamOutcome = computed(() => {
  const { team1, team2 } = teamNet.value;
  if (team1 == null || team2 == null) {
    return { t1Win: false, t2Win: false, tied: false, decided: false };
  }
  return {
    t1Win: team1 < team2,
    t2Win: team2 < team1,
    tied: team1 === team2,
    decided: true,
  };
});

const skinsEnabled = computed(() => store.games.skins.enabled);
const skinHoles = computed(() => store.skins.holeResults);
const skinsSummary = computed(() =>
  Object.entries(store.skins.skinsByPlayer)
    .filter(([, skins]) => skins > 0)
    .sort(([, a], [, b]) => b - a),
);
const tiedSkinHoles = computed(() => skinHoles.value.filter((hole) => hole.tied).map((hole) => hole.hole));
const skinBasisLabel = computed(() => (store.games.skins.type === 'gross' ? 'Gross' : 'Net'));
const skinRows = computed(() => [
  { label: 'Front 9', holes: skinHoles.value.filter((hole) => hole.hole <= 9) },
  { label: 'Back 9', holes: skinHoles.value.filter((hole) => hole.hole > 9) },
]);
const completed = computed(() => store.round?.completed ?? false);
const expandedHblDetails = ref<Record<string, boolean>>({});

interface RoundStory {
  headline: string;
  subhead: string;
  facts: Array<{ label: string; value: string; note?: string }>;
}

interface SegmentDisplayRow {
  label: string;
  a: number | null;
  b: number | null;
  winnerSide: 'a' | 'b' | null;
  status: 'win' | 'push' | 'open';
  stake: number;
}

interface HblHoleDisplay {
  hole: number;
  a: number | null;
  b: number | null;
  result: string;
  status: string;
  winnerSide: 'a' | 'b' | 'tie' | null;
}

interface HblContestDisplay {
  key: 'lowBall' | 'highBall';
  label: string;
  status: string;
  statusState: 'win' | 'push' | 'open';
  winnerSide: 'a' | 'b' | null;
  segments: SegmentDisplayRow[];
  holes: HblHoleDisplay[];
}

function segmentRow(
  label: string,
  seg: {
    incomplete: boolean;
    pushed: boolean;
    winnerTeamId: string | undefined;
    stakePerPerson: number;
    teamScores?: Record<string, number>;
    teamHolesWon?: Record<string, number>;
  },
  aId: string,
  bId: string,
  mode: 'stroke' | 'match',
): SegmentDisplayRow {
  const map = mode === 'stroke' ? seg.teamScores : seg.teamHolesWon;
  const a = seg.incomplete || !map ? null : map[aId] ?? null;
  const b = seg.incomplete || !map ? null : map[bId] ?? null;
  let winnerSide: 'a' | 'b' | null = null;
  let status: 'win' | 'push' | 'open' = 'open';
  if (seg.incomplete) status = 'open';
  else if (seg.pushed) status = 'push';
  else {
    status = 'win';
    winnerSide = seg.winnerTeamId === aId ? 'a' : seg.winnerTeamId === bId ? 'b' : null;
  }
  return { label, a, b, winnerSide, status, stake: seg.stakePerPerson };
}

function sideName(side: 'a' | 'b' | null, aName: string, bName: string): string {
  if (side === 'a') return aName;
  if (side === 'b') return bName;
  return '';
}

function matchStatusLabel(winners: HoleWinner[], aName: string, bName: string): string {
  const status = finalMatchStatus(winners, { closeout: true });
  if (status.label === 'Pending') return 'In progress';
  if (status.leader === null) return 'All square';
  const leader = sideName(status.leader, aName, bName);
  return status.decided ? `${leader} wins ${status.label}` : `${leader} ${status.label.toLowerCase()}`;
}

function matchStatusState(winners: HoleWinner[]): { statusState: 'win' | 'push' | 'open'; winnerSide: 'a' | 'b' | null } {
  const status = finalMatchStatus(winners, { closeout: true });
  if (status.label === 'Pending') return { statusState: 'open', winnerSide: null };
  if (status.leader === null) return { statusState: 'push', winnerSide: null };
  if (status.leader !== 'a' && status.leader !== 'b') return { statusState: 'push', winnerSide: null };
  return { statusState: 'win', winnerSide: status.leader };
}

function segmentDisplayLabel(label: string): string {
  if (label === 'Front') return 'Front 9';
  if (label === 'Back') return 'Back 9';
  return label;
}

function segmentScoreLabel(row: SegmentDisplayRow): string {
  if (row.status === 'open' || row.a == null || row.b == null) return 'Open';
  return `${row.a}-${row.b}`;
}

function segmentOutcomeLabel(row: SegmentDisplayRow, aName: string, bName: string): string {
  if (row.status === 'open') return 'Not scored yet';
  if (row.status === 'push') return 'All square';
  const winner = sideName(row.winnerSide, aName, bName);
  return winner ? `${winner} wins` : 'Winner pending';
}

function holeWinnerSide(winnerTeamId: string | undefined, tied: boolean, incomplete: boolean, aId: string): HoleWinner {
  if (incomplete) return null;
  if (tied) return 'tie';
  if (winnerTeamId === aId) return 'a';
  if (winnerTeamId) return 'b';
  return null;
}

function holeResultLabel(winner: HoleWinner, aName: string, bName: string): string {
  if (winner === 'a') return aName;
  if (winner === 'b') return bName;
  if (winner === 'tie') return 'Push';
  return 'In progress';
}

function hblContest(
  key: 'lowBall' | 'highBall',
  label: string,
  match: ReturnType<typeof scoreHighBallLowBall>,
  rows: SegmentDisplayRow[],
  aName: string,
  bName: string,
): HblContestDisplay {
  const aId = match.teams[0].id;
  const bId = match.teams[1].id;
  const scoreKey = key === 'lowBall' ? 'lowBallScore' : 'highBallScore';
  const winnerKey = key === 'lowBall' ? 'lowBallWinnerTeamId' : 'highBallWinnerTeamId';
  const tiedKey = key === 'lowBall' ? 'lowBallTied' : 'highBallTied';
  const winners = match.holeResults.map((hole) =>
    holeWinnerSide(hole[winnerKey], hole[tiedKey], hole.incomplete, aId),
  );
  const finalStatus = matchStatusState(winners);
  const statuses = runningMatchStatus(winners, { closeout: true });
  return {
    key,
    label,
    status: matchStatusLabel(winners, aName, bName),
    ...finalStatus,
    segments: rows,
    holes: match.holeResults.map((hole, index) => {
      const winner = winners[index];
      return {
        hole: hole.holeNumber,
        a: hole.teamScores[aId][scoreKey],
        b: hole.teamScores[bId][scoreKey],
        result: holeResultLabel(winner, aName, bName),
        status: statuses[index]?.label === 'Pending' ? 'In progress' : statuses[index]?.label ?? 'In progress',
        winnerSide: winner,
      };
    }),
  };
}

const eventBestBallAggyResults = computed(() => {
  const eventRound = activeEventRound.value;
  const games = activeEventGames.value;
  const scoreContext = store.round ? buildScoreContext(store.round, store.players) : null;
  if (!eventRound || !games || !scoreContext || eventRound.config.format !== 'twoManBestBallAggy') return [];
  return eventRound.config.pairMatches.map((match) =>
    scoreBestBallAggy(buildBestBallAggyConfig(match, games.bestBallAggy), scoreContext),
  );
});

const eventHighBallLowBallResults = computed(() => {
  const eventRound = activeEventRound.value;
  const games = activeEventGames.value;
  const scoreContext = store.round ? buildScoreContext(store.round, store.players) : null;
  if (!eventRound || !games || !scoreContext || eventRound.config.format !== 'twoManHighBallLowBall') return [];
  return eventRound.config.pairMatches.map((match) =>
    scoreHighBallLowBall(buildHighBallLowBallConfig(match, games.highBallLowBall), scoreContext),
  );
});

const eventTwoManScrambleResults = computed(() => {
  const eventRound = activeEventRound.value;
  const games = activeEventGames.value;
  if (!eventRound || !games || !store.round || eventRound.config.format !== 'scramble2v2Nassau') return [];
  return eventRound.config.pairMatches.map((match, index) => {
    const config = buildTwoManScrambleConfig(match, index, games.twoManScramble);
    return scoreTwoManScramble(config, {
      [twoManScrambleTeamKey(index, 'a')]: store.round?.teamScores?.[twoManScrambleTeamKey(index, 'a')],
      [twoManScrambleTeamKey(index, 'b')]: store.round?.teamScores?.[twoManScrambleTeamKey(index, 'b')],
    });
  });
});

const bestBallAggyResults = computed(() =>
  (eventBestBallAggyResults.value.length ? eventBestBallAggyResults.value : store.bestBallAggyResults).map((r, index) => {
    const aId = r.teams[0].id;
    const bId = r.teams[1].id;
    const mode = r.scoringMode;
    return {
      index,
      aName: r.teams[0].players.join(' + ') || 'Team A',
      bName: r.teams[1].players.join(' + ') || 'Team B',
      mode,
      basis: r.scoreBasis,
      unit: mode === 'match' ? 'holes' : 'strokes',
      valid: r.valid,
      validationError: r.validationError,
      rows: [
        segmentRow('Best Ball — Front', r.segmentResults.bestBall.front, aId, bId, mode),
        segmentRow('Best Ball — Back', r.segmentResults.bestBall.back, aId, bId, mode),
        segmentRow('Best Ball — Overall', r.segmentResults.bestBall.overall, aId, bId, mode),
        segmentRow('Aggy — Front', r.segmentResults.aggy.front, aId, bId, mode),
        segmentRow('Aggy — Back', r.segmentResults.aggy.back, aId, bId, mode),
        segmentRow('Aggy — Overall', r.segmentResults.aggy.overall, aId, bId, mode),
      ],
    };
  }),
);

const highBallLowBallResults = computed(() =>
  (eventHighBallLowBallResults.value.length ? eventHighBallLowBallResults.value : store.highBallLowBallResults).map((r, index) => {
    const aId = r.teams[0].id;
    const bId = r.teams[1].id;
    const mode = r.scoringMode;
    const aName = r.teams[0].players.join(' + ') || 'Team A';
    const bName = r.teams[1].players.join(' + ') || 'Team B';
    const lowRows = [
      segmentRow('Front', r.segmentResults.lowBall.front, aId, bId, mode),
      segmentRow('Back', r.segmentResults.lowBall.back, aId, bId, mode),
      segmentRow('Overall', r.segmentResults.lowBall.overall, aId, bId, mode),
    ];
    const highRows = [
      segmentRow('Front', r.segmentResults.highBall.front, aId, bId, mode),
      segmentRow('Back', r.segmentResults.highBall.back, aId, bId, mode),
      segmentRow('Overall', r.segmentResults.highBall.overall, aId, bId, mode),
    ];
    return {
      index,
      aName,
      bName,
      mode,
      basis: r.scoreBasis,
      unit: mode === 'match' ? 'holes' : 'strokes',
      valid: r.valid,
      validationError: r.validationError,
      contests: [
        hblContest('lowBall', 'Low Ball', r, lowRows, aName, bName),
        hblContest('highBall', 'High Ball', r, highRows, aName, bName),
      ],
    };
  }),
);

function hblDetailKey(matchIndex: number, contest: HblContestDisplay): string {
  return `${matchIndex}-${contest.key}`;
}

function toggleHblDetails(matchIndex: number, contest: HblContestDisplay) {
  const key = hblDetailKey(matchIndex, contest);
  expandedHblDetails.value = { ...expandedHblDetails.value, [key]: !expandedHblDetails.value[key] };
}

const twoManScrambleResults = computed(() =>
  (eventTwoManScrambleResults.value.length ? eventTwoManScrambleResults.value : store.twoManScrambleResults).map((r, index) => {
    const aId = r.teams[0].id;
    const bId = r.teams[1].id;
    const mode = r.scoringMode;
    return {
      index,
      aName: r.teams[0].players.join(' + ') || 'Team A',
      bName: r.teams[1].players.join(' + ') || 'Team B',
      mode,
      unit: mode === 'match' ? 'holes' : 'strokes',
      valid: r.valid,
      validationError: r.validationError,
      rows: [
        segmentRow('Front', r.segmentResults.front, aId, bId, mode),
        segmentRow('Back', r.segmentResults.back, aId, bId, mode),
        segmentRow('Overall', r.segmentResults.overall, aId, bId, mode),
      ],
    };
  }),
);

function outcomeLabel(row: SegmentDisplayRow, aName: string, bName: string): string {
  if (row.status === 'open') return 'In progress';
  if (row.status === 'push') return 'Push';
  const winner = row.winnerSide === 'a' ? aName : bName;
  return row.stake > 0 ? `${winner} +$${row.stake}` : `${winner}`;
}

function segmentClass(segment: SegmentDisplayRow): string[] {
  return [`status-${segment.status}`, segment.winnerSide ? `winner-${segment.winnerSide}` : 'winner-none'];
}

function resultBadgeClass(status: 'win' | 'push' | 'open', winnerSide?: 'a' | 'b' | null): string[] {
  return ['result-badge', `status-${status}`, winnerSide ? `team-${winnerSide}` : 'team-neutral'];
}

function teamBoxClass(side: 'a' | 'b', winner: boolean): Record<string, boolean> {
  return { [`team-${side}`]: true, winner };
}

function teamScoreBadge(side: 'a' | 'b'): string {
  if (!teamOutcome.value.decided) return 'In progress';
  if (teamOutcome.value.tied) return 'Push';
  return side === 'a'
    ? teamOutcome.value.t1Win ? 'Winners' : 'Runner-up'
    : teamOutcome.value.t2Win ? 'Winners' : 'Runner-up';
}

function teamScoreBadgeClass(side: 'a' | 'b'): string[] {
  if (!teamOutcome.value.decided) return resultBadgeClass('open');
  if (teamOutcome.value.tied) return resultBadgeClass('push');
  const won = side === 'a' ? teamOutcome.value.t1Win : teamOutcome.value.t2Win;
  return resultBadgeClass(won ? 'win' : 'open', won ? side : null);
}

function lowerScoreWinner(a: number | null | undefined, b: number | null | undefined): 'a' | 'b' | 'push' | 'open' {
  if (a == null || b == null) return 'open';
  if (a === b) return 'push';
  return a < b ? 'a' : 'b';
}

function teamGameSideClass(game: { team1: { total: number | null }; team2: { total: number | null } }, side: 'a' | 'b'): string[] {
  const winner = lowerScoreWinner(game.team1.total, game.team2.total);
  return [`team-${side}`, winner === side ? 'winner' : '', winner === 'push' ? 'pushed' : ''].filter(
    (value): value is string => Boolean(value),
  );
}

function teamGameBadge(game: { team1: { total: number | null }; team2: { total: number | null } }, side: 'a' | 'b'): string {
  const winner = lowerScoreWinner(game.team1.total, game.team2.total);
  if (winner === 'open') return 'In progress';
  if (winner === 'push') return 'Push';
  return winner === side ? 'Winning' : 'Trailing';
}

function teamGameBadgeClass(game: { team1: { total: number | null }; team2: { total: number | null } }, side: 'a' | 'b'): string[] {
  const winner = lowerScoreWinner(game.team1.total, game.team2.total);
  if (winner === 'push') return resultBadgeClass('push');
  if (winner === 'open' || winner !== side) return resultBadgeClass('open');
  return resultBadgeClass('win', side);
}

function winnersFromScores(
  team1Name: string,
  team1: number | null,
  team2Name: string,
  team2: number | null,
  lowWins: boolean,
): { headline: string; winner: string | null } {
  if (team1 == null || team2 == null) return { headline: 'Round still taking shape', winner: null };
  if (team1 === team2) return { headline: `${team1Name} and ${team2Name} are tied, ${team1}-${team2}`, winner: null };
  const team1Wins = lowWins ? team1 < team2 : team1 > team2;
  const winner = team1Wins ? team1Name : team2Name;
  return { headline: `${winner} wins, ${team1Wins ? team1 : team2}-${team1Wins ? team2 : team1}`, winner };
}

const topNetStory = computed(() => {
  const topNet = leaderboard.value.find((row) => row.net != null)?.net;
  if (topNet == null) return null;
  const players = leaderboard.value.filter((row) => row.net === topNet).map((row) => row.player);
  return {
    players: players.join(', '),
    net: topNet,
  };
});

const skinsLeaderStory = computed(() => {
  const leader = skinsSummary.value[0];
  if (!leader) return null;
  return { player: leader[0], skins: leader[1] };
});

const biggestEventMatchStory = computed(() => {
  const result = eventRoundResult.value;
  if (!result?.rows.length) return null;
  const rows = result.rows
    .map((row) => {
      const team1 = row.components.reduce((total, component) => total + component.team1, 0);
      const team2 = row.components.reduce((total, component) => total + component.team2, 0);
      return {
        row,
        team1,
        team2,
        margin: Math.abs(team1 - team2),
      };
    })
    .filter((row) => row.team1 !== row.team2)
    .sort((a, b) => b.margin - a.margin);
  const best = rows[0];
  if (!best) return null;
  const winner = best.team1 > best.team2 ? best.row.aPlayers.join(' + ') : best.row.bPlayers.join(' + ');
  const label = `${best.row.aPlayers.join(' + ')} vs ${best.row.bPlayers.join(' + ')}`;
  return {
    label,
    value: `${winner} carried it, ${best.team1}-${best.team2}`,
  };
});

const roundStory = computed<RoundStory>(() => {
  const event = eventRoundSummary.value;
  const eventOutcome = event
    ? winnersFromScores(event.team1Name, event.team1, event.team2Name, event.team2, false)
    : null;
  const teamOutcomeStory = !event
    ? winnersFromScores(teamNames.value.team1, teamNet.value.team1, teamNames.value.team2, teamNet.value.team2, true)
    : null;
  const headline = event
    ? (eventOutcome ?? { headline: 'Round still taking shape' }).headline.replace('wins,', `wins ${event.name},`)
    : teamOutcomeStory?.headline ?? 'Round still taking shape';
  const subhead = event
    ? 'Round points, player scoring, skins, and money all in one share-ready view.'
    : 'Team net, player scoring, skins, and money all in one share-ready view.';
  const facts: RoundStory['facts'] = [];

  if (event) {
    facts.push({
      label: 'Round points',
      value: `${event.team1Name} ${event.team1} · ${event.team2Name} ${event.team2}`,
    });
  } else if (teamNet.value.team1 != null && teamNet.value.team2 != null) {
    facts.push({
      label: 'Team net',
      value: `${teamNames.value.team1} ${teamNet.value.team1} · ${teamNames.value.team2} ${teamNet.value.team2}`,
    });
  }

  if (topNetStory.value) {
    facts.push({ label: 'Top net', value: `${topNetStory.value.players} · ${topNetStory.value.net}` });
  }
  if (skinsLeaderStory.value) {
    facts.push({
      label: 'Skins leader',
      value: `${skinsLeaderStory.value.player} · ${skinsLeaderStory.value.skins}`,
    });
  }
  if (biggestEventMatchStory.value) {
    facts.push({
      label: 'Biggest match',
      value: biggestEventMatchStory.value.value,
      note: biggestEventMatchStory.value.label,
    });
  }
  if (settlementTransfers.value[0]) {
    const payment = settlementTransfers.value[0];
    facts.push({
      label: 'Top payment',
      value: `${payment.from} pays ${payment.to} $${payment.amount}`,
    });
  }

  return { headline, subhead, facts };
});

function dash(value: number | null | undefined): string {
  return value == null ? '—' : String(value);
}

function money(value: number): string {
  if (value === 0) return '$0';
  return `${value > 0 ? '+' : '-'}$${Math.abs(value)}`;
}

function cardLifeLabel(cards: number): string {
  return `${cards} card${cards === 1 ? '' : 's'} left`;
}

function puttPokerStateLabel(coinHolder: string | null): string {
  return coinHolder ? `Coin is with ${coinHolder}` : 'No penalty putts yet';
}

function puttPokerPotLabel(pot: number): string {
  return `Pot is $${pot}`;
}

function betLabelParts(label: string): { contest: string; segment: string } {
  const [contest, segment] = label.split(' — ');
  return { contest, segment: segment ?? '' };
}

function skinPar(hole: number): number | null {
  return course.value?.par?.[hole - 1] ?? null;
}

function scoreToParDescriptor(hole: SkinHoleResult): string {
  const par = skinPar(hole.hole);
  if (hole.tied || !hole.winner || par == null) return 'No skin';
  const score = hole.effectiveScores[hole.winner];
  if (score == null) return 'Skin won';
  const diff = score - par;
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
  const par = skinPar(hole.hole);
  const parts = [par == null ? null : `Par ${par}`, scoreToParDescriptor(hole)].filter(Boolean);
  return parts.join(' · ');
}

function toggleComplete() {
  if (!completed.value) {
    const ok = confirmAction('Complete this round?\n\nThis will save the final results to the event and group history.');
    if (!ok) return;
  }
  store.setCompleted(!completed.value);
}

function resetRound() {
  const firstOk = confirmAction('Reset this round?\n\nThis will clear entered scores and calculated results for this round. This cannot be undone.');
  if (!firstOk) return;
  const finalOk = confirmAction('Type-level confirmation\n\nChoose OK only if you intentionally want to reset this round and lose the current scores.');
  if (!finalOk) return;
  store.reset();
  void router.push('/group');
}

function rankLabel(index: number): string {
  const row = leaderboard.value[index];
  if (!row || row.net == null) return String(index + 1);
  const firstTie = leaderboard.value.findIndex((candidate) => candidate.net === row.net);
  const tied = leaderboard.value.filter((candidate) => candidate.net === row.net).length > 1;
  return tied ? `T${firstTie + 1}` : String(index + 1);
}

function isLeader(index: number): boolean {
  const row = leaderboard.value[index];
  const first = leaderboard.value.find((candidate) => candidate.net != null);
  return row?.net != null && first?.net === row.net;
}

function hblMatchPointSummary(matchIndex: number, aName: string, bName: string): string {
  const row = eventRoundResult.value?.rows[matchIndex];
  if (!row) return 'Event points pending';
  const a = row.components.reduce((total, component) => total + component.team1, 0);
  const b = row.components.reduce((total, component) => total + component.team2, 0);
  if (a === b) return `Push ${a}-${b} event points`;
  return `${a > b ? aName : bName} wins ${a}-${b} event points`;
}

function goScorecard() {
  void router.push('/scorecard');
}

function goGroup() {
  void router.push('/group');
}
</script>

<template>
  <main class="rs-shell">
    <template v-if="store.round && course">
      <header class="rs-topbar">
        <div>
          <p class="rs-eyebrow">{{ completed ? '✓ Round Complete' : 'Final Results' }}</p>
          <h1 class="rs-title">Final Results</h1>
          <p v-if="eventRoundSummary" class="rs-event-round">{{ eventRoundSummary.name }}</p>
          <p class="rs-course-title">{{ courseTitle }}</p>
          <p v-if="courseMeta" class="rs-course-meta">{{ courseMeta }}</p>
        </div>
        <div v-if="eventRoundSummary" class="round-points-card" aria-label="Round points">
          <span>Round points</span>
          <div class="round-points-row team-a">
            <strong>{{ eventRoundSummary.team1Name }}</strong>
            <b>{{ eventRoundSummary.team1 }}</b>
          </div>
          <div class="round-points-row team-b">
            <strong>{{ eventRoundSummary.team2Name }}</strong>
            <b>{{ eventRoundSummary.team2 }}</b>
          </div>
        </div>
        <div class="rs-actions">
          <button class="btn-ghost" type="button" @click="goScorecard">Back to scorecard</button>
          <button class="btn-complete" type="button" @click="toggleComplete">
            {{ completed ? 'Reopen round' : 'Complete round' }}
          </button>
          <button class="btn-reset-secondary" type="button" @click="resetRound">Reset round</button>
        </div>
      </header>

      <section class="story-card" aria-label="Story of the round">
        <div class="story-main">
          <span>Story of the round</span>
          <h2>{{ roundStory.headline }}</h2>
          <p>{{ roundStory.subhead }}</p>
        </div>
        <div class="story-facts">
          <div v-for="fact in roundStory.facts" :key="fact.label" class="story-fact">
            <span>{{ fact.label }}</span>
            <strong>{{ fact.value }}</strong>
            <em v-if="fact.note">{{ fact.note }}</em>
          </div>
        </div>
      </section>

      <section v-if="!hasPrimaryMatchPlayGame" class="rs-section">
        <h2 class="rs-section-hdr">Team Scores</h2>
        <div class="team-grid">
          <div class="team-box" :class="teamBoxClass('a', teamOutcome.t1Win)">
            <div class="tb-label">{{ teamNames.team1 }}</div>
            <div class="tb-members">{{ teamMembers.team1.join(', ') }}</div>
            <div class="tb-score" :class="{ 'winner-score': teamOutcome.t1Win }">{{ dash(teamNet.team1) }}</div>
            <div :class="teamScoreBadgeClass('a')">{{ teamScoreBadge('a') }}</div>
          </div>
          <div class="team-vs">vs</div>
          <div class="team-box" :class="teamBoxClass('b', teamOutcome.t2Win)">
            <div class="tb-label">{{ teamNames.team2 }}</div>
            <div class="tb-members">{{ teamMembers.team2.join(', ') }}</div>
            <div class="tb-score" :class="{ 'winner-score': teamOutcome.t2Win }">{{ dash(teamNet.team2) }}</div>
            <div :class="teamScoreBadgeClass('b')">{{ teamScoreBadge('b') }}</div>
          </div>
        </div>
      </section>

      <section class="rs-section">
        <h2 class="rs-section-hdr">Individual Leaderboard</h2>
        <p class="rs-section-note">Strokes are course strokes received. Tied net scores share the same rank.</p>
        <div class="rs-table-wrap">
          <table class="rs-table leaderboard-table">
            <thead>
              <tr><th>Rank</th><th class="col-left">Player</th><th class="col-left">Team</th><th>Gross</th><th>Strokes received</th><th>Net</th><th>Skins</th></tr>
            </thead>
            <tbody>
              <tr v-for="(row, i) in leaderboard" :key="row.player" :class="{ 'leader-row': isLeader(i) }">
                <td class="rs-rank" data-label="Rank">{{ rankLabel(i) }}</td>
                <td class="col-left" data-label="Player">
                  <span :class="{ 'rs-winner': isLeader(i) }">{{ row.player }}</span>
                </td>
                <td class="col-left" data-label="Team">{{ row.team }}</td>
                <td data-label="Gross">{{ dash(row.gross) }}</td>
                <td data-label="Strokes received">{{ row.strokes > 0 ? `+${row.strokes}` : '—' }}</td>
                <td class="rs-net" data-label="Net">{{ dash(row.net) }}</td>
                <td class="rs-skins" data-label="Skins">{{ row.skins > 0 ? row.skins : '—' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section v-if="store.hasBets" class="rs-section">
        <h2 class="rs-section-hdr">Settlement</h2>
        <div v-if="settlementTransfers.length" class="settle-list" aria-label="Payments">
          <h3 class="settle-subhead">Payments due</h3>
          <div v-for="(t, i) in settlementTransfers" :key="i" class="settle-row">
            <span>{{ t.from }} <span class="settle-arrow">pays</span> {{ t.to }}</span>
            <span class="settle-amount">${{ t.amount }}</span>
          </div>
        </div>
        <p v-else class="settle-square">No payments due. All selected money games were played for $0 or settled evenly.</p>
        <h3 class="settle-subhead net-subhead">Net by player</h3>
        <table class="pnl-table" aria-label="Net by player">
          <thead>
            <tr><th>Player</th><th>Net</th></tr>
          </thead>
          <tbody>
            <tr v-for="row in settlementRows" :key="row.player">
              <td>{{ row.player }}</td>
              <td :class="row.pnl > 0 ? 'pnl-pos' : row.pnl < 0 ? 'pnl-neg' : ''">
                {{ money(row.pnl) }}
              </td>
            </tr>
          </tbody>
        </table>
      </section>

      <section v-if="teamGameResults.length" class="rs-section">
        <h2 class="rs-section-hdr">Team Game Results</h2>
        <div v-for="game in teamGameResults" :key="game.key" class="fc-game">
          <div class="fc-game-label">{{ game.label }} <span class="fc-type">{{ game.type }}</span></div>
          <div class="fc-grid">
            <div class="fc-box" :class="teamGameSideClass(game, 'a')">
              <div class="fc-team">{{ teamNames.team1 }}</div>
              <div class="fc-split">
                <div><span class="fc-sub">Front</span><span class="fc-val">{{ dash(game.team1.front) }}</span></div>
                <div><span class="fc-sub">Back</span><span class="fc-val">{{ dash(game.team1.back) }}</span></div>
              </div>
              <div class="fc-total-label">Total</div>
              <div class="fc-score">{{ dash(game.team1.total) }}</div>
              <div :class="teamGameBadgeClass(game, 'a')">{{ teamGameBadge(game, 'a') }}</div>
            </div>
            <div class="fc-vs">vs</div>
            <div class="fc-box" :class="teamGameSideClass(game, 'b')">
              <div class="fc-team">{{ teamNames.team2 }}</div>
              <div class="fc-split">
                <div><span class="fc-sub">Front</span><span class="fc-val">{{ dash(game.team2.front) }}</span></div>
                <div><span class="fc-sub">Back</span><span class="fc-val">{{ dash(game.team2.back) }}</span></div>
              </div>
              <div class="fc-total-label">Total</div>
              <div class="fc-score">{{ dash(game.team2.total) }}</div>
              <div :class="teamGameBadgeClass(game, 'b')">{{ teamGameBadge(game, 'b') }}</div>
            </div>
          </div>
        </div>
      </section>

      <section v-if="bestBallAggyResults.length" class="rs-section">
        <h2 class="rs-section-hdr">Best Ball + Aggy</h2>
        <div v-for="match in bestBallAggyResults" :key="`bba-${match.index}`" class="bba-match">
          <div class="bba-head">
            <span class="bba-vs">{{ match.aName }} <span class="bba-vs-sep">vs</span> {{ match.bName }}</span>
            <span class="bba-meta">{{ match.mode === 'match' ? 'Match play' : 'Stroke play' }} · {{ match.basis }}</span>
          </div>
          <p v-if="!match.valid" class="bba-error">{{ match.validationError }}</p>
          <table v-else class="rs-table bba-table">
            <thead>
              <tr>
                <th>Bet</th>
                <th>{{ match.aName }}</th>
                <th>{{ match.bName }}</th>
                <th>Result</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in match.rows" :key="row.label" :class="`status-${row.status}`">
                <td class="bba-bet">
                  <span class="bba-contest">{{ betLabelParts(row.label).contest }}</span>
                  <span v-if="betLabelParts(row.label).segment" class="bba-segment">{{ betLabelParts(row.label).segment }}</span>
                </td>
                <td :class="{ 'bba-win': row.winnerSide === 'a' }">{{ dash(row.a) }}</td>
                <td :class="{ 'bba-win': row.winnerSide === 'b' }">{{ dash(row.b) }}</td>
                <td class="bba-result">
                  <span :class="resultBadgeClass(row.status, row.winnerSide)">{{ outcomeLabel(row, match.aName, match.bName) }}</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section v-if="highBallLowBallResults.length" class="rs-section">
        <h2 class="rs-section-hdr">High Ball / Low Ball</h2>
        <div v-for="match in highBallLowBallResults" :key="`hbl-${match.index}`" class="hbl-match">
          <div class="bba-head">
            <div>
              <span class="bba-vs">{{ match.aName }} <span class="bba-vs-sep">vs</span> {{ match.bName }}</span>
              <p class="hbl-match-summary">{{ hblMatchPointSummary(match.index, match.aName, match.bName) }}</p>
            </div>
            <span class="bba-meta">{{ match.mode === 'match' ? 'Match play' : 'Stroke play' }} · {{ match.basis }} · event points</span>
          </div>
          <p v-if="!match.valid" class="bba-error">{{ match.validationError }}</p>
          <div v-else class="hbl-contests">
            <article v-for="contest in match.contests" :key="contest.key" class="hbl-card">
              <div class="hbl-card-head">
                <div>
                  <h3>{{ contest.label }}</h3>
                  <p>{{ contest.status }}</p>
                </div>
                <span :class="resultBadgeClass(contest.statusState, contest.winnerSide)">{{ contest.status }}</span>
              </div>

              <div class="hbl-segments">
                <div
                  v-for="segment in contest.segments"
                  :key="segment.label"
                  class="hbl-segment"
                  :class="segmentClass(segment)"
                >
                  <span class="hbl-segment-label">{{ segmentDisplayLabel(segment.label) }}</span>
                  <strong class="hbl-segment-score">{{ segmentScoreLabel(segment) }}</strong>
                  <em class="hbl-segment-result">{{ segmentOutcomeLabel(segment, match.aName, match.bName) }}</em>
                </div>
              </div>

              <button class="btn-ghost hbl-toggle" type="button" @click="toggleHblDetails(match.index, contest)">
                {{ expandedHblDetails[hblDetailKey(match.index, contest)] ? 'Hide hole-by-hole' : 'View hole-by-hole' }}
              </button>

              <div v-if="expandedHblDetails[hblDetailKey(match.index, contest)]" class="hbl-detail">
                <div class="hbl-legend">
                  <span>AS = all square</span>
                  <span>Push = tied hole or segment</span>
                  <span>{{ match.aName }} / {{ match.bName }} = winning side</span>
                </div>
                <div class="hbl-timeline">
                  <div v-for="hole in contest.holes" :key="`${contest.key}-${hole.hole}`" class="hbl-hole" :class="`winner-${hole.winnerSide ?? 'open'}`">
                    <div class="hbl-hole-top">
                      <strong>Hole {{ hole.hole }}</strong>
                      <span>{{ hole.status }}</span>
                    </div>
                    <div class="hbl-hole-scores">
                      <span>{{ match.aName }}: <strong>{{ dash(hole.a) }}</strong></span>
                      <span>{{ match.bName }}: <strong>{{ dash(hole.b) }}</strong></span>
                    </div>
                    <div class="hbl-hole-result">Result: {{ hole.result }}</div>
                  </div>
                </div>
              </div>
            </article>
          </div>
        </div>
      </section>

      <section v-if="twoManScrambleResults.length" class="rs-section">
        <h2 class="rs-section-hdr">Two-Man Scramble</h2>
        <div v-for="match in twoManScrambleResults" :key="`tms-${match.index}`" class="bba-match">
          <div class="bba-head">
            <span class="bba-vs">{{ match.aName }} <span class="bba-vs-sep">vs</span> {{ match.bName }}</span>
            <span class="bba-meta">{{ match.mode === 'match' ? 'Match play' : 'Stroke play' }} · gross</span>
          </div>
          <p v-if="!match.valid" class="bba-error">{{ match.validationError }}</p>
          <table v-else class="rs-table bba-table">
            <thead>
              <tr>
                <th>Segment</th>
                <th>{{ match.aName }}</th>
                <th>{{ match.bName }}</th>
                <th>Result</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in match.rows" :key="row.label" :class="`status-${row.status}`">
                <td class="bba-bet">{{ row.label }}</td>
                <td :class="{ 'bba-win': row.winnerSide === 'a' }">{{ dash(row.a) }}</td>
                <td :class="{ 'bba-win': row.winnerSide === 'b' }">{{ dash(row.b) }}</td>
                <td class="bba-result">
                  <span :class="resultBadgeClass(row.status, row.winnerSide)">{{ outcomeLabel(row, match.aName, match.bName) }}</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section v-if="wolfVisible" class="rs-section">
        <h2 class="rs-section-hdr">Wolf</h2>
        <div class="wolf-standings">
          <div v-for="row in wolf.standings" :key="row.player" class="wolf-stand" :class="{ winner: row.leader }">
            <div class="wolf-player">{{ row.player }}</div>
            <div class="wolf-points-total">{{ row.points }}</div>
            <div class="wolf-tag">{{ row.leader ? 'Leader' : 'points' }}</div>
          </div>
        </div>

        <div v-if="wolf.nassau" class="wolf-scroll">
          <table class="rs-table wolf-segments">
            <thead>
              <tr>
                <th class="col-left">Nassau</th>
                <th v-for="player in store.playerNames" :key="`seg-head-${player}`">{{ player }}</th>
                <th class="col-left">Winner</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="segment in wolf.segments" :key="segment.label">
                <td class="col-left">{{ segment.label }}</td>
                <td v-for="player in store.playerNames" :key="`${segment.label}-${player}`">
                  {{ segment.points[player] || 0 }}
                </td>
                <td class="col-left">{{ segment.winners.length ? segment.winners.join(', ') : '—' }}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="wolf-scroll">
          <table class="rs-table wolf-holes">
            <thead>
              <tr>
                <th>Hole</th>
                <th class="col-left">Wolf Side</th>
                <th class="col-left">Field</th>
                <th class="col-left">Result</th>
                <th class="col-left">Points</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in wolf.rows" :key="row.hole">
                <td>{{ row.hole }}</td>
                <td class="col-left">{{ row.result.sideA.join(' + ') || '—' }}</td>
                <td class="col-left">{{ row.result.sideB.join(' + ') || '—' }}</td>
                <td class="col-left">{{ row.resultLabel }}</td>
                <td class="col-left">{{ row.pointsLabel }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section v-if="puttPokerEnabled" class="rs-section">
        <h2 class="rs-section-hdr">Putt Poker</h2>
        <div class="pp-groups">
          <div v-for="group in puttPokerGroups" :key="group.name" class="pp-group">
            <div class="pp-group-hdr">{{ group.name }}</div>
            <div class="pp-state-grid">
              <div class="pp-state-card">
                <span>Pot</span>
                <strong>{{ puttPokerPotLabel(group.result.pot) }}</strong>
              </div>
              <div class="pp-state-card">
                <span>Coin state</span>
                <strong :class="{ 'pp-coin-none': !group.result.coinHolder }">{{ puttPokerStateLabel(group.result.coinHolder) }}</strong>
              </div>
            </div>
            <div class="pp-token-label">Card lives remaining</div>
            <div class="pp-cards">
              <div v-for="player in group.players" :key="player" class="pp-player">
                <div class="pp-player-name">{{ player }}</div>
                <div class="pp-card-count">{{ cardLifeLabel(group.result.cards[player]) }}</div>
                <div
                  v-if="puttPenaltyNote(group.result.threePuttCount[player], group.result.fourPuttCount[player])"
                  class="pp-note"
                >
                  {{ puttPenaltyNote(group.result.threePuttCount[player], group.result.fourPuttCount[player]) }}
                </div>
              </div>
            </div>
            <p class="pp-final-note">No final pot winner yet unless your group has declared one.</p>
          </div>
        </div>
      </section>

      <section v-if="skinsEnabled" class="rs-section">
        <h2 class="rs-section-hdr">Skins Breakdown · {{ store.games.skins.type }}</h2>
        <p v-if="!skinHoles.length" class="rs-empty-note">No completed holes yet.</p>
        <template v-else>
          <div class="skins-summary">
            <h3>Skins won</h3>
            <div v-if="skinsSummary.length" class="skins-summary-list">
              <span v-for="[player, skins] in skinsSummary" :key="player">{{ player }} {{ skins }}</span>
            </div>
            <p v-else>No skins won yet.</p>
          </div>
          <p v-if="tiedSkinHoles.length" class="skins-note">
            Tied holes do not pay a skin here: {{ tiedSkinHoles.join(', ') }}.
          </p>
          <div class="skins-rows" aria-label="Hole-by-hole skins">
            <div v-for="row in skinRows" :key="row.label" class="skins-row">
              <h3>{{ row.label }}</h3>
              <div class="skins-grid">
                <div v-for="h in row.holes" :key="h.hole" class="skin-chip" :class="{ tied: h.tied }">
                  <span class="skin-hole">Hole {{ h.hole }}</span>
                  <span class="skin-winner">{{ h.tied ? 'Tied' : h.winner }}</span>
                  <span class="skin-detail">{{ skinDetailLabel(h) }}</span>
                </div>
              </div>
            </div>
          </div>
        </template>
      </section>
    </template>

    <section v-else class="panel rs-empty">
      <p class="eyebrow">Results</p>
      <h1>No active round</h1>
      <p class="lede">Start or score a round to see results.</p>
      <div class="rs-empty-actions">
        <button class="btn-primary" type="button" @click="goGroup">Back to group</button>
      </div>
    </section>
  </main>
</template>

<style scoped>
.rs-shell {
  max-width: 900px;
  margin: 0 auto;
  padding: 20px 16px 48px;
}

.rs-topbar {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 20px;
  flex-wrap: wrap;
}

.rs-eyebrow {
  margin: 0;
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: #8a672f;
}

.rs-title {
  margin: 4px 0 0;
  font-size: 1.4rem;
  color: #24362c;
}

.rs-course-title {
  margin: 4px 0 0;
  color: #6a7a6f;
  font-size: 0.86rem;
  font-weight: 700;
}

.rs-event-round {
  margin: 4px 0 0;
  color: #24362c;
  font-size: 1rem;
  font-weight: 800;
}

.rs-course-meta {
  margin: 2px 0 0;
  color: #7a8a7e;
  font-size: 0.78rem;
  font-weight: 700;
}

.round-points-card {
  min-width: 180px;
  border: 1px solid #d7cebd;
  border-radius: 8px;
  background: #fdfbf4;
  padding: 10px 12px;
}

.round-points-card > span {
  display: block;
  margin-bottom: 6px;
  color: #8a672f;
  font-size: 0.68rem;
  font-weight: 900;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.round-points-card .round-points-row {
  display: flex;
  justify-content: space-between;
  gap: 18px;
  border-left: 3px solid transparent;
  padding-left: 8px;
  color: #24362c;
  font-size: 0.86rem;
}

.round-points-row + .round-points-row {
  margin-top: 3px;
}

.team-a {
  --team-accent: #2f5d43;
  --team-accent-soft: #e8f0e8;
  --team-accent-border: #92b99b;
}

.team-b {
  --team-accent: #9f3f2d;
  --team-accent-soft: #faebe6;
  --team-accent-border: #d8a18e;
}

.round-points-row.team-a,
.round-points-row.team-b {
  border-left-color: var(--team-accent);
}

.round-points-card b {
  color: #2f5d43;
}

.round-points-row.team-b b {
  color: #9f3f2d;
}

.rs-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  align-items: center;
}

.story-card {
  display: grid;
  grid-template-columns: minmax(220px, 1.1fr) minmax(280px, 1.4fr);
  gap: 14px;
  border: 1px solid #d7cebd;
  border-radius: 8px;
  background: #fdfbf4;
  box-shadow: 0 1px 0 rgba(47, 93, 67, 0.08);
  padding: 16px 18px;
}

.story-main {
  border-left: 4px solid #2f5d43;
  padding-left: 12px;
}

.story-main > span,
.story-fact span {
  display: block;
  color: #8a672f;
  font-size: 0.66rem;
  font-weight: 900;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.story-main h2 {
  margin: 4px 0 6px;
  color: #24362c;
  font-size: 1.22rem;
  line-height: 1.15;
}

.story-main p {
  margin: 0;
  color: #6a7a6f;
  font-size: 0.82rem;
  font-weight: 700;
  line-height: 1.35;
}

.story-facts {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.story-fact {
  min-width: 0;
  border: 1px solid #e4ddcd;
  border-radius: 8px;
  background: #fffdf7;
  padding: 9px 10px;
}

.story-fact strong {
  display: block;
  margin-top: 3px;
  color: #24362c;
  font-size: 0.9rem;
  line-height: 1.2;
}

.story-fact em {
  display: block;
  margin-top: 3px;
  color: #7a8a7e;
  font-size: 0.72rem;
  font-style: normal;
  font-weight: 700;
  line-height: 1.25;
}

.rs-section {
  margin-top: 22px;
  border: 1px solid #d7cebd;
  border-radius: 8px;
  background: #f8f4ea;
  padding: 16px 20px;
}

.rs-section-hdr {
  margin: 0 0 14px;
  font-size: 0.95rem;
  color: #24362c;
}

.rs-section-note {
  margin: -6px 0 12px;
  color: #6a7a6f;
  font-size: 0.76rem;
  font-weight: 700;
}

.rs-section > .rs-table-wrap,
.rs-section > .pnl-table {
  margin-top: 4px;
}

.team-grid {
  display: flex;
  align-items: center;
  gap: 16px;
}

.team-box {
  flex: 1;
  text-align: center;
  border: 1px solid #e4ddcd;
  border-radius: 8px;
  background: #fdfbf4;
  padding: 16px 12px;
  box-shadow: 4px 0 0 var(--team-accent, transparent) inset;
}

.team-box.winner {
  border-color: var(--team-accent-border);
  background: var(--team-accent-soft);
  box-shadow: 4px 0 0 var(--team-accent) inset, 0 0 0 1px var(--team-accent-border) inset;
}

.tb-label {
  font-weight: 700;
  color: var(--team-accent, #2f5d43);
}

.tb-members {
  font-size: 0.74rem;
  color: #8a9489;
  margin: 2px 0 8px;
}

.tb-score {
  font-size: 2rem;
  font-weight: 700;
  color: #24362c;
  line-height: 1;
}

.tb-score.winner-score { color: var(--team-accent, #b08416); }

.result-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  max-width: 100%;
  min-height: 24px;
  border: 1px solid #d7cebd;
  border-radius: 999px;
  background: #f4efe4;
  color: #6a7a6f;
  padding: 3px 9px;
  font-size: 0.72rem;
  font-weight: 900;
  line-height: 1.15;
  text-align: center;
  white-space: normal;
}

.result-badge.status-win.team-a {
  border-color: #92b99b;
  background: #e8f0e8;
  color: #2f5d43;
}

.result-badge.status-win.team-b {
  border-color: #d8a18e;
  background: #faebe6;
  color: #9f3f2d;
}

.result-badge.status-push {
  border-color: #d7c08f;
  background: #fbf6ea;
  color: #8a672f;
}

.result-badge.status-open {
  color: #7a8a7e;
}

.team-vs {
  color: #9aa49a;
  font-size: 0.8rem;
  font-weight: 700;
}

.rs-table-wrap {
  overflow-x: auto;
}

.rs-table {
  border-collapse: collapse;
  width: 100%;
  font-size: 0.85rem;
  background: #fdfbf4;
  border: 1px solid #e4ddcd;
  border-radius: 8px;
  overflow: hidden;
}

.rs-table th,
.rs-table td {
  border-bottom: 1px solid #e4ddcd;
  padding: 7px 10px;
  text-align: center;
  white-space: nowrap;
}

.rs-table thead th {
  background: #efe9da;
  color: #4a5a4f;
  font-size: 0.72rem;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.rs-table tbody tr:nth-child(even) {
  background: #fbf7ed;
}

.col-left { text-align: left; }
.leader-row {
  background: #fcf6e6;
}
.rs-rank { color: #9aa49a; font-weight: 700; }
.rs-winner { color: #b08416; font-weight: 700; }
.rs-net { color: #2f5d43; font-weight: 700; }

.bba-match + .bba-match {
  margin-top: 16px;
}

.bba-match {
  border: 1px solid #e4ddcd;
  border-radius: 8px;
  background: #fdfbf4;
  padding: 12px;
}

.bba-head {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
  align-items: baseline;
  margin-bottom: 10px;
}

.bba-vs {
  font-weight: 800;
  color: #283b30;
}

.bba-vs-sep {
  color: #9aa49a;
  font-weight: 600;
  margin: 0 4px;
}

.bba-meta {
  font-size: 0.78rem;
  color: #7a8a7e;
  text-transform: capitalize;
}

.hbl-match-summary {
  margin: 3px 0 0;
  color: #2f5d43;
  font-size: 0.86rem;
  font-weight: 900;
}

.bba-table .bba-bet {
  text-align: left;
  font-weight: 600;
  color: #3a4a40;
}

.bba-contest,
.bba-segment {
  display: block;
}

.bba-contest {
  font-weight: 800;
  color: #283b30;
}

.bba-segment {
  margin-top: 1px;
  color: #7a8a7e;
  font-size: 0.72rem;
  font-weight: 700;
}

.bba-table tbody tr:nth-child(3) td,
.bba-table tbody tr:nth-child(6) td {
  border-bottom-width: 2px;
  border-bottom-color: #cfc4b0;
}

.bba-table tbody tr:nth-child(4) .bba-contest {
  color: #8a672f;
}

.bba-table .bba-result {
  min-width: 120px;
}

.bba-table .bba-win {
  font-weight: 800;
  color: #2f5d43;
}

.bba-error {
  color: #a3433a;
  font-size: 0.85rem;
}

.hbl-match + .hbl-match {
  margin-top: 16px;
}

.hbl-match {
  border: 1px solid #e4ddcd;
  border-radius: 8px;
  background: #fdfbf4;
  padding: 12px;
}

.hbl-contests {
  display: grid;
  gap: 12px;
}

.hbl-card {
  border: 1px solid #e4ddcd;
  border-radius: 8px;
  background: #fffdf7;
  padding: 12px;
}

.hbl-card-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
}

.hbl-card h3 {
  margin: 0;
  color: #24362c;
  font-size: 1rem;
}

.hbl-card p {
  margin: 3px 0 0;
  color: #4a5a4f;
  font-weight: 800;
}

.hbl-segments {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}

.hbl-segment {
  border: 1px solid #e4ddcd;
  border-radius: 8px;
  background: #f8f4ea;
  min-height: 94px;
  padding: 12px;
}

.hbl-segment-label,
.hbl-segment-score,
.hbl-segment-result {
  display: block;
}

.hbl-segment-label {
  color: #8a9489;
  font-size: 0.72rem;
  font-weight: 900;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.hbl-segment-score {
  margin-top: 10px;
  color: #24362c;
  font-size: 1.35rem;
  line-height: 1;
}

.hbl-segment-result {
  margin-top: 8px;
  color: #4a5a4f;
  font-size: 0.82rem;
  font-style: normal;
  font-weight: 850;
}

.hbl-segment.status-win {
  border-color: #cddfcf;
  background: #f3faf2;
}

.hbl-segment.status-win.winner-a {
  border-color: #92b99b;
  box-shadow: 4px 0 0 #2f5d43 inset;
}

.hbl-segment.status-win.winner-b {
  border-color: #d8a18e;
  box-shadow: 4px 0 0 #b1462f inset;
}

.hbl-segment.status-push {
  border-color: #eadfca;
  background: #fbf6ea;
}

.hbl-segment.status-open {
  color: #8a672f;
  opacity: 0.68;
}

.hbl-toggle {
  width: 100%;
  min-height: 44px;
  margin-top: 12px;
}

.hbl-detail {
  margin-top: 12px;
  border-top: 1px solid #e4ddcd;
  padding-top: 12px;
}

.hbl-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 12px;
  margin-bottom: 10px;
  color: #6a7a6f;
  font-size: 0.72rem;
  font-weight: 700;
}

.hbl-timeline {
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: minmax(132px, 1fr);
  gap: 8px;
  overflow-x: auto;
  padding-bottom: 6px;
}

.hbl-hole {
  border: 1px solid #e4ddcd;
  border-radius: 8px;
  background: #fdfbf4;
  padding: 9px 10px;
}

.hbl-hole.winner-a {
  border-left: 4px solid #2f5d43;
}

.hbl-hole.winner-b {
  border-left: 4px solid #b1462f;
}

.hbl-hole.winner-tie {
  border-left: 4px solid #c9a14a;
}

.hbl-hole-top,
.hbl-hole-scores {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
}

.hbl-hole-top strong {
  color: #24362c;
}

.hbl-hole-top span {
  color: #2f5d43;
  font-weight: 800;
}

.hbl-hole-scores {
  margin-top: 5px;
  color: #4a5a4f;
}

.hbl-hole-result {
  margin-top: 5px;
  color: #6a7a6f;
  font-size: 0.78rem;
  font-weight: 700;
}
.rs-skins { color: #8a672f; }

.pnl-table {
  border-collapse: collapse;
  min-width: 260px;
  margin-top: 14px;
  background: #fdfbf4;
  border: 1px solid #e4ddcd;
  border-radius: 8px;
  overflow: hidden;
}

.pnl-table th,
.pnl-table td {
  border-bottom: 1px solid #e4ddcd;
  padding: 8px 12px;
  text-align: left;
}

.pnl-table th {
  background: #efe9da;
  color: #4a5a4f;
}

.pnl-table tr:last-child td {
  border-bottom: 0;
}

.pnl-pos { color: #2f8f58; font-weight: 700; }
.pnl-neg { color: #b1462f; font-weight: 700; }

.settle-list {
  display: grid;
  gap: 8px;
}

.settle-subhead {
  margin: 0 0 2px;
  color: #24362c;
  font-size: 0.82rem;
}

.net-subhead {
  margin-top: 14px;
}

.settle-row {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  padding: 10px 12px;
  background: #fdfbf4;
  border: 1px solid #e4ddcd;
  border-radius: 6px;
  max-width: 420px;
  font-size: 0.9rem;
  font-weight: 800;
}

.settle-arrow { color: #9aa49a; font-size: 0.78rem; }
.settle-amount { font-weight: 900; color: #2f5d43; }
.settle-square { color: #6a7a6f; }

.fc-game {
  border: 1px solid #e4ddcd;
  border-radius: 8px;
  background: #fdfbf4;
  margin-bottom: 12px;
  overflow: hidden;
}

.fc-game:last-child { margin-bottom: 0; }

.fc-game-label {
  background: #efe9da;
  padding: 8px 14px;
  font-weight: 700;
  color: #2f5d43;
  letter-spacing: 0.04em;
}

.fc-type {
  font-size: 0.68rem;
  font-weight: 600;
  color: #8a9489;
  text-transform: uppercase;
  margin-left: 6px;
}

.fc-grid {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px;
}

.fc-box {
  flex: 1;
  text-align: center;
  border-radius: 8px;
  padding: 10px 8px;
  box-shadow: 4px 0 0 var(--team-accent, transparent) inset;
}

.fc-box.winner {
  background: var(--team-accent-soft);
}

.fc-box.pushed {
  background: #fbf6ea;
}

.fc-team {
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--team-accent, #6a7a6f);
  margin-bottom: 8px;
}

.fc-split {
  display: flex;
  justify-content: center;
  gap: 20px;
  margin-bottom: 8px;
}

.fc-split > div {
  display: flex;
  flex-direction: column;
}

.fc-sub {
  font-size: 0.55rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: #9aa49a;
}

.fc-val {
  font-weight: 700;
  color: #4a5a4f;
}

.fc-total-label {
  font-size: 0.55rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: #9aa49a;
}

.fc-score {
  font-size: 1.6rem;
  font-weight: 700;
  color: #24362c;
  line-height: 1.1;
}

.fc-vs { color: #9aa49a; font-weight: 700; font-size: 0.8rem; }

.pm-result {
  margin-top: 14px;
  border-top: 1px solid #e4ddcd;
  padding-top: 12px;
  overflow-x: auto;
}

.pm-title {
  margin-bottom: 8px;
  color: #8a672f;
  font-size: 0.76rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.pm-table {
  width: 100%;
  min-width: 520px;
}

.pm-total {
  margin: 12px 0 0;
  color: #4a5a4f;
  font-weight: 700;
}

.wolf-standings {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: 10px;
  margin-bottom: 14px;
}

.wolf-stand {
  border: 1px solid #e4ddcd;
  border-radius: 8px;
  background: #fdfbf4;
  padding: 12px;
  text-align: center;
}

.wolf-stand.winner {
  border-color: #c9a14a;
  background: #fcf6e6;
  box-shadow: 0 0 0 1px #c9a14a inset;
}

.wolf-player {
  color: #2f5d43;
  font-weight: 800;
}

.wolf-points-total {
  color: #24362c;
  font-size: 1.6rem;
  font-weight: 800;
  line-height: 1.1;
}

.wolf-tag {
  color: #8a9489;
  font-size: 0.72rem;
  font-weight: 700;
}

.wolf-scroll {
  overflow-x: auto;
  margin-top: 12px;
}

.wolf-segments,
.wolf-holes {
  min-width: 560px;
}

.skins-summary {
  margin-bottom: 12px;
}

.skins-summary h3,
.skins-row h3 {
  margin: 0 0 8px;
  color: #24362c;
  font-size: 0.82rem;
}

.skins-summary p,
.skins-note {
  margin: 0 0 12px;
  color: #6a7a6f;
  font-size: 0.78rem;
  font-weight: 700;
}

.skins-summary-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.skins-summary-list span {
  border: 1px solid #d7cebd;
  border-radius: 6px;
  background: #fdfbf4;
  padding: 6px 10px;
  color: #2f5d43;
  font-size: 0.82rem;
  font-weight: 900;
}

.skins-rows {
  display: grid;
  gap: 14px;
}

.skins-grid {
  display: grid;
  grid-template-columns: repeat(9, minmax(76px, 1fr));
  gap: 8px;
}

.skin-chip {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 84px;
  border: 1px solid #e4ddcd;
  border-radius: 6px;
  background: #fdfbf4;
  padding: 8px;
  text-align: center;
}

.skin-chip.tied {
  opacity: 0.68;
  background: #f4efe4;
}

.skin-hole {
  font-size: 0.6rem;
  font-weight: 700;
  color: #9aa49a;
}

.skin-winner {
  font-weight: 700;
  color: #2f5d43;
  font-size: 0.82rem;
}

.skin-detail {
  margin-top: 4px;
  color: #6a7a6f;
  font-size: 0.68rem;
  font-weight: 700;
  line-height: 1.2;
}

.skin-chip.tied .skin-winner { color: #9aa49a; font-style: italic; }

.nassau-table { min-width: 500px; }
.nassau-result { font-weight: 700; }
.nassau-note { margin-top: 10px; font-size: 0.78rem; color: #6a7a6f; }

.pp-groups { display: flex; flex-wrap: wrap; gap: 16px; }
.pp-group { flex: 1; min-width: 180px; border: 1px solid #e4ddcd; border-radius: 8px; background: #fdfbf4; padding: 12px 14px; }
.pp-group-hdr { font-weight: 800; color: #2f5d43; margin-bottom: 8px; font-size: 0.82rem; text-transform: uppercase; letter-spacing: 0.06em; }
.pp-state-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; margin-bottom: 10px; }
.pp-state-card { border: 1px solid #e4ddcd; border-radius: 6px; background: #fffdf7; padding: 8px 10px; }
.pp-state-card span { display: block; color: #8a9489; font-size: 0.64rem; font-weight: 900; letter-spacing: 0.08em; text-transform: uppercase; }
.pp-state-card strong { display: block; margin-top: 2px; color: #24362c; font-size: 0.84rem; line-height: 1.2; }
.pp-state-card strong.pp-coin-none { color: #6a7a6f; }
.pp-token-label { margin-bottom: 6px; color: #8a672f; font-size: 0.68rem; font-weight: 900; letter-spacing: 0.08em; text-transform: uppercase; }
.pp-cards { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 10px; }
.pp-player { text-align: center; min-width: 54px; border: 1px solid #e4ddcd; border-radius: 6px; background: #fffdf7; padding: 6px 8px; }
.pp-player-name { font-size: 0.72rem; color: #6a7a6f; font-weight: 700; }
.pp-card-count { font-size: 0.78rem; font-weight: 900; color: #2f5d43; }
.pp-note { font-size: 0.68rem; color: #b1462f; }
.pp-final-note { margin: 0; color: #6a7a6f; font-size: 0.74rem; font-weight: 700; }

.rs-empty-note { color: #6a7a6f; }

.rs-empty {
  margin: 48px auto 0;
}

.rs-empty-actions {
  display: flex;
  gap: 12px;
  margin-top: 20px;
}

.btn-primary,
.btn-ghost,
.btn-complete,
.btn-danger {
  border-radius: 6px;
  padding: 8px 16px;
  font-weight: 700;
  cursor: pointer;
}

.btn-primary {
  border: 1px solid #2f5d43;
  background: #2f5d43;
  color: #f3efe2;
}

.btn-complete {
  border: 1px solid #2f5d43;
  background: #2f5d43;
  color: #f3efe2;
}

.btn-ghost {
  border: 1px solid #cdbf9f;
  background: transparent;
  color: #4a5a4f;
}

.btn-danger {
  border: 1px solid #c0392b;
  background: transparent;
  color: #b1462f;
}

.btn-reset-secondary {
  border: 0;
  background: transparent;
  color: #8f5b54;
  cursor: pointer;
  font-size: 0.78rem;
  font-weight: 700;
  padding: 8px 4px;
  text-decoration: underline;
  text-underline-offset: 3px;
}

@media (max-width: 760px) {
  .rs-shell {
    padding: 16px 14px 40px;
  }

  .rs-actions,
  .rs-actions button {
    width: 100%;
  }

  .round-points-card {
    width: 100%;
    order: 2;
  }

  .story-card {
    grid-template-columns: 1fr;
    padding: 14px;
  }

  .story-facts {
    grid-template-columns: 1fr;
  }

  .rs-actions button,
  .btn-primary,
  .btn-ghost,
  .btn-complete,
  .btn-danger,
  .btn-reset-secondary {
    min-height: 44px;
  }

  .btn-reset-secondary {
    border: 1px solid #eadbd7;
    border-radius: 6px;
    padding: 8px 16px;
    text-decoration: none;
  }

  .rs-section {
    padding: 14px;
  }

  .leaderboard-table,
  .leaderboard-table tbody,
  .leaderboard-table tr,
  .leaderboard-table td {
    display: block;
  }

  .leaderboard-table {
    border: 0;
    background: transparent;
  }

  .leaderboard-table thead {
    display: none;
  }

  .leaderboard-table tbody tr {
    border: 1px solid #e4ddcd;
    border-radius: 8px;
    background: #fdfbf4;
    padding: 10px 12px;
  }

  .leaderboard-table tbody tr + tr {
    margin-top: 10px;
  }

  .leaderboard-table tbody tr:nth-child(even) {
    background: #fdfbf4;
  }

  .leaderboard-table td {
    border-bottom: 0;
    padding: 5px 0;
    text-align: right;
    white-space: normal;
  }

  .leaderboard-table td::before {
    content: attr(data-label);
    float: left;
    color: #7a8a7e;
    font-size: 0.68rem;
    font-weight: 800;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  .leaderboard-table .col-left {
    text-align: right;
  }

  .leaderboard-table .rs-rank {
    color: #24362c;
    font-size: 1rem;
  }

  .leaderboard-table .rs-rank::before {
    padding-top: 2px;
  }

  .settle-row {
    display: grid;
    gap: 4px;
    max-width: none;
  }

  .settle-amount {
    font-size: 1.2rem;
  }

  .hbl-segments {
    grid-template-columns: 1fr;
  }

  .skins-grid {
    grid-template-columns: repeat(auto-fit, minmax(86px, 1fr));
  }

  .pp-state-grid {
    grid-template-columns: 1fr;
  }

  .hbl-card-head {
    flex-direction: column;
  }

  .hbl-status {
    white-space: normal;
  }

  .hbl-hole-top,
  .hbl-hole-scores {
    display: grid;
    gap: 4px;
  }

  .pp-groups {
    display: grid;
  }
}
</style>
