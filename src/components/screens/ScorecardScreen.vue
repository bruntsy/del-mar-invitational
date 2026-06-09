<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { getsStroke } from '@/scoring/handicap';
import { puttPenaltyNote } from '@/scoring/puttPoker';
import { useRoundStore } from '@/stores/round';

const store = useRoundStore();
const router = useRouter();

onMounted(() => {
  if (!store.round) store.load();
  loadMobileHole();
});

const HOLES = Array.from({ length: 18 }, (_, hole) => hole);
const FRONT = HOLES.slice(0, 9);
const BACK = HOLES.slice(9);

const expandedPutts = reactive<Record<string, boolean>>({});
function togglePutts(player: string) {
  expandedPutts[player] = !expandedPutts[player];
}

const course = computed(() => store.course);
const par = computed(() => course.value?.par ?? []);
const si = computed(() => course.value?.si ?? []);
const outPar = computed(() => par.value.slice(0, 9).reduce((a, b) => a + b, 0));
const inPar = computed(() => par.value.slice(9).reduce((a, b) => a + b, 0));

const courseTitle = computed(() => {
  const c = course.value;
  if (!c) return '';
  return [c.clubName, c.courseName].filter(Boolean).join(' — ') || c.courseName || c.clubName || 'Course';
});
const courseSub = computed(() => {
  const c = course.value;
  if (!c) return '';
  return [c.location, c.tee?.name].filter(Boolean).join(' / ');
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

function onTeamScoreInput(teamKey: 'team1' | 'team2', hole: number, raw: string) {
  if (raw === '') {
    store.setTeamScore(teamKey, hole, null);
    return;
  }
  const value = Number.parseInt(raw, 10);
  if (Number.isNaN(value) || value < 1) return;
  store.setTeamScore(teamKey, hole, value);
}

function teamScoreSum(teamKey: 'team1' | 'team2', start: number, end: number): number | null {
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

const puttPokerEnabled = computed(() => store.games.puttPoker.enabled);
const scrambleEnabled = computed(() => store.games.scramble4.enabled);
const pairMatch = computed(() => store.pairMatchResult);
const pairMatchVisible = computed(() => pairMatch.value.enabled && pairMatch.value.matches.length > 0);
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

const settlement = computed(() => store.settlement);
const settlementRows = computed(() =>
  store.playerNames.map((player) => ({ player, pnl: Math.round(settlement.value.pnl[player] || 0) })),
);

function loadDemo() {
  // imported lazily to keep the demo fixture out of the production-critical path
  void import('@/fixtures/demoRound').then(({ demoRound }) => {
    const { round, players } = demoRound();
    store.setRound(round, players);
  });
}

function goHome() {
  void router.push('/');
}

function goResults() {
  void router.push('/results');
}

function shortTeamLabel(name: string, fallback: string): string {
  const clean = name.replace(/[^a-z0-9 ]/gi, ' ').trim();
  if (!clean) return fallback;
  if (/^team\s*1$/i.test(clean)) return 'T1';
  if (/^team\s*2$/i.test(clean)) return 'T2';
  return clean.split(/\s+/)[0].slice(0, 3).toUpperCase();
}

function holeClass(winner: 'a' | 'b' | 'tie' | null): string {
  if (winner === 'a') return 'side-a';
  if (winner === 'b') return 'side-b';
  if (winner === 'tie') return 'tie';
  return 'pending';
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
  return teamRows.value.map((t) => ({ name: t.label, players: t.players }));
});

const selectedGroupIndex = ref(-1); // -1 = show all

const activeGroupPlayers = computed<Set<string>>(() => {
  if (selectedGroupIndex.value < 0) return new Set(store.playerNames);
  return new Set(playingGroups.value[selectedGroupIndex.value]?.players ?? []);
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
const mobileMode = ref(false);
const mobileHole = ref(0);

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
function nextHole() { if (mobileHole.value < 17) mobileHole.value += 1; }

function adjustScore(player: string, delta: number) {
  const current = store.readScore(player, mobileHole.value) ?? 0;
  const next = Math.max(1, current + delta);
  store.setScore(player, mobileHole.value, next);
}

function adjustPutt(player: string, delta: number) {
  const current = store.readPutt(player, mobileHole.value) ?? 0;
  const next = Math.max(0, current + delta);
  store.setPutt(player, mobileHole.value, next);
}

const mobilePlayers = computed(() => {
  if (selectedGroupIndex.value >= 0) {
    return playingGroups.value[selectedGroupIndex.value]?.players ?? store.playerNames;
  }
  return store.playerNames;
});
</script>

<template>
  <main class="sc-shell">
    <template v-if="store.round && course">
      <header class="sc-topbar">
        <div>
          <h1 class="sc-title">{{ courseTitle }}</h1>
          <p class="sc-sub">{{ courseSub }}</p>
        </div>
        <div class="sc-topbar-actions">
          <button class="btn-ghost" :class="{ 'btn-ghost-active': mobileMode }" type="button" @click="mobileMode = !mobileMode">
            {{ mobileMode ? 'Full card' : 'Mobile' }}
          </button>
          <button class="btn-ghost" type="button" @click="goResults">Results →</button>
          <button class="btn-ghost" type="button" @click="goHome">← Home</button>
        </div>
      </header>

      <!-- Group filter (shown when more than one playing group exists) -->
      <div v-if="playingGroups.length > 1" class="group-filter">
        <button
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
      <div v-if="mobileMode" class="mobile-card">
        <div class="mobile-hole-nav">
          <button class="btn-ghost" type="button" :disabled="mobileHole === 0" @click="prevHole">←</button>
          <div class="mobile-hole-info">
            <span class="mobile-hole-num">Hole {{ mobileHole + 1 }}</span>
            <span class="mobile-hole-par">Par {{ par[mobileHole] }}</span>
            <span class="mobile-hole-si">SI {{ si[mobileHole] }}</span>
          </div>
          <button class="btn-ghost" type="button" :disabled="mobileHole === 17" @click="nextHole">→</button>
        </div>

        <div class="mobile-players">
          <div v-for="player in mobilePlayers" :key="player" class="mobile-player-row">
            <div class="mobile-player-meta">
              <div class="mobile-player-name">{{ player }}</div>
              <div class="mobile-player-hcp">
                Hcp {{ store.courseHandicaps[player] }}
                <span v-if="getsStrokeHere(player, mobileHole)" class="mobile-stroke-dot">●</span>
              </div>
            </div>
            <div class="mobile-score-block">
              <div class="mobile-field-label">Score</div>
              <div class="mobile-stepper" :class="scoreColorClass(store.readScore(player, mobileHole), par[mobileHole])">
                <button class="stepper-btn" type="button" @click="adjustScore(player, -1)">−</button>
                <input
                  type="number"
                  inputmode="numeric"
                  min="1"
                  max="20"
                  class="mobile-score-input"
                  :value="store.readScore(player, mobileHole) ?? ''"
                  @input="onScoreInput(player, mobileHole, ($event.target as HTMLInputElement).value)"
                  @focus="($event.target as HTMLInputElement).select()"
                />
                <button class="stepper-btn" type="button" @click="adjustScore(player, 1)">+</button>
              </div>
            </div>
            <div v-if="puttPokerEnabled" class="mobile-score-block">
              <div class="mobile-field-label">Putts</div>
              <div class="mobile-stepper" :class="puttColorClass(store.readPutt(player, mobileHole))">
                <button class="stepper-btn" type="button" @click="adjustPutt(player, -1)">−</button>
                <input
                  type="number"
                  inputmode="numeric"
                  min="0"
                  max="9"
                  class="mobile-score-input"
                  :value="store.readPutt(player, mobileHole) ?? ''"
                  @input="onPuttInput(player, mobileHole, ($event.target as HTMLInputElement).value)"
                  @focus="($event.target as HTMLInputElement).select()"
                />
                <button class="stepper-btn" type="button" @click="adjustPutt(player, 1)">+</button>
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
            :class="{ active: mobileHole === h, filled: mobilePlayers.some(p => store.readScore(p, h) != null) }"
            type="button"
            @click="mobileHole = h"
          >{{ h + 1 }}</button>
        </div>
      </div>

      <div v-if="!mobileMode" class="sc-table-wrap">
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
                  <td class="score-cell" :class="scoreColorClass(store.readTeamScore(section.teamKey!, h), par[h])">
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
                  <td class="score-cell" :class="scoreColorClass(store.readTeamScore(section.teamKey!, h), par[h])">
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
                  <td class="score-cell" :class="scoreColorClass(store.readScore(player, h), par[h])">
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
                  <td class="score-cell" :class="scoreColorClass(store.readScore(player, h), par[h])">
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
                <td v-for="h in FRONT" :key="`${section.key}-${format.key}-fh-${h}`" class="fmt-cell">
                  {{ dash(format.holes[h]) }}
                </td>
                <td class="sum-cell out-col">{{ dash(format.out) }}</td>
                <td v-for="h in BACK" :key="`${section.key}-${format.key}-bh-${h}`" class="fmt-cell">
                  {{ dash(format.holes[h]) }}
                </td>
                <td class="sum-cell in-col">{{ dash(format.in) }}</td>
                <td class="sum-cell total-col">{{ dash(format.total) }}</td>
                <td class="sum-cell net-col">—</td>
                <td class="sum-cell skins-col">—</td>
              </tr>
              </template><!-- end teamSection -->
            </template><!-- end displaySections loop -->
          </tbody>
        </table>
      </div><!-- end sc-table-wrap / v-if="!mobileMode" -->

      <section v-if="pairMatchVisible" class="pair-live">
        <div class="pair-live-title">
          <span>Pair Match Play</span>
          <span class="pair-live-total">
            {{ store.round.teamNames.team1 }} {{ pairMatch.team1Points }} - {{ pairMatch.team2Points }}
            {{ store.round.teamNames.team2 }}
            {{ pairMatch.pointsPerHole === 1 ? 'holes' : 'pts' }}
          </span>
        </div>
        <div class="pair-live-grid">
          <div v-for="match in pairMatch.matches" :key="match.idx" class="pair-live-card">
            <div class="pair-live-head">
              <div class="pair-live-side" :class="{ win: match.aPts > match.bPts }">
                <div class="pair-live-name">{{ match.a.join(' / ') }}</div>
                <div class="pair-live-meta">{{ store.round.teamNames.team1 }}</div>
              </div>
              <div class="pair-live-score">{{ match.aPts }} - {{ match.bPts }}</div>
              <div class="pair-live-side" :class="{ win: match.bPts > match.aPts }">
                <div class="pair-live-name">{{ match.b.join(' / ') }}</div>
                <div class="pair-live-meta">{{ store.round.teamNames.team2 }}</div>
              </div>
            </div>
            <div class="pair-live-holes">
              <div
                v-for="hole in match.holes"
                :key="hole.hole"
                class="pair-live-hole"
                :class="holeClass(hole.winner)"
                :title="`Hole ${hole.hole}: ${hole.a ?? '—'} - ${hole.b ?? '—'}`"
              >
                <span class="pair-live-hole-num">{{ hole.hole }}</span>
                <span class="pair-live-hole-result">
                  {{
                    hole.winner === 'a'
                      ? shortTeamLabel(store.round.teamNames.team1, 'T1')
                      : hole.winner === 'b'
                        ? shortTeamLabel(store.round.teamNames.team2, 'T2')
                        : hole.winner === 'tie'
                          ? '='
                          : '-'
                  }}
                </span>
              </div>
            </div>
            <div class="pair-live-splits">
              <span>F: {{ match.front.label }}</span>
              <span>B: {{ match.back.label }}</span>
              <span>T: {{ match.overall.label }}</span>
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
              <div class="pp-coin">
                Coin:
                <strong v-if="result.coinHolder">{{ result.coinHolder }}</strong>
                <em v-else class="pp-coin-none">no 3-putts yet</em>
              </div>
              <div class="pp-cards">
                <div v-for="p in group.players" :key="p" class="pp-player">
                  <div class="pp-player-name">{{ p }}</div>
                  <div class="pp-card-count">🃏 × {{ result.cards[p] }}</div>
                  <div
                    v-if="puttPenaltyNote(result.threePuttCount[p], result.fourPuttCount[p])"
                    class="pp-note"
                  >
                    {{ puttPenaltyNote(result.threePuttCount[p], result.fourPuttCount[p]) }}
                  </div>
                </div>
              </div>
              <div class="pp-pot">Pot: <strong>${{ result.pot }}</strong></div>
            </template>
          </div>
        </div>
      </section>

      <section v-if="store.hasBets" class="sc-settlement">
        <h2 class="sc-section-hdr">Settlement</h2>
        <table class="pnl-table">
          <thead>
            <tr><th>Player</th><th>Net</th></tr>
          </thead>
          <tbody>
            <tr v-for="row in settlementRows" :key="row.player">
              <td>{{ row.player }}</td>
              <td :class="row.pnl > 0 ? 'pnl-pos' : row.pnl < 0 ? 'pnl-neg' : ''">
                {{ row.pnl === 0 ? '—' : `${row.pnl > 0 ? '+' : ''}$${Math.abs(row.pnl)}` }}
              </td>
            </tr>
          </tbody>
        </table>
        <div v-if="settlement.transfers.length" class="settle-list">
          <div v-for="(t, i) in settlement.transfers" :key="i" class="settle-row">
            <span>{{ t.from }} <span class="settle-arrow">pays</span> {{ t.to }}</span>
            <span class="settle-amount">${{ Math.round(t.amount) }}</span>
          </div>
        </div>
        <p v-else class="settle-square">All square.</p>
      </section>
    </template>

    <section v-else class="panel sc-empty">
      <p class="eyebrow">Scorecard</p>
      <h1>No active round</h1>
      <p class="lede">Start a demo round to score live with the new engine.</p>
      <div class="sc-empty-actions">
        <button class="btn-primary" type="button" @click="loadDemo">Load demo round</button>
        <button class="btn-ghost" type="button" @click="goHome">Home</button>
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
}

.sc-topbar-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.sc-title {
  margin: 0;
  font-size: 1.4rem;
  color: #24362c;
}

.sc-sub {
  margin: 4px 0 0;
  color: #6a7a6f;
  font-size: 0.85rem;
}

.sc-table-wrap {
  overflow-x: auto;
  border: 1px solid #d7cebd;
  border-radius: 8px;
  background: #fdfbf4;
}

.sc-table {
  border-collapse: collapse;
  width: 100%;
  font-size: 0.8rem;
}

.sc-table th,
.sc-table td {
  border: 1px solid #e4ddcd;
  padding: 2px 4px;
  text-align: center;
  white-space: nowrap;
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
  font-size: 0.78rem;
}

.row-team-divider-sub td {
  background: #4a7c5f;
  font-size: 0.74rem;
}

.row-format td {
  background: #fbf7ed;
}

.fmt-cell {
  color: #2f5d43;
  font-weight: 700;
}

.name-cell {
  text-align: left;
  min-width: 120px;
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
.sc-settlement,
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

.pp-coin {
  font-size: 0.85rem;
  color: #4a5a4f;
  margin-bottom: 10px;
}

.pp-coin strong { color: #8a672f; }
.pp-coin-none { color: #9aa49a; font-size: 0.78rem; }

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
}

.pp-note {
  font-size: 0.62rem;
  color: #c0392b;
  margin-top: 2px;
}

.pp-pot {
  margin-top: 12px;
  font-size: 0.9rem;
  color: #24362c;
}

.pp-pot strong { color: #2f5d43; }

.sc-section-hdr {
  margin: 0 0 12px;
  font-size: 0.95rem;
  color: #24362c;
}

.pnl-table {
  border-collapse: collapse;
  min-width: 220px;
}

.pnl-table th,
.pnl-table td {
  border-bottom: 1px solid #e4ddcd;
  padding: 6px 14px 6px 0;
  text-align: left;
}

.pnl-pos { color: #2f8f58; font-weight: 700; }
.pnl-neg { color: #b1462f; font-weight: 700; }

.settle-list {
  margin-top: 14px;
  display: grid;
  gap: 6px;
}

.settle-row {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  padding: 8px 12px;
  background: #fdfbf4;
  border: 1px solid #e4ddcd;
  border-radius: 6px;
  max-width: 360px;
}

.settle-arrow { color: #9aa49a; font-size: 0.78rem; }
.settle-amount { font-weight: 700; color: #2f5d43; }
.settle-square { color: #6a7a6f; }

/* Group filter bar */
.group-filter {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 12px;
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

.btn-ghost-active {
  background: #ece8da;
  border-color: #b8a97a;
}

/* Mobile hole card */
.mobile-card {
  border: 1px solid #d7cebd;
  border-radius: 10px;
  background: #f8f4ea;
  padding: 16px;
  margin-bottom: 16px;
}

.mobile-hole-nav {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}

.mobile-hole-info {
  text-align: center;
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

.mobile-players {
  display: grid;
  gap: 12px;
  margin-bottom: 16px;
}

.mobile-player-row {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  border: 1px solid #e4ddcd;
  border-radius: 8px;
  background: #fdfbf4;
  padding: 10px 12px;
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
  gap: 4px;
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
  padding: 6px 12px;
  cursor: pointer;
  line-height: 1;
}

.stepper-btn:active {
  background: #e8f0e8;
}

.mobile-score-input {
  width: 44px;
  border: none;
  background: transparent;
  text-align: center;
  font-size: 1.3rem;
  font-weight: 900;
  color: inherit;
  padding: 4px 0;
}

.mobile-score-input:focus {
  outline: 2px solid #2f8f58;
  outline-offset: -2px;
}

/* Inherit score color classes on stepper */
.score-eagle .mobile-score-input { color: #8a672f; }
.score-birdie .mobile-stepper { background: #cdeccd; }
.score-bogey .mobile-stepper { background: #f3dede; }
.score-double .mobile-stepper { background: #e6c4c4; }

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
  padding: 4px 6px;
  min-width: 30px;
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

.sc-empty {
  margin: 48px auto 0;
}

.sc-empty-actions {
  display: flex;
  gap: 12px;
  margin-top: 20px;
}

.btn-primary,
.btn-ghost {
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

.btn-ghost {
  border: 1px solid #cdbf9f;
  background: transparent;
  color: #4a5a4f;
}
</style>
