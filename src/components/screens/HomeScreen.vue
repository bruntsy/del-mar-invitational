<script setup lang="ts">
import { useRouter } from 'vue-router';
import { demoRound } from '@/fixtures/demoRound';
import { useRoundStore } from '@/stores/round';

const appName = 'Del Mar Invitational';
const store = useRoundStore();
const router = useRouter();

function startDemo() {
  const { round, players } = demoRound();
  store.setRound(round, players);
  void router.push('/scorecard');
}

function newRound() {
  void router.push('/setup');
}

function openScorecard() {
  void router.push('/scorecard');
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
      <div class="home-actions">
        <button class="btn-primary" type="button" @click="newRound">New round</button>
        <button class="btn-ghost" type="button" @click="startDemo">Start demo round</button>
        <button class="btn-ghost" type="button" @click="openScorecard">Open scorecard</button>
      </div>
    </section>
  </main>
</template>

<style scoped>
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
</style>
