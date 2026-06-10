<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import CourseScorecard from '@/components/CourseScorecard.vue';
import { courseFromSearchTee, selectableCourseTees, type CourseSearchResult, type CourseSearchTee } from '@/domain/courseSearch';
import { gamesFromEventRound } from '@/domain/events';
import { cloneDefaultGames, normalizeGames } from '@/domain/games';
import { sortedGroupPlayers } from '@/domain/players';
import { autoPlayingGroupsForTeams, autoPlayingGroupsFromPairMatches, normalizePlayingGroups } from '@/domain/playingGroups';
import { allocateNetStrokes, computeWHSCourseHcp, getsStroke } from '@/scoring/handicap';
import { searchCourses } from '@/services/courseSearch';
import { useGroupStore } from '@/stores/group';
import { emptyRound, useRoundStore } from '@/stores/round';
import { useEventStore } from '@/stores/event';
import type { Course, GameConfig, PairMatch, PlayerMap, RoundState, ScoreType } from '@/types';

const store = useRoundStore();
const group = useGroupStore();
const event = useEventStore();
const router = useRouter();
const route = useRoute();

const editMode = computed(() => route.query.edit === '1');

const DEFAULT_PAR = [4, 5, 3, 4, 4, 3, 5, 4, 4, 4, 4, 3, 5, 4, 4, 3, 5, 4];
const DEFAULT_SI = [7, 1, 15, 5, 11, 17, 3, 9, 13, 8, 2, 16, 4, 12, 10, 18, 6, 14];
const DEFAULT_YDS = Array.from({ length: 18 }, () => 0);

function confirmAction(message: string): boolean {
  if (navigator.userAgent.includes('jsdom')) return true;
  try {
    const answer = window.confirm(message);
    return typeof answer === 'boolean' ? answer : true;
  } catch {
    return true;
  }
}

interface PlayerRow {
  name: string;
  handicapIndex: number | string;
  team: 'team1' | 'team2';
}

const form = reactive({
  courseQuery: '',
  courseId: '',
  clubName: '',
  courseName: '',
  location: '',
  teeName: 'Blue',
  teeGender: '',
  teeYards: 0,
  rating: 72,
  slope: 113,
  par: [...DEFAULT_PAR],
  si: [...DEFAULT_SI],
  yds: [...DEFAULT_YDS],
  teamNames: { team1: 'Team 1', team2: 'Team 2' },
  players: [
    { name: '', handicapIndex: '', team: 'team1' },
    { name: '', handicapIndex: '', team: 'team1' },
    { name: '', handicapIndex: '', team: 'team2' },
    { name: '', handicapIndex: '', team: 'team2' },
  ] as PlayerRow[],
  games: cloneDefaultGames() as GameConfig,
  playingGroupNames: [] as string[],
  playingGroupCustom: null as string[][] | null,
  pairMatches: [] as PairMatch[],
});

onMounted(() => {
  group.load();
  // In edit mode, recover the round from storage if it isn't already in memory
  // (e.g. a refresh or deep-link to /setup?edit=1) before prefilling the form.
  if (editMode.value && !store.round) store.load();
  prefillPlayersFromGroup();
});


const courseResults = ref<CourseSearchResult[]>([]);
const selectedCourse = ref<CourseSearchResult | null>(null);
const selectedTeeKey = ref('');
const courseSearching = ref(false);
const courseSearchError = ref('');
const showCourseScorecard = ref(false);
// True once a real course is in the form (prefilled from edit/event, or picked
// from search). Drives whether we show the read-only scorecard + "Change course"
// or the search UI — applies in every mode so a missing/wrong course is fixable.
const courseSet = ref(false);

const canSearchCourses = computed(() => form.courseQuery.trim().length >= 3 && !courseSearching.value);

function prefillPlayersFromGroup() {
  const players = sortedGroupPlayers(group.group?.players);

  // Edit mode: prefill from live round state, preserving all setup fields.
  const editRound = editMode.value ? store.round : null;
  const editCourse = editRound?.course ?? null;
  if (editRound && editCourse) {
    const r = editRound;
    const hcpMap = Object.fromEntries(players.map((p) => [p.name, p.handicapIndex]));
    form.courseId = editCourse.id ?? '';
    form.clubName = editCourse.clubName ?? '';
    form.courseName = editCourse.courseName ?? '';
    form.location = typeof editCourse.location === 'string' ? editCourse.location : '';
    form.teeName = editCourse.tee.name;
    form.teeGender = editCourse.tee.gender ?? '';
    form.teeYards = editCourse.tee.yards ?? 0;
    form.rating = editCourse.tee.rating;
    form.slope = editCourse.tee.slope;
    form.par = [...editCourse.par];
    form.si = [...editCourse.si];
    form.yds = [...editCourse.yds];
    form.teamNames = { ...r.teamNames };
    form.players = [
      ...r.team1.map((name) => ({ name, handicapIndex: hcpMap[name] ?? '', team: 'team1' as const })),
      ...r.team2.map((name) => ({ name, handicapIndex: hcpMap[name] ?? '', team: 'team2' as const })),
    ];
    // r.games is a reactive proxy; structuredClone throws on it, so deep-clone
    // via JSON (plain data) to avoid aborting the rest of the prefill.
    form.games = JSON.parse(JSON.stringify(r.games)) as GameConfig;
    form.playingGroupNames = (r.playingGroups ?? []).map((g) => g.name);
    form.playingGroupCustom = (r.playingGroups ?? []).map((g) => [...g.players]);
    form.pairMatches = (r.pairMatches ?? []).map((m) => ({ a: [...m.a], b: [...m.b] }));
    courseSet.value = true;
    return;
  }

  if (!players.length) return;

  // When launched from an event round, use the event's team assignments.
  const pendingIndex = event.pendingRoundLink?.roundIndex;
  const eventConfig = event.event?.config;
  const roundConfig = pendingIndex != null ? eventConfig?.rounds[pendingIndex] : null;

  if (eventConfig && roundConfig) {
    const hcpMap = Object.fromEntries(players.map((p) => [p.name, p.handicapIndex]));
    form.teamNames.team1 = eventConfig.teamNames.team1;
    form.teamNames.team2 = eventConfig.teamNames.team2;
    form.players = [
      ...eventConfig.team1.map((name) => ({ name, handicapIndex: hcpMap[name] ?? '', team: 'team1' as const })),
      ...eventConfig.team2.map((name) => ({ name, handicapIndex: hcpMap[name] ?? '', team: 'team2' as const })),
    ];
    form.playingGroupNames = (roundConfig.playingGroups ?? []).map((g) => g.name);
    if (roundConfig.pairMatches?.length) {
      form.pairMatches = roundConfig.pairMatches.map((m) => ({ a: [...m.a], b: [...m.b] }));
    }
    // Inherit (and lock) the course/tee chosen in the event round config.
    if (roundConfig.course) {
      const c = roundConfig.course;
      form.courseId = c.id ?? '';
      form.clubName = c.clubName ?? '';
      form.courseName = c.courseName ?? '';
      form.location = typeof c.location === 'string' ? c.location : '';
      form.teeName = c.tee.name;
      form.teeGender = c.tee.gender ?? '';
      form.teeYards = c.tee.yards ?? 0;
      form.rating = c.tee.rating;
      form.slope = c.tee.slope;
      form.par = [...c.par];
      form.si = [...c.si];
      form.yds = [...c.yds];
      courseSet.value = true;
    }
    applyEventGames(roundConfig);
    return;
  }

  // Default: split roster evenly across teams.
  const split = Math.ceil(players.length / 2);
  form.players = players.map((player, index) => ({
    name: player.name,
    handicapIndex: player.handicapIndex,
    team: index < split ? 'team1' : 'team2',
  }));
}

function applyEventGames(roundConfig: import('@/types/event').EventRoundConfig) {
  form.games = gamesFromEventRound(roundConfig);
}

function courseLabel(course: CourseSearchResult) {
  return course.clubName || course.courseName || 'Course';
}

function courseSubLabel(course: CourseSearchResult) {
  return [course.courseName && course.courseName !== course.clubName ? course.courseName : '', course.location]
    .filter(Boolean)
    .join(' - ');
}

function teeLabel(tee: CourseSearchTee) {
  return [
    tee.gender || '',
    tee.yards ? `${Number(tee.yards).toLocaleString()} yds` : '',
    tee.rating ? `Rating ${tee.rating}` : '',
    tee.slope ? `Slope ${tee.slope}` : '',
  ].filter(Boolean).join(' / ');
}

function courseTeeKey(tee: CourseSearchTee) {
  return `${tee.name || 'Tee'}-${tee.gender || ''}-${tee.yards || 0}`;
}

async function runCourseSearch() {
  if (form.courseQuery.trim().length < 3) {
    courseSearchError.value = 'Enter at least 3 characters.';
    courseResults.value = [];
    selectedCourse.value = null;
    return;
  }

  courseSearching.value = true;
  courseSearchError.value = '';
  selectedCourse.value = null;
  selectedTeeKey.value = '';
  try {
    courseResults.value = await searchCourses(form.courseQuery);
    if (!courseResults.value.length) courseSearchError.value = 'No courses found.';
  } catch (error) {
    courseResults.value = [];
    courseSearchError.value = error instanceof Error ? error.message : 'Course search failed.';
  } finally {
    courseSearching.value = false;
  }
}

function chooseCourse(course: CourseSearchResult) {
  selectedCourse.value = course;
  selectedTeeKey.value = '';
  courseSearchError.value = selectableCourseTees(course).length ? '' : 'No 18-hole tees returned for this course.';
}

function applyCourse(course: CourseSearchResult, tee: CourseSearchTee) {
  const selected = courseFromSearchTee(course, tee);
  form.courseId = selected.id || '';
  form.clubName = selected.clubName || '';
  form.courseName = selected.courseName || '';
  form.location = selected.location || '';
  form.teeName = selected.tee.name;
  form.teeGender = selected.tee.gender || '';
  form.teeYards = selected.tee.yards || 0;
  form.rating = selected.tee.rating;
  form.slope = selected.tee.slope;
  form.par = [...selected.par];
  form.si = [...selected.si];
  form.yds = [...selected.yds];
  selectedCourse.value = course;
  selectedTeeKey.value = courseTeeKey(tee);
  courseResults.value = [];
  courseSearchError.value = '';
  courseSet.value = true;
}

function clearCourse() {
  if (courseSet.value) {
    const ok = confirmAction('Change course?\n\nThis clears the selected course details for this setup. Existing saved rounds are not changed until you save.');
    if (!ok) return;
  }
  form.courseId = '';
  form.clubName = '';
  form.courseName = '';
  form.location = '';
  form.teeName = 'Blue';
  form.teeGender = '';
  form.teeYards = 0;
  form.rating = 72;
  form.slope = 113;
  form.par = [...DEFAULT_PAR];
  form.si = [...DEFAULT_SI];
  form.yds = [...DEFAULT_YDS];
  form.courseQuery = '';
  selectedCourse.value = null;
  selectedTeeKey.value = '';
  courseResults.value = [];
  courseSearchError.value = '';
  courseSet.value = false;
  showCourseScorecard.value = false;
}

function addPlayer() {
  const team = form.players.filter((p) => p.team === 'team1').length <= form.players.filter((p) => p.team === 'team2').length
    ? 'team1'
    : 'team2';
  form.players.push({ name: '', handicapIndex: '', team });
}

function removePlayer(index: number) {
  const name = form.players[index]?.name?.trim() || 'this player';
  const ok = confirmAction(`Remove ${name}?\n\nThis removes the player from this round setup only.`);
  if (!ok) return;
  form.players.splice(index, 1);
}

const namedPlayers = computed(() => form.players.filter((p) => p.name.trim()));
const team1 = computed(() => namedPlayers.value.filter((p) => p.team === 'team1').map((p) => p.name.trim()));
const team2 = computed(() => namedPlayers.value.filter((p) => p.team === 'team2').map((p) => p.name.trim()));

const duplicateNames = computed(() => {
  const names = namedPlayers.value.map((p) => p.name.trim());
  return names.length !== new Set(names).size;
});

const selectedGameCount = computed(() => {
  const games = form.games;
  return [
    games.skins.enabled,
    games.bestBall.enabled,
    games.bestBallAggy.enabled,
    games.twoManScramble.enabled,
    games.highBallLowBall.enabled,
    games.scramble4.enabled,
    games.wolf.enabled,
    games.puttPoker.enabled,
  ].filter(Boolean).length;
});

const errors = computed(() => {
  const list: string[] = [];
  if (form.par.some((value) => !Number(value))) list.push('Every hole needs a par value.');
  if (!selectedGameCount.value && !hasEventContext.value) list.push('Select at least one game.');
  if (!team1.value.length) list.push(`${form.teamNames.team1} needs at least one player.`);
  if (!team2.value.length) list.push(`${form.teamNames.team2} needs at least one player.`);
  if (duplicateNames.value) list.push('Player names must be unique.');
  if (showPairMatches.value && !cleanedPairMatches.value.length) list.push('Team games need at least one valid team set.');
  return list;
});

const canStart = computed(() => errors.value.length === 0);
const firstBlockingIssue = computed(() => errors.value[0] ?? '');

const hasEventContext = computed(() => event.pendingRoundLink != null);
const rosterReadOnly = computed(() => hasEventContext.value);

// --- Pair-match builder (Side A vs Side B) ------------------------------

const TEAM_GAMES = [
  { key: 'bestBallAggy', label: 'Best Ball + Aggy', hasBasis: true },
  { key: 'highBallLowBall', label: 'High / Low Ball', hasBasis: true },
  { key: 'twoManScramble', label: 'Two-Man Scramble', hasBasis: false },
] as const;

const enabledTeamGames = computed(() => TEAM_GAMES.filter((g) => form.games[g.key].enabled));
const showPairMatches = computed(() => enabledTeamGames.value.length > 0);

function addPairMatch() {
  form.pairMatches.push({ a: [], b: [] });
}

function removePairMatch(index: number) {
  const ok = confirmAction('Remove team set?\n\nThis removes the matchup from this round setup.');
  if (!ok) return;
  form.pairMatches.splice(index, 1);
}

function setPairSide(matchIndex: number, player: string, side: 'a' | 'b' | 'sit') {
  const match = form.pairMatches[matchIndex];
  if (!match) return;
  match.a = match.a.filter((p) => p !== player);
  match.b = match.b.filter((p) => p !== player);
  if (side !== 'sit') match[side].push(player);
}

function pairSide(matchIndex: number, player: string): 'a' | 'b' | 'sit' {
  const match = form.pairMatches[matchIndex];
  if (!match) return 'sit';
  if (match.a.includes(player)) return 'a';
  if (match.b.includes(player)) return 'b';
  return 'sit';
}

// Seed a sensible default match (whole team1 vs whole team2) the first time a
// team game is enabled, so an ad-hoc round always has something to score.
watch(showPairMatches, (show) => {
  if (show && form.pairMatches.length === 0 && team1.value.length && team2.value.length) {
    form.pairMatches = [{ a: [...team1.value], b: [...team2.value] }];
  }
});

const cleanedPairMatches = computed<PairMatch[]>(() => {
  const valid = new Set(namedPlayers.value.map((p) => p.name.trim()));
  return form.pairMatches
    .map((m) => ({
      a: m.a.filter((p) => valid.has(p)),
      b: m.b.filter((p) => valid.has(p)),
    }))
    .filter((m) => m.a.length && m.b.length);
});

const matchSummaries = computed(() =>
  cleanedPairMatches.value.map((m, i) => ({
    index: i,
    a: m.a.join(' / '),
    b: m.b.join(' / '),
    group: previewPlayingGroups.value[i]?.name ?? `Group ${i + 1}`,
    games: enabledTeamGames.value.map((g) => {
      const cfg = form.games[g.key] as { scoringMode: 'stroke' | 'match'; scoreBasis?: ScoreType; stake: { front: number; back: number; overall: number } };
      return {
        label: g.label,
        basis: g.hasBasis ? capitalize(cfg.scoreBasis ?? 'net') : 'Gross',
        mode: cfg.scoringMode === 'match' ? 'match play' : 'stroke play',
        bet: `Front $${cfg.stake.front} · Back $${cfg.stake.back} · Overall $${cfg.stake.overall}`,
      };
    }),
  })),
);

// Prompt before clobbering manually-edited playing groups when matches change.
watch(
  () => JSON.stringify(form.pairMatches),
  () => {
    if (form.playingGroupCustom) {
      const ok = confirmAction('Team sets changed. Regenerate playing groups from team sets? Cancel keeps your manual groups.');
      if (ok) form.playingGroupCustom = null;
    }
  },
);

const previewPlayingGroups = computed(() =>
  cleanedPairMatches.value.length
    ? autoPlayingGroupsFromPairMatches(
        cleanedPairMatches.value,
        [...team1.value, ...team2.value],
        team1.value,
        team2.value,
      )
    : autoPlayingGroupsForTeams(team1.value, team2.value),
);

const displayPlayingGroups = computed(() => {
  if (form.playingGroupCustom) {
    return form.playingGroupCustom.map((players, i) => ({
      name: previewPlayingGroups.value[i]?.name ?? `Group ${i + 1}`,
      players,
    }));
  }
  return previewPlayingGroups.value;
});

function movePlayerToGroup(player: string, toGroupIndex: number) {
  if (!form.playingGroupCustom) {
    form.playingGroupCustom = previewPlayingGroups.value.map((g) => [...g.players]);
  }
  form.playingGroupCustom = form.playingGroupCustom.map((players) => players.filter((p) => p !== player));
  form.playingGroupCustom[toGroupIndex]?.push(player);
}

function resetCustomGroups() {
  form.playingGroupCustom = null;
}

const courseParTotal = computed(() => form.par.reduce((total, value) => total + Number(value || 0), 0));
const courseYardsTotal = computed(() => Number(form.teeYards) || form.yds.reduce((total, value) => total + Number(value || 0), 0));
const frontPar = computed(() => form.par.slice(0, 9).reduce((total, value) => total + Number(value || 0), 0));
const backPar = computed(() => form.par.slice(9).reduce((total, value) => total + Number(value || 0), 0));
const frontYards = computed(() => form.yds.slice(0, 9).reduce((total, value) => total + Number(value || 0), 0));
const backYards = computed(() => form.yds.slice(9).reduce((total, value) => total + Number(value || 0), 0));

const courseSummaryName = computed(() => (
  [form.clubName, form.courseName && form.courseName !== form.clubName ? form.courseName : '']
    .filter(Boolean)
    .join(' — ') || form.courseName || form.clubName || 'Course'
));

const courseMeta = computed(() => [
  form.teeGender || '',
  form.teeName ? `${form.teeName} tees` : '',
  `Rating ${Number(form.rating || 0).toFixed(1).replace('.0', '')}`,
  `Slope ${Number(form.slope || 0)}`,
  `Par ${courseParTotal.value}`,
  courseYardsTotal.value ? `${Number(courseYardsTotal.value).toLocaleString()} yards` : '',
].filter(Boolean));

function capitalize(value: string) {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : value;
}

function strokeSummary(row: { strokes: number }) {
  if (row.strokes <= 0) return 'Low / no strokes';
  return `Gets +${row.strokes}`;
}

function assignmentLabel(team: 'team1' | 'team2') {
  return team === 'team1' ? form.teamNames.team1 : form.teamNames.team2;
}

function setPlayerTeam(player: PlayerRow, team: 'team1' | 'team2') {
  player.team = team;
}

function groupMatchup(players: string[]) {
  const set = new Set(players);
  const match = matchSummaries.value.find((m) =>
    [...m.a.split(' / '), ...m.b.split(' / ')].filter(Boolean).some((player) => set.has(player)),
  );
  return match ? `${match.a || 'TBD'} vs ${match.b || 'TBD'}` : '';
}

const formCourse = computed<Course>(() => ({
  id: form.courseId || undefined,
  clubName: form.clubName.trim() || undefined,
  courseName: form.courseName.trim() || 'Course',
  location: form.location.trim() || undefined,
  tee: {
    name: form.teeName.trim() || 'Tee',
    gender: form.teeGender || undefined,
    rating: Number(form.rating) || 72,
    slope: Number(form.slope) || 113,
    parTotal: courseParTotal.value,
    yards: Number(form.teeYards) || form.yds.reduce((a, b) => a + Number(b || 0), 0),
  },
  par: form.par.map((v) => Number(v) || 0),
  si: form.si.map((v) => Number(v) || 0),
  yds: form.yds.map((v) => Number(v) || 0),
}));

const previewCourseHandicaps = computed(() => Object.fromEntries(
  namedPlayers.value.map((player) => [
    player.name.trim(),
    computeWHSCourseHcp(player.handicapIndex, form.slope, form.rating, courseParTotal.value),
  ]),
));

const previewStrokes = computed(() => allocateNetStrokes(previewCourseHandicaps.value));

const handicapPreviewRows = computed(() => namedPlayers.value.map((player) => {
  const name = player.name.trim();
  const strokes = previewStrokes.value[name] ?? 0;
  return {
    name,
    index: Number(player.handicapIndex || 0),
    courseHandicap: previewCourseHandicaps.value[name] ?? 0,
    strokes,
    holes: strokeHoleSummary(strokes),
  };
}));

function strokeHoleSummary(strokes: number) {
  if (strokes <= 0) return 'No strokes';
  const holes = form.si
    .map((si, index) => ({ hole: index + 1, si: Number(si) }))
    .filter(({ si }) => getsStroke(strokes, si))
    .sort((a, b) => a.si - b.si)
    .map(({ hole }) => hole);

  if (!holes.length) return 'No strokes';
  if (holes.length === 18) return 'All 18 holes';
  return `Holes ${holes.join(', ')}`;
}

function buildRound(): { round: RoundState; players: PlayerMap } {
  const course: Course = {
    id: form.courseId || undefined,
    clubName: form.clubName.trim() || undefined,
    courseName: form.courseName.trim() || 'Course',
    location: form.location.trim() || undefined,
    tee: {
      name: form.teeName.trim() || 'Tee',
      gender: form.teeGender || undefined,
      rating: Number(form.rating) || 72,
      slope: Number(form.slope) || 113,
      parTotal: form.par.reduce((a, b) => a + Number(b || 0), 0),
      yards: Number(form.teeYards) || form.yds.reduce((a, b) => a + Number(b || 0), 0),
    },
    par: form.par.map((value) => Number(value) || 0),
    si: form.si.map((value) => Number(value) || 0),
    yds: form.yds.map((value) => Number(value) || 0),
  };

  const players: PlayerMap = {};
  namedPlayers.value.forEach((p) => {
    players[p.name.trim()] = { name: p.name.trim(), handicapIndex: Number(p.handicapIndex) || 0 };
  });

  // Pair team1[i] vs team2[i] for head-to-head, matching the legacy setup.
  const matchups = team1.value
    .map((t1, index) => ({ t1, t2: team2.value[index] }))
    .filter((m) => m.t1 && m.t2);

  const playingGroups = normalizePlayingGroups(
    displayPlayingGroups.value.map((g, i) => ({
      name: form.playingGroupNames[i] || g.name,
      players: g.players,
    })),
    [...team1.value, ...team2.value],
  );

  const round: RoundState = {
    ...emptyRound(),
    course,
    team1: team1.value,
    team2: team2.value,
    teamNames: { team1: form.teamNames.team1, team2: form.teamNames.team2 },
    matchups,
    pairMatches: showPairMatches.value ? cleanedPairMatches.value : [],
    playingGroups,
    games: normalizeGames(form.games),
  };

  return { round, players };
}

async function startRound() {
  if (!canStart.value) return;
  const { round, players } = buildRound();
  if (editMode.value && store.round?.id) {
    await store.updateRound(round, players);
    void router.push('/scorecard');
    return;
  }
  const created = await store.startRound(round, players, group.group?.id ?? null);
  if (event.pendingRoundLink != null && created.id) {
    const { roundIndex } = event.pendingRoundLink;
    if (event.event?.config.rounds[roundIndex]) {
      const rounds = [...event.event.config.rounds];
      rounds[roundIndex] = { ...rounds[roundIndex], playingGroups: round.playingGroups };
      event.event.config = { ...event.event.config, rounds };
    }
    await event.linkRound(created.id);
  }
  void router.push('/scorecard');
}

function goGroup() {
  void router.push('/group');
}
</script>

<template>
  <main class="setup-shell">
    <header class="setup-topbar">
      <div>
        <p class="eyebrow">{{ editMode ? 'Edit Round' : 'New Round' }}</p>
        <h1 class="setup-title">Round Setup</h1>
        <p class="setup-lede">Configure the course, players, games, and teams before starting.</p>
      </div>
      <button class="btn-ghost" type="button" @click="goGroup">← Back to group</button>
    </header>

    <section class="setup-card checklist-card">
      <div class="setup-section-head">
        <div>
          <span class="step-pill">{{ courseSet ? 'Complete' : 'Needed' }}</span>
          <h2 class="setup-hdr">Course</h2>
        </div>
      </div>

      <!-- A course is set (prefilled from edit/event or picked from search):
           show the read-only scorecard with a Change action available in every mode. -->
      <template v-if="courseSet">
        <div class="course-summary-card">
          <div>
            <h3 class="course-summary-name">{{ courseSummaryName }}</h3>
            <p class="course-summary-meta">{{ courseMeta.join(' · ') }}</p>
            <div class="course-nine-grid">
              <div>
                <strong>Front 9</strong>
                <span>Par {{ frontPar }} · {{ Number(frontYards).toLocaleString() }} yds</span>
              </div>
              <div>
                <strong>Back 9</strong>
                <span>Par {{ backPar }} · {{ Number(backYards).toLocaleString() }} yds</span>
              </div>
            </div>
          </div>
          <div class="course-summary-actions">
            <button class="btn-ghost sm" type="button" @click="clearCourse">Change course</button>
            <button class="btn-ghost sm" type="button" @click="showCourseScorecard = !showCourseScorecard">
              {{ showCourseScorecard ? 'Hide scorecard' : 'View scorecard' }}
            </button>
          </div>
        </div>
        <div v-if="showCourseScorecard" class="contained-scorecard">
          <CourseScorecard :course="formCourse" />
        </div>
      </template>

      <!-- No course yet: show search (works for new, edit, and event rounds). -->
      <template v-else>
        <div class="course-search">
          <input
            v-model="form.courseQuery"
            class="form-input course-search-input"
            type="search"
            placeholder="Search course name"
            @keydown.enter.prevent="runCourseSearch"
          />
          <button class="btn-ghost course-search-btn" type="button" :disabled="!canSearchCourses" @click="runCourseSearch">
            {{ courseSearching ? 'Searching...' : 'Search' }}
          </button>
        </div>

        <div v-if="courseResults.length" class="course-results">
          <button v-for="course in courseResults" :key="course.id || courseLabel(course)" class="course-result" type="button" @click="chooseCourse(course)">
            <span>
              <strong>{{ courseLabel(course) }}</strong>
              <small>{{ courseSubLabel(course) }}</small>
            </span>
            <span class="course-result-meta">{{ selectableCourseTees(course).length }} tees</span>
          </button>
        </div>

        <div v-if="selectedCourse" class="tee-results">
          <button
            v-for="tee in selectableCourseTees(selectedCourse)"
            :key="courseTeeKey(tee)"
            class="tee-result"
            type="button"
            @click="applyCourse(selectedCourse, tee)"
          >
            <span>
              <strong>{{ tee.name || 'Tee' }}</strong>
              <small>{{ teeLabel(tee) }}</small>
            </span>
          </button>
        </div>

        <p v-if="courseSearchError" class="course-search-error">{{ courseSearchError }}</p>
      </template>
    </section>

    <section class="setup-card checklist-card">
      <div class="setup-section-head">
        <div>
          <span class="step-pill">{{ namedPlayers.length ? `${namedPlayers.length} players` : 'Needed' }}</span>
          <h2 class="setup-hdr">Players</h2>
        </div>
      </div>
      <div v-if="rosterReadOnly" class="event-roster-preview">
        <div class="event-roster-team">
          <div class="event-roster-team-name">{{ form.teamNames.team1 }}</div>
          <div v-for="row in handicapPreviewRows.filter((p) => team1.includes(p.name))" :key="row.name" class="event-roster-player">
            <strong>{{ row.name }}</strong>
            <span>Idx {{ row.index.toFixed(1).replace('.0', '') }}</span>
            <span>Course {{ row.courseHandicap }}</span>
          </div>
        </div>
        <div class="event-roster-team">
          <div class="event-roster-team-name">{{ form.teamNames.team2 }}</div>
          <div v-for="row in handicapPreviewRows.filter((p) => team2.includes(p.name))" :key="row.name" class="event-roster-player">
            <strong>{{ row.name }}</strong>
            <span>Idx {{ row.index.toFixed(1).replace('.0', '') }}</span>
            <span>Course {{ row.courseHandicap }}</span>
          </div>
        </div>
      </div>
      <template v-else>
        <div class="player-list">
          <div v-for="(player, index) in form.players" :key="index" class="player-row">
            <div class="player-fields">
              <input v-model="player.name" class="form-input" placeholder="Player name" />
              <input
                v-model="player.handicapIndex"
                class="form-input idx-input"
                type="number"
                step="0.1"
                inputmode="decimal"
                placeholder="Handicap index"
              />
            </div>
            <div class="player-row-actions">
              <span class="team-chip">{{ player.name ? assignmentLabel(player.team) : 'Team later' }}</span>
              <button class="btn-text-danger" type="button" @click="removePlayer(index)">Remove</button>
            </div>
          </div>
        </div>
        <button class="btn-ghost" type="button" @click="addPlayer">+ Add player</button>
      </template>

      <div v-if="handicapPreviewRows.length" class="hcp-preview">
        <h3 class="sub-hdr">Course handicaps</h3>
        <div class="hcp-preview-list">
          <div v-for="row in handicapPreviewRows" :key="row.name" class="hcp-preview-row">
            <div>
              <strong>{{ row.name }}</strong>
              <small>Index {{ row.index.toFixed(1).replace('.0', '') }} → Course {{ row.courseHandicap }}</small>
            </div>
            <div class="hcp-preview-strokes">
              <strong>{{ strokeSummary(row) }}</strong>
              <small>{{ row.strokes > 0 ? `Stroke holes: ${row.holes.replace('Holes ', '')}` : row.holes }}</small>
            </div>
          </div>
        </div>
      </div>
    </section>

    <section v-if="!hasEventContext" class="setup-card checklist-card">
      <div class="setup-section-head">
        <div>
          <span class="step-pill">{{ selectedGameCount ? `${selectedGameCount} selected` : 'Needed' }}</span>
          <h2 class="setup-hdr">Games</h2>
        </div>
      </div>
      <div class="games-list">
        <div class="game-row game-card" :class="{ active: form.games.skins.enabled }">
          <label class="game-toggle"><input v-model="form.games.skins.enabled" type="checkbox" /> <span><strong>Skins</strong><small>Optional individual skins game.</small></span></label>
          <div v-if="form.games.skins.enabled" class="game-inline-settings">
            <label class="bet-field">Buy-in $ / player<input v-model.number="form.games.skins.pot" class="form-input sm" type="number" min="0" /></label>
            <select v-model="form.games.skins.type" class="form-input sm"><option>net</option><option>gross</option></select>
          </div>
        </div>

        <div class="game-row game-card" :class="{ active: form.games.bestBall.enabled }">
          <label class="game-toggle"><input v-model="form.games.bestBall.enabled" type="checkbox" /> <span><strong>Best Ball</strong><small>Team game using each side’s best ball.</small></span></label>
          <div v-if="form.games.bestBall.enabled" class="game-inline-settings">
            <label class="bet-field">Front 9 $ / player<input v-model.number="form.games.bestBall.front" class="form-input sm" type="number" min="0" /></label>
            <label class="bet-field">Back 9 $ / player<input v-model.number="form.games.bestBall.back" class="form-input sm" type="number" min="0" /></label>
            <label class="bet-field">Overall $ / player<input v-model.number="form.games.bestBall.total" class="form-input sm" type="number" min="0" /></label>
            <select v-model="form.games.bestBall.type" class="form-input sm"><option>net</option><option>gross</option></select>
            <select v-model="form.games.bestBall.scoringMode" class="form-input sm">
              <option value="stroke">stroke</option>
              <option value="match">match</option>
            </select>
            <p v-if="!form.games.bestBall.front && !form.games.bestBall.back && !form.games.bestBall.total" class="game-helper">This game will be tracked with no money attached.</p>
          </div>
        </div>

        <div class="game-row game-card" :class="{ active: form.games.bestBallAggy.enabled }">
          <label class="game-toggle"><input v-model="form.games.bestBallAggy.enabled" type="checkbox" /> <span><strong>Best Ball + Aggy</strong><small>Scores both the team’s best ball and combined aggregate score.</small></span></label>
        <div v-if="form.games.bestBallAggy.enabled" class="game-subconfig">
          <div class="sub-row">
            <span class="sub-label">Score basis</span>
            <div class="seg-ctrl">
              <button class="seg-btn" :class="{ active: form.games.bestBallAggy.scoreBasis === 'net' }" type="button" @click="form.games.bestBallAggy.scoreBasis = 'net'">Net</button>
              <button class="seg-btn" :class="{ active: form.games.bestBallAggy.scoreBasis === 'gross' }" type="button" @click="form.games.bestBallAggy.scoreBasis = 'gross'">Gross</button>
            </div>
          </div>
          <div class="sub-row">
            <span class="sub-label">Scoring mode</span>
            <div class="seg-ctrl">
              <button class="seg-btn" :class="{ active: form.games.bestBallAggy.scoringMode === 'match' }" type="button" @click="form.games.bestBallAggy.scoringMode = 'match'">Match Play</button>
              <button class="seg-btn" :class="{ active: form.games.bestBallAggy.scoringMode === 'stroke' }" type="button" @click="form.games.bestBallAggy.scoringMode = 'stroke'">Stroke Play</button>
            </div>
          </div>
          <div class="sub-row">
            <span class="sub-label">Stakes</span>
            <label class="bet-field">Front 9 ($/person)<input v-model.number="form.games.bestBallAggy.stake.front" class="form-input sm" type="number" min="0" /></label>
            <label class="bet-field">Back 9 ($/person)<input v-model.number="form.games.bestBallAggy.stake.back" class="form-input sm" type="number" min="0" /></label>
            <label class="bet-field">Overall ($/person)<input v-model.number="form.games.bestBallAggy.stake.overall" class="form-input sm" type="number" min="0" /></label>
          </div>
          <p v-if="!form.games.bestBallAggy.stake.front && !form.games.bestBallAggy.stake.back && !form.games.bestBallAggy.stake.overall" class="game-helper">This game will be tracked with no money attached.</p>
        </div>
        </div>

        <div class="game-row game-card" :class="{ active: form.games.twoManScramble.enabled }">
          <label class="game-toggle"><input v-model="form.games.twoManScramble.enabled" type="checkbox" /> <span><strong>Two-Man Scramble</strong><small>Two-player teams post one gross scramble score.</small></span></label>
        <div v-if="form.games.twoManScramble.enabled" class="game-subconfig">
          <div class="sub-row">
            <span class="sub-label">Scoring mode</span>
            <div class="seg-ctrl">
              <button class="seg-btn" :class="{ active: form.games.twoManScramble.scoringMode === 'match' }" type="button" @click="form.games.twoManScramble.scoringMode = 'match'">Match Play</button>
              <button class="seg-btn" :class="{ active: form.games.twoManScramble.scoringMode === 'stroke' }" type="button" @click="form.games.twoManScramble.scoringMode = 'stroke'">Stroke Play</button>
            </div>
          </div>
          <div class="sub-row">
            <span class="sub-label">Stakes</span>
            <label class="bet-field">Front 9 ($/person)<input v-model.number="form.games.twoManScramble.stake.front" class="form-input sm" type="number" min="0" /></label>
            <label class="bet-field">Back 9 ($/person)<input v-model.number="form.games.twoManScramble.stake.back" class="form-input sm" type="number" min="0" /></label>
            <label class="bet-field">Overall ($/person)<input v-model.number="form.games.twoManScramble.stake.overall" class="form-input sm" type="number" min="0" /></label>
          </div>
        </div>
        </div>

        <div class="game-row game-card" :class="{ active: form.games.highBallLowBall.enabled }">
          <label class="game-toggle"><input v-model="form.games.highBallLowBall.enabled" type="checkbox" /> <span><strong>High Ball / Low Ball</strong><small>Scores both low-ball and high-ball team contests.</small></span></label>
        <div v-if="form.games.highBallLowBall.enabled" class="game-subconfig">
          <div class="sub-row">
            <span class="sub-label">Score basis</span>
            <div class="seg-ctrl">
              <button class="seg-btn" :class="{ active: form.games.highBallLowBall.scoreBasis === 'net' }" type="button" @click="form.games.highBallLowBall.scoreBasis = 'net'">Net</button>
              <button class="seg-btn" :class="{ active: form.games.highBallLowBall.scoreBasis === 'gross' }" type="button" @click="form.games.highBallLowBall.scoreBasis = 'gross'">Gross</button>
            </div>
          </div>
          <div class="sub-row">
            <span class="sub-label">Scoring mode</span>
            <div class="seg-ctrl">
              <button class="seg-btn" :class="{ active: form.games.highBallLowBall.scoringMode === 'match' }" type="button" @click="form.games.highBallLowBall.scoringMode = 'match'">Match Play</button>
              <button class="seg-btn" :class="{ active: form.games.highBallLowBall.scoringMode === 'stroke' }" type="button" @click="form.games.highBallLowBall.scoringMode = 'stroke'">Stroke Play</button>
            </div>
          </div>
          <div class="sub-row">
            <span class="sub-label">Stakes</span>
            <label class="bet-field">Front 9 ($/person)<input v-model.number="form.games.highBallLowBall.stake.front" class="form-input sm" type="number" min="0" /></label>
            <label class="bet-field">Back 9 ($/person)<input v-model.number="form.games.highBallLowBall.stake.back" class="form-input sm" type="number" min="0" /></label>
            <label class="bet-field">Overall ($/person)<input v-model.number="form.games.highBallLowBall.stake.overall" class="form-input sm" type="number" min="0" /></label>
          </div>
        </div>
        </div>

        <div class="game-row game-card" :class="{ active: form.games.scramble4.enabled }">
          <label class="game-toggle"><input v-model="form.games.scramble4.enabled" type="checkbox" /> <span><strong>4-Man Scramble</strong><small>Team scramble scored as gross stroke play.</small></span></label>
          <div v-if="form.games.scramble4.enabled" class="game-inline-settings">
            <label class="bet-field">Front 9 $ / player<input v-model.number="form.games.scramble4.front" class="form-input sm" type="number" min="0" /></label>
            <label class="bet-field">Back 9 $ / player<input v-model.number="form.games.scramble4.back" class="form-input sm" type="number" min="0" /></label>
            <label class="bet-field">Overall $ / player<input v-model.number="form.games.scramble4.total" class="form-input sm" type="number" min="0" /></label>
            <span class="game-note">Gross stroke play</span>
          </div>
        </div>

        <div class="game-row game-card" :class="{ active: form.games.wolf.enabled }">
          <label class="game-toggle"><input v-model="form.games.wolf.enabled" type="checkbox" /> <span><strong>Wolf</strong><small>Rotating individual/team side game.</small></span></label>
          <div v-if="form.games.wolf.enabled" class="game-inline-settings">
            <label class="bet-field">{{ form.games.wolf.nassau ? 'Overall $ / player' : 'Full round $ / player' }}<input v-model.number="form.games.wolf.amount" class="form-input sm" type="number" min="0" /></label>
            <select v-model="form.games.wolf.type" class="form-input sm"><option>net</option><option>gross</option></select>
            <label class="game-toggle sm"><input v-model="form.games.wolf.nassau" type="checkbox" /> Nassau</label>
          </div>
        </div>

        <div class="game-row game-card" :class="{ active: form.games.puttPoker.enabled }">
          <label class="game-toggle"><input v-model="form.games.puttPoker.enabled" type="checkbox" /> <span><strong>Putt Poker</strong><small>Putting-card side pot by playing group.</small></span></label>
          <div v-if="form.games.puttPoker.enabled" class="game-inline-settings">
            <label class="bet-field">Buy-in $ / player<input v-model.number="form.games.puttPoker.pot" class="form-input sm" type="number" min="0" /></label>
          </div>
        </div>
      </div>
    </section>

    <section v-if="!hasEventContext && namedPlayers.length" class="setup-card checklist-card">
      <div class="pg-header">
        <div>
          <span class="step-pill">{{ team1.length }} vs {{ team2.length }}</span>
          <h2 class="setup-hdr">Teams &amp; matchups</h2>
        </div>
        <button v-if="showPairMatches" class="btn-ghost sm" type="button" @click="addPairMatch">+ Add team set</button>
      </div>
      <p class="pg-hint">Assign round teams first. Team sets appear when a selected game needs a specific matchup.</p>

      <div class="team-name-grid">
        <label>Team 1 name<input v-model="form.teamNames.team1" class="form-input" /></label>
        <label>Team 2 name<input v-model="form.teamNames.team2" class="form-input" /></label>
      </div>

      <div class="team-assignment-list">
        <div v-for="player in namedPlayers" :key="`assign-${player.name}`" class="team-assignment-row">
          <strong>{{ player.name }}</strong>
          <div class="team-toggle">
            <button class="seg-btn" :class="{ active: player.team === 'team1' }" type="button" @click="setPlayerTeam(player, 'team1')">{{ form.teamNames.team1 }}</button>
            <button class="seg-btn" :class="{ active: player.team === 'team2' }" type="button" @click="setPlayerTeam(player, 'team2')">{{ form.teamNames.team2 }}</button>
          </div>
        </div>
      </div>

      <div v-if="showPairMatches" class="pm-list">
        <div v-for="(_match, mi) in form.pairMatches" :key="mi" class="pair-match-builder">
          <div class="pm-builder-head">
            <strong>Team Set {{ mi + 1 }}</strong>
            <button class="btn-remove" type="button" title="Remove team set" @click="removePairMatch(mi)">✕</button>
          </div>
          <div class="pm-assign-list">
            <div v-for="p in namedPlayers" :key="`pm-${mi}-${p.name}`" class="pm-assign-row">
              <strong>{{ p.name }}</strong>
              <div class="team-toggle three">
                <button class="seg-btn" :class="{ active: pairSide(mi, p.name.trim()) === 'a' }" type="button" @click="setPairSide(mi, p.name.trim(), 'a')">Team A</button>
                <button class="seg-btn" :class="{ active: pairSide(mi, p.name.trim()) === 'b' }" type="button" @click="setPairSide(mi, p.name.trim(), 'b')">Team B</button>
                <button class="seg-btn" :class="{ active: pairSide(mi, p.name.trim()) === 'sit' }" type="button" @click="setPairSide(mi, p.name.trim(), 'sit')">Sit</button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div v-if="matchSummaries.length" class="pm-summaries">
        <h3 class="sub-hdr">Team Summary</h3>
        <div v-for="m in matchSummaries" :key="m.index" class="pm-summary">
          <div class="pm-summary-head">
            <strong>Team Set {{ m.index + 1 }}</strong>
            <span class="pm-summary-group">{{ m.group }}</span>
          </div>
          <div class="pm-summary-vs">
            <span>{{ m.a }}</span>
            <em>vs</em>
            <span>{{ m.b }}</span>
          </div>
          <ul class="pm-summary-games">
            <li v-for="(g, gi) in m.games" :key="gi">
              {{ g.label }} · {{ g.basis }} {{ g.mode }} · {{ g.bet }}
            </li>
          </ul>
        </div>
      </div>
    </section>

    <section v-if="namedPlayers.length >= 2" class="setup-card checklist-card">
      <div class="pg-header">
        <div>
          <span class="step-pill">{{ displayPlayingGroups.length }} group{{ displayPlayingGroups.length === 1 ? '' : 's' }}</span>
          <h2 class="setup-hdr">Playing groups</h2>
        </div>
        <button v-if="form.playingGroupCustom" class="btn-ghost sm" type="button" @click="resetCustomGroups">Reset to auto</button>
      </div>
      <p class="pg-hint">Set who is playing together on the course. {{ form.playingGroupCustom ? 'Manually assigned.' : 'Auto-assigned from team sets or team order.' }}</p>
      <div class="pg-list">
        <div v-for="(group, gi) in displayPlayingGroups" :key="gi" class="pg-group">
          <input
            class="form-input pg-name-input"
            :placeholder="group.name"
            :value="form.playingGroupNames[gi] || ''"
            @input="form.playingGroupNames[gi] = ($event.target as HTMLInputElement).value"
          />
          <div class="pg-players">
            <span v-for="player in group.players" :key="player" class="pg-player-chip">
              <span>{{ player }}</span>
              <select
                v-if="displayPlayingGroups.length > 1"
                class="pg-move-select"
                :value="gi"
                @change="movePlayerToGroup(player, Number(($event.target as HTMLSelectElement).value))"
              >
                <option v-for="(g, i) in displayPlayingGroups" :key="i" :value="i" :disabled="i === gi">
                  {{ form.playingGroupNames[i] || g.name }}
                </option>
              </select>
            </span>
          </div>
          <p v-if="groupMatchup(group.players)" class="pg-matchup">Matchup: {{ groupMatchup(group.players) }}</p>
        </div>
      </div>
    </section>

    <ul v-if="errors.length" class="setup-errors">
      <li v-for="(err, i) in errors" :key="i">{{ err }}</li>
    </ul>

    <div class="setup-actions sticky-actions">
      <p v-if="store.syncError" class="sync-error">{{ store.syncError }}</p>
      <p v-else-if="firstBlockingIssue" class="sync-error">{{ firstBlockingIssue }}</p>
      <button class="btn-ghost" type="button" @click="goGroup">Back to group</button>
      <button class="btn-primary" type="button" :disabled="!canStart || store.starting" @click="startRound">
        {{ store.starting ? (editMode ? 'Saving...' : 'Starting...') : (editMode ? 'Save changes →' : 'Start round →') }}
      </button>
    </div>
  </main>
</template>

<style scoped>
.setup-shell {
  max-width: 900px;
  margin: 0 auto;
  padding: 20px 16px 132px;
}

.setup-topbar {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 16px;
}

.eyebrow {
  margin: 0 0 4px;
  color: #8a672f;
  font-size: 0.7rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.setup-title {
  margin: 0;
  font-size: 1.6rem;
  color: #24362c;
}

.setup-lede {
  margin: 8px 0 0;
  color: #607067;
  line-height: 1.45;
}

.setup-card {
  border: 1px solid #d7cebd;
  border-radius: 8px;
  background: #f8f4ea;
  padding: 18px 20px;
  margin-bottom: 18px;
}

.checklist-card {
  box-shadow: 0 8px 22px rgb(31 42 36 / 6%);
}

.setup-section-head,
.pg-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
}

.step-pill {
  display: inline-flex;
  align-items: center;
  min-height: 24px;
  border: 1px solid #d7cebd;
  border-radius: 999px;
  background: #fdfbf4;
  color: #7c693d;
  padding: 3px 9px;
  font-size: 0.68rem;
  font-weight: 800;
  text-transform: uppercase;
}

.setup-hdr {
  margin: 5px 0 0;
  font-size: 1rem;
  color: #2f5d43;
}

.sub-hdr {
  margin: 0 0 10px;
  font-size: 0.82rem;
  color: #2f5d43;
  text-transform: uppercase;
  letter-spacing: 0;
}

.course-readonly {
  padding: 10px 0 4px;
}

.course-readonly-name {
  font-size: 1.1rem;
  font-weight: 700;
  color: #24362c;
}

.course-readonly-meta {
  font-size: 0.82rem;
  color: #7a8a7f;
  margin-top: 2px;
}

.course-summary-card {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  border: 1px solid #e4ddcd;
  border-radius: 8px;
  background: #fdfbf4;
  padding: 14px;
}

.course-summary-name {
  margin: 0;
  color: #24362c;
  font-size: 1.12rem;
}

.course-summary-meta {
  margin: 5px 0 0;
  color: #607067;
  line-height: 1.45;
}

.course-summary-actions {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: flex-end;
  flex-shrink: 0;
}

.course-nine-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  margin-top: 12px;
}

.course-nine-grid div {
  border: 1px solid #ece3d2;
  border-radius: 6px;
  padding: 9px 10px;
  background: #fbf7ed;
}

.course-nine-grid strong,
.course-nine-grid span {
  display: block;
}

.course-nine-grid strong {
  color: #2f5d43;
  font-size: 0.8rem;
}

.course-nine-grid span {
  margin-top: 2px;
  color: #607067;
  font-size: 0.8rem;
}

.contained-scorecard {
  margin-top: 12px;
  overflow-x: auto;
}

.course-search {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
}

.course-search-input {
  flex: 1;
}

.course-search-btn {
  min-width: 104px;
  padding: 7px 14px;
}

.course-results,
.tee-results {
  display: grid;
  gap: 8px;
  margin-bottom: 12px;
}

.course-result,
.tee-result {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  border: 1px solid #d7cebd;
  border-radius: 6px;
  background: #fdfbf4;
  padding: 10px 12px;
  color: #283b30;
  text-align: left;
  cursor: pointer;
}

.course-result:hover,
.tee-result:hover,
.tee-result.selected {
  border-color: #b88a3b;
  background: #fff8e8;
}

.course-result small,
.tee-result small {
  display: block;
  margin-top: 2px;
  color: #6a7a6f;
  font-size: 0.72rem;
  font-weight: 600;
}

.course-result-meta {
  color: #8a672f;
  font-size: 0.72rem;
  font-weight: 800;
  white-space: nowrap;
}

.course-search-error {
  margin: 0 0 12px;
  color: #b4473a;
  font-size: 0.78rem;
  font-weight: 700;
}

.field-grid,
.team-name-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 12px;
}

label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 0.78rem;
  font-weight: 600;
  color: #4a5a4f;
}

.form-input {
  border: 1px solid #cdbf9f;
  border-radius: 6px;
  padding: 7px 9px;
  background: #fdfbf4;
  color: #283b30;
}

.form-input:focus {
  outline: 2px solid #2f8f58;
  outline-offset: -1px;
}

.hole-grid {
  margin-top: 16px;
  overflow-x: auto;
}

.hole-grid-row {
  display: flex;
  gap: 3px;
  margin-bottom: 3px;
  align-items: center;
}

.hole-grid-label {
  min-width: 34px;
  font-size: 0.7rem;
  font-weight: 700;
  color: #8a9489;
}

.hole-grid-head {
  width: 34px;
  text-align: center;
  font-size: 0.7rem;
  color: #8a9489;
}

.hole-input {
  width: 34px;
  text-align: center;
  border: 1px solid #cdbf9f;
  border-radius: 4px;
  padding: 4px 0;
  background: #fdfbf4;
  color: #283b30;
}

.hole-cell {
  width: 34px;
  text-align: center;
  font-size: 0.82rem;
  color: #283b30;
  flex-shrink: 0;
}

.hole-grid-readonly {
  margin-top: 10px;
}

.player-list {
  display: grid;
  gap: 8px;
  margin: 14px 0;
}

.player-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px;
  align-items: center;
  border: 1px solid #e4ddcd;
  border-radius: 8px;
  background: #fdfbf4;
  padding: 10px;
}

.player-fields {
  display: grid;
  grid-template-columns: minmax(160px, 1fr) minmax(130px, 180px);
  gap: 8px;
}

.player-row-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  justify-content: flex-end;
}

.idx-input {
  max-width: none;
}

.team-select {
  max-width: 140px;
}

.team-chip {
  display: inline-flex;
  align-items: center;
  min-height: 30px;
  border-radius: 999px;
  background: #eef2ec;
  color: #4d6255;
  padding: 3px 10px;
  font-size: 0.74rem;
  font-weight: 800;
  white-space: nowrap;
}

.btn-text-danger {
  border: 0;
  background: transparent;
  color: #b1462f;
  padding: 6px 0;
  font-size: 0.82rem;
  font-weight: 800;
  cursor: pointer;
}

.event-roster-preview {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 12px;
  margin-bottom: 14px;
}

.event-roster-team {
  border: 1px solid #e0d7c4;
  border-radius: 8px;
  background: #fdfbf4;
  padding: 12px;
}

.event-roster-team-name {
  font-weight: 800;
  color: #2f5d43;
  margin-bottom: 8px;
}

.event-roster-player {
  display: grid;
  grid-template-columns: minmax(120px, 1fr) auto auto;
  gap: 8px;
  align-items: center;
  border-top: 1px solid #ece3d2;
  padding: 7px 0;
  color: #4a5a4f;
  font-size: 0.82rem;
}

.event-roster-player:first-of-type {
  border-top: 0;
}

.btn-remove {
  border: 1px solid #d8c4c4;
  background: #f7ecec;
  color: #b1462f;
  border-radius: 6px;
  width: 32px;
  height: 32px;
  cursor: pointer;
}

.hcp-preview {
  margin-top: 16px;
  border: 1px solid #e4ddcd;
  border-radius: 8px;
  background: #fdfbf4;
  padding: 12px;
}

.hcp-preview-list {
  display: grid;
  gap: 8px;
}

.hcp-preview-row {
  display: grid;
  grid-template-columns: minmax(140px, 1fr) minmax(150px, 1.1fr);
  gap: 12px;
  align-items: center;
  border-top: 1px solid #ece3d2;
  padding-top: 8px;
}

.hcp-preview-row:first-child {
  border-top: 0;
  padding-top: 0;
}

.hcp-preview-row strong {
  color: #283b30;
}

.hcp-preview-row small {
  display: block;
  margin-top: 2px;
  color: #6a7a6f;
  font-size: 0.72rem;
  font-weight: 600;
}

.hcp-preview-strokes {
  text-align: right;
}

.games-list {
  display: grid;
  gap: 10px;
}

.game-row {
  display: block;
  border: 1px solid #e4ddcd;
  border-radius: 8px;
  background: #fdfbf4;
  padding: 12px;
}

.game-card.active {
  border-color: #9fb5a7;
  background: #f3f8f1;
  box-shadow: 0 0 0 1px rgb(47 93 67 / 12%) inset;
}

.game-toggle {
  flex-direction: row;
  align-items: flex-start;
  gap: 10px;
}

.game-toggle input {
  width: 18px;
  height: 18px;
  margin-top: 2px;
}

.game-toggle span {
  display: grid;
  gap: 2px;
}

.game-toggle strong {
  color: #24362c;
  font-size: 0.95rem;
}

.game-toggle small {
  color: #65756a;
  font-size: 0.78rem;
}

.game-inline-settings,
.game-subconfig {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 10px;
  margin-top: 12px;
  border-top: 1px solid #dfe6dc;
  padding-top: 12px;
}

.game-subconfig .sub-row {
  display: contents;
}

.game-helper {
  grid-column: 1 / -1;
  margin: 0;
  color: #607067;
  font-size: 0.78rem;
}

.team-assignment-list,
.pm-assign-list {
  display: grid;
  gap: 8px;
  margin-top: 12px;
}

.team-assignment-row,
.pm-assign-row {
  display: grid;
  grid-template-columns: minmax(120px, 1fr) minmax(220px, 1.4fr);
  gap: 12px;
  align-items: center;
  border: 1px solid #e4ddcd;
  border-radius: 8px;
  background: #fdfbf4;
  padding: 10px;
}

.team-assignment-row strong,
.pm-assign-row strong {
  color: #24362c;
}

.team-toggle {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px;
}

.team-toggle.three {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.game-toggle {
  flex-direction: row;
  align-items: center;
  gap: 6px;
  min-width: 0;
  font-weight: 700;
  color: #283b30;
  min-height: 34px;
}

.game-toggle.sm {
  min-width: auto;
  font-weight: 600;
}

.game-note {
  font-weight: 500;
  color: #7a8a7e;
  font-size: 0.85rem;
}

.game-subconfig {
  display: grid;
  gap: 8px;
  margin: -4px 0 4px;
  padding: 10px 12px 12px;
  border: 1px solid #d3e0d3;
  border-radius: 8px;
  background: #f7faf6;
}

.sub-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.sub-label {
  min-width: 120px;
  font-weight: 600;
  font-size: 0.85rem;
  color: #4a6050;
}

.seg-ctrl {
  display: flex;
  border: 1px solid #c8d8c8;
  border-radius: 6px;
  overflow: hidden;
}

.seg-btn {
  padding: 5px 14px;
  font-size: 0.85rem;
  font-weight: 600;
  background: #f5f8f5;
  border: none;
  cursor: pointer;
  color: #4a6050;
  transition: background 0.15s, color 0.15s;
}

.seg-btn + .seg-btn {
  border-left: 1px solid #c8d8c8;
}

.seg-btn.active {
  background: #2f5d43;
  color: #fff;
}

.form-input.sm {
  width: 96px;
  max-width: 100%;
  padding: 5px 8px;
  font-size: 0.82rem;
}

.bet-field {
  flex-direction: column;
  gap: 3px;
  font-size: 0.7rem;
  font-weight: 600;
  color: #6a7a6f;
  justify-content: end;
}

.pair-match-builder {
  display: grid;
  gap: 8px;
  border: 1px solid #e4ddcd;
  border-radius: 8px;
  background: #fdfbf4;
  padding: 10px;
}

.pair-match-row,
.pair-match-side {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
}

.pair-match-vs {
  color: #8a9489;
  font-size: 0.72rem;
  font-weight: 800;
  text-transform: uppercase;
}

.pair-select {
  width: 138px;
}

.pair-add {
  justify-self: start;
  padding: 7px 12px;
}

.pg-hint {
  margin: 0 0 12px;
  color: #6a7a6f;
  font-size: 0.78rem;
}

.pm-list {
  display: grid;
  gap: 10px;
}

.pm-builder-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
}

.pm-sides {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  flex-wrap: wrap;
}

.pm-side {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 160px;
  flex: 1;
  border: 1px solid #eee5d5;
  border-radius: 8px;
  background: #fffdf7;
  padding: 8px 10px;
}

.pm-side-label {
  font-size: 0.7rem;
  font-weight: 800;
  text-transform: uppercase;
  color: #8a672f;
}

.pm-chk {
  flex-direction: row;
  align-items: center;
  gap: 6px;
  font-weight: 600;
  color: #283b30;
}

.pm-summaries {
  margin-top: 14px;
}

.pm-summary {
  border-top: 1px solid #ece3d2;
  padding: 10px 0;
}

.pm-summary-head {
  display: flex;
  align-items: baseline;
  gap: 8px;
}

.pm-summary-group {
  font-size: 0.72rem;
  font-weight: 700;
  color: #2f5d43;
}

.pm-summary-vs {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  margin-top: 4px;
  color: #283b30;
  font-weight: 800;
}

.pm-summary-vs em {
  color: #8a9489;
  font-style: normal;
  font-size: 0.72rem;
  text-transform: uppercase;
}

.pm-summary-games {
  margin: 6px 0 0;
  padding-left: 18px;
  color: #4a5a4f;
  font-size: 0.8rem;
}

.pg-list {
  display: grid;
  gap: 10px;
}

.pg-group {
  display: grid;
  grid-template-columns: minmax(130px, 160px) 1fr;
  align-items: start;
  gap: 10px;
}

.pg-name-input {
  max-width: 160px;
  flex-shrink: 0;
}

.pg-players {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.pg-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 4px;
}

.pg-header .setup-hdr {
  margin-bottom: 0;
}

.pg-player-chip {
  display: inline-flex;
  align-items: center;
  flex-direction: column;
  gap: 3px;
  background: #e8f0e8;
  border: 1px solid #b8d4c0;
  border-radius: 8px;
  padding: 7px 9px;
  font-size: 0.78rem;
  font-weight: 700;
  color: #2f5d43;
  min-width: 132px;
  align-items: flex-start;
}

.pg-partner-label {
  color: #6a7a6f;
  font-size: 0.7rem;
  font-weight: 700;
  line-height: 1.2;
  max-width: 180px;
}

.pg-move-select {
  background: transparent;
  border: 1px solid #b8d4c0;
  border-radius: 6px;
  font-size: 0.68rem;
  color: #7a8a7f;
  cursor: pointer;
  padding: 2px 4px;
  max-width: 100%;
  margin-top: 3px;
}

.pg-move-select:focus {
  outline: none;
  border-color: #2f5d43;
  color: #2f5d43;
}

.setup-errors {
  margin: 0 0 14px;
  padding: 12px 16px 12px 32px;
  border: 1px solid #e0c4c0;
  background: #f9eeec;
  border-radius: 8px;
  color: #a23b28;
  font-size: 0.85rem;
}

@media (max-width: 620px) {
  .game-row {
    grid-template-columns: 1fr 1fr;
  }

  .game-toggle {
    grid-column: 1 / -1;
  }

  .pg-group {
    grid-template-columns: 1fr;
  }
}

.setup-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  justify-content: flex-end;
  flex-wrap: wrap;
}

.sticky-actions {
  position: sticky;
  bottom: 0;
  z-index: 20;
  margin: 22px -16px -132px;
  padding: 12px 16px calc(12px + env(safe-area-inset-bottom));
  border-top: 1px solid #d7cebd;
  background: rgb(238 240 232 / 94%);
  backdrop-filter: blur(10px);
  box-shadow: 0 -12px 28px rgb(31 42 36 / 10%);
}

.sync-error {
  margin: 0;
  color: #b4473a;
  font-size: 0.78rem;
  font-weight: 700;
}

.btn-primary,
.btn-ghost {
  border-radius: 6px;
  padding: 10px 20px;
  font-weight: 700;
  cursor: pointer;
}

.btn-primary {
  border: 1px solid #2f5d43;
  background: #2f5d43;
  color: #f3efe2;
}

.btn-primary:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.btn-ghost {
  border: 1px solid #cdbf9f;
  background: transparent;
  color: #4a5a4f;
}

.btn-ghost:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

@media (max-width: 640px) {
  .setup-shell {
    padding: 16px 12px 148px;
  }

  .setup-topbar,
  .course-summary-card,
  .player-row,
  .team-assignment-row,
  .pm-assign-row {
    grid-template-columns: 1fr;
    flex-direction: column;
    align-items: stretch;
  }

  .setup-card {
    padding: 16px;
  }

  .setup-section-head,
  .pg-header {
    align-items: flex-start;
  }

  .course-summary-actions,
  .player-row-actions,
  .setup-actions {
    justify-content: stretch;
  }

  .course-summary-actions .btn-ghost,
  .setup-actions .btn-primary,
  .setup-actions .btn-ghost {
    width: 100%;
    min-height: 44px;
  }

  .course-nine-grid,
  .player-fields,
  .team-name-grid,
  .game-inline-settings,
  .game-subconfig {
    grid-template-columns: 1fr;
  }

  .course-search {
    flex-direction: column;
  }

  .course-search-btn {
    width: 100%;
  }

  .hcp-preview-row {
    grid-template-columns: 1fr;
    gap: 4px;
  }

  .hcp-preview-strokes {
    text-align: left;
  }

  .team-toggle,
  .team-toggle.three {
    grid-template-columns: 1fr;
  }

  .pg-player-chip {
    min-width: 0;
    width: 100%;
  }

  .sticky-actions {
    margin: 22px -12px -148px;
    align-items: stretch;
  }
}

/* Final overrides for the guided setup card pattern. */
.game-subconfig {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 10px;
  margin: 12px 0 0;
  padding: 12px 0 0;
  border: 0;
  border-top: 1px solid #dfe6dc;
  border-radius: 0;
  background: transparent;
}

.game-subconfig .sub-row {
  display: contents;
}

.pg-header {
  align-items: flex-start;
  margin-bottom: 12px;
}

.pg-group {
  grid-template-columns: minmax(130px, 160px) 1fr;
  border: 1px solid #e4ddcd;
  border-radius: 8px;
  background: #fdfbf4;
  padding: 10px;
}

.pg-player-chip {
  flex-direction: row;
  min-width: auto;
}

.pg-matchup {
  grid-column: 2;
  margin: 4px 0 0;
  color: #607067;
  font-size: 0.78rem;
  font-weight: 700;
}

@media (max-width: 640px) {
  .pg-group,
  .pg-matchup {
    grid-template-columns: 1fr;
    grid-column: 1;
  }
}
</style>
