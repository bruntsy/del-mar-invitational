<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { sortedGroupPlayers } from '@/domain/players';
import { hasSupabase } from '@/services/supabase';
import { useGroupStore } from '@/stores/group';
import { useHistoryStore } from '@/stores/history';

const store = useGroupStore();
const history = useHistoryStore();
const router = useRouter();

const newName = ref('');
const joinCode = ref('');
const renameValue = ref('');
const online = hasSupabase();
const rosterName = ref('');
const rosterHandicapIndex = ref<number | string>('');
const editingPlayer = ref('');
const editName = ref('');
const editHandicapIndex = ref<number | string>('');

const rosterPlayers = computed(() => sortedGroupPlayers(store.group?.players));

onMounted(() => {
  store.load();
  renameValue.value = store.group?.name ?? '';
  if (store.group?.id) void history.loadHistory(store.group.id);
});

function refreshHistory() {
  if (store.group?.id) void history.loadHistory(store.group.id);
  else history.clear();
}

async function create() {
  if (await store.createGroup(newName.value)) {
    newName.value = '';
    renameValue.value = store.group?.name ?? '';
    refreshHistory();
  }
}

async function join() {
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
  await store.renameGroup(renameValue.value);
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
  if (editingPlayer.value === name) cancelEditPlayer();
  await store.removePlayer(name);
}

function leave() {
  store.leaveGroup();
  renameValue.value = '';
  history.clear();
}

function goSetup() {
  void router.push('/setup');
}

function goHome() {
  void router.push('/');
}
</script>

<template>
  <main class="app-shell">
    <section class="panel">
      <p class="eyebrow">Groups</p>

      <!-- Active group -->
      <template v-if="store.hasGroup">
        <h1>{{ store.groupName }}</h1>
        <div class="code-badge">Group {{ store.groupCode }}</div>

        <label class="field">
          <span class="field-label">Group name</span>
          <div class="field-row">
            <input v-model="renameValue" class="form-input" type="text" placeholder="Group name" />
            <button class="btn-ghost" type="button" :disabled="store.busy" @click="rename">
              Save
            </button>
          </div>
        </label>

        <div class="home-actions">
          <button class="btn-primary" type="button" @click="goSetup">New round</button>
          <button class="btn-ghost" type="button" @click="goHome">Home</button>
          <button class="btn-ghost danger" type="button" @click="leave">Leave group</button>
        </div>

        <section class="roster">
          <span class="field-label">Roster</span>
          <div class="roster-add">
            <input v-model="rosterName" class="form-input" type="text" placeholder="Player name" @keyup.enter="addRosterPlayer" />
            <input
              v-model="rosterHandicapIndex"
              class="form-input idx-input"
              type="number"
              step="0.1"
              placeholder="Index"
              @keyup.enter="addRosterPlayer"
            />
            <button class="btn-primary" type="button" :disabled="store.busy" @click="addRosterPlayer">Add</button>
          </div>

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
                <div class="roster-meta">Idx {{ Number(player.handicapIndex || 0).toFixed(1).replace('.0', '') }}</div>
              </div>
              <div class="roster-actions">
                <button class="btn-ghost sm" type="button" @click="startEditPlayer(player.name, player.handicapIndex)">Edit</button>
                <button class="btn-ghost sm danger" type="button" :disabled="store.busy" @click="removeRosterPlayer(player.name)">Remove</button>
              </div>
            </template>
          </div>
        </section>

        <!-- Past rounds (online only) -->
        <section v-if="online" class="history">
          <span class="field-label">Past rounds</span>
          <p v-if="history.loading" class="hint">Loading…</p>
          <p v-else-if="history.error" class="status error">{{ history.error }}</p>
          <p v-else-if="!history.rounds.length" class="hint">No completed rounds yet.</p>
          <div v-for="round in history.rounds" :key="round.id ?? round.completedAt ?? round.courseName" class="hist-card">
            <div class="hist-hdr">
              <div class="hist-course">{{ round.courseName }}</div>
              <div class="hist-date">{{ formatDate(round.completedAt) }}</div>
            </div>
            <table class="hist-table">
              <thead>
                <tr><th>Player</th><th>Team</th><th>Net</th><th>Skins</th></tr>
              </thead>
              <tbody>
                <tr v-for="p in round.players" :key="p.name">
                  <td><strong>{{ p.name }}</strong></td>
                  <td>{{ p.team }}</td>
                  <td>{{ p.net }}</td>
                  <td>{{ p.skins > 0 ? p.skins : '—' }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      </template>

      <!-- No active group -->
      <template v-else>
        <h1>Join a group</h1>
        <p class="lede">Create a new group or join one with a 4-character code.</p>

        <label class="field">
          <span class="field-label">Create group</span>
          <div class="field-row">
            <input
              v-model="newName"
              class="form-input"
              type="text"
              placeholder="Group name"
              @keyup.enter="create"
            />
            <button class="btn-primary" type="button" :disabled="store.busy" @click="create">
              Create
            </button>
          </div>
        </label>

        <label class="field">
          <span class="field-label">Join with code</span>
          <div class="field-row">
            <input
              v-model="joinCode"
              class="form-input"
              type="text"
              maxlength="4"
              placeholder="ABCD"
              :disabled="!online"
              @keyup.enter="join"
            />
            <button class="btn-ghost" type="button" :disabled="store.busy || !online" @click="join">
              Join
            </button>
          </div>
        </label>
        <p v-if="!online" class="hint">Online sync is not configured; joining is unavailable.</p>

        <div v-if="store.recentGroups.length" class="recent">
          <span class="field-label">Recent groups</span>
          <div v-for="g in store.recentGroups" :key="g.roomCode" class="recent-row">
            <div>
              <div class="recent-name">{{ g.name }}</div>
              <div class="recent-meta">Group {{ g.roomCode }}</div>
            </div>
            <div class="recent-actions">
              <button class="btn-ghost sm" type="button" @click="openRecent(g.roomCode)">Open</button>
              <button class="btn-ghost sm" type="button" @click="store.forgetRecentGroup(g.roomCode)">
                Forget
              </button>
            </div>
          </div>
        </div>

        <div class="home-actions">
          <button class="btn-ghost" type="button" @click="goHome">Home</button>
        </div>
      </template>

      <p v-if="store.status" class="status" :class="{ error: store.statusError }">
        {{ store.status }}
      </p>
    </section>
  </main>
</template>

<style scoped>
.code-badge {
  display: inline-block;
  margin: 12px 0 4px;
  border: 1px solid #cdbf9f;
  border-radius: 6px;
  padding: 4px 12px;
  color: #8a672f;
  font-weight: 800;
  letter-spacing: 0.18em;
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
  padding: 10px 12px;
  background: #fffdf7;
  color: #1f2a24;
}

.home-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 24px;
}

.btn-primary,
.btn-ghost {
  border-radius: 6px;
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
}

.idx-input {
  max-width: 110px;
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

.hist-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.85rem;
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
