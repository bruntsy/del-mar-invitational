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

const errors = computed(() => {
  const list: string[] = [];
  if (form.par.some((value) => !Number(value))) list.push('Every hole needs a par value.');
  if (!team1.value.length) list.push(`${form.teamNames.team1} needs at least one player.`);
  if (!team2.value.length) list.push(`${form.teamNames.team2} needs at least one player.`);
  if (duplicateNames.value) list.push('Player names must be unique.');
  return list;
});

const canStart = computed(() => errors.value.length === 0);

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

function togglePairSide(matchIndex: number, side: 'a' | 'b', player: string) {
  const match = form.pairMatches[matchIndex];
  if (!match) return;
  const list = match[side];
  const at = list.indexOf(player);
  if (at >= 0) {
    list.splice(at, 1);
    return;
  }
  // A player can only be on one side of a given match.
  const other = side === 'a' ? match.b : match.a;
  const otherAt = other.indexOf(player);
  if (otherAt >= 0) other.splice(otherAt, 1);
  list.push(player);
}

function inPairSide(matchIndex: number, side: 'a' | 'b', player: string) {
  return form.pairMatches[matchIndex]?.[side].includes(player) ?? false;
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
        basis: g.hasBasis ? cfg.scoreBasis ?? 'net' : 'gross',
        mode: cfg.scoringMode === 'match' ? 'match' : 'stroke',
        bet: `$${cfg.stake.front}/$${cfg.stake.back}/$${cfg.stake.overall}`,
      };
    }),
  })),
);

const playerPartnerLabels = computed(() => {
  const labels: Record<string, string> = {};
  for (const match of cleanedPairMatches.value) {
    const a = match.a.join(' + ');
    const b = match.b.join(' + ');
    const label = `${a || 'TBD'} vs ${b || 'TBD'}`;
    [...match.a, ...match.b].forEach((player) => { labels[player] = label; });
  }
  return labels;
});

// Prompt before clobbering manually-edited playing groups when matches change.
watch(
  () => JSON.stringify(form.pairMatches),
  () => {
    if (form.playingGroupCustom) {
      const ok = window.confirm('Team sets changed. Regenerate playing groups from team sets? Cancel keeps your manual groups.');
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
      </div>
      <button class="btn-ghost" type="button" @click="goGroup">← Back to group</button>
    </header>

    <section class="setup-card">
      <h2 class="setup-hdr">Course</h2>

      <!-- A course is set (prefilled from edit/event or picked from search):
           show the read-only scorecard with a Change action available in every mode. -->
      <template v-if="courseSet">
        <CourseScorecard :course="formCourse" />
        <button class="btn-ghost sm" type="button" style="margin-top: 8px;" @click="clearCourse">Change course</button>
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

    <section class="setup-card">
      <h2 class="setup-hdr">Teams &amp; Players</h2>
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
        <div class="team-name-grid">
          <label>Team 1 name<input v-model="form.teamNames.team1" class="form-input" /></label>
          <label>Team 2 name<input v-model="form.teamNames.team2" class="form-input" /></label>
        </div>
        <div class="player-list">
          <div v-for="(player, index) in form.players" :key="index" class="player-row">
            <input v-model="player.name" class="form-input" placeholder="Player name" />
            <input
              v-model="player.handicapIndex"
              class="form-input idx-input"
              type="number"
              step="0.1"
              placeholder="Handicap index"
            />
            <select v-model="player.team" class="form-input team-select">
              <option value="team1">{{ form.teamNames.team1 }}</option>
              <option value="team2">{{ form.teamNames.team2 }}</option>
            </select>
            <button class="btn-remove" type="button" title="Remove" @click="removePlayer(index)">✕</button>
          </div>
        </div>
        <button class="btn-ghost" type="button" @click="addPlayer">+ Add player</button>
      </template>

      <div v-if="handicapPreviewRows.length" class="hcp-preview">
        <h3 class="sub-hdr">Course Handicap Preview</h3>
        <div class="hcp-preview-list">
          <div v-for="row in handicapPreviewRows" :key="row.name" class="hcp-preview-row">
            <div>
              <strong>{{ row.name }}</strong>
              <small>Idx {{ row.index.toFixed(1).replace('.0', '') }} / Course {{ row.courseHandicap }}</small>
            </div>
            <div class="hcp-preview-strokes">
              <strong>{{ row.strokes > 0 ? `+${row.strokes}` : 'Low' }}</strong>
              <small>{{ row.holes }}</small>
            </div>
          </div>
        </div>
      </div>
    </section>

    <section v-if="!hasEventContext" class="setup-card">
      <h2 class="setup-hdr">Games</h2>
      <div class="games-list">
        <div class="game-row">
          <label class="game-toggle"><input v-model="form.games.skins.enabled" type="checkbox" /> Skins</label>
          <label class="bet-field">Buy-in per player<input v-model.number="form.games.skins.pot" class="form-input sm" type="number" min="0" /></label>
          <select v-model="form.games.skins.type" class="form-input sm"><option>net</option><option>gross</option></select>
        </div>

        <div class="game-row">
          <label class="game-toggle"><input v-model="form.games.bestBall.enabled" type="checkbox" /> Best Ball</label>
          <label class="bet-field">Front 9 ($/person)<input v-model.number="form.games.bestBall.front" class="form-input sm" type="number" min="0" /></label>
          <label class="bet-field">Back 9 ($/person)<input v-model.number="form.games.bestBall.back" class="form-input sm" type="number" min="0" /></label>
          <label class="bet-field">Overall ($/person)<input v-model.number="form.games.bestBall.total" class="form-input sm" type="number" min="0" /></label>
          <select v-model="form.games.bestBall.type" class="form-input sm"><option>net</option><option>gross</option></select>
          <select v-model="form.games.bestBall.scoringMode" class="form-input sm">
            <option value="stroke">stroke</option>
            <option value="match">match</option>
          </select>
        </div>

        <div class="game-row">
          <label class="game-toggle"><input v-model="form.games.bestBallAggy.enabled" type="checkbox" /> Best Ball + Aggy</label>
        </div>
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
        </div>

        <div class="game-row">
          <label class="game-toggle"><input v-model="form.games.twoManScramble.enabled" type="checkbox" /> Two-Man Scramble <span class="game-note">(gross)</span></label>
        </div>
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

        <div class="game-row">
          <label class="game-toggle"><input v-model="form.games.highBallLowBall.enabled" type="checkbox" /> High Ball / Low Ball</label>
        </div>
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

        <div class="game-row">
          <label class="game-toggle"><input v-model="form.games.scramble4.enabled" type="checkbox" /> 4-Man Scramble</label>
          <label class="bet-field">Front 9 ($/person)<input v-model.number="form.games.scramble4.front" class="form-input sm" type="number" min="0" /></label>
          <label class="bet-field">Back 9 ($/person)<input v-model.number="form.games.scramble4.back" class="form-input sm" type="number" min="0" /></label>
          <label class="bet-field">Overall ($/person)<input v-model.number="form.games.scramble4.total" class="form-input sm" type="number" min="0" /></label>
          <span class="game-note">Stroke play</span>
        </div>

        <div class="game-row">
          <label class="game-toggle"><input v-model="form.games.wolf.enabled" type="checkbox" /> Wolf</label>
          <label class="bet-field">{{ form.games.wolf.nassau ? 'Overall ($/person)' : 'Full round ($/person)' }}<input v-model.number="form.games.wolf.amount" class="form-input sm" type="number" min="0" /></label>
          <select v-model="form.games.wolf.type" class="form-input sm"><option>net</option><option>gross</option></select>
          <label class="game-toggle sm"><input v-model="form.games.wolf.nassau" type="checkbox" /> Nassau</label>
        </div>

        <div class="game-row">
          <label class="game-toggle"><input v-model="form.games.puttPoker.enabled" type="checkbox" /> Putt Poker</label>
          <label class="bet-field">Buy-in per player<input v-model.number="form.games.puttPoker.pot" class="form-input sm" type="number" min="0" /></label>
        </div>
      </div>
    </section>

    <section v-if="!hasEventContext && showPairMatches" class="setup-card">
      <div class="pg-header">
        <h2 class="setup-hdr">Teams</h2>
        <button class="btn-ghost sm" type="button" @click="addPairMatch">+ Add team set</button>
      </div>
      <p class="pg-hint">Set sides for each team game. These teams drive Best Ball, Best Ball + Aggy, High/Low and Two-Man Scramble scoring.</p>

      <div class="pm-list">
        <div v-for="(_match, mi) in form.pairMatches" :key="mi" class="pair-match-builder">
          <div class="pm-builder-head">
            <strong>Team Set {{ mi + 1 }}</strong>
            <button class="btn-remove" type="button" title="Remove team set" @click="removePairMatch(mi)">✕</button>
          </div>
          <div class="pm-sides">
            <div class="pm-side">
              <span class="pm-side-label">Team A</span>
              <label v-for="p in namedPlayers" :key="`a-${mi}-${p.name}`" class="pm-chk">
                <input type="checkbox" :checked="inPairSide(mi, 'a', p.name.trim())" @change="togglePairSide(mi, 'a', p.name.trim())" />
                {{ p.name }}
              </label>
            </div>
            <span class="pair-match-vs">vs</span>
            <div class="pm-side">
              <span class="pm-side-label">Team B</span>
              <label v-for="p in namedPlayers" :key="`b-${mi}-${p.name}`" class="pm-chk">
                <input type="checkbox" :checked="inPairSide(mi, 'b', p.name.trim())" @change="togglePairSide(mi, 'b', p.name.trim())" />
                {{ p.name }}
              </label>
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

    <section v-if="namedPlayers.length >= 2" class="setup-card">
      <div class="pg-header">
        <h2 class="setup-hdr">Playing Groups</h2>
        <button v-if="form.playingGroupCustom" class="btn-ghost sm" type="button" @click="resetCustomGroups">Reset to auto</button>
      </div>
      <p class="pg-hint">{{ form.playingGroupCustom ? 'Manually assigned.' : 'Auto-assigned from team sets or team order.' }} Rename groups or move players between groups.</p>
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
              <small v-if="playerPartnerLabels[player]" class="pg-partner-label">{{ playerPartnerLabels[player] }}</small>
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
        </div>
      </div>
    </section>

    <ul v-if="errors.length" class="setup-errors">
      <li v-for="(err, i) in errors" :key="i">{{ err }}</li>
    </ul>

    <div class="setup-actions">
      <p v-if="store.syncError" class="sync-error">{{ store.syncError }}</p>
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
  padding: 20px 16px 64px;
}

.setup-topbar {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
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
  font-size: 1.5rem;
  color: #24362c;
}

.setup-card {
  border: 1px solid #d7cebd;
  border-radius: 10px;
  background: #f8f4ea;
  padding: 18px 20px;
  margin-bottom: 18px;
}

.setup-hdr {
  margin: 0 0 14px;
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
  display: flex;
  gap: 8px;
  align-items: center;
}

.player-row .form-input {
  flex: 1;
}

.idx-input {
  max-width: 90px;
}

.team-select {
  max-width: 140px;
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
  gap: 12px;
}

.game-row {
  display: grid;
  grid-template-columns: minmax(170px, 1.2fr) repeat(auto-fit, minmax(104px, max-content));
  gap: 12px;
  align-items: end;
  border: 1px solid #e4ddcd;
  border-radius: 8px;
  background: #fdfbf4;
  padding: 12px;
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
}
</style>
