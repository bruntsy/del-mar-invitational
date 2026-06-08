<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { hasSupabase } from '@/services/supabase';
import { useGroupStore } from '@/stores/group';

const store = useGroupStore();
const router = useRouter();

const newName = ref('');
const joinCode = ref('');
const renameValue = ref('');
const online = hasSupabase();

onMounted(() => {
  store.load();
  renameValue.value = store.group?.name ?? '';
});

async function create() {
  if (await store.createGroup(newName.value)) {
    newName.value = '';
    renameValue.value = store.group?.name ?? '';
  }
}

async function join() {
  if (await store.joinGroup(joinCode.value)) {
    joinCode.value = '';
    renameValue.value = store.group?.name ?? '';
  }
}

async function openRecent(code: string) {
  if (await store.switchToRecentGroup(code)) {
    renameValue.value = store.group?.name ?? '';
  }
}

async function rename() {
  await store.renameGroup(renameValue.value);
}

function leave() {
  store.leaveGroup();
  renameValue.value = '';
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
  letter-spacing: 0.06em;
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

.btn-primary:disabled,
.btn-ghost:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.recent {
  margin-top: 24px;
}

.recent-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  border: 1px solid #e0d7c4;
  border-radius: 6px;
  padding: 10px 12px;
  margin-top: 8px;
}

.recent-name {
  font-weight: 700;
  color: #24362c;
}

.recent-meta {
  color: #7a8a7f;
  font-size: 0.8rem;
  letter-spacing: 0.08em;
}

.recent-actions {
  display: flex;
  gap: 8px;
}

.hint {
  margin: 8px 0 0;
  color: #7a8a7f;
  font-size: 0.85rem;
}

.status {
  margin: 16px 0 0;
  color: #4a5a4f;
  font-weight: 600;
}

.status.error {
  color: #c0392b;
}
</style>
