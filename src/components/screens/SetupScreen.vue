<script setup lang="ts">
import { computed, reactive } from 'vue';
import { useRouter } from 'vue-router';
import { cloneDefaultGames, normalizeGames } from '@/domain/games';
import { ensurePairMatches } from '@/scoring/pairMatch';
import { useGroupStore } from '@/stores/group';
import { emptyRound, useRoundStore } from '@/stores/round';
import type { Course, GameConfig, PairMatch, PlayerMap, RoundState } from '@/types';

const store = useRoundStore();
const group = useGroupStore();
const router = useRouter();

const HOLES = Array.from({ length: 18 }, (_, hole) => hole);
const DEFAULT_PAR = [4, 5, 3, 4, 4, 3, 5, 4, 4, 4, 4, 3, 5, 4, 4, 3, 5, 4];
const DEFAULT_SI = [7, 1, 15, 5, 11, 17, 3, 9, 13, 8, 2, 16, 4, 12, 10, 18, 6, 14];

interface PlayerRow {
  name: string;
  handicapIndex: number | string;
  team: 'team1' | 'team2';
}

const form = reactive({
  clubName: '',
  courseName: '',
  location: '',
  teeName: 'Blue',
  rating: 72,
  slope: 113,
  par: [...DEFAULT_PAR],
  si: [...DEFAULT_SI],
  teamNames: { team1: 'Team 1', team2: 'Team 2' },
  players: [
    { name: '', handicapIndex: '', team: 'team1' },
    { name: '', handicapIndex: '', team: 'team1' },
    { name: '', handicapIndex: '', team: 'team2' },
    { name: '', handicapIndex: '', team: 'team2' },
  ] as PlayerRow[],
  games: cloneDefaultGames() as GameConfig,
  pairMatches: [] as PairMatch[],
});

function addPlayer() {
  const team = form.players.filter((p) => p.team === 'team1').length <= form.players.filter((p) => p.team === 'team2').length
    ? 'team1'
    : 'team2';
  form.players.push({ name: '', handicapIndex: '', team });
}

function removePlayer(index: number) {
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

const pairMatches = computed(() => ensurePairMatches(form.pairMatches, team1.value, team2.value));

function syncPairMatches() {
  form.pairMatches = ensurePairMatches(form.pairMatches, team1.value, team2.value);
}

function addPairMatch() {
  syncPairMatches();
  form.pairMatches.push({ a: [], b: [] });
}

function setPairMatchPlayer(matchIndex: number, side: 'a' | 'b', slot: number, player: string) {
  syncPairMatches();
  const match = form.pairMatches[matchIndex] ?? { a: [], b: [] };
  const roster = side === 'a' ? team1.value : team2.value;
  const values = [...(match[side] || [])];
  values[slot] = roster.includes(player) ? player : '';
  form.pairMatches[matchIndex] = {
    ...match,
    [side]: values.filter(Boolean).slice(0, 2),
  };
}

function buildRound(): { round: RoundState; players: PlayerMap } {
  const course: Course = {
    clubName: form.clubName.trim() || undefined,
    courseName: form.courseName.trim() || 'Course',
    location: form.location.trim() || undefined,
    tee: {
      name: form.teeName.trim() || 'Tee',
      rating: Number(form.rating) || 72,
      slope: Number(form.slope) || 113,
      parTotal: form.par.reduce((a, b) => a + Number(b || 0), 0),
    },
    par: form.par.map((value) => Number(value) || 0),
    si: form.si.map((value) => Number(value) || 0),
    yds: form.par.map(() => 0),
  };

  const players: PlayerMap = {};
  namedPlayers.value.forEach((p) => {
    players[p.name.trim()] = { name: p.name.trim(), handicapIndex: Number(p.handicapIndex) || 0 };
  });

  // Pair team1[i] vs team2[i] for head-to-head, matching the legacy setup.
  const matchups = team1.value
    .map((t1, index) => ({ t1, t2: team2.value[index] }))
    .filter((m) => m.t1 && m.t2);

  const round: RoundState = {
    ...emptyRound(),
    course,
    team1: team1.value,
    team2: team2.value,
    teamNames: { team1: form.teamNames.team1, team2: form.teamNames.team2 },
    matchups,
    pairMatches: ensurePairMatches(form.pairMatches, team1.value, team2.value),
    games: normalizeGames(form.games),
  };

  return { round, players };
}

async function startRound() {
  if (!canStart.value) return;
  const { round, players } = buildRound();
  await store.startRound(round, players, group.group?.id ?? null);
  void router.push('/scorecard');
}

function goHome() {
  void router.push('/');
}
</script>

<template>
  <main class="setup-shell">
    <header class="setup-topbar">
      <div>
        <p class="eyebrow">New Round</p>
        <h1 class="setup-title">Round Setup</h1>
      </div>
      <button class="btn-ghost" type="button" @click="goHome">← Home</button>
    </header>

    <section class="setup-card">
      <h2 class="setup-hdr">Course</h2>
      <div class="field-grid">
        <label>Club<input v-model="form.clubName" class="form-input" placeholder="Del Mar Country Club" /></label>
        <label>Course<input v-model="form.courseName" class="form-input" placeholder="Championship" /></label>
        <label>Location<input v-model="form.location" class="form-input" placeholder="Del Mar, CA" /></label>
        <label>Tee<input v-model="form.teeName" class="form-input" /></label>
        <label>Rating<input v-model.number="form.rating" class="form-input" type="number" step="0.1" /></label>
        <label>Slope<input v-model.number="form.slope" class="form-input" type="number" /></label>
      </div>

      <div class="hole-grid">
        <div class="hole-grid-row">
          <span class="hole-grid-label">Hole</span>
          <span v-for="h in HOLES" :key="`hl-${h}`" class="hole-grid-head">{{ h + 1 }}</span>
        </div>
        <div class="hole-grid-row">
          <span class="hole-grid-label">Par</span>
          <input
            v-for="h in HOLES"
            :key="`par-${h}`"
            v-model.number="form.par[h]"
            class="hole-input"
            type="number"
            min="3"
            max="6"
          />
        </div>
        <div class="hole-grid-row">
          <span class="hole-grid-label">SI</span>
          <input
            v-for="h in HOLES"
            :key="`si-${h}`"
            v-model.number="form.si[h]"
            class="hole-input"
            type="number"
            min="1"
            max="18"
          />
        </div>
      </div>
    </section>

    <section class="setup-card">
      <h2 class="setup-hdr">Teams &amp; Players</h2>
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
            placeholder="Index"
          />
          <select v-model="player.team" class="form-input team-select">
            <option value="team1">{{ form.teamNames.team1 }}</option>
            <option value="team2">{{ form.teamNames.team2 }}</option>
          </select>
          <button class="btn-remove" type="button" title="Remove" @click="removePlayer(index)">✕</button>
        </div>
      </div>
      <button class="btn-ghost" type="button" @click="addPlayer">+ Add player</button>
    </section>

    <section class="setup-card">
      <h2 class="setup-hdr">Games</h2>
      <div class="games-list">
        <div class="game-row">
          <label class="game-toggle"><input v-model="form.games.skins.enabled" type="checkbox" /> Skins</label>
          <input v-model.number="form.games.skins.pot" class="form-input sm" type="number" min="0" placeholder="$/player" />
          <select v-model="form.games.skins.type" class="form-input sm"><option>net</option><option>gross</option></select>
        </div>

        <div class="game-row">
          <label class="game-toggle"><input v-model="form.games.bestBall.enabled" type="checkbox" /> Best Ball</label>
          <input v-model.number="form.games.bestBall.front" class="form-input sm" type="number" min="0" placeholder="Front $" />
          <input v-model.number="form.games.bestBall.back" class="form-input sm" type="number" min="0" placeholder="Back $" />
          <input v-model.number="form.games.bestBall.total" class="form-input sm" type="number" min="0" placeholder="Total $" />
          <select v-model="form.games.bestBall.type" class="form-input sm"><option>net</option><option>gross</option></select>
        </div>

        <div class="game-row">
          <label class="game-toggle"><input v-model="form.games.scramble4.enabled" type="checkbox" /> 4-Man Scramble</label>
          <input v-model.number="form.games.scramble4.front" class="form-input sm" type="number" min="0" placeholder="Front $" />
          <input v-model.number="form.games.scramble4.back" class="form-input sm" type="number" min="0" placeholder="Back $" />
          <input v-model.number="form.games.scramble4.total" class="form-input sm" type="number" min="0" placeholder="Total $" />
        </div>

        <div class="game-row">
          <label class="game-toggle"><input v-model="form.games.twoBall.enabled" type="checkbox" /> 2-Ball</label>
          <input v-model.number="form.games.twoBall.front" class="form-input sm" type="number" min="0" placeholder="Front $" />
          <input v-model.number="form.games.twoBall.back" class="form-input sm" type="number" min="0" placeholder="Back $" />
          <input v-model.number="form.games.twoBall.total" class="form-input sm" type="number" min="0" placeholder="Total $" />
          <select v-model="form.games.twoBall.type" class="form-input sm"><option>net</option><option>gross</option></select>
        </div>

        <div class="game-row">
          <label class="game-toggle"><input v-model="form.games.aggy.enabled" type="checkbox" /> Aggy</label>
          <input v-model.number="form.games.aggy.front" class="form-input sm" type="number" min="0" placeholder="Front $" />
          <input v-model.number="form.games.aggy.back" class="form-input sm" type="number" min="0" placeholder="Back $" />
          <input v-model.number="form.games.aggy.total" class="form-input sm" type="number" min="0" placeholder="Total $" />
          <select v-model="form.games.aggy.type" class="form-input sm"><option>net</option><option>gross</option></select>
        </div>

        <div class="game-row">
          <label class="game-toggle"><input v-model="form.games.pairMatch.enabled" type="checkbox" @change="syncPairMatches" /> Pair Match Play</label>
          <input v-model.number="form.games.pairMatch.pointsPerHole" class="form-input sm" type="number" min="1" placeholder="Pts/hole" />
          <select v-model="form.games.pairMatch.type" class="form-input sm"><option>net</option><option>gross</option></select>
        </div>

        <div v-if="form.games.pairMatch.enabled" class="pair-match-builder">
          <div v-for="(match, matchIndex) in pairMatches" :key="matchIndex" class="pair-match-row">
            <div class="pair-match-side">
              <select
                class="form-input pair-select"
                :value="match.a[0] || ''"
                @change="setPairMatchPlayer(matchIndex, 'a', 0, ($event.target as HTMLSelectElement).value)"
              >
                <option value="">Open</option>
                <option v-for="player in team1" :key="`a0-${matchIndex}-${player}`" :value="player">{{ player }}</option>
              </select>
              <select
                class="form-input pair-select"
                :value="match.a[1] || ''"
                @change="setPairMatchPlayer(matchIndex, 'a', 1, ($event.target as HTMLSelectElement).value)"
              >
                <option value="">Open</option>
                <option v-for="player in team1" :key="`a1-${matchIndex}-${player}`" :value="player">{{ player }}</option>
              </select>
            </div>
            <div class="pair-match-vs">vs</div>
            <div class="pair-match-side">
              <select
                class="form-input pair-select"
                :value="match.b[0] || ''"
                @change="setPairMatchPlayer(matchIndex, 'b', 0, ($event.target as HTMLSelectElement).value)"
              >
                <option value="">Open</option>
                <option v-for="player in team2" :key="`b0-${matchIndex}-${player}`" :value="player">{{ player }}</option>
              </select>
              <select
                class="form-input pair-select"
                :value="match.b[1] || ''"
                @change="setPairMatchPlayer(matchIndex, 'b', 1, ($event.target as HTMLSelectElement).value)"
              >
                <option value="">Open</option>
                <option v-for="player in team2" :key="`b1-${matchIndex}-${player}`" :value="player">{{ player }}</option>
              </select>
            </div>
          </div>
          <button class="btn-ghost pair-add" type="button" @click="addPairMatch">+ Add match</button>
        </div>

        <div class="game-row">
          <label class="game-toggle"><input v-model="form.games.h2h.enabled" type="checkbox" /> Head-to-Head</label>
          <input v-model.number="form.games.h2h.perMatchup" class="form-input sm" type="number" min="0" placeholder="$/matchup" />
          <select v-model="form.games.h2h.type" class="form-input sm"><option>net</option><option>gross</option></select>
        </div>

        <div class="game-row">
          <label class="game-toggle"><input v-model="form.games.stableford.enabled" type="checkbox" /> Stableford</label>
          <input v-model.number="form.games.stableford.buyIn" class="form-input sm" type="number" min="0" placeholder="Buy-in $" />
          <select v-model="form.games.stableford.type" class="form-input sm"><option>net</option><option>gross</option></select>
        </div>

        <div class="game-row">
          <label class="game-toggle"><input v-model="form.games.threeManNassau.enabled" type="checkbox" /> 3-Man Nassau</label>
          <input v-model.number="form.games.threeManNassau.amount" class="form-input sm" type="number" min="0" placeholder="$/opponent" />
          <select v-model="form.games.threeManNassau.type" class="form-input sm"><option>net</option><option>gross</option></select>
        </div>

        <div class="game-row">
          <label class="game-toggle"><input v-model="form.games.wolf.enabled" type="checkbox" /> Wolf</label>
          <input v-model.number="form.games.wolf.amount" class="form-input sm" type="number" min="0" placeholder="$/player" />
          <select v-model="form.games.wolf.type" class="form-input sm"><option>net</option><option>gross</option></select>
          <label class="game-toggle sm"><input v-model="form.games.wolf.nassau" type="checkbox" /> Nassau</label>
        </div>

        <div class="game-row">
          <label class="game-toggle"><input v-model="form.games.puttPoker.enabled" type="checkbox" /> Putt Poker</label>
          <input v-model.number="form.games.puttPoker.pot" class="form-input sm" type="number" min="0" placeholder="$/person" />
        </div>
      </div>
    </section>

    <ul v-if="errors.length" class="setup-errors">
      <li v-for="(err, i) in errors" :key="i">{{ err }}</li>
    </ul>

    <div class="setup-actions">
      <p v-if="store.syncError" class="sync-error">{{ store.syncError }}</p>
      <button class="btn-primary" type="button" :disabled="!canStart || store.starting" @click="startRound">
        {{ store.starting ? 'Starting...' : 'Start round →' }}
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

.btn-remove {
  border: 1px solid #d8c4c4;
  background: #f7ecec;
  color: #b1462f;
  border-radius: 6px;
  width: 32px;
  height: 32px;
  cursor: pointer;
}

.games-list {
  display: grid;
  gap: 10px;
}

.game-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.game-toggle {
  flex-direction: row;
  align-items: center;
  gap: 6px;
  min-width: 130px;
  font-weight: 700;
  color: #283b30;
}

.game-toggle.sm {
  min-width: auto;
  font-weight: 600;
}

.form-input.sm {
  max-width: 100px;
  padding: 5px 8px;
  font-size: 0.82rem;
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

.setup-errors {
  margin: 0 0 14px;
  padding: 12px 16px 12px 32px;
  border: 1px solid #e0c4c0;
  background: #f9eeec;
  border-radius: 8px;
  color: #a23b28;
  font-size: 0.85rem;
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
</style>
