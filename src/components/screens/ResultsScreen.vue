<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useRoundStore } from '@/stores/round';
import { puttPenaltyNote } from '@/scoring/puttPoker';

const store = useRoundStore();
const router = useRouter();

onMounted(() => {
  if (!store.round) store.load();
});

const course = computed(() => store.course);
const courseTitle = computed(() => {
  const c = course.value;
  if (!c) return '';
  return [c.clubName, c.courseName].filter(Boolean).join(' — ') || c.courseName || c.clubName || 'Course';
});

const teamNames = computed(() => store.round?.teamNames ?? { team1: 'Team 1', team2: 'Team 2' });
const teamMembers = computed(() => ({
  team1: store.round?.team1 ?? [],
  team2: store.round?.team2 ?? [],
}));

const leaderboard = computed(() => store.leaderboard);
const teamNet = computed(() => store.teamNetTotals);
const teamGameResults = computed(() => store.teamGameResults);
const hasPrimaryMatchPlayGame = computed(() =>
  Boolean(
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
const completed = computed(() => store.round?.completed ?? false);

interface SegmentDisplayRow {
  label: string;
  a: number | null;
  b: number | null;
  winnerSide: 'a' | 'b' | null;
  status: 'win' | 'push' | 'open';
  stake: number;
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

const bestBallAggyResults = computed(() =>
  store.bestBallAggyResults.map((r, index) => {
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
  store.highBallLowBallResults.map((r, index) => {
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
        segmentRow('Low Ball — Front', r.segmentResults.lowBall.front, aId, bId, mode),
        segmentRow('Low Ball — Back', r.segmentResults.lowBall.back, aId, bId, mode),
        segmentRow('Low Ball — Overall', r.segmentResults.lowBall.overall, aId, bId, mode),
        segmentRow('High Ball — Front', r.segmentResults.highBall.front, aId, bId, mode),
        segmentRow('High Ball — Back', r.segmentResults.highBall.back, aId, bId, mode),
        segmentRow('High Ball — Overall', r.segmentResults.highBall.overall, aId, bId, mode),
      ],
    };
  }),
);

const twoManScrambleResults = computed(() =>
  store.twoManScrambleResults.map((r, index) => {
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

function dash(value: number | null | undefined): string {
  return value == null ? '—' : String(value);
}

function toggleComplete() {
  store.setCompleted(!completed.value);
}

function resetRound() {
  store.reset();
  void router.push('/');
}

function goScorecard() {
  void router.push('/scorecard');
}

function goHome() {
  void router.push('/');
}
</script>

<template>
  <main class="rs-shell">
    <template v-if="store.round && course">
      <header class="rs-topbar">
        <div>
          <p class="rs-eyebrow">{{ completed ? '✓ Round Complete' : 'Final Results' }}</p>
          <h1 class="rs-title">{{ courseTitle }}</h1>
        </div>
        <div class="rs-actions">
          <button class="btn-complete" type="button" @click="toggleComplete">
            {{ completed ? 'Reopen round' : 'Complete round ✓' }}
          </button>
          <button class="btn-ghost" type="button" @click="goScorecard">← Scorecard</button>
          <button class="btn-danger" type="button" @click="resetRound">Reset round</button>
        </div>
      </header>

      <section v-if="!hasPrimaryMatchPlayGame" class="rs-section">
        <h2 class="rs-section-hdr">Team Scores</h2>
        <div class="team-grid">
          <div class="team-box" :class="{ winner: teamOutcome.t1Win }">
            <div class="tb-label">{{ teamNames.team1 }}</div>
            <div class="tb-members">{{ teamMembers.team1.join(', ') }}</div>
            <div class="tb-score" :class="{ 'winner-score': teamOutcome.t1Win }">{{ dash(teamNet.team1) }}</div>
            <div class="tb-tag" :class="{ 'winner-tag': teamOutcome.t1Win }">
              {{ teamOutcome.t1Win ? 'Winners' : teamNet.team1 == null ? 'In progress' : '' }}
            </div>
          </div>
          <div class="team-vs">vs</div>
          <div class="team-box" :class="{ winner: teamOutcome.t2Win }">
            <div class="tb-label">{{ teamNames.team2 }}</div>
            <div class="tb-members">{{ teamMembers.team2.join(', ') }}</div>
            <div class="tb-score" :class="{ 'winner-score': teamOutcome.t2Win }">{{ dash(teamNet.team2) }}</div>
            <div class="tb-tag" :class="{ 'winner-tag': teamOutcome.t2Win }">
              {{ teamOutcome.t2Win ? 'Winners' : teamOutcome.tied ? 'All square' : teamNet.team2 == null ? 'In progress' : '' }}
            </div>
          </div>
        </div>
      </section>

      <section class="rs-section">
        <h2 class="rs-section-hdr">Individual Leaderboard</h2>
        <div class="rs-table-wrap">
          <table class="rs-table">
            <thead>
              <tr><th>#</th><th class="col-left">Player</th><th class="col-left">Team</th><th>Gross</th><th>Strokes</th><th>Net</th><th>Skins</th></tr>
            </thead>
            <tbody>
              <tr v-for="(row, i) in leaderboard" :key="row.player">
                <td class="rs-rank">{{ i + 1 }}</td>
                <td class="col-left">
                  <span :class="{ 'rs-winner': i === 0 && row.net != null }">{{ row.player }}</span>
                </td>
                <td class="col-left">{{ row.team }}</td>
                <td>{{ dash(row.gross) }}</td>
                <td>{{ row.strokes > 0 ? `+${row.strokes}` : '—' }}</td>
                <td class="rs-net">{{ dash(row.net) }}</td>
                <td class="rs-skins">{{ row.skins > 0 ? row.skins : '—' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section v-if="store.hasBets" class="rs-section">
        <h2 class="rs-section-hdr">Settlement</h2>
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

      <section v-if="teamGameResults.length" class="rs-section">
        <h2 class="rs-section-hdr">Team Game Results</h2>
        <div v-for="game in teamGameResults" :key="game.key" class="fc-game">
          <div class="fc-game-label">{{ game.label }} <span class="fc-type">{{ game.type }}</span></div>
          <div class="fc-grid">
            <div class="fc-box">
              <div class="fc-team">{{ teamNames.team1 }}</div>
              <div class="fc-split">
                <div><span class="fc-sub">Front</span><span class="fc-val">{{ dash(game.team1.front) }}</span></div>
                <div><span class="fc-sub">Back</span><span class="fc-val">{{ dash(game.team1.back) }}</span></div>
              </div>
              <div class="fc-total-label">Total</div>
              <div class="fc-score">{{ dash(game.team1.total) }}</div>
            </div>
            <div class="fc-vs">vs</div>
            <div class="fc-box">
              <div class="fc-team">{{ teamNames.team2 }}</div>
              <div class="fc-split">
                <div><span class="fc-sub">Front</span><span class="fc-val">{{ dash(game.team2.front) }}</span></div>
                <div><span class="fc-sub">Back</span><span class="fc-val">{{ dash(game.team2.back) }}</span></div>
              </div>
              <div class="fc-total-label">Total</div>
              <div class="fc-score">{{ dash(game.team2.total) }}</div>
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
                <td class="bba-bet">{{ row.label }}</td>
                <td :class="{ 'bba-win': row.winnerSide === 'a' }">{{ dash(row.a) }}</td>
                <td :class="{ 'bba-win': row.winnerSide === 'b' }">{{ dash(row.b) }}</td>
                <td class="bba-result">{{ outcomeLabel(row, match.aName, match.bName) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section v-if="highBallLowBallResults.length" class="rs-section">
        <h2 class="rs-section-hdr">High Ball / Low Ball</h2>
        <div v-for="match in highBallLowBallResults" :key="`hbl-${match.index}`" class="bba-match">
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
                <td class="bba-bet">{{ row.label }}</td>
                <td :class="{ 'bba-win': row.winnerSide === 'a' }">{{ dash(row.a) }}</td>
                <td :class="{ 'bba-win': row.winnerSide === 'b' }">{{ dash(row.b) }}</td>
                <td class="bba-result">{{ outcomeLabel(row, match.aName, match.bName) }}</td>
              </tr>
            </tbody>
          </table>
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
                <td class="bba-result">{{ outcomeLabel(row, match.aName, match.bName) }}</td>
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
            <div class="pp-coin">
              Coin:
              <strong v-if="group.result.coinHolder">{{ group.result.coinHolder }}</strong>
              <em v-else class="pp-coin-none">no 3-putts yet</em>
            </div>
            <div class="pp-cards">
              <div v-for="player in group.players" :key="player" class="pp-player">
                <div class="pp-player-name">{{ player }}</div>
                <div class="pp-card-count">🃏 × {{ group.result.cards[player] }}</div>
                <div
                  v-if="puttPenaltyNote(group.result.threePuttCount[player], group.result.fourPuttCount[player])"
                  class="pp-note"
                >
                  {{ puttPenaltyNote(group.result.threePuttCount[player], group.result.fourPuttCount[player]) }}
                </div>
              </div>
            </div>
            <div class="pp-pot">Pot: <strong>${{ group.result.pot }}</strong></div>
          </div>
        </div>
      </section>

      <section v-if="skinsEnabled" class="rs-section">
        <h2 class="rs-section-hdr">Skins Breakdown</h2>
        <p v-if="!skinHoles.length" class="rs-empty-note">No completed holes yet.</p>
        <div v-else class="skins-grid">
          <div v-for="h in skinHoles" :key="h.hole" class="skin-chip" :class="{ tied: h.tied }">
            <span class="skin-hole">{{ h.hole }}</span>
            <span class="skin-winner">{{ h.tied ? 'Tied' : h.winner }}</span>
          </div>
        </div>
      </section>
    </template>

    <section v-else class="panel rs-empty">
      <p class="eyebrow">Results</p>
      <h1>No active round</h1>
      <p class="lede">Start or score a round to see results.</p>
      <div class="rs-empty-actions">
        <button class="btn-primary" type="button" @click="goHome">Home</button>
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

.rs-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
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
}

.team-box.winner {
  border-color: #c9a14a;
  background: #fcf6e6;
  box-shadow: 0 0 0 1px #c9a14a inset;
}

.tb-label {
  font-weight: 700;
  color: #2f5d43;
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

.tb-score.winner-score { color: #b08416; }

.tb-tag {
  font-size: 0.72rem;
  color: #8a9489;
  margin-top: 4px;
  font-style: italic;
  min-height: 1em;
}

.tb-tag.winner-tag { color: #b08416; font-weight: 700; font-style: normal; }

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

.bba-table .bba-bet {
  text-align: left;
  font-weight: 600;
  color: #3a4a40;
}

.bba-table tbody tr:nth-child(3),
.bba-table tbody tr:nth-child(6) {
  border-bottom: 2px solid #d7cebd;
}

.bba-table tbody tr:nth-child(4) .bba-bet {
  color: #8a672f;
}

.bba-table .bba-result {
  font-weight: 700;
  color: #2f5d43;
}

.bba-table .bba-win {
  font-weight: 800;
  color: #2f5d43;
}

.bba-table tr.status-push .bba-result {
  color: #8a672f;
}

.bba-table tr.status-open .bba-result {
  color: #9aa49a;
  font-weight: 600;
}

.bba-error {
  color: #a3433a;
  font-size: 0.85rem;
}
.rs-skins { color: #8a672f; }

.pnl-table {
  border-collapse: collapse;
  min-width: 260px;
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

.fc-box { flex: 1; text-align: center; }

.fc-team {
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: #6a7a6f;
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

.skins-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.skin-chip {
  display: flex;
  flex-direction: column;
  align-items: center;
  min-width: 48px;
  border: 1px solid #e4ddcd;
  border-radius: 6px;
  background: #fdfbf4;
  padding: 6px 8px;
}

.skin-chip.tied { opacity: 0.55; }

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

.skin-chip.tied .skin-winner { color: #9aa49a; font-style: italic; }

.nassau-table { min-width: 500px; }
.nassau-result { font-weight: 700; }
.nassau-note { margin-top: 10px; font-size: 0.78rem; color: #6a7a6f; }

.pp-groups { display: flex; flex-wrap: wrap; gap: 16px; }
.pp-group { flex: 1; min-width: 180px; border: 1px solid #e4ddcd; border-radius: 8px; background: #fdfbf4; padding: 12px 14px; }
.pp-group-hdr { font-weight: 800; color: #2f5d43; margin-bottom: 8px; font-size: 0.82rem; text-transform: uppercase; letter-spacing: 0.06em; }
.pp-coin { font-size: 0.82rem; color: #4a5a4f; margin-bottom: 8px; }
.pp-coin-none { color: #9aa49a; font-style: italic; }
.pp-cards { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 10px; }
.pp-player { text-align: center; min-width: 54px; }
.pp-player-name { font-size: 0.72rem; color: #6a7a6f; font-weight: 700; }
.pp-card-count { font-size: 0.88rem; font-weight: 700; color: #2f5d43; }
.pp-note { font-size: 0.68rem; color: #b1462f; }
.pp-pot { font-size: 0.82rem; color: #24362c; border-top: 1px solid #e4ddcd; padding-top: 8px; }

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
</style>
