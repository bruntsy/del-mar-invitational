<script setup lang="ts">
const appName = 'Del Mar Invitational';
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
        Foundation scaffold is running.
      </div>
    </section>
  </main>
</template>
