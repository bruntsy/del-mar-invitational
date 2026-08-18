<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { demoRound } from '@/fixtures/demoRound';
import { courseDisplayName } from '@/domain/round';
import { useRoundStore } from '@/stores/round';

const appName = 'Del Mar Invitational';
const store = useRoundStore();
const router = useRouter();

onMounted(() => {
  if (!store.round) store.load();
});

const resumeCard = computed(() => {
  const round = store.round;
  if (!round) return null;
  const status = store.roundStatus;
  const subtext = `${courseDisplayName(round.course)} · ${store.holesScoredCount} of 18 holes scored`;
  if (status === 'completed') return { label: 'View results', to: '/results', subtext };
  if (status === 'in_progress') return { label: 'Resume round', to: '/scorecard', subtext };
  return { label: 'Continue setup', to: '/setup?edit=1', subtext };
});

function startDemo() {
  const { round, players } = demoRound();
  store.setRound(round, players);
  void router.push('/scorecard');
}

function openGroups() {
  void router.push({ path: '/group', query: { view: 'groups' } });
}

function newRound() {
  void router.push('/setup');
}

function resume() {
  if (resumeCard.value) void router.push(resumeCard.value.to);
}
</script>

<template>
  <main class="app-shell">
    <section class="panel">
      <p class="eyebrow">Rewrite Preview</p>
      <h1>{{ appName }}</h1>
      <p class="lede">
        Vue, TypeScript, Pinia, and a pure scoring engine are coming online.
      </p>
      <div class="status-row">
        <span class="status-dot" aria-hidden="true"></span>
        Live scorecard wired to the new engine.
      </div>
      <button v-if="resumeCard" class="resume-card" type="button" @click="resume">
        <span class="resume-label">{{ resumeCard.label }} →</span>
        <span class="resume-sub">{{ resumeCard.subtext }}</span>
      </button>

      <div class="home-actions">
        <button class="btn-primary" type="button" @click="openGroups">Groups</button>
        <button class="btn-ghost" type="button" @click="newRound">Start new round</button>
        <button class="btn-ghost" type="button" @click="startDemo">Start demo round</button>
      </div>
    </section>
  </main>
</template>

<style scoped>
.resume-card {
  display: flex;
  flex-direction: column;
  gap: 3px;
  align-items: flex-start;
  width: 100%;
  margin-top: 24px;
  padding: 14px 18px;
  border: 1px solid #2f5d43;
  border-radius: 8px;
  background: #eaf3ec;
  cursor: pointer;
  text-align: left;
}

.resume-card:hover {
  background: #def0e3;
}

.resume-label {
  font-size: 1rem;
  font-weight: 800;
  color: #2f5d43;
}

.resume-sub {
  font-size: 0.8rem;
  color: #5a6a5f;
}

.home-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 16px;
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
</style>
