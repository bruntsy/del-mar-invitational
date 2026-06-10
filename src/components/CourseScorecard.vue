<script setup lang="ts">
import { computed } from 'vue';
import type { Course } from '@/types';

const props = defineProps<{ course: Course }>();

const FRONT = Array.from({ length: 9 }, (_, i) => i);
const BACK = Array.from({ length: 9 }, (_, i) => i + 9);

const par = computed(() => props.course.par ?? []);
const si = computed(() => props.course.si ?? []);
const yds = computed(() => props.course.yds ?? []);

function sum(values: number[], holes: number[]) {
  return holes.reduce((total, h) => total + (Number(values[h]) || 0), 0);
}

const outPar = computed(() => sum(par.value, FRONT));
const inPar = computed(() => sum(par.value, BACK));
const outYds = computed(() => sum(yds.value, FRONT));
const inYds = computed(() => sum(yds.value, BACK));
const hasYards = computed(() => yds.value.some((y) => Number(y) > 0));

const title = computed(() =>
  [props.course.clubName, props.course.courseName].filter(Boolean).join(' — ') || 'Course',
);

const meta = computed(() => {
  const tee = props.course.tee;
  return [
    tee?.name ? `${tee.name} tees` : '',
    tee?.gender || '',
    props.course.location || '',
    tee?.rating ? `Rating ${tee.rating}` : '',
    tee?.slope ? `Slope ${tee.slope}` : '',
  ].filter(Boolean).join(' · ');
});
</script>

<template>
  <div class="cs-card">
    <div class="cs-head">
      <div class="cs-title">{{ title }}</div>
      <div class="cs-meta">{{ meta }}</div>
    </div>
    <div class="cs-table-wrap">
      <table class="cs-table">
        <thead>
          <tr>
            <th class="cs-rowlabel">Hole</th>
            <th v-for="h in FRONT" :key="`h-${h}`">{{ h + 1 }}</th>
            <th class="cs-sub">Out</th>
            <th v-for="h in BACK" :key="`h-${h}`">{{ h + 1 }}</th>
            <th class="cs-sub">In</th>
            <th class="cs-tot">Total</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <th class="cs-rowlabel">Par</th>
            <td v-for="h in FRONT" :key="`p-${h}`">{{ par[h] }}</td>
            <td class="cs-sub">{{ outPar }}</td>
            <td v-for="h in BACK" :key="`p-${h}`">{{ par[h] }}</td>
            <td class="cs-sub">{{ inPar }}</td>
            <td class="cs-tot">{{ outPar + inPar }}</td>
          </tr>
          <tr v-if="hasYards">
            <th class="cs-rowlabel">Yards</th>
            <td v-for="h in FRONT" :key="`y-${h}`">{{ yds[h] || '—' }}</td>
            <td class="cs-sub">{{ outYds }}</td>
            <td v-for="h in BACK" :key="`y-${h}`">{{ yds[h] || '—' }}</td>
            <td class="cs-sub">{{ inYds }}</td>
            <td class="cs-tot">{{ outYds + inYds }}</td>
          </tr>
          <tr>
            <th class="cs-rowlabel">HCP</th>
            <td v-for="h in FRONT" :key="`s-${h}`">{{ si[h] }}</td>
            <td class="cs-sub"></td>
            <td v-for="h in BACK" :key="`s-${h}`">{{ si[h] }}</td>
            <td class="cs-sub"></td>
            <td class="cs-tot"></td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style scoped>
.cs-card {
  border: 1px solid #d7cebd;
  border-radius: 8px;
  background: #fdfbf4;
  overflow: hidden;
}

.cs-head {
  padding: 10px 12px;
  border-bottom: 1px solid #e4ddcd;
}

.cs-title {
  font-size: 1.05rem;
  font-weight: 700;
  color: #24362c;
}

.cs-meta {
  margin-top: 2px;
  font-size: 0.76rem;
  color: #7a8a7f;
}

.cs-table-wrap {
  overflow-x: auto;
}

.cs-table {
  border-collapse: collapse;
  width: 100%;
  font-size: 0.78rem;
  white-space: nowrap;
}

.cs-table th,
.cs-table td {
  border: 1px solid #e4ddcd;
  padding: 5px 7px;
  text-align: center;
  color: #283b30;
  min-width: 30px;
}

.cs-table thead th {
  background: #2f5d43;
  color: #f3efe2;
  font-weight: 700;
}

.cs-rowlabel {
  text-align: left;
  background: #f2ecdd;
  font-weight: 700;
  color: #4a5a4f;
  position: sticky;
  left: 0;
}

.cs-table thead .cs-rowlabel {
  background: #244836;
  color: #f3efe2;
}

.cs-sub {
  background: #f2ecdd;
  font-weight: 700;
}

.cs-tot {
  background: #ece3d2;
  font-weight: 800;
}
</style>
