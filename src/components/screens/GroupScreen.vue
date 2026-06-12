<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { sortedGroupPlayers } from '@/domain/players';
import { courseDisplayName } from '@/domain/round';
import { hasSupabase } from '@/services/supabase';
import { useGroupStore } from '@/stores/group';
import { useHistoryStore } from '@/stores/history';
import { useStatsStore } from '@/stores/stats';
import { useEventStore } from '@/stores/event';
import { useRoundStore } from '@/stores/round';
import { eventFormatLabel } from '@/domain/events';
import { buildScoreContext, useEventLeaderboard } from '@/composables/useEventLeaderboard';
import { computeSkins } from '@/scoring/skins';
import { playerRangeScore } from '@/scoring/round';
import EventConfigEditor from '@/components/EventConfigEditor.vue';
import type { EventConfig, EventRoundConfig } from '@/types/event';
import type { EventComponent, EventRoundRow } from '@/scoring/eventRound';
import type { PlayerMap, RoundState, ScoreType } from '@/types';

const store = useGroupStore();
const history = useHistoryStore();
const stats = useStatsStore();
const eventStore = useEventStore();
const roundStore = useRoundStore();
const router = useRouter();
const route = useRoute();

const { leaderboard } = useEventLeaderboard(
  () => eventStore.event?.config,
  () => eventStore.cachedRounds,
  () => roundStore.round,
  () => roundStore.players,
);

function confirmAction(message: string): boolean {
  if (navigator.userAgent.includes('jsdom')) return true;
  try {
    const answer = window.confirm(message);
    return typeof answer === 'boolean' ? answer : true;
  } catch {
    return true;
  }
}

const newName = ref('');
const joinCode = ref('');
const newEventName = ref('');
const renameValue = ref('');
const editingEvent = ref(false);
const savingEvent = ref(false);
const online = hasSupabase();
const rosterName = ref('');
const rosterHandicapIndex = ref<number | string>('');
const editingPlayer = ref('');
const editName = ref('');
const editHandicapIndex = ref<number | string>('');
const editingGroupName = ref(false);
const copiedCode = ref(false);
const showEventMode = ref(false);
const expandedHistory = ref<Record<string, boolean>>({});
const expandedEventDetails = ref<Record<string, boolean>>({});

const rosterPlayers = computed(() => sortedGroupPlayers(store.group?.players));
const canCreateGroup = computed(() => newName.value.trim().length > 0 && !store.busy);
const normalizedJoinCode = computed(() => joinCode.value.trim().toUpperCase().replace(/\s+/g, '').slice(0, 4));
const canJoinGroup = computed(() => normalizedJoinCode.value.length === 4 && online && !store.busy);
const canRenameGroup = computed(() => {
  const name = renameValue.value.trim();
  return name.length > 0 && name !== store.groupName && !store.busy;
});
const canAddRosterPlayer = computed(() => rosterName.value.trim().length > 0 && !store.busy);
const showGroupsList = computed(() => !store.hasGroup || route.query.view === 'groups');

const resumeCard = computed(() => {
  const round = roundStore.round;
  if (!round) return null;
  if (store.group && round.groupId !== store.group.id) return null;
  const status = roundStore.roundStatus;
  const subtext = `${courseDisplayName(round.course)} · ${roundStore.holesScoredCount} of 18 holes scored`;
  if (status === 'completed') return { label: 'View results', to: '/results', subtext };
  if (status === 'in_progress') return { label: 'Resume round', to: '/scorecard', subtext };
  return { label: 'Continue setup', to: '/setup?edit=1', subtext };
});

function resume() {
  if (resumeCard.value) void router.push(resumeCard.value.to);
}

async function loadGroupData(groupId: string) {
  const loaded = await roundStore.loadActiveRound(groupId);
  if (!loaded && roundStore.round?.groupId && roundStore.round.groupId !== groupId) roundStore.reset();
  void history.loadHistory(groupId);
  void stats.loadStats(groupId);
  await eventStore.loadEvent(groupId);
  void eventStore.loadLinkedRounds();
  eventStore.subscribeToEvent(groupId);
}

onMounted(() => {
  store.load();
  renameValue.value = store.group?.name ?? '';
  if (store.group?.id) void loadGroupData(store.group.id);
});

function refreshHistory() {
  if (store.group?.id) void loadGroupData(store.group.id);
  else { history.clear(); stats.clear(); eventStore.clear(); }
}

async function create() {
  if (await store.createGroup(newName.value)) {
    newName.value = '';
    renameValue.value = store.group?.name ?? '';
    refreshHistory();
  }
}

async function join() {
  joinCode.value = normalizedJoinCode.value;
  if (await store.joinGroup(joinCode.value)) {
    joinCode.value = '';
    renameValue.value = store.group?.name ?? '';
    refreshHistory();
  }
}

async function openRecent(code: string) {
  if (await store.switchToRecentGroup(code)) {
    renameValue.value = store.group?.name ?? '';
    refreshHistory();
    void router.push('/group');
  }
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? '—'
    : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

async function rename() {
  if (await store.renameGroup(renameValue.value)) editingGroupName.value = false;
}

function startEditGroupName() {
  renameValue.value = store.group?.name ?? '';
  editingGroupName.value = true;
}

function cancelEditGroupName() {
  renameValue.value = store.group?.name ?? '';
  editingGroupName.value = false;
}

function normalizeJoinInput() {
  joinCode.value = normalizedJoinCode.value;
}

async function copyCode() {
  if (!store.groupCode) return;
  try {
    await navigator.clipboard.writeText(store.groupCode);
    copiedCode.value = true;
    window.setTimeout(() => { copiedCode.value = false; }, 1400);
  } catch {
    copiedCode.value = false;
  }
}

async function addRosterPlayer() {
  if (await store.addPlayer(rosterName.value, rosterHandicapIndex.value)) {
    rosterName.value = '';
    rosterHandicapIndex.value = '';
  }
}

function startEditPlayer(name: string, handicapIndex: number) {
  editingPlayer.value = name;
  editName.value = name;
  editHandicapIndex.value = handicapIndex;
}

function cancelEditPlayer() {
  editingPlayer.value = '';
  editName.value = '';
  editHandicapIndex.value = '';
}

async function saveEditPlayer() {
  if (!editingPlayer.value) return;
  if (await store.updatePlayer(editingPlayer.value, editName.value, editHandicapIndex.value)) {
    cancelEditPlayer();
  }
}

async function removeRosterPlayer(name: string) {
  const ok = confirmAction(`Remove ${name}?\n\nThis removes ${name} from the group roster. Existing completed round results should remain unchanged.`);
  if (!ok) return;
  if (editingPlayer.value === name) cancelEditPlayer();
  await store.removePlayer(name);
}

function leave() {
  const ok = confirmAction('Leave this group?\n\nYou’ll remove this group from your recent groups on this device. The group itself will not be deleted.');
  if (!ok) return;
  store.leaveGroup();
  renameValue.value = '';
  history.clear();
  stats.clear();
  eventStore.clear();
}

function goSetup() {
  void router.push('/setup');
}

async function createEvent() {
  if (!store.group?.id) return;
  const playerNames = Object.keys(store.group.players || {});
  await eventStore.createEvent(store.group.id, newEventName.value, playerNames);
  newEventName.value = '';
}

async function archiveEvent() {
  const ok = confirmAction('Archive this event?\n\nThis will remove the event from the active event view. Completed round history should remain available if supported.');
  if (!ok) return;
  await eventStore.archiveEvent();
}

async function saveEventConfig(config: EventConfig, name: string) {
  if (!eventStore.event) return;
  savingEvent.value = true;
  eventStore.event.name = name;
  eventStore.event.config = config;
  await eventStore.saveEvent();
  savingEvent.value = false;
  editingEvent.value = false;
}

function launchEventRound(roundIndex: number) {
  if (roundReadinessIssue(eventStore.event?.config.rounds[roundIndex])) {
    editingEvent.value = true;
    return;
  }
  eventStore.setPendingRoundLink(roundIndex);
  void router.push('/setup');
}

function finishEventRoundSetup() {
  editingEvent.value = true;
}

function openEventRound(roundIndex: number) {
  const roundId = eventStore.event?.config.rounds[roundIndex]?.roundId;
  const cached = roundId ? eventStore.cachedRounds[roundId] : null;
  if (cached) roundStore.setRound(cached.round, cached.players);
  void router.push('/scorecard');
}

function goGroups() {
  void router.push({ path: '/group', query: { view: 'groups' } });
}

function forgetRecent(roomCode: string) {
  const ok = confirmAction('Forget this group?\n\nThis only removes it from your recent groups. It does not delete the group.');
  if (ok) store.forgetRecentGroup(roomCode);
}

function toggleHistory(key: string) {
  expandedHistory.value = {
    ...expandedHistory.value,
    [key]: !expandedHistory.value[key],
  };
}

function toggleEventDetails(key: string) {
  expandedEventDetails.value = {
    ...expandedEventDetails.value,
    [key]: !expandedEventDetails.value[key],
  };
}

function eventScoreState() {
  const team1 = leaderboard.value.team1Total;
  const team2 = leaderboard.value.team2Total;
  const target = leaderboard.value.winPoints;
  if (team1 >= target && team1 > team2) return `${leaderboard.value.team1Name} wins`;
  if (team2 >= target && team2 > team1) return `${leaderboard.value.team2Name} wins`;
  return `${target} points to win`;
}

function roundReadinessIssue(round: EventRoundConfig | null | undefined): string {
  if (!round) return 'Missing round configuration';
  if (!round.course) return 'Missing course';
  if (!round.pairMatches?.length) return 'Missing pair matches';
  if (!round.format || round.format === 'custom') return 'No games selected';
  return '';
}

function roundStateLabel(roundIndex: number, hasData: boolean): string {
  const status = eventStore.roundsWithStatus[roundIndex];
  const round = eventStore.event?.config.rounds[roundIndex];
  if (!status?.linked) return roundReadinessIssue(round) ? 'Finish setup' : 'Ready to launch';
  const cached = round?.roundId ? eventStore.cachedRounds[round.roundId] : null;
  if (cached?.round.completed) return 'Completed';
  return hasData ? 'Live' : 'Active';
}

function roundActionLabel(roundIndex: number): string {
  const status = eventStore.roundsWithStatus[roundIndex];
  const round = eventStore.event?.config.rounds[roundIndex];
  if (status?.linked) return 'Open round';
  return roundReadinessIssue(round) ? 'Finish setup' : 'Launch round';
}

function roundScoreLabel(team1: number, team2: number): string {
  return `${leaderboard.value.team1Name} ${team1} – ${team2} ${leaderboard.value.team2Name}`;
}

function roundDeltaLabel(team1: number, team2: number): string {
  if (team1 === team2) return 'All square';
  const leader = team1 > team2 ? leaderboard.value.team1Name : leaderboard.value.team2Name;
  return `${leader} +${Math.abs(team1 - team2)} pts`;
}

function eventDetailKey(roundIndex: number, row: EventRoundRow): string {
  return `${roundIndex}-${row.label}`;
}

type EventSide = 'team1' | 'team2';

function rowTotals(row: EventRoundRow): { team1: number; team2: number } {
  return row.components.reduce(
    (acc, c) => ({ team1: acc.team1 + c.team1, team2: acc.team2 + c.team2 }),
    { team1: 0, team2: 0 },
  );
}

// Aggregate across all components so this works for both the old hole-by-hole
// format and the new segment-component format (best ball / aggy x front/back/overall).
function overallWinner(row: EventRoundRow): string {
  const totals = rowTotals(row);
  if (totals.team1 === 0 && totals.team2 === 0) return 'open';
  if (totals.team1 > totals.team2) return 'team1';
  if (totals.team2 > totals.team1) return 'team2';
  return 'tie';
}

function matchResultLabel(row: EventRoundRow): string {
  const totals = rowTotals(row);
  if (totals.team1 === 0 && totals.team2 === 0) return '—';
  return `${totals.team1} – ${totals.team2} pts`;
}

function eventSideTeamName(side: EventSide): string {
  return side === 'team1' ? leaderboard.value.team1Name : leaderboard.value.team2Name;
}

function eventSidePlayers(row: EventRoundRow, side: EventSide): string[] {
  return side === 'team1' ? row.aPlayers : row.bPlayers;
}

function eventSidePair(row: EventRoundRow, side: EventSide): string {
  return pairLabel(eventSidePlayers(row, side));
}

function eventSideTotal(row: EventRoundRow, side: EventSide): number {
  const totals = rowTotals(row);
  return side === 'team1' ? totals.team1 : totals.team2;
}

function isTeamScoreboardRound(round: EventRoundConfig): boolean {
  return ['bestBallNassau', 'twoManBestBallAggy', 'twoManHighBallLowBall', 'scramble2v2Nassau', 'fourManScramble'].includes(round.format);
}

function eventRoundScoreboardMeta(round: EventRoundConfig): string {
  const mode = round.scoringMode === 'strokePlay' ? 'Stroke Play' : 'Match Play';
  const basis = round.bestBallBet.type === 'gross' ? 'Gross' : 'Net';
  return `${eventFormatLabel(round.format)} · ${mode} · ${basis} · event points`;
}

function hblMatchState(row: EventRoundRow): string {
  const winner = overallWinner(row);
  if (winner === 'open') return 'No scoring yet';
  if (winner === 'tie') return 'All square';
  const side = winner as EventSide;
  const complete = row.components.length > 0 && row.components.every((component) => component.winner !== 'open');
  return `${eventSidePair(row, side)} ${complete ? 'wins' : 'leads'}`;
}

function hblSegmentName(component: EventComponent): string {
  return component.label
    .replace(/^Low Ball\s+/, '')
    .replace(/^High Ball\s+/, '')
    .replace(/^Best Ball\s+/, '')
    .replace(/^Aggy\s+/, '');
}

function hblSegmentWinner(component: EventComponent, row: EventRoundRow): string {
  if (component.winner === 'open') return 'Open';
  if (component.winner === 'tie') return 'Push';
  return eventSidePair(row, component.winner);
}

function hblSegmentScore(component: EventComponent): string {
  if (component.winner === 'open') return 'Not scored';
  return `${component.team1}-${component.team2}`;
}

function hblSegmentClass(component: EventComponent): string {
  if (component.winner === 'team1') return 'hbl-segment-team1';
  if (component.winner === 'team2') return 'hbl-segment-team2';
  if (component.winner === 'tie') return 'hbl-segment-push';
  return 'hbl-segment-open';
}

function eventScoreboardSectionLabel(component: EventComponent): string {
  if (component.label.startsWith('Low Ball')) return 'Low Ball';
  if (component.label.startsWith('High Ball')) return 'High Ball';
  if (component.label.startsWith('Best Ball')) return 'Best Ball';
  if (component.label.startsWith('Aggy')) return 'Aggy';
  return 'Segments';
}

function eventScoreboardSections(row: EventRoundRow): { label: string; components: EventComponent[] }[] {
  const sections = new Map<string, EventComponent[]>();
  for (const component of row.components) {
    const label = eventScoreboardSectionLabel(component);
    sections.set(label, [...(sections.get(label) ?? []), component]);
  }

  const order = ['Low Ball', 'High Ball', 'Best Ball', 'Aggy', 'Segments'];
  return [...sections.entries()]
    .sort(([a], [b]) => order.indexOf(a) - order.indexOf(b))
    .map(([label, components]) => ({ label, components }));
}

/** Components that have a decided/scored result, for the per-segment breakdown. */
function scoredComponents(row: EventRoundRow): EventComponent[] {
  return row.components.filter((c) => c.winner !== 'open');
}

function componentResultClass(component: EventComponent): string {
  if (component.winner === 'team1') return 'comp-team1';
  if (component.winner === 'team2') return 'comp-team2';
  return 'comp-tie';
}

function componentResultLabel(component: EventComponent): string {
  if (component.winner === 'team1') return `${leaderboard.value.team1Name} ${component.team1}–${component.team2}`;
  if (component.winner === 'team2') return `${leaderboard.value.team2Name} ${component.team1}–${component.team2}`;
  return `Push ${component.team1}–${component.team2}`;
}

interface LinkedRoundData {
  round: RoundState;
  players: PlayerMap;
}

interface EventLeaderCard {
  key: string;
  label: string;
  value: string;
  detail: string;
}

function addTo(map: Map<string, number>, names: string[], amount: number) {
  if (amount <= 0) return;
  for (const name of names) map.set(name, (map.get(name) ?? 0) + amount);
}

function topEntry(map: Map<string, number>): [string, number] | null {
  return [...map.entries()].filter(([, value]) => value > 0).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0] ?? null;
}

interface PairRecord {
  pair: string;
  wins: number;
  losses: number;
  pushes: number;
}

interface ValuableMatch {
  round: string;
  label: string;
  winner: string;
  winnerPoints: number;
  loserPoints: number;
  margin: number;
}

function pairLabel(players: string[]): string {
  return players.join(' + ') || 'Pair';
}

function addPairRecord(records: Map<string, PairRecord>, players: string[], result: 'win' | 'loss' | 'push') {
  const pair = pairLabel(players);
  const record = records.get(pair) ?? { pair, wins: 0, losses: 0, pushes: 0 };
  if (result === 'win') record.wins += 1;
  else if (result === 'loss') record.losses += 1;
  else record.pushes += 1;
  records.set(pair, record);
}

function componentHoleWins(component: EventComponent): { a: number; b: number } | null {
  if (component.unit !== 'holes' || component.label === 'Overall') return null;
  const a = typeof component.a === 'number' ? component.a : null;
  const b = typeof component.b === 'number' ? component.b : null;
  if (a == null || b == null) return null;
  return { a, b };
}

function isClosingComponent(component: EventComponent): boolean {
  return /\bBack\b/.test(component.label);
}

function valuableMatch(roundName: string, row: EventRoundRow): ValuableMatch | null {
  const components = scoredComponents(row);
  if (!components.length) return null;
  const team1 = components.reduce((total, component) => total + component.team1, 0);
  const team2 = components.reduce((total, component) => total + component.team2, 0);
  if (team1 === team2) return null;
  const winner = team1 > team2 ? pairLabel(row.aPlayers) : pairLabel(row.bPlayers);
  const winnerPoints = Math.max(team1, team2);
  const loserPoints = Math.min(team1, team2);

  return {
    round: roundName,
    label: row.label,
    winner,
    winnerPoints,
    loserPoints,
    margin: winnerPoints - loserPoints,
  };
}

function linkedRoundData(roundId: string | null | undefined): LinkedRoundData | null {
  if (!roundId) return null;
  if (roundStore.round?.id === roundId) return { round: roundStore.round, players: roundStore.players };
  return eventStore.cachedRounds[roundId] ?? null;
}

const eventLeaderCards = computed<EventLeaderCard[]>(() => {
  if (!eventStore.event) return [];
  const contributed = new Map<string, number>();
  const closingPoints = new Map<string, number>();
  const holesWon = new Map<string, number>();
  const pairRecords = new Map<string, PairRecord>();
  const skinsWon = new Map<string, number>();
  const netTotals = new Map<string, { total: number; rounds: number }>();
  const valuableMatches: ValuableMatch[] = [];

  for (const round of leaderboard.value.rounds) {
    if (!round.hasData) continue;
    for (const row of round.result.rows) {
      const match = valuableMatch(round.result.round.name, row);
      if (match) valuableMatches.push(match);

      for (const component of scoredComponents(row)) {
        addTo(contributed, row.aPlayers, component.team1);
        addTo(contributed, row.bPlayers, component.team2);
        if (isClosingComponent(component)) {
          addTo(closingPoints, row.aPlayers, component.team1);
          addTo(closingPoints, row.bPlayers, component.team2);
        }
        const holeWins = componentHoleWins(component);
        if (holeWins) {
          addTo(holesWon, row.aPlayers, holeWins.a);
          addTo(holesWon, row.bPlayers, holeWins.b);
        }
      }
      const winner = overallWinner(row);
      if (winner === 'team1') {
        addPairRecord(pairRecords, row.aPlayers, 'win');
        addPairRecord(pairRecords, row.bPlayers, 'loss');
      } else if (winner === 'team2') {
        addPairRecord(pairRecords, row.aPlayers, 'loss');
        addPairRecord(pairRecords, row.bPlayers, 'win');
      } else if (winner === 'tie') {
        addPairRecord(pairRecords, row.aPlayers, 'push');
        addPairRecord(pairRecords, row.bPlayers, 'push');
      }
    }
  }

  for (const roundConfig of eventStore.event.config.rounds) {
    const linked = linkedRoundData(roundConfig.roundId);
    if (!linked?.round.completed) continue;
    const ctx = buildScoreContext(linked.round, linked.players);
    if (!ctx) continue;
    const names = [...(linked.round.team1 || []), ...(linked.round.team2 || [])];
    const skinType = (linked.round.games?.skins?.type ?? 'net') as ScoreType;
    const skins = computeSkins(ctx, names, skinType).skinsByPlayer;

    for (const name of names) {
      const skinCount = skins[name] ?? 0;
      if (skinCount > 0) skinsWon.set(name, (skinsWon.get(name) ?? 0) + skinCount);
      const net = playerRangeScore(ctx, name, 0, 18, 'net');
      if (net == null) continue;
      const entry = netTotals.get(name) ?? { total: 0, rounds: 0 };
      entry.total += net;
      entry.rounds += 1;
      netTotals.set(name, entry);
    }
  }

  const cards: EventLeaderCard[] = [];
  const pointsLeader = topEntry(contributed);
  if (pointsLeader) {
    cards.push({
      key: 'points',
      label: 'Contributed points',
      value: pointsLeader[0],
      detail: `${pointsLeader[1]} event pts`,
    });
  }

  const closingLeader = topEntry(closingPoints);
  if (closingLeader) {
    cards.push({
      key: 'closing-points',
      label: 'Closing points',
      value: closingLeader[0],
      detail: `${closingLeader[1]} back-nine event pts`,
    });
  }

  const skinsLeader = topEntry(skinsWon);
  if (skinsLeader) {
    cards.push({
      key: 'skins',
      label: 'Skins won',
      value: skinsLeader[0],
      detail: `${skinsLeader[1]} skin${skinsLeader[1] === 1 ? '' : 's'}`,
    });
  }

  const holesLeader = topEntry(holesWon);
  if (holesLeader) {
    cards.push({
      key: 'holes',
      label: 'Holes won',
      value: holesLeader[0],
      detail: `${holesLeader[1]} match-play hole${holesLeader[1] === 1 ? '' : 's'}`,
    });
  }

  const pairLeader = [...pairRecords.values()]
    .filter((record) => record.wins > 0 || record.pushes > 0)
    .sort((a, b) => b.wins - a.wins || a.losses - b.losses || b.pushes - a.pushes || a.pair.localeCompare(b.pair))[0];
  if (pairLeader) {
    cards.push({
      key: 'pair-record',
      label: 'Best pair record',
      value: pairLeader.pair,
      detail: `${pairLeader.wins}-${pairLeader.losses}-${pairLeader.pushes}`,
    });
  }

  const matchLeader = valuableMatches
    .sort((a, b) => b.margin - a.margin || b.winnerPoints - a.winnerPoints || a.round.localeCompare(b.round) || a.label.localeCompare(b.label))[0];
  if (matchLeader) {
    cards.push({
      key: 'valuable-match',
      label: 'Most valuable match',
      value: matchLeader.winner,
      detail: `${matchLeader.winnerPoints}-${matchLeader.loserPoints} event pts · ${matchLeader.round} ${matchLeader.label}`,
    });
  }

  const netLeader = [...netTotals.entries()]
    .filter(([, value]) => value.rounds > 0)
    .map(([name, value]) => ({ name, avg: value.total / value.rounds, rounds: value.rounds }))
    .sort((a, b) => a.avg - b.avg || a.name.localeCompare(b.name))[0];
  if (netLeader) {
    cards.push({
      key: 'net',
      label: 'Best net average',
      value: netLeader.name,
      detail: `${Math.round(netLeader.avg * 10) / 10} over ${netLeader.rounds} round${netLeader.rounds === 1 ? '' : 's'}`,
    });
  }

  return cards;
});
</script>

<template>
  <main class="app-shell">
    <section class="panel group-panel">
      <p class="eyebrow">Groups</p>

      <!-- Active group -->
      <template v-if="store.hasGroup && !showGroupsList">
        <header class="group-header">
          <div>
            <div v-if="!editingGroupName" class="group-title-row">
              <h1>{{ store.groupName }}</h1>
              <button class="btn-text" type="button" @click="startEditGroupName">Edit name</button>
            </div>
            <form v-else class="rename-row" @submit.prevent="rename" @keyup.esc="cancelEditGroupName">
              <input v-model="renameValue" class="form-input" type="text" placeholder="Group name" />
              <button class="btn-primary sm" type="submit" :disabled="!canRenameGroup">Save</button>
              <button class="btn-ghost sm" type="button" @click="cancelEditGroupName">Cancel</button>
            </form>
            <div class="group-meta-row">
              <span class="code-badge">Group code {{ store.groupCode }}</span>
              <button class="btn-text" type="button" @click="copyCode">{{ copiedCode ? 'Copied' : 'Copy code' }}</button>
              <span class="meta-dot">{{ rosterPlayers.length }} players</span>
            </div>
          </div>
          <button class="btn-text" type="button" @click="goGroups">← Back to groups</button>
        </header>

        <section class="action-card">
          <div>
            <h2>Ad hoc rounds</h2>
            <p class="hint">Start a one-off round for this group.</p>
          </div>
          <button class="btn-primary" type="button" @click="goSetup">Start new round</button>
        </section>

        <button v-if="resumeCard" class="resume-card" type="button" @click="resume">
          <span class="resume-label">{{ resumeCard.label }} →</span>
          <span class="resume-sub">{{ resumeCard.subtext }}</span>
        </button>

        <section class="roster">
          <div class="section-head">
            <span class="field-label">Roster</span>
            <span class="section-count">{{ rosterPlayers.length }} players</span>
          </div>
          <form class="roster-add" @submit.prevent="addRosterPlayer">
            <input v-model="rosterName" class="form-input" type="text" placeholder="Player name" @keyup.enter="addRosterPlayer" />
            <input
              v-model="rosterHandicapIndex"
              class="form-input idx-input"
              type="number"
              step="0.1"
              placeholder="Handicap index"
              @keyup.enter="addRosterPlayer"
            />
            <button class="btn-primary" type="submit" :disabled="!canAddRosterPlayer" @click.prevent="addRosterPlayer">Add player</button>
          </form>

          <p v-if="!rosterPlayers.length" class="hint">No players yet.</p>
          <div v-for="player in rosterPlayers" :key="player.name" class="roster-row">
            <template v-if="editingPlayer === player.name">
              <input v-model="editName" class="form-input" type="text" />
              <input v-model="editHandicapIndex" class="form-input idx-input" type="number" step="0.1" />
              <div class="roster-actions">
                <button class="btn-ghost sm" type="button" :disabled="store.busy" @click="saveEditPlayer">Save</button>
                <button class="btn-ghost sm" type="button" @click="cancelEditPlayer">Cancel</button>
              </div>
            </template>
            <template v-else>
              <div>
                <div class="roster-name">{{ player.name }}</div>
                <div class="roster-meta">Handicap index {{ Number(player.handicapIndex || 0).toFixed(1).replace('.0', '') }}</div>
              </div>
              <div class="roster-actions">
                <button class="btn-ghost sm" type="button" @click="startEditPlayer(player.name, player.handicapIndex)">Edit</button>
                <button class="btn-text danger" type="button" :disabled="store.busy" @click="removeRosterPlayer(player.name)">Remove player</button>
              </div>
            </template>
          </div>
        </section>

        <!-- Team event (online only) -->
        <section v-if="online && (showEventMode || eventStore.event)" class="event-section">
          <div class="section-head">
            <span class="field-label">Event mode</span>
            <button v-if="!eventStore.event" class="btn-text" type="button" @click="showEventMode = false">Hide</button>
          </div>

          <!-- Active event -->
          <template v-if="eventStore.event">
            <div class="event-header">
              <div>
                <div class="event-kicker">Team event</div>
                <div class="event-name">{{ eventStore.event.name }}</div>
                <div class="event-title-sub">{{ leaderboard.team1Name }} vs {{ leaderboard.team2Name }}</div>
              </div>
              <div class="event-header-actions">
                <button class="btn-ghost sm" type="button" @click="editingEvent = !editingEvent">
                  {{ editingEvent ? 'Cancel' : 'Edit event' }}
                </button>
              </div>
            </div>

            <!-- Inline config editor -->
            <EventConfigEditor
              v-if="editingEvent"
              :event="eventStore.event"
              :group-players="rosterPlayers.map(p => p.name)"
              @save="saveEventConfig"
              @cancel="editingEvent = false"
            />

            <template v-if="!editingEvent">
              <div class="event-scoreboard">
                <div class="event-scoreboard-title">Event score</div>
                <div class="event-score-grid">
                  <div class="event-score-team" :class="{ leading: leaderboard.team1Total > leaderboard.team2Total }">
                    <span>{{ leaderboard.team1Name }}</span>
                    <strong>{{ leaderboard.team1Total }}</strong>
                  </div>
                  <div class="event-score-team" :class="{ leading: leaderboard.team2Total > leaderboard.team1Total }">
                    <span>{{ leaderboard.team2Name }}</span>
                    <strong>{{ leaderboard.team2Total }}</strong>
                  </div>
                </div>
                <p class="event-score-note">{{ eventScoreState() }}</p>
              </div>

              <!-- Team rosters -->
              <div class="event-teams">
                <div class="event-team">
                  <div class="event-team-name">{{ leaderboard.team1Name }}</div>
                  <div class="event-team-players">{{ eventStore.event.config.team1.join(' · ') || '—' }}</div>
                </div>
                <div class="event-vs">vs</div>
                <div class="event-team">
                  <div class="event-team-name">{{ leaderboard.team2Name }}</div>
                  <div class="event-team-players">{{ eventStore.event.config.team2.join(' · ') || '—' }}</div>
                </div>
              </div>

              <section v-if="eventLeaderCards.length" class="event-leaders">
                <div class="event-leaders-head">
                  <span class="field-label">Event leaders</span>
                  <span>Derived from scored linked rounds</span>
                </div>
                <div class="event-leader-grid">
                  <article v-for="card in eventLeaderCards" :key="card.key" class="event-leader-card">
                    <span>{{ card.label }}</span>
                    <strong>{{ card.value }}</strong>
                    <em>{{ card.detail }}</em>
                  </article>
                </div>
              </section>

              <!-- Per-round breakdown -->
              <div class="event-rounds-head">Rounds</div>
              <div class="event-rounds">
                <div
                  v-for="r in leaderboard.rounds"
                  :key="r.roundIndex"
                  class="event-round-card"
                  :class="`round-state-${roundStateLabel(r.roundIndex, r.hasData).toLowerCase().replaceAll(' ', '-')}`"
                >
                  <div class="event-round-hdr">
                    <div>
                      <div class="event-round-name">{{ r.result.round.name }}</div>
                      <div class="event-round-meta">{{ eventFormatLabel(r.result.round.format) }}</div>
                      <span class="event-round-state">{{ roundStateLabel(r.roundIndex, r.hasData) }}</span>
                    </div>
                    <div class="event-round-actions">
                      <div v-if="r.hasData" class="event-round-score">
                        <strong>{{ roundScoreLabel(r.result.team1, r.result.team2) }}</strong>
                        <span>{{ roundDeltaLabel(r.result.team1, r.result.team2) }}</span>
                      </div>
                      <button
                        v-if="!eventStore.roundsWithStatus[r.roundIndex]?.linked"
                        class="btn-ghost sm"
                        type="button"
                        @click="roundReadinessIssue(eventStore.event?.config.rounds[r.roundIndex]) ? finishEventRoundSetup() : launchEventRound(r.roundIndex)"
                      >
                        {{ roundActionLabel(r.roundIndex) }}
                      </button>
                      <button
                        v-else
                        class="btn-ghost sm"
                        type="button"
                        @click="openEventRound(r.roundIndex)"
                      >
                        {{ roundActionLabel(r.roundIndex) }}
                      </button>
                    </div>
                  </div>
                  <p v-if="!eventStore.roundsWithStatus[r.roundIndex]?.linked && roundReadinessIssue(eventStore.event?.config.rounds[r.roundIndex])" class="event-blocker">
                    {{ roundReadinessIssue(eventStore.event?.config.rounds[r.roundIndex]) }}
                  </p>

                  <!-- Match rows when data is present -->
                  <template v-if="r.hasData && r.result.rows.length">
                    <div class="match-summary-list">
                      <template v-for="row in r.result.rows" :key="row.label">
                        <article v-if="isTeamScoreboardRound(r.result.round)" class="hbl-match-card">
                          <div class="hbl-match-head">
                            <div>
                              <div class="hbl-match-label">{{ row.label }}</div>
                              <div class="hbl-match-meta">{{ eventRoundScoreboardMeta(r.result.round) }}</div>
                            </div>
                            <div class="hbl-match-score">
                              <strong>{{ eventSideTotal(row, 'team1') }}-{{ eventSideTotal(row, 'team2') }}</strong>
                              <span>{{ hblMatchState(row) }}</span>
                            </div>
                          </div>

                          <div class="hbl-team-grid">
                            <div class="hbl-team-block hbl-team1" :class="{ 'hbl-team-leading': overallWinner(row) === 'team1' }">
                              <span>{{ eventSideTeamName('team1') }}</span>
                              <strong>{{ eventSidePair(row, 'team1') }}</strong>
                              <em>{{ eventSideTotal(row, 'team1') }} event pts</em>
                            </div>
                            <div class="hbl-team-block hbl-team2" :class="{ 'hbl-team-leading': overallWinner(row) === 'team2' }">
                              <span>{{ eventSideTeamName('team2') }}</span>
                              <strong>{{ eventSidePair(row, 'team2') }}</strong>
                              <em>{{ eventSideTotal(row, 'team2') }} event pts</em>
                            </div>
                          </div>

                          <div v-if="scoredComponents(row).length" class="hbl-section-stack">
                            <section v-for="section in eventScoreboardSections(row)" :key="section.label" class="hbl-section">
                              <h4>{{ section.label }}</h4>
                              <div class="hbl-segment-grid">
                                <article
                                  v-for="component in section.components"
                                  :key="`${row.label}-${component.label}`"
                                  class="hbl-segment-card"
                                  :class="hblSegmentClass(component)"
                                >
                                  <span>{{ hblSegmentName(component) }}</span>
                                  <strong>{{ hblSegmentWinner(component, row) }}</strong>
                                  <em>{{ hblSegmentScore(component) }}</em>
                                </article>
                              </div>
                            </section>
                          </div>
                          <p v-else class="hbl-empty">No scoring yet.</p>
                        </article>
                        <template v-else>
                          <div class="match-summary-row">
                            <span class="match-label">{{ row.label }}</span>
                            <span class="match-players" :class="{ 'match-winner': overallWinner(row) === 'team1' }">{{ row.aPlayers.join(' / ') }}</span>
                            <span class="match-vs">vs</span>
                            <span class="match-players" :class="{ 'match-winner': overallWinner(row) === 'team2' }">{{ row.bPlayers.join(' / ') }}</span>
                            <span class="match-result">{{ matchResultLabel(row) }}</span>
                          </div>
                          <button
                            v-if="scoredComponents(row).length"
                            class="btn-text event-detail-toggle"
                            type="button"
                            @click="toggleEventDetails(eventDetailKey(r.roundIndex, row))"
                          >
                            {{ expandedEventDetails[eventDetailKey(r.roundIndex, row)] ? 'Hide match details' : 'View match details' }}
                          </button>
                          <div v-if="expandedEventDetails[eventDetailKey(r.roundIndex, row)] && scoredComponents(row).length" class="comp-breakdown">
                            <span
                              v-for="component in scoredComponents(row)"
                              :key="`${row.label}-${component.label}`"
                              class="comp-chip"
                              :class="componentResultClass(component)"
                            >{{ component.label }}: {{ componentResultLabel(component) }}</span>
                          </div>
                        </template>
                      </template>
                    </div>
                  </template>
                  <p v-else-if="!r.hasData && !roundReadinessIssue(eventStore.event?.config.rounds[r.roundIndex])" class="hint">Ready to launch.</p>
                </div>
              </div>

              <section class="event-settings">
                <span class="field-label">Event settings</span>
                <button class="btn-text danger" type="button" @click="archiveEvent">Archive event</button>
              </section>

              <p v-if="eventStore.error" class="status error">{{ eventStore.error }}</p>
            </template>
          </template>

          <!-- No active event -->
          <template v-else-if="!eventStore.loading">
            <p class="hint">No active event.</p>
            <div class="field-row" style="margin-top: 8px;">
              <input
                v-model="newEventName"
                class="form-input"
                type="text"
                placeholder="Event name"
                @keyup.enter="createEvent"
              />
              <button class="btn-ghost" type="button" :disabled="!store.group?.id" @click="createEvent">
                Create
              </button>
            </div>
          </template>
          <p v-else class="hint">Loading…</p>
        </section>

        <section v-else-if="online" class="settings-section">
          <button class="btn-ghost" type="button" @click="showEventMode = true">Event mode</button>
        </section>

        <!-- Past rounds (online only) -->
        <section v-if="online" class="history">
          <span class="field-label">Past rounds</span>
          <p v-if="history.loading" class="hint">Loading…</p>
          <p v-else-if="history.error" class="status error">{{ history.error }}</p>
          <p v-else-if="!history.rounds.length" class="hint">
            {{ eventStore.event ? 'No completed event rounds yet. Completed rounds will appear here after they are finished.' : 'No completed rounds yet.' }}
          </p>
          <div v-for="round in history.rounds" :key="round.id ?? round.completedAt ?? round.courseName" class="hist-card">
            <div class="hist-hdr">
              <div>
                <div class="hist-course">{{ round.courseName }}</div>
                <div class="hist-date">Completed round · {{ formatDate(round.completedAt) }}</div>
              </div>
              <button class="btn-ghost sm" type="button" @click="toggleHistory(round.id ?? round.completedAt ?? round.courseName)">
                {{ expandedHistory[round.id ?? round.completedAt ?? round.courseName] ? 'Hide details' : 'View details' }}
              </button>
            </div>
            <div v-if="round.players.length" class="hist-summary">
              <span>Top net: {{ round.players[0]?.name ?? '—' }}, {{ round.players[0]?.net ?? '—' }}</span>
              <span>Skins leader: {{ [...round.players].sort((a, b) => b.skins - a.skins)[0]?.name ?? '—' }}, {{ [...round.players].sort((a, b) => b.skins - a.skins)[0]?.skins ?? 0 }}</span>
            </div>
            <table v-if="expandedHistory[round.id ?? round.completedAt ?? round.courseName]" class="hist-table">
              <thead>
                <tr><th>Player</th><th>Team</th><th>Gross</th><th>Net</th><th>Skins</th></tr>
              </thead>
              <tbody>
                <tr v-for="p in round.players" :key="p.name">
                  <td><strong>{{ p.name }}</strong></td>
                  <td>{{ p.team }}</td>
                  <td>{{ p.gross ?? '—' }}</td>
                  <td>{{ p.net }}</td>
                  <td>{{ p.skins > 0 ? p.skins : '—' }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <!-- All-time stats (online only) -->
        <section v-if="online && (stats.stats.length || stats.loading)" class="stats">
          <span class="field-label">All-time stats</span>
          <p v-if="stats.loading" class="hint">Loading…</p>
          <template v-else>
            <table class="stats-table">
              <thead>
                <tr>
                  <th>Player</th>
                  <th>Rnds</th>
                  <th>Avg Gross</th>
                  <th>Avg Net</th>
                  <th>Skins</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="p in stats.stats" :key="p.name">
                  <td><strong>{{ p.name }}</strong></td>
                  <td>{{ p.rounds }}</td>
                  <td>{{ p.avgGross ?? '—' }}</td>
                  <td>{{ p.avgNet ?? '—' }}</td>
                  <td>{{ p.totalSkins > 0 ? p.totalSkins : '—' }}</td>
                </tr>
              </tbody>
            </table>
          </template>
        </section>

        <section class="settings-section">
          <span class="field-label">Group settings</span>
          <button class="btn-text danger" type="button" @click="leave">Leave group</button>
        </section>
      </template>

      <!-- No active group -->
      <template v-else>
        <h1>Groups</h1>
        <p class="lede">Join or create a group. Create a group for your round or enter a code to join one.</p>

        <section v-if="store.hasGroup" class="current-group card-section">
          <div>
            <span class="field-label">Current group</span>
            <div class="recent-name">{{ store.groupName }}</div>
            <div class="recent-meta">Group code {{ store.groupCode }}</div>
          </div>
          <button class="btn-primary sm" type="button" @click="router.push('/group')">Open group</button>
        </section>

        <form class="field card-section" @submit.prevent="create">
          <span class="field-label">Create group</span>
          <div class="field-row">
            <input
              v-model="newName"
              class="form-input"
              type="text"
              placeholder="Group name"
              @keyup.enter="create"
            />
            <button class="btn-primary" type="submit" :disabled="!canCreateGroup">
              {{ store.busy ? 'Creating…' : 'Create group' }}
            </button>
          </div>
        </form>

        <form class="field card-section" @submit.prevent="join">
          <span class="field-label">Join with code</span>
          <div class="field-row">
            <input
              v-model="joinCode"
              class="form-input"
              type="text"
              maxlength="4"
              placeholder="ABCD"
              :disabled="!online"
              inputmode="text"
              autocomplete="off"
              @input="normalizeJoinInput"
              @keyup.enter="join"
            />
            <button class="btn-primary" type="submit" :disabled="!canJoinGroup">
              {{ store.busy ? 'Joining…' : 'Join' }}
            </button>
          </div>
        </form>
        <p v-if="!online" class="hint">Online sync is not configured; joining is unavailable.</p>

        <div class="recent card-section">
          <span class="field-label">Recent groups</span>
          <p v-if="!store.recentGroups.length" class="hint">No recent groups yet. Create a group or join one with a code to get started.</p>
          <div v-for="g in store.recentGroups" :key="g.roomCode" class="recent-row">
            <div>
              <div class="recent-name">{{ g.name }}</div>
              <div class="recent-meta">Group code {{ g.roomCode }}</div>
            </div>
            <div class="recent-actions">
              <button class="btn-primary sm" type="button" @click="openRecent(g.roomCode)">Open group</button>
              <button class="btn-text danger" type="button" @click="forgetRecent(g.roomCode)">Forget group</button>
            </div>
          </div>
        </div>
      </template>

      <p v-if="store.status" class="status" :class="{ error: store.statusError }">
        {{ store.status }}
      </p>
    </section>
  </main>
</template>

<style scoped>
.group-panel {
  width: min(100%, 980px);
}

.group-header {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: flex-start;
}

.group-title-row,
.group-meta-row,
.section-head,
.rename-row {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.group-title-row h1 {
  font-size: clamp(1.85rem, 5vw, 2.65rem);
}

.group-meta-row {
  margin-top: 10px;
}

.code-badge {
  display: inline-flex;
  align-items: center;
  border: 1px solid #cdbf9f;
  border-radius: 999px;
  padding: 4px 12px;
  color: #8a672f;
  font-weight: 800;
  letter-spacing: 0.06em;
  font-size: 0.78rem;
  text-transform: uppercase;
}

.meta-dot,
.section-count {
  color: #6f7d72;
  font-size: 0.82rem;
  font-weight: 700;
}

.action-card,
.card-section,
.settings-section {
  border: 1px solid #e0d7c4;
  border-radius: 8px;
  background: #fffdf7;
  padding: 14px;
}

.action-card {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: center;
  margin-top: 24px;
}

.action-card h2 {
  margin: 0;
  color: #24362c;
  font-size: 1.05rem;
}

.settings-section {
  margin-top: 28px;
}

.btn-text {
  border: 0;
  background: transparent;
  color: #4a5a4f;
  padding: 6px 2px;
  font-size: 0.88rem;
  font-weight: 800;
  cursor: pointer;
}

.btn-text:hover {
  color: #2f5d43;
  text-decoration: underline;
}

.btn-text.danger {
  color: #b1462f;
}

.field {
  display: block;
  margin-top: 20px;
}

.field-label {
  display: block;
  margin-bottom: 6px;
  color: #4a5a4f;
  font-size: 0.78rem;
  font-weight: 700;
  letter-spacing: 0;
  text-transform: uppercase;
}

.field-row {
  display: flex;
  gap: 8px;
}

.form-input {
  flex: 1;
  min-width: 0;
  border: 1px solid #cdbf9f;
  border-radius: 6px;
  min-height: 48px;
  padding: 10px 12px;
  background: #fffdf7;
  color: #1f2a24;
}

input[placeholder="ABCD"] {
  text-transform: uppercase;
  letter-spacing: 0.22em;
  font-weight: 800;
}

.home-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 24px;
}

.resume-card {
  display: flex;
  flex-direction: column;
  gap: 3px;
  align-items: flex-start;
  width: 100%;
  margin-top: 14px;
  padding: 14px 18px;
  border: 1px solid #2f5d43;
  border-radius: 8px;
  background: #eaf3ec;
  cursor: pointer;
  text-align: left;
}

.resume-card:hover {
  background: #def0e3;
}

.resume-label {
  font-size: 1rem;
  font-weight: 800;
  color: #2f5d43;
}

.resume-sub {
  font-size: 0.8rem;
  color: #5a6a5f;
}

.btn-primary,
.btn-ghost {
  border-radius: 6px;
  min-height: 44px;
  padding: 10px 18px;
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

.btn-ghost.sm {
  padding: 6px 12px;
  font-size: 0.85rem;
}

.btn-primary.sm {
  min-height: 36px;
  padding: 6px 12px;
  font-size: 0.85rem;
}

.btn-ghost.danger {
  border-color: #c0392b;
  color: #c0392b;
}

.btn-ghost.sm.danger {
  border-color: #d8c4c4;
  color: #b1462f;
}

.btn-primary:disabled,
.btn-ghost:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.recent {
  margin-top: 24px;
}

.recent-row,
.roster-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  border: 1px solid #e0d7c4;
  border-radius: 6px;
  padding: 10px 12px;
  margin-top: 8px;
}

.roster {
  margin-top: 28px;
}

.roster-add {
  display: flex;
  gap: 8px;
  margin-top: 8px;
}

.idx-input {
  max-width: 160px;
}

.recent-name,
.roster-name {
  font-weight: 700;
  color: #24362c;
}

.recent-meta,
.roster-meta {
  color: #7a8a7f;
  font-size: 0.8rem;
  letter-spacing: 0;
}

.recent-actions,
.roster-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.hint {
  margin: 8px 0 0;
  color: #7a8a7f;
  font-size: 0.85rem;
}

.history {
  margin-top: 28px;
}

.hist-card {
  border: 1px solid #e0d7c4;
  border-radius: 6px;
  padding: 12px;
  margin-top: 10px;
  background: #fffdf7;
}

.hist-hdr {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 8px;
}

.hist-course {
  font-weight: 700;
  color: #24362c;
}

.hist-date {
  color: #7a8a7f;
  font-size: 0.8rem;
}

.hist-summary {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  margin: 10px 0 2px;
  color: #4a5a4f;
  font-size: 0.84rem;
  font-weight: 700;
}

.hist-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.85rem;
  margin-top: 10px;
}

.hist-table th,
.hist-table td {
  text-align: left;
  padding: 4px 8px;
  border-bottom: 1px solid #efe9da;
}

.hist-table th {
  color: #7a8a7f;
  font-weight: 600;
  text-transform: uppercase;
  font-size: 0.7rem;
  letter-spacing: 0;
}

.event-section {
  margin-top: 28px;
  border: 1px solid #e0d7c4;
  border-radius: 8px;
  background: #fffdf7;
  padding: 16px;
}

.event-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-top: 6px;
}

.event-header-actions {
  display: flex;
  gap: 8px;
  align-items: center;
}

.event-kicker,
.event-rounds-head {
  color: #4a5a4f;
  font-size: 0.72rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.event-name {
  margin-top: 3px;
  font-weight: 800;
  color: #24362c;
  font-size: 1.28rem;
}

.event-title-sub {
  margin-top: 2px;
  color: #6f7d72;
  font-size: 0.86rem;
  font-weight: 700;
}

.event-scoreboard {
  margin-top: 14px;
  border: 1px solid #d8e2d7;
  border-radius: 8px;
  background: #f3faf2;
  padding: 14px;
}

.event-scoreboard-title {
  color: #2f5d43;
  font-size: 0.78rem;
  font-weight: 900;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.event-score-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  margin-top: 10px;
}

.event-score-team {
  border: 1px solid #d8e2d7;
  border-radius: 8px;
  background: #fffdf7;
  padding: 12px;
}

.event-score-team span {
  display: block;
  color: #4a5a4f;
  font-size: 0.82rem;
  font-weight: 800;
}

.event-score-team strong {
  display: block;
  margin-top: 4px;
  color: #24362c;
  font-size: 2rem;
  line-height: 1;
}

.event-score-team.leading {
  border-color: #b7d1b9;
  box-shadow: inset 0 0 0 1px #b7d1b9;
}

.event-score-team.leading strong {
  color: #2f5d43;
}

.event-score-note {
  margin: 10px 0 0;
  color: #5a6a5f;
  font-size: 0.82rem;
  font-weight: 800;
}

.event-teams {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  align-items: flex-start;
  gap: 12px;
  margin-top: 12px;
  padding: 12px;
  border: 1px solid #e0d7c4;
  border-radius: 8px;
  background: #fffdf7;
}

.event-team {
  min-width: 0;
}

.event-team-name {
  font-weight: 800;
  color: #24362c;
  font-size: 0.92rem;
}

.event-team-players {
  color: #7a8a7f;
  font-size: 0.82rem;
  font-weight: 700;
  margin-top: 4px;
  line-height: 1.35;
}

.event-vs {
  color: #7a8a7f;
  font-weight: 800;
  padding-top: 4px;
}

.event-leaders {
  margin-top: 12px;
  border: 1px solid #e0d7c4;
  border-radius: 8px;
  background: #fdfbf4;
  padding: 12px;
}

.event-leaders-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  color: #7a8a7f;
  font-size: 0.74rem;
  font-weight: 700;
}

.event-leader-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 8px;
  margin-top: 10px;
}

.event-leader-card {
  min-width: 0;
  border: 1px solid #e4ddcd;
  border-radius: 8px;
  background: #fffdf7;
  padding: 10px;
}

.event-leader-card span {
  display: block;
  color: #7a8a7f;
  font-size: 0.7rem;
  font-weight: 900;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.event-leader-card strong {
  display: block;
  margin-top: 5px;
  color: #24362c;
  font-size: 1.05rem;
  line-height: 1.1;
}

.event-leader-card em {
  display: block;
  margin-top: 4px;
  color: #2f5d43;
  font-size: 0.78rem;
  font-style: normal;
  font-weight: 800;
}

.event-rounds {
  margin-top: 10px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.event-rounds-head {
  margin-top: 18px;
}

.event-round-card {
  border: 1px solid #e0d7c4;
  border-radius: 8px;
  padding: 12px;
  background: #fffdf7;
}

.event-round-card.round-state-completed,
.event-round-card.round-state-live,
.event-round-card.round-state-active {
  border-color: #cddfcf;
}

.event-round-hdr {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.event-round-actions {
  display: flex;
  align-items: flex-end;
  gap: 8px;
  flex-shrink: 0;
  text-align: right;
}

.event-round-name {
  font-weight: 800;
  color: #24362c;
  font-size: 0.98rem;
}

.event-round-meta {
  color: #7a8a7f;
  font-size: 0.78rem;
  font-weight: 700;
}

.event-round-state {
  display: inline-flex;
  margin-top: 8px;
  border-radius: 999px;
  background: #eef2ec;
  color: #4a5a4f;
  padding: 3px 8px;
  font-size: 0.68rem;
  font-weight: 900;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.event-round-score {
  display: grid;
  gap: 2px;
}

.event-round-score strong {
  color: #24362c;
  font-size: 0.9rem;
}

.event-round-score span {
  color: #2f5d43;
  font-size: 0.8rem;
  font-weight: 800;
}

.event-blocker {
  margin: 10px 0 0;
  color: #8a672f;
  font-size: 0.82rem;
  font-weight: 800;
}

.match-summary-list {
  display: grid;
  gap: 8px;
  margin-top: 12px;
}

.match-summary-row {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.82rem;
  flex-wrap: wrap;
  border-top: 1px solid #efe9da;
  padding-top: 8px;
}

.match-label {
  color: #7a8a7f;
  font-size: 0.72rem;
  font-weight: 600;
  text-transform: uppercase;
  min-width: 46px;
}

.match-players {
  color: #283b30;
}

.match-winner {
  font-weight: 700;
  color: #2f5d43;
}

.match-vs {
  color: #aab8b0;
  font-size: 0.75rem;
}

.match-result {
  margin-left: auto;
  font-weight: 800;
  color: #4a6050;
  font-size: 0.82rem;
}

.hbl-match-card {
  border: 1px solid #e3dbc9;
  border-radius: 8px;
  background: #fffdf7;
  padding: 12px;
  box-shadow: inset 4px 0 0 rgba(47, 93, 67, 0.18);
}

.hbl-match-card + .hbl-match-card,
.hbl-match-card + .match-summary-row,
.match-summary-row + .hbl-match-card {
  margin-top: 10px;
}

.hbl-match-head,
.hbl-team-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 12px;
  align-items: start;
}

.hbl-match-label {
  color: #24362c;
  font-size: 0.9rem;
  font-weight: 900;
}

.hbl-match-meta {
  margin-top: 2px;
  color: #7a8a7f;
  font-size: 0.74rem;
  font-weight: 800;
}

.hbl-match-score {
  text-align: right;
  color: #24362c;
}

.hbl-match-score strong {
  display: block;
  font-size: 1.2rem;
  line-height: 1;
}

.hbl-match-score span {
  display: block;
  margin-top: 4px;
  color: #4a6050;
  font-size: 0.78rem;
  font-weight: 850;
}

.hbl-team-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
  margin-top: 10px;
}

.hbl-team-block {
  min-width: 0;
  border: 1px solid #e4ddcd;
  border-radius: 8px;
  background: #fbf7ed;
  padding: 9px 10px;
}

.hbl-team-block span,
.hbl-team-block em {
  display: block;
  font-style: normal;
}

.hbl-team-block span {
  color: #7a8a7f;
  font-size: 0.68rem;
  font-weight: 900;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.hbl-team-block strong {
  display: block;
  margin-top: 4px;
  color: #24362c;
  font-size: 0.95rem;
  line-height: 1.15;
}

.hbl-team-block em {
  margin-top: 4px;
  color: #607067;
  font-size: 0.76rem;
  font-weight: 850;
}

.hbl-team1 {
  box-shadow: inset 4px 0 0 #2f5d43;
}

.hbl-team2 {
  box-shadow: inset 4px 0 0 #9a6f24;
}

.hbl-team-leading.hbl-team1 {
  background: rgba(47, 93, 67, 0.1);
  border-color: rgba(47, 93, 67, 0.32);
}

.hbl-team-leading.hbl-team2 {
  background: rgba(154, 111, 36, 0.11);
  border-color: rgba(154, 111, 36, 0.34);
}

.hbl-section-stack {
  display: grid;
  gap: 10px;
  margin-top: 12px;
}

.hbl-section h4 {
  margin: 0 0 6px;
  color: #24362c;
  font-size: 0.82rem;
}

.hbl-segment-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 7px;
}

.hbl-segment-card {
  min-width: 0;
  border: 1px solid #e5dece;
  border-radius: 8px;
  background: #f5f1e8;
  padding: 8px;
}

.hbl-segment-card span,
.hbl-segment-card strong,
.hbl-segment-card em {
  display: block;
}

.hbl-segment-card span {
  color: #7a8a7f;
  font-size: 0.68rem;
  font-weight: 900;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.hbl-segment-card strong {
  margin-top: 5px;
  color: #24362c;
  font-size: 0.84rem;
  line-height: 1.18;
}

.hbl-segment-card em {
  margin-top: 4px;
  color: #607067;
  font-size: 0.74rem;
  font-style: normal;
  font-weight: 850;
}

.hbl-segment-team1 {
  background: rgba(47, 93, 67, 0.1);
  border-color: rgba(47, 93, 67, 0.28);
  box-shadow: inset 3px 0 0 #2f5d43;
}

.hbl-segment-team2 {
  background: rgba(154, 111, 36, 0.11);
  border-color: rgba(154, 111, 36, 0.3);
  box-shadow: inset 3px 0 0 #9a6f24;
}

.hbl-segment-push {
  background: #f2eee4;
}

.hbl-segment-open {
  opacity: 0.62;
}

.hbl-empty {
  margin: 12px 0 0;
  border: 1px dashed #ded6c7;
  border-radius: 8px;
  background: #f7f3ea;
  color: #7a8a7f;
  font-size: 0.82rem;
  font-weight: 800;
  padding: 10px;
}

.event-detail-toggle {
  margin-left: 52px;
  font-size: 0.78rem;
}

.comp-breakdown {
  display: grid;
  gap: 5px;
  margin: 0 0 4px 52px;
}

.comp-chip {
  width: fit-content;
  font-size: 0.72rem;
  font-weight: 800;
  padding: 4px 8px;
  border-radius: 999px;
  background: #eef2ec;
  color: #5a6a5e;
}

.comp-chip.comp-team1 {
  background: rgba(47, 93, 67, 0.14);
  color: #2f5d43;
}

.comp-chip.comp-team2 {
  background: rgba(176, 132, 22, 0.16);
  color: #8a672f;
}

.event-settings {
  margin-top: 18px;
  border-top: 1px solid #e0d7c4;
  padding-top: 14px;
}

@media (max-width: 700px) {
  .group-panel {
    padding: 20px 16px;
  }

  .group-header,
  .action-card,
  .field-row,
  .roster-add,
  .recent-row,
  .roster-row,
  .hist-hdr,
  .event-header,
  .event-round-hdr,
  .event-round-actions {
    align-items: stretch;
    flex-direction: column;
  }

  .btn-primary,
  .btn-ghost {
    width: 100%;
  }

  .btn-text {
    align-self: flex-start;
  }

  .idx-input {
    max-width: none;
  }

  .hist-table {
    display: block;
    overflow-x: auto;
  }

  .event-score-grid,
  .event-teams,
  .event-leader-grid {
    grid-template-columns: 1fr;
  }

  .hbl-match-head,
  .hbl-team-grid,
  .hbl-segment-grid {
    grid-template-columns: 1fr;
  }

  .hbl-match-score {
    text-align: left;
  }

  .event-vs {
    padding-top: 0;
  }

  .event-round-actions {
    text-align: left;
  }

  .match-summary-row {
    display: grid;
    gap: 4px;
  }

  .match-result {
    margin-left: 0;
  }

  .event-detail-toggle,
  .comp-breakdown {
    margin-left: 0;
  }
}

.stats {
  margin-top: 28px;
}

.stats-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.85rem;
}

.stats-table th,
.stats-table td {
  text-align: left;
  padding: 4px 8px;
  border-bottom: 1px solid #efe9da;
}

.stats-table th {
  color: #7a8a7f;
  font-weight: 600;
  text-transform: uppercase;
  font-size: 0.7rem;
}

.status {
  margin: 16px 0 0;
  color: #4a5a4f;
  font-weight: 600;
}

.status.error {
  color: #c0392b;
}

@media (max-width: 640px) {
  .field-row,
  .roster-add,
  .roster-row {
    align-items: stretch;
    flex-direction: column;
  }

  .idx-input {
    max-width: none;
  }
}
</style>
