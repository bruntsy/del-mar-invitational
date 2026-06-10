<script setup lang="ts">
import { ref } from 'vue';
import type { EventRoundConfig } from '@/types/event';
import type { Event, EventConfig } from '@/types/event';
import { eventFormatLabel, normalizeEventConfig } from '@/domain/events';
import { autoPlayingGroupsFromPairMatches } from '@/domain/playingGroups';

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

function movePlayer(player: string, from: 'team1' | 'team2') {
  const to = from === 'team1' ? 'team2' : 'team1';
  draft.value[from] = draft.value[from].filter((p) => p !== player);
  draft.value[to] = [...draft.value[to], player];
  // Purge stale player refs from pair matches
  for (let i = 0; i < draft.value.rounds.length; i++) {
    const round = draft.value.rounds[i];
    round.pairMatches = round.pairMatches
      .map((m) => ({
        a: m.a.filter((p) => draft.value.team1.includes(p)),
        b: m.b.filter((p) => draft.value.team2.includes(p)),
      }))
      .filter((m) => m.a.length > 0 || m.b.length > 0);
    recomputePlayingGroups(i);
  }
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
  draft.value.rounds[roundIndex].pairMatches = draft.value.rounds[roundIndex].pairMatches.filter(
    (_, i) => i !== matchIndex,
  );
  recomputePlayingGroups(roundIndex);
}

function save() {
  const normalized = normalizeEventConfig(draft.value, props.groupPlayers);
  emit('save', normalized, draftName.value.trim() || props.event.name);
}


</script>

<template>
  <div class="ece">
    <!-- Event name -->
    <div class="ece-section">
      <label class="ece-label">Event name</label>
      <input v-model="draftName" class="form-input" type="text" />
    </div>

    <!-- Team names -->
    <div class="ece-section">
      <label class="ece-label">Team names</label>
      <div class="ece-row">
        <input v-model="draft.teamNames.team1" class="form-input" type="text" placeholder="Team A" />
        <span class="ece-vs">vs</span>
        <input v-model="draft.teamNames.team2" class="form-input" type="text" placeholder="Team B" />
      </div>
    </div>

    <!-- Team rosters -->
    <div class="ece-section">
      <label class="ece-label">Rosters</label>
      <div class="ece-teams">
        <div class="ece-team">
          <div class="ece-team-name">{{ draft.teamNames.team1 || 'Team A' }}</div>
          <div v-for="player in draft.team1" :key="player" class="ece-player-row">
            <span class="ece-player-name">{{ player }}</span>
            <button class="btn-ghost xs" type="button" @click="movePlayer(player, 'team1')">→</button>
          </div>
          <p v-if="!draft.team1.length" class="ece-empty">No players</p>
        </div>
        <div class="ece-team">
          <div class="ece-team-name">{{ draft.teamNames.team2 || 'Team B' }}</div>
          <div v-for="player in draft.team2" :key="player" class="ece-player-row">
            <button class="btn-ghost xs" type="button" @click="movePlayer(player, 'team2')">←</button>
            <span class="ece-player-name">{{ player }}</span>
          </div>
          <p v-if="!draft.team2.length" class="ece-empty">No players</p>
        </div>
      </div>
    </div>

    <!-- Per-round config -->
    <div class="ece-section">
      <label class="ece-label">Rounds</label>
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
          <span class="ece-round-toggle-name">{{ round.name || `Round ${ri + 1}` }}</span>
          <span class="ece-round-toggle-meta">{{ eventFormatLabel(round.format) }}</span>
          <span class="ece-round-caret">{{ openRound === ri ? '▲' : '▼' }}</span>
        </button>

        <div v-if="openRound === ri" class="ece-round-body">
          <!-- Round name -->
          <div class="ece-field">
            <label class="ece-sublabel">Name</label>
            <input v-model="round.name" class="form-input" type="text" :placeholder="`Round ${ri + 1}`" />
          </div>

          <!-- Format -->
          <div class="ece-field">
            <label class="ece-sublabel">Base format</label>
            <div class="ece-seg">
              <button class="ece-seg-btn" :class="{ active: roundBase(round) === 'bestBall' }" type="button" @click="setRoundBase(ri, 'bestBall')">Best Ball</button>
              <button class="ece-seg-btn" :class="{ active: roundBase(round) === 'scramble' }" type="button" @click="setRoundBase(ri, 'scramble')">Scramble</button>
              <button class="ece-seg-btn" :class="{ active: roundBase(round) === 'custom' }" type="button" @click="setRoundBase(ri, 'custom')">Custom</button>
            </div>
          </div>

          <!-- Nassau / Full Round (scramble only) -->
          <div v-if="roundBase(round) === 'scramble'" class="ece-field">
            <label class="ece-sublabel">Scoring structure</label>
            <div class="ece-seg">
              <button class="ece-seg-btn" :class="{ active: roundNassau(round) }" type="button" @click="setRoundNassau(ri, true)">Nassau</button>
              <button class="ece-seg-btn" :class="{ active: !roundNassau(round) }" type="button" @click="setRoundNassau(ri, false)">Full Round</button>
            </div>
          </div>

          <!-- Variant (Best Ball base) -->
          <div v-if="roundBase(round) === 'bestBall'" class="ece-field">
            <label class="ece-sublabel">Variant</label>
            <div class="ece-seg">
              <button class="ece-seg-btn" :class="{ active: roundVariant(round) === 'nassau' }" type="button" @click="setRoundVariant(ri, 'nassau')">Nassau</button>
              <button class="ece-seg-btn" :class="{ active: roundVariant(round) === 'aggy' }" type="button" @click="setRoundVariant(ri, 'aggy')">Best Ball + Aggy</button>
              <button class="ece-seg-btn" :class="{ active: roundVariant(round) === 'highLow' }" type="button" @click="setRoundVariant(ri, 'highLow')">High Ball / Low Ball</button>
            </div>
          </div>

          <!-- Scoring Mode -->
          <div class="ece-field">
            <label class="ece-sublabel">Scoring Mode</label>
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
          </div>

          <!-- Best Ball Bet (bestBall base) -->
          <template v-if="roundBase(round) === 'bestBall'">
            <div class="ece-field">
              <label class="ece-sublabel">Best Ball Bet</label>
              <div class="ece-row ece-points-row">
                <template v-if="roundNassau(round)">
                  <label class="ece-pts-label">Front
                    <input v-model.number="round.bestBallBet.front" class="form-input ece-pts-input" type="number" min="0" placeholder="$" />
                  </label>
                  <label class="ece-pts-label">Back
                    <input v-model.number="round.bestBallBet.back" class="form-input ece-pts-input" type="number" min="0" placeholder="$" />
                  </label>
                </template>
                <label class="ece-pts-label">Total
                  <input v-model.number="round.bestBallBet.total" class="form-input ece-pts-input" type="number" min="0" placeholder="$" />
                </label>
                <select v-model="round.bestBallBet.type" class="form-input ece-type-select">
                  <option value="net">Net</option>
                  <option value="gross">Gross</option>
                </select>
              </div>
            </div>
          </template>

          <!-- Scramble Bet (scramble base) -->
          <template v-if="roundBase(round) === 'scramble'">
            <div class="ece-field">
              <label class="ece-sublabel">Scramble Bet</label>
              <div class="ece-row ece-points-row">
                <template v-if="roundNassau(round)">
                  <label class="ece-pts-label">Front
                    <input v-model.number="round.scrambleBet.front" class="form-input ece-pts-input" type="number" min="0" placeholder="$" />
                  </label>
                  <label class="ece-pts-label">Back
                    <input v-model.number="round.scrambleBet.back" class="form-input ece-pts-input" type="number" min="0" placeholder="$" />
                  </label>
                </template>
                <label class="ece-pts-label">Total
                  <input v-model.number="round.scrambleBet.total" class="form-input ece-pts-input" type="number" min="0" placeholder="$" />
                </label>
              </div>
            </div>
          </template>

          <!-- Points: 6 per-component fields for combo games (BB+Aggy, HB/LB), 3 otherwise -->
          <div class="ece-field">
            <label class="ece-sublabel">Points</label>
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
              <label class="ece-pts-label">Front
                <input v-model.number="round.points.front" class="form-input ece-pts-input" type="number" min="0" />
              </label>
              <label class="ece-pts-label">Back
                <input v-model.number="round.points.back" class="form-input ece-pts-input" type="number" min="0" />
              </label>
              <label class="ece-pts-label">Total
                <input v-model.number="round.points.total" class="form-input ece-pts-input" type="number" min="0" />
              </label>
            </div>
          </div>

          <!-- Pair matches (not used for full-round scramble) -->
          <template v-if="!(roundBase(round) === 'scramble' && !roundNassau(round))">
            <div class="ece-field">
              <label class="ece-sublabel">Pair matches</label>
              <div v-for="(match, mi) in round.pairMatches" :key="mi" class="ece-match">
                <span class="ece-match-num">{{ mi + 1 }}</span>
                <div class="ece-match-sides">
                  <div class="ece-match-side">
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
                <button class="btn-ghost xs danger" type="button" @click="removeMatch(ri, mi)">✕</button>
              </div>
              <button class="btn-ghost sm" type="button" @click="addMatch(ri)">+ Add match</button>
            </div>
          </template>

          <!-- Skins -->
          <div class="ece-field ece-inline-field">
            <label class="ece-sublabel">
              <input v-model="round.skins.enabled" type="checkbox" />
              Skins
            </label>
            <template v-if="round.skins.enabled">
              <input v-model.number="round.skins.pot" class="form-input ece-money-input" type="number" min="0" placeholder="Pot $" />
              <select v-model="round.skins.type" class="form-input ece-type-select">
                <option value="gross">Gross</option>
                <option value="net">Net</option>
              </select>
            </template>
          </div>

          <!-- Putt Poker -->
          <div class="ece-field ece-inline-field">
            <label class="ece-sublabel">
              <input v-model="round.puttPoker.enabled" type="checkbox" />
              Putt poker
            </label>
            <template v-if="round.puttPoker.enabled">
              <input v-model.number="round.puttPoker.pot" class="form-input ece-money-input" type="number" min="0" placeholder="Buy-in $" />
            </template>
          </div>
        </div>
      </div>
    </div>

    <!-- Actions -->
    <div class="ece-actions">
      <button class="btn-ghost" type="button" @click="emit('cancel')">Cancel</button>
      <button class="btn-primary" type="button" @click="save">Save</button>
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
</style>
