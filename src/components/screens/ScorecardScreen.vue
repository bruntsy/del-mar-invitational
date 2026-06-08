<script setup lang="ts">
import { computed, onMounted, reactive } from 'vue';
import { useRouter } from 'vue-router';
import { getsStroke } from '@/scoring/handicap';
import { puttPenaltyNote } from '@/scoring/puttPoker';
import { useRoundStore } from '@/stores/round';

const store = useRoundStore();
const router = useRouter();

onMounted(() => {
  if (!store.round) store.load();
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
</script>

<template>
  <main class="sc-shell">
    <template v-if="store.round && course">
      <header class="sc-topbar">
        <div>
          <h1 class="sc-title">{{ courseTitle }}</h1>
          <p class="sc-sub">{{ courseSub }}</p>
        </div>
        <button class="btn-ghost" type="button" @click="goHome">← Home</button>
      </header>

      <div class="sc-table-wrap">
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
            <template v-for="team in teamRows" :key="team.key">
              <tr class="row-team-divider">
                <td :colspan="24">{{ team.label }} — {{ team.players.join(' · ') }}</td>
              </tr>
              <template v-for="player in team.players" :key="player">
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
            </template>
          </tbody>
        </table>
      </div>

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

.row-team-divider td {
  background: #2f5d43;
  color: #f3efe2;
  text-align: left;
  font-weight: 700;
  letter-spacing: 0.04em;
  font-size: 0.78rem;
}

.name-cell {
  text-align: left;
  min-width: 120px;
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
.sc-settlement {
  margin-top: 24px;
  border: 1px solid #d7cebd;
  border-radius: 8px;
  background: #f8f4ea;
  padding: 16px 20px;
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
