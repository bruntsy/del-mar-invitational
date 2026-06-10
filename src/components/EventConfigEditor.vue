<script setup lang="ts">
import { computed, ref } from 'vue';
import type { EventRoundConfig } from '@/types/event';
import type { Event, EventConfig } from '@/types/event';
import { eventDefaultRound, eventFormatLabel, eventRoundAvailablePoints, normalizeEventConfig } from '@/domain/events';
import { autoPlayingGroupsFromPairMatches } from '@/domain/playingGroups';
import { courseFromSearchTee, selectableCourseTees, type CourseSearchResult, type CourseSearchTee } from '@/domain/courseSearch';
import { searchCourses } from '@/services/courseSearch';
import CourseScorecard from '@/components/CourseScorecard.vue';

const props = defineProps<{
  event: Event;
  groupPlayers: string[];
}>();

const emit = defineEmits<{
  save: [config: EventConfig, name: string];
  cancel: [];
}>();

const draft = ref<EventConfig>(JSON.parse(JSON.stringify(props.event.config)));
const draftName = ref(props.event.name);
const openRound = ref<number | null>(0);
const showRoundScorecard = ref<Record<number, boolean>>({});

type BaseFormat = 'bestBall' | 'scramble' | 'custom';
type BestBallVariant = 'nassau' | 'aggy' | 'highLow';

/** Seed per-component point overrides for combo (BB+Aggy / HB-LB) rounds. */
function ensureComboPoints(round: EventRoundConfig) {
  const base = { front: round.points.front, back: round.points.back, overall: round.points.total };
  if (round.format === 'twoManBestBallAggy') {
    if (!round.points.bestBall) round.points.bestBall = { ...base };
    if (!round.points.aggy) round.points.aggy = { ...base };
  } else if (round.format === 'twoManHighBallLowBall') {
    if (!round.points.lowBall) round.points.lowBall = { ...base };
    if (!round.points.highBall) round.points.highBall = { ...base };
  }
}

for (const round of draft.value.rounds) {
  ensureComboPoints(round);
}

const eventPlayers = computed(() =>
  Array.from(new Set([...props.groupPlayers, ...draft.value.team1, ...draft.value.team2].filter(Boolean))),
);

const validationErrors = computed(() => {
  const errors: string[] = [];
  if (!draftName.value.trim()) errors.push('Event name is required.');
  if (!draft.value.teamNames.team1.trim()) errors.push('Team A name is required.');
  if (!draft.value.teamNames.team2.trim()) errors.push('Team B name is required.');

  for (const player of eventPlayers.value) {
    const inTeam1 = draft.value.team1.includes(player);
    const inTeam2 = draft.value.team2.includes(player);
    if (!inTeam1 && !inTeam2) errors.push(`${player} must be assigned to a team.`);
    if (inTeam1 && inTeam2) errors.push(`${player} is assigned to both teams.`);
  }

  if (!draft.value.team1.length) errors.push(`${draft.value.teamNames.team1 || 'Team A'} needs at least one player.`);
  if (!draft.value.team2.length) errors.push(`${draft.value.teamNames.team2 || 'Team B'} needs at least one player.`);

  draft.value.rounds.forEach((round, ri) => {
    const roundName = round.name || `Round ${ri + 1}`;
    if (!round.name.trim()) errors.push(`${roundName} needs a round name.`);
    if (hasNegativePoints(round)) errors.push(`${roundName} has negative event points.`);
    if (round.skins.enabled && Number(round.skins.pot) < 0) errors.push(`${roundName} skins buy-in cannot be negative.`);
    if (round.puttPoker.enabled && Number(round.puttPoker.pot) < 0) errors.push(`${roundName} putt poker buy-in cannot be negative.`);
    if (roundBase(round) === 'bestBall' && hasNegativeMoney(round.bestBallBet)) {
      errors.push(`${roundName} money bet cannot be negative.`);
    }
    if (roundBase(round) === 'scramble' && hasNegativeMoney(round.scrambleBet)) {
      errors.push(`${roundName} money bet cannot be negative.`);
    }

    if (usesPairMatches(round)) {
      round.pairMatches.forEach((match, mi) => {
        if (match.a.length !== 2) errors.push(`${roundName} match ${mi + 1} needs two ${draft.value.teamNames.team1 || 'Team A'} players.`);
        if (match.b.length !== 2) errors.push(`${roundName} match ${mi + 1} needs two ${draft.value.teamNames.team2 || 'Team B'} players.`);
      });
      for (const duplicate of duplicatePairPlayers(round)) {
        errors.push(`${roundName} uses ${duplicate} in multiple matches.`);
      }
    }
  });

  return errors;
});

const validationWarnings = computed(() => {
  const warnings: string[] = [];
  if (draft.value.team1.length !== draft.value.team2.length) {
    warnings.push(
      `${draft.value.teamNames.team1 || 'Team A'} has ${draft.value.team1.length} players and ${draft.value.teamNames.team2 || 'Team B'} has ${draft.value.team2.length}.`,
    );
  }

  draft.value.rounds.forEach((round, ri) => {
    if (!usesPairMatches(round)) return;
    const used = new Set(round.pairMatches.flatMap((match) => [...match.a, ...match.b]));
    const omitted = [...draft.value.team1, ...draft.value.team2].filter((player) => !used.has(player));
    if (omitted.length) warnings.push(`${round.name || `Round ${ri + 1}`} leaves out ${omitted.join(', ')}.`);
  });

  return warnings;
});

const canSave = computed(() => validationErrors.value.length === 0);

const dirty = computed(() => {
  const original = JSON.stringify({ name: props.event.name, config: props.event.config });
  const current = JSON.stringify({ name: draftName.value, config: draft.value });
  return original !== current;
});

function hasNegativeMoney(bet: { front: number; back: number; total: number }) {
  return [bet.front, bet.back, bet.total].some((value) => Number(value) < 0);
}

function hasNegativePoints(round: EventRoundConfig) {
  const groups = [
    [round.points.front, round.points.back, round.points.total],
    round.points.bestBall ? [round.points.bestBall.front, round.points.bestBall.back, round.points.bestBall.overall] : [],
    round.points.aggy ? [round.points.aggy.front, round.points.aggy.back, round.points.aggy.overall] : [],
    round.points.lowBall ? [round.points.lowBall.front, round.points.lowBall.back, round.points.lowBall.overall] : [],
    round.points.highBall ? [round.points.highBall.front, round.points.highBall.back, round.points.highBall.overall] : [],
  ];
  return groups.flat().some((value) => Number(value) < 0);
}

function usesPairMatches(round: EventRoundConfig) {
  return !(roundBase(round) === 'scramble' && !roundNassau(round));
}

function duplicatePairPlayers(round: EventRoundConfig) {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const player of round.pairMatches.flatMap((match) => [...match.a, ...match.b]).filter(Boolean)) {
    if (seen.has(player)) duplicates.add(player);
    seen.add(player);
  }
  return Array.from(duplicates);
}

function playerTeam(player: string): 'team1' | 'team2' {
  return draft.value.team2.includes(player) ? 'team2' : 'team1';
}

function assignPlayerTeam(player: string, team: 'team1' | 'team2') {
  const other = team === 'team1' ? 'team2' : 'team1';
  draft.value[other] = draft.value[other].filter((p) => p !== player);
  if (!draft.value[team].includes(player)) draft.value[team] = [...draft.value[team], player];
  purgePairMatches();
}

function purgePairMatches() {
  for (let i = 0; i < draft.value.rounds.length; i++) {
    const round = draft.value.rounds[i];
    round.pairMatches = round.pairMatches
      .map((m) => ({
        a: m.a.filter((p) => draft.value.team1.includes(p)).slice(0, 2),
        b: m.b.filter((p) => draft.value.team2.includes(p)).slice(0, 2),
      }))
      .filter((m) => m.a.length > 0 || m.b.length > 0);
    recomputePlayingGroups(i);
  }
}

function addRound() {
  const index = draft.value.rounds.length;
  draft.value.rounds = [...draft.value.rounds, eventDefaultRound(index, draft.value.team1, draft.value.team2)];
  openRound.value = index;
}

function courseDisplayName(round: EventRoundConfig) {
  const course = round.course;
  if (!course) return 'No course selected';
  if (course.clubName && course.courseName && course.clubName !== course.courseName) {
    return `${course.clubName} - ${course.courseName}`;
  }
  return course.courseName || course.clubName || 'Course selected';
}

function courseMeta(round: EventRoundConfig) {
  const course = round.course;
  if (!course) return 'Choose a course before launching this round.';
  return [
    course.tee.name ? `${course.tee.name} tees` : '',
    course.tee.gender || '',
    course.tee.rating ? `Rating ${course.tee.rating}` : '',
    course.tee.slope ? `Slope ${course.tee.slope}` : '',
  ].filter(Boolean).join(' / ');
}

function roundStatus(round: EventRoundConfig) {
  if (!round.course) return 'Missing course';
  if (usesPairMatches(round) && !round.pairMatches.length) return 'Missing pair matches';
  return 'Configured';
}

function totalEventPoints(round: EventRoundConfig) {
  return eventRoundAvailablePoints(round);
}

function confirmCancel() {
  if (!dirty.value) {
    emit('cancel');
    return;
  }
  const ok = window.confirm('Discard changes?\n\nYour event edits have not been saved.');
  if (ok) emit('cancel');
}

function roundBase(round: EventRoundConfig): BaseFormat {
  if (
    round.format === 'bestBallNassau' ||
    round.format === 'twoManBestBallAggy' ||
    round.format === 'twoManHighBallLowBall'
  ) {
    return 'bestBall';
  }
  if (round.format === 'scramble2v2Nassau' || round.format === 'fourManScramble') return 'scramble';
  return 'custom';
}

function roundNassau(round: EventRoundConfig): boolean {
  return round.format === 'bestBallNassau' || round.format === 'scramble2v2Nassau';
}

function roundVariant(round: EventRoundConfig): BestBallVariant {
  if (round.format === 'twoManBestBallAggy') return 'aggy';
  if (round.format === 'twoManHighBallLowBall') return 'highLow';
  return 'nassau';
}

function setRoundBase(ri: number, base: BaseFormat) {
  const round = draft.value.rounds[ri];
  if (base === 'bestBall') round.format = 'bestBallNassau';
  else if (base === 'scramble') round.format = roundNassau(round) ? 'scramble2v2Nassau' : 'fourManScramble';
  else round.format = 'custom';
  recomputePlayingGroups(ri);
}

function setRoundNassau(ri: number, nassau: boolean) {
  const round = draft.value.rounds[ri];
  const base = roundBase(round);
  if (base === 'scramble') round.format = nassau ? 'scramble2v2Nassau' : 'fourManScramble';
  else if (base === 'bestBall') round.format = 'bestBallNassau';
}

function setRoundVariant(ri: number, variant: BestBallVariant) {
  const round = draft.value.rounds[ri];
  round.format =
    variant === 'aggy'
      ? 'twoManBestBallAggy'
      : variant === 'highLow'
        ? 'twoManHighBallLowBall'
        : 'bestBallNassau';
  ensureComboPoints(round);
}

function recomputePlayingGroups(roundIndex: number) {
  const round = draft.value.rounds[roundIndex];
  round.playingGroups = autoPlayingGroupsFromPairMatches(
    round.pairMatches,
    [...draft.value.team1, ...draft.value.team2],
    draft.value.team1,
    draft.value.team2,
  );
}

function setPairSlot(roundIndex: number, matchIndex: number, side: 'a' | 'b', slot: 0 | 1, value: string) {
  const round = draft.value.rounds[roundIndex];
  round.pairMatches = round.pairMatches.map((m, mi) => {
    if (mi !== matchIndex) return m;
    const arr = [...m[side]];
    if (value === '') {
      arr.splice(slot, 1);
    } else {
      arr[slot] = value;
    }
    return { ...m, [side]: arr.filter(Boolean).slice(0, 2) };
  });
  recomputePlayingGroups(roundIndex);
}

function addMatch(roundIndex: number) {
  draft.value.rounds[roundIndex].pairMatches = [
    ...draft.value.rounds[roundIndex].pairMatches,
    { a: [], b: [] },
  ];
  recomputePlayingGroups(roundIndex);
}

function removeMatch(roundIndex: number, matchIndex: number) {
  const match = draft.value.rounds[roundIndex].pairMatches[matchIndex];
  if ([...(match?.a ?? []), ...(match?.b ?? [])].length) {
    const ok = window.confirm('Remove match?\n\nThis match already has selected players.');
    if (!ok) return;
  }
  draft.value.rounds[roundIndex].pairMatches = draft.value.rounds[roundIndex].pairMatches.filter(
    (_, i) => i !== matchIndex,
  );
  recomputePlayingGroups(roundIndex);
}

// --- Per-round course search -------------------------------------------
const courseQuery = ref<Record<number, string>>({});
const courseResults = ref<Record<number, CourseSearchResult[]>>({});
const courseSelected = ref<Record<number, CourseSearchResult | null>>({});
const courseSearching = ref<Record<number, boolean>>({});
const courseError = ref<Record<number, string>>({});

function courseLabel(course: CourseSearchResult) {
  return course.clubName || course.courseName || 'Course';
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

async function runCourseSearch(ri: number) {
  const q = (courseQuery.value[ri] ?? '').trim();
  if (q.length < 3) {
    courseError.value[ri] = 'Enter at least 3 characters.';
    return;
  }
  courseSearching.value[ri] = true;
  courseError.value[ri] = '';
  courseSelected.value[ri] = null;
  try {
    const results = await searchCourses(q);
    courseResults.value[ri] = results;
    if (!results.length) courseError.value[ri] = 'No courses found.';
  } catch (error) {
    courseResults.value[ri] = [];
    courseError.value[ri] = error instanceof Error ? error.message : 'Course search failed.';
  } finally {
    courseSearching.value[ri] = false;
  }
}

function chooseCourse(ri: number, course: CourseSearchResult) {
  courseSelected.value[ri] = course;
  courseError.value[ri] = selectableCourseTees(course).length ? '' : 'No 18-hole tees returned for this course.';
}

function applyCourse(ri: number, course: CourseSearchResult, tee: CourseSearchTee) {
  draft.value.rounds[ri].course = courseFromSearchTee(course, tee);
  courseResults.value[ri] = [];
  courseSelected.value[ri] = null;
  courseQuery.value[ri] = '';
  courseError.value[ri] = '';
}

function clearCourse(ri: number) {
  draft.value.rounds[ri].course = null;
  courseSelected.value[ri] = null;
  courseResults.value[ri] = [];
  courseQuery.value[ri] = '';
  courseError.value[ri] = '';
}

function save() {
  if (!canSave.value) return;
  const normalized = normalizeEventConfig(draft.value, props.groupPlayers);
  emit('save', normalized, draftName.value.trim() || props.event.name);
}


</script>

<template>
  <div class="ece">
    <header class="ece-head">
      <div>
        <p class="ece-kicker">Edit event</p>
        <h2>Event configuration</h2>
      </div>
      <span v-if="dirty" class="ece-unsaved">Unsaved changes</span>
    </header>

    <div class="ece-section">
      <div class="ece-section-head">
        <div>
          <p class="ece-kicker">Event details</p>
          <h3>Names</h3>
        </div>
      </div>
      <label class="ece-field-label">
        Event name
        <input v-model="draftName" class="form-input" type="text" />
      </label>
      <div class="ece-field-grid">
        <label class="ece-field-label">
          Team A
          <input v-model="draft.teamNames.team1" class="form-input" type="text" placeholder="Team A" />
        </label>
        <label class="ece-field-label">
          Team B
          <input v-model="draft.teamNames.team2" class="form-input" type="text" placeholder="Team B" />
        </label>
      </div>
    </div>

    <div class="ece-section">
      <div class="ece-section-head">
        <div>
          <p class="ece-kicker">Teams & rosters</p>
          <h3>Player assignment</h3>
        </div>
        <div class="ece-counts">
          <span>{{ draft.teamNames.team1 || 'Team A' }}: {{ draft.team1.length }}</span>
          <span>{{ draft.teamNames.team2 || 'Team B' }}: {{ draft.team2.length }}</span>
        </div>
      </div>
      <div class="ece-assignment-list">
        <div v-for="player in eventPlayers" :key="player" class="ece-assignment-row">
          <span class="ece-player-name">{{ player }}</span>
          <div class="ece-seg team-seg" role="group" :aria-label="`Assign ${player}`">
            <button
              class="ece-seg-btn"
              :class="{ active: playerTeam(player) === 'team1' }"
              type="button"
              :aria-pressed="playerTeam(player) === 'team1'"
              @click="assignPlayerTeam(player, 'team1')"
            >
              {{ draft.teamNames.team1 || 'Team A' }}
            </button>
            <button
              class="ece-seg-btn"
              :class="{ active: playerTeam(player) === 'team2' }"
              type="button"
              :aria-pressed="playerTeam(player) === 'team2'"
              @click="assignPlayerTeam(player, 'team2')"
            >
              {{ draft.teamNames.team2 || 'Team B' }}
            </button>
          </div>
        </div>
      </div>
      <p v-if="!eventPlayers.length" class="ece-empty">No players are available for this event.</p>
    </div>

    <div class="ece-section">
      <div class="ece-section-head">
        <div>
          <p class="ece-kicker">Rounds</p>
          <h3>Round setup</h3>
        </div>
        <button class="btn-ghost sm" type="button" @click="addRound">Add round</button>
      </div>
      <div
        v-for="(round, ri) in draft.rounds"
        :key="ri"
        class="ece-round"
      >
        <button
          class="ece-round-toggle"
          type="button"
          @click="openRound = openRound === ri ? null : ri"
        >
          <span class="ece-round-main">
            <span class="ece-round-toggle-name">{{ round.name || `Round ${ri + 1}` }}</span>
            <span class="ece-round-toggle-meta">{{ eventFormatLabel(round.format) }} / {{ courseDisplayName(round) }}</span>
          </span>
          <span class="ece-status" :class="{ warning: roundStatus(round) !== 'Configured' }">{{ roundStatus(round) }}</span>
          <span class="ece-round-caret">{{ openRound === ri ? 'Hide' : 'Edit' }}</span>
        </button>

        <div v-if="openRound === ri" class="ece-round-body">
          <div class="ece-subsection">
            <h4>Round basics</h4>
            <label class="ece-field-label">
              Round name
              <input v-model="round.name" class="form-input" type="text" :placeholder="`Round ${ri + 1}`" />
            </label>
          </div>

          <div class="ece-subsection">
            <div class="ece-subsection-head">
              <div>
                <h4>Course</h4>
                <p>{{ courseDisplayName(round) }}</p>
                <p class="ece-helper">{{ courseMeta(round) }}</p>
              </div>
              <div v-if="round.course" class="ece-course-actions">
                <button class="btn-ghost sm" type="button" @click="clearCourse(ri)">Change course</button>
                <button class="btn-ghost sm" type="button" @click="showRoundScorecard[ri] = !showRoundScorecard[ri]">
                  {{ showRoundScorecard[ri] ? 'Hide scorecard' : 'View scorecard' }}
                </button>
              </div>
            </div>
            <template v-if="round.course">
              <div v-if="showRoundScorecard[ri]" class="ece-contained-scorecard">
                <CourseScorecard :course="round.course" />
              </div>
            </template>
            <template v-else>
              <div class="ece-course-search">
                <input
                  v-model="courseQuery[ri]"
                  class="form-input"
                  type="search"
                  placeholder="Search course name"
                  @keydown.enter.prevent="runCourseSearch(ri)"
                />
                <button class="btn-ghost sm" type="button" :disabled="courseSearching[ri]" @click="runCourseSearch(ri)">
                  {{ courseSearching[ri] ? 'Searching…' : 'Search' }}
                </button>
              </div>
              <div v-if="courseResults[ri]?.length" class="ece-course-results">
                <button v-for="c in courseResults[ri]" :key="c.id || courseLabel(c)" class="ece-course-result" type="button" @click="chooseCourse(ri, c)">
                  <strong>{{ courseLabel(c) }}</strong>
                  <small>{{ selectableCourseTees(c).length }} tees</small>
                </button>
              </div>
              <div v-if="courseSelected[ri]" class="ece-course-results">
                <button v-for="t in selectableCourseTees(courseSelected[ri]!)" :key="courseTeeKey(t)" class="ece-course-result" type="button" @click="applyCourse(ri, courseSelected[ri]!, t)">
                  <strong>{{ t.name || 'Tee' }}</strong>
                  <small>{{ teeLabel(t) }}</small>
                </button>
              </div>
              <p v-if="courseError[ri]" class="ece-course-error">{{ courseError[ri] }}</p>
            </template>
          </div>

          <div class="ece-subsection">
            <h4>Format</h4>
            <label class="ece-sublabel">Base format</label>
            <div class="ece-seg">
              <button class="ece-seg-btn" :class="{ active: roundBase(round) === 'bestBall' }" type="button" @click="setRoundBase(ri, 'bestBall')">Best Ball</button>
              <button class="ece-seg-btn" :class="{ active: roundBase(round) === 'scramble' }" type="button" @click="setRoundBase(ri, 'scramble')">Scramble</button>
              <button class="ece-seg-btn" :class="{ active: roundBase(round) === 'custom' }" type="button" @click="setRoundBase(ri, 'custom')">Custom</button>
            </div>
            <p class="ece-helper">Determines the core scoring structure.</p>

            <template v-if="roundBase(round) === 'scramble'">
              <label class="ece-sublabel">Scoring structure</label>
              <div class="ece-seg">
                <button class="ece-seg-btn" :class="{ active: roundNassau(round) }" type="button" @click="setRoundNassau(ri, true)">Nassau</button>
                <button class="ece-seg-btn" :class="{ active: !roundNassau(round) }" type="button" @click="setRoundNassau(ri, false)">Full Round</button>
              </div>
            </template>

            <template v-if="roundBase(round) === 'bestBall'">
              <label class="ece-sublabel">Variant</label>
              <div class="ece-seg">
                <button class="ece-seg-btn" :class="{ active: roundVariant(round) === 'nassau' }" type="button" @click="setRoundVariant(ri, 'nassau')">Nassau</button>
                <button class="ece-seg-btn" :class="{ active: roundVariant(round) === 'aggy' }" type="button" @click="setRoundVariant(ri, 'aggy')">Best Ball + Aggy</button>
                <button class="ece-seg-btn" :class="{ active: roundVariant(round) === 'highLow' }" type="button" @click="setRoundVariant(ri, 'highLow')">High Ball / Low Ball</button>
              </div>
              <p class="ece-helper">Determines which team result types are scored.</p>
            </template>

            <label class="ece-sublabel">Scoring mode</label>
            <div class="ece-seg">
              <button
                class="ece-seg-btn"
                :class="{ active: round.scoringMode === 'matchPlay' }"
                type="button"
                @click="round.scoringMode = 'matchPlay'"
              >Match Play</button>
              <button
                class="ece-seg-btn"
                :class="{ active: round.scoringMode === 'strokePlay' }"
                type="button"
                @click="round.scoringMode = 'strokePlay'"
              >Stroke Play</button>
            </div>
            <p class="ece-helper">Determines whether holes or total strokes decide the result.</p>
          </div>

          <template v-if="roundBase(round) === 'bestBall'">
            <div class="ece-subsection">
              <h4>Money games / side games</h4>
              <label class="ece-sublabel">Best Ball bet</label>
              <div class="ece-row ece-points-row">
                <template v-if="roundNassau(round)">
                  <label class="ece-pts-label">Front 9 $ / player
                    <input v-model.number="round.bestBallBet.front" class="form-input ece-pts-input" type="number" min="0" placeholder="$" />
                  </label>
                  <label class="ece-pts-label">Back 9 $ / player
                    <input v-model.number="round.bestBallBet.back" class="form-input ece-pts-input" type="number" min="0" placeholder="$" />
                  </label>
                </template>
                <label class="ece-pts-label">{{ roundNassau(round) ? 'Overall $ / player' : 'Full round $ / player' }}
                  <input v-model.number="round.bestBallBet.total" class="form-input ece-pts-input" type="number" min="0" placeholder="$" />
                </label>
                <select v-model="round.bestBallBet.type" class="form-input ece-type-select">
                  <option value="net">Net</option>
                  <option value="gross">Gross</option>
                </select>
              </div>
              <p v-if="!round.bestBallBet.front && !round.bestBallBet.back && !round.bestBallBet.total" class="ece-helper">Tracking only when the buy-in is $0.</p>
            </div>
          </template>

          <template v-if="roundBase(round) === 'scramble'">
            <div class="ece-subsection">
              <h4>Money games / side games</h4>
              <label class="ece-sublabel">Scramble bet</label>
              <div class="ece-row ece-points-row">
                <template v-if="roundNassau(round)">
                  <label class="ece-pts-label">Front 9 $ / player
                    <input v-model.number="round.scrambleBet.front" class="form-input ece-pts-input" type="number" min="0" placeholder="$" />
                  </label>
                  <label class="ece-pts-label">Back 9 $ / player
                    <input v-model.number="round.scrambleBet.back" class="form-input ece-pts-input" type="number" min="0" placeholder="$" />
                  </label>
                </template>
                <label class="ece-pts-label">{{ roundNassau(round) ? 'Overall $ / player' : 'Full round $ / player' }}
                  <input v-model.number="round.scrambleBet.total" class="form-input ece-pts-input" type="number" min="0" placeholder="$" />
                </label>
              </div>
              <p v-if="!round.scrambleBet.front && !round.scrambleBet.back && !round.scrambleBet.total" class="ece-helper">Tracking only when the buy-in is $0.</p>
            </div>
          </template>

          <div class="ece-subsection">
            <div class="ece-subsection-head">
              <div>
                <h4>Event points</h4>
                <p class="ece-helper">Team event points, not dollars.</p>
              </div>
              <strong class="ece-total-points">Total available: {{ totalEventPoints(round) }} points</strong>
            </div>
            <template v-if="roundVariant(round) === 'aggy' && round.points.bestBall && round.points.aggy">
              <div class="ece-row ece-points-row">
                <span class="ece-pts-group">Best Ball</span>
                <label class="ece-pts-label">Front
                  <input v-model.number="round.points.bestBall.front" class="form-input ece-pts-input" type="number" min="0" />
                </label>
                <label class="ece-pts-label">Back
                  <input v-model.number="round.points.bestBall.back" class="form-input ece-pts-input" type="number" min="0" />
                </label>
                <label class="ece-pts-label">Overall
                  <input v-model.number="round.points.bestBall.overall" class="form-input ece-pts-input" type="number" min="0" />
                </label>
              </div>
              <div class="ece-row ece-points-row">
                <span class="ece-pts-group">Aggy</span>
                <label class="ece-pts-label">Front
                  <input v-model.number="round.points.aggy.front" class="form-input ece-pts-input" type="number" min="0" />
                </label>
                <label class="ece-pts-label">Back
                  <input v-model.number="round.points.aggy.back" class="form-input ece-pts-input" type="number" min="0" />
                </label>
                <label class="ece-pts-label">Overall
                  <input v-model.number="round.points.aggy.overall" class="form-input ece-pts-input" type="number" min="0" />
                </label>
              </div>
            </template>
            <template v-else-if="roundVariant(round) === 'highLow' && round.points.lowBall && round.points.highBall">
              <div class="ece-row ece-points-row">
                <span class="ece-pts-group">Low Ball</span>
                <label class="ece-pts-label">Front
                  <input v-model.number="round.points.lowBall.front" class="form-input ece-pts-input" type="number" min="0" />
                </label>
                <label class="ece-pts-label">Back
                  <input v-model.number="round.points.lowBall.back" class="form-input ece-pts-input" type="number" min="0" />
                </label>
                <label class="ece-pts-label">Overall
                  <input v-model.number="round.points.lowBall.overall" class="form-input ece-pts-input" type="number" min="0" />
                </label>
              </div>
              <div class="ece-row ece-points-row">
                <span class="ece-pts-group">High Ball</span>
                <label class="ece-pts-label">Front
                  <input v-model.number="round.points.highBall.front" class="form-input ece-pts-input" type="number" min="0" />
                </label>
                <label class="ece-pts-label">Back
                  <input v-model.number="round.points.highBall.back" class="form-input ece-pts-input" type="number" min="0" />
                </label>
                <label class="ece-pts-label">Overall
                  <input v-model.number="round.points.highBall.overall" class="form-input ece-pts-input" type="number" min="0" />
                </label>
              </div>
            </template>
            <div v-else class="ece-row ece-points-row">
              <label class="ece-pts-label">Front (pts)
                <input v-model.number="round.points.front" class="form-input ece-pts-input" type="number" min="0" />
              </label>
              <label class="ece-pts-label">Back (pts)
                <input v-model.number="round.points.back" class="form-input ece-pts-input" type="number" min="0" />
              </label>
              <label class="ece-pts-label">Overall (pts)
                <input v-model.number="round.points.total" class="form-input ece-pts-input" type="number" min="0" />
              </label>
            </div>
          </div>

          <template v-if="usesPairMatches(round)">
            <div class="ece-subsection">
              <div class="ece-subsection-head">
                <div>
                  <h4>Pair matches</h4>
                  <p class="ece-helper">Each match uses one pair from each event team.</p>
                </div>
                <button class="btn-ghost sm" type="button" @click="addMatch(ri)">Add match</button>
              </div>
              <div v-for="(match, mi) in round.pairMatches" :key="mi" class="ece-match">
                <div class="ece-match-head">
                  <strong>Match {{ mi + 1 }}</strong>
                  <button class="btn-ghost xs danger" type="button" @click="removeMatch(ri, mi)">Remove match</button>
                </div>
                <div class="ece-match-sides">
                  <div class="ece-match-side">
                    <label>{{ draft.teamNames.team1 || 'Team A' }} pair</label>
                    <select
                      class="form-input ece-player-select"
                      :value="match.a[0] ?? ''"
                      @change="setPairSlot(ri, mi, 'a', 0, ($event.target as HTMLSelectElement).value)"
                    >
                      <option value="">—</option>
                      <option
                        v-for="p in draft.team1"
                        :key="p"
                        :value="p"
                        :disabled="p !== match.a[0] && match.a[1] === p"
                      >{{ p }}</option>
                    </select>
                    <select
                      class="form-input ece-player-select"
                      :value="match.a[1] ?? ''"
                      @change="setPairSlot(ri, mi, 'a', 1, ($event.target as HTMLSelectElement).value)"
                    >
                      <option value="">—</option>
                      <option
                        v-for="p in draft.team1"
                        :key="p"
                        :value="p"
                        :disabled="p !== match.a[1] && match.a[0] === p"
                      >{{ p }}</option>
                    </select>
                  </div>
                  <span class="ece-vs">vs</span>
                  <div class="ece-match-side">
                    <label>{{ draft.teamNames.team2 || 'Team B' }} pair</label>
                    <select
                      class="form-input ece-player-select"
                      :value="match.b[0] ?? ''"
                      @change="setPairSlot(ri, mi, 'b', 0, ($event.target as HTMLSelectElement).value)"
                    >
                      <option value="">—</option>
                      <option
                        v-for="p in draft.team2"
                        :key="p"
                        :value="p"
                        :disabled="p !== match.b[0] && match.b[1] === p"
                      >{{ p }}</option>
                    </select>
                    <select
                      class="form-input ece-player-select"
                      :value="match.b[1] ?? ''"
                      @change="setPairSlot(ri, mi, 'b', 1, ($event.target as HTMLSelectElement).value)"
                    >
                      <option value="">—</option>
                      <option
                        v-for="p in draft.team2"
                        :key="p"
                        :value="p"
                        :disabled="p !== match.b[1] && match.b[0] === p"
                      >{{ p }}</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>
          </template>

          <div class="ece-side-games">
            <div class="ece-money-card">
              <label class="ece-toggle-label">
                <input v-model="round.skins.enabled" type="checkbox" />
                <span>
                  <strong>Skins</strong>
                  <small>Individual skins game.</small>
                </span>
              </label>
              <div v-if="round.skins.enabled" class="ece-row ece-points-row">
                <label class="ece-pts-label">Buy-in $ / player
                  <input v-model.number="round.skins.pot" class="form-input ece-money-input" type="number" min="0" />
                </label>
                <select v-model="round.skins.type" class="form-input ece-type-select" aria-label="Skins basis">
                  <option value="gross">Gross</option>
                  <option value="net">Net</option>
                </select>
              </div>
            </div>

            <div class="ece-money-card">
              <label class="ece-toggle-label">
                <input v-model="round.puttPoker.enabled" type="checkbox" />
                <span>
                  <strong>Putt poker</strong>
                  <small>Optional putting side game.</small>
                </span>
              </label>
              <div v-if="round.puttPoker.enabled" class="ece-row ece-points-row">
                <label class="ece-pts-label">Buy-in $ / player
                  <input v-model.number="round.puttPoker.pot" class="form-input ece-money-input" type="number" min="0" />
                </label>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div v-if="validationErrors.length || validationWarnings.length" class="ece-validation">
      <template v-if="validationErrors.length">
        <strong>Fix {{ validationErrors.length }} {{ validationErrors.length === 1 ? 'issue' : 'issues' }} before saving:</strong>
        <ul>
          <li v-for="error in validationErrors" :key="error">{{ error }}</li>
        </ul>
      </template>
      <template v-if="validationWarnings.length">
        <strong>Review before saving:</strong>
        <ul>
          <li v-for="warning in validationWarnings" :key="warning">{{ warning }}</li>
        </ul>
      </template>
    </div>

    <div class="ece-actions">
      <button class="btn-ghost" type="button" @click="confirmCancel">Cancel</button>
      <button class="btn-primary" type="button" :disabled="!canSave" @click="save">Save changes</button>
    </div>
  </div>
</template>

<style scoped>
.ece {
  border: 1px solid #c8d4bc;
  border-radius: 8px;
  padding: 16px;
  margin-top: 10px;
  background: #f9f7f2;
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.ece-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.ece-label {
  font-size: 0.78rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #7a8a7f;
}

.ece-sublabel {
  font-size: 0.82rem;
  font-weight: 600;
  color: #4a5a4f;
  display: flex;
  align-items: center;
  gap: 6px;
}

.ece-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.ece-vs {
  color: #7a8a7f;
  font-weight: 700;
  flex-shrink: 0;
}

.ece-teams {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.ece-team {
  border: 1px solid #e0d7c4;
  border-radius: 6px;
  padding: 10px;
  background: #fff;
}

.ece-team-name {
  font-weight: 700;
  color: #24362c;
  font-size: 0.88rem;
  margin-bottom: 8px;
}

.ece-player-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  padding: 3px 0;
}

.ece-player-name {
  font-size: 0.88rem;
  color: #24362c;
  flex: 1;
}

.ece-empty {
  color: #7a8a7f;
  font-size: 0.8rem;
  margin: 0;
}

.ece-round {
  border: 1px solid #e0d7c4;
  border-radius: 6px;
  overflow: hidden;
}

.ece-round-toggle {
  width: 100%;
  background: #fff;
  border: none;
  padding: 10px 12px;
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  text-align: left;
}

.ece-round-toggle:hover {
  background: #f5f2ea;
}

.ece-round-toggle-name {
  font-weight: 700;
  color: #24362c;
  font-size: 0.9rem;
}

.ece-round-toggle-meta {
  color: #7a8a7f;
  font-size: 0.78rem;
  flex: 1;
}

.ece-round-caret {
  color: #7a8a7f;
  font-size: 0.7rem;
}

.ece-round-body {
  padding: 12px;
  background: #fdfcf8;
  border-top: 1px solid #e0d7c4;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.ece-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.ece-inline-field {
  flex-direction: row;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.ece-points-row {
  gap: 12px;
}

.ece-pts-group {
  min-width: 72px;
  font-size: 0.78rem;
  font-weight: 700;
  color: #2f5d43;
}

.ece-pts-label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.82rem;
  color: #4a5a4f;
}

.ece-pts-input {
  width: 56px !important;
}

.ece-money-input {
  width: 80px !important;
}

.ece-type-select {
  width: auto !important;
}

.ece-match {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 0;
  border-bottom: 1px solid #efe9da;
}

.ece-match:last-of-type {
  border-bottom: none;
}

.ece-match-num {
  font-size: 0.78rem;
  color: #7a8a7f;
  font-weight: 700;
  width: 16px;
  flex-shrink: 0;
}

.ece-match-sides {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 1;
  flex-wrap: wrap;
}

.ece-match-side {
  display: flex;
  gap: 4px;
}

.ece-player-select {
  width: auto !important;
  font-size: 0.82rem !important;
  padding: 4px 6px !important;
}

.ece-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}

.btn-primary {
  background: #2f5d43;
  color: #fff;
  border: none;
  border-radius: 6px;
  padding: 8px 18px;
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
}

.btn-primary:hover {
  background: #24472f;
}

.btn-ghost.xs {
  padding: 2px 7px;
  font-size: 0.75rem;
}

.ece-seg {
  display: flex;
  border: 1px solid #cdbf9f;
  border-radius: 6px;
  overflow: hidden;
}

.ece-seg-btn {
  flex: 1;
  padding: 6px 12px;
  border: none;
  background: transparent;
  color: #4a5a4f;
  font-size: 0.82rem;
  font-weight: 600;
  cursor: pointer;
}

.ece-seg-btn + .ece-seg-btn {
  border-left: 1px solid #cdbf9f;
}

.ece-seg-btn.active {
  background: #2f5d43;
  color: #f3efe2;
}

.ece-course-search {
  display: flex;
  gap: 8px;
}

.ece-course-search .form-input {
  flex: 1;
}

.ece-course-results {
  display: grid;
  gap: 6px;
  margin-top: 8px;
}

.ece-course-result {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  border: 1px solid #d7cebd;
  border-radius: 6px;
  background: #fdfbf4;
  padding: 8px 10px;
  color: #283b30;
  text-align: left;
  cursor: pointer;
}

.ece-course-result:hover {
  border-color: #b88a3b;
  background: #fff8e8;
}

.ece-course-result small {
  color: #6a7a6f;
  font-size: 0.72rem;
  font-weight: 600;
}

.ece-course-error {
  margin: 8px 0 0;
  color: #b4473a;
  font-size: 0.78rem;
  font-weight: 700;
}

.ece-head,
.ece-section-head,
.ece-subsection-head {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: flex-start;
}

.ece-head h2,
.ece-section-head h3,
.ece-subsection h4 {
  margin: 0;
  color: #24362c;
  letter-spacing: 0;
}

.ece-head h2 {
  font-size: 1.15rem;
}

.ece-section-head h3 {
  font-size: 0.98rem;
}

.ece-subsection h4 {
  font-size: 0.9rem;
}

.ece-kicker {
  margin: 0 0 3px;
  color: #7a8a7f;
  font-size: 0.72rem;
  font-weight: 800;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

.ece-unsaved,
.ece-status {
  display: inline-flex;
  align-items: center;
  border: 1px solid #c8d4bc;
  border-radius: 999px;
  padding: 4px 8px;
  background: #eef4ec;
  color: #2f5d43;
  font-size: 0.72rem;
  font-weight: 800;
  white-space: nowrap;
}

.ece-unsaved,
.ece-status.warning {
  border-color: #e0c4a0;
  background: #fff5e2;
  color: #8a672f;
}

.ece-field-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.ece-field-label {
  display: flex;
  flex-direction: column;
  gap: 5px;
  color: #4a5a4f;
  font-size: 0.8rem;
  font-weight: 700;
}

.ece-counts {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.ece-counts span {
  border: 1px solid #d7cebd;
  border-radius: 999px;
  padding: 4px 8px;
  background: #fdfbf4;
  color: #4a5a4f;
  font-size: 0.72rem;
  font-weight: 800;
}

.ece-assignment-list {
  display: grid;
  gap: 8px;
}

.ece-assignment-row {
  display: grid;
  grid-template-columns: minmax(110px, 0.8fr) minmax(220px, 1.2fr);
  gap: 10px;
  align-items: center;
  border: 1px solid #e0d7c4;
  border-radius: 6px;
  padding: 8px;
  background: #fff;
}

.team-seg {
  min-width: 0;
}

.ece-round-main {
  display: flex;
  flex: 1;
  min-width: 0;
  flex-direction: column;
  gap: 2px;
}

.ece-round-toggle-meta {
  white-space: normal;
}

.ece-subsection {
  display: flex;
  flex-direction: column;
  gap: 8px;
  border: 1px solid #e4dbc9;
  border-radius: 6px;
  padding: 12px;
  background: #fff;
}

.ece-subsection-head p,
.ece-helper {
  margin: 2px 0 0;
  color: #6a7a6f;
  font-size: 0.76rem;
  font-weight: 600;
}

.ece-course-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.ece-contained-scorecard {
  overflow-x: auto;
}

.ece-total-points {
  color: #2f5d43;
  font-size: 0.8rem;
  white-space: nowrap;
}

.ece-money-card {
  border: 1px solid #e0d7c4;
  border-radius: 6px;
  padding: 10px;
  background: #fdfbf4;
}

.ece-side-games {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.ece-toggle-label {
  display: flex;
  flex-direction: row;
  gap: 8px;
  align-items: flex-start;
  color: #24362c;
  font-size: 0.85rem;
  font-weight: 800;
}

.ece-toggle-label small {
  display: block;
  margin-top: 2px;
  color: #6a7a6f;
  font-size: 0.74rem;
  font-weight: 600;
}

.ece-match {
  display: grid;
  gap: 10px;
  padding: 10px;
  border: 1px solid #e0d7c4;
  border-radius: 6px;
  background: #fdfbf4;
}

.ece-match-head {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  align-items: center;
}

.ece-match-head strong {
  color: #24362c;
  font-size: 0.85rem;
}

.ece-match-side {
  display: grid;
  grid-template-columns: repeat(2, minmax(110px, 1fr));
  gap: 6px;
  flex: 1;
}

.ece-match-side label {
  grid-column: 1 / -1;
  color: #4a5a4f;
  font-size: 0.76rem;
  font-weight: 800;
}

.ece-validation {
  border: 1px solid #e0c4c0;
  border-radius: 8px;
  padding: 12px 14px;
  background: #f9eeec;
  color: #a23b28;
  font-size: 0.82rem;
}

.ece-validation strong {
  display: block;
  margin-bottom: 6px;
}

.ece-validation ul {
  margin: 0 0 8px;
  padding-left: 18px;
}

.ece-actions {
  position: sticky;
  bottom: 0;
  z-index: 5;
  margin: 4px -16px -16px;
  padding: 12px 16px calc(12px + env(safe-area-inset-bottom));
  border-top: 1px solid #d7cebd;
  background: rgb(249 247 242 / 94%);
  backdrop-filter: blur(10px);
}

.btn-primary:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

@media (max-width: 640px) {
  .ece {
    padding: 14px;
  }

  .ece-head,
  .ece-section-head,
  .ece-subsection-head,
  .ece-row,
  .ece-match-sides {
    flex-direction: column;
    align-items: stretch;
  }

  .ece-field-grid,
  .ece-side-games,
  .ece-assignment-row {
    grid-template-columns: 1fr;
  }

  .ece-counts,
  .ece-course-actions {
    justify-content: stretch;
  }

  .ece-counts span,
  .ece-course-actions .btn-ghost,
  .ece-actions .btn-primary,
  .ece-actions .btn-ghost {
    width: 100%;
  }

  .ece-seg {
    width: 100%;
  }

  .ece-match-side {
    grid-template-columns: 1fr;
  }

  .ece-points-row {
    align-items: stretch;
  }
}
</style>
