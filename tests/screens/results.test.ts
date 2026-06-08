import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { nextTick } from 'vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ResultsScreen from '@/components/screens/ResultsScreen.vue';
import { demoRound } from '@/fixtures/demoRound';
import { useRoundStore } from '@/stores/round';

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

let pinia: ReturnType<typeof createPinia>;

function mountResults() {
  return mount(ResultsScreen, { global: { plugins: [pinia] } });
}

function fillCard(store: ReturnType<typeof useRoundStore>, player: string, gross: number) {
  for (let hole = 0; hole < 18; hole += 1) store.setScore(player, hole, gross);
}

beforeEach(() => {
  pinia = createPinia();
  setActivePinia(pinia);
  localStorage.clear();
});

describe('ResultsScreen', () => {
  it('shows an empty state with no active round', () => {
    const wrapper = mountResults();
    expect(wrapper.text()).toContain('No active round');
  });

  it('renders team scores, leaderboard, and team game breakdowns', () => {
    const store = useRoundStore();
    const { round, players } = demoRound();
    store.setRound(round, players);
    for (const player of ['Wes', 'Aaron', 'Tito', 'Q']) fillCard(store, player, 5);

    const wrapper = mountResults();

    // team scores section with both team names
    expect(wrapper.text()).toContain('Team Scores');
    expect(wrapper.text()).toContain('Bay Cats');
    expect(wrapper.text()).toContain('Hill Dogs');

    // leaderboard has one row per player
    expect(wrapper.findAll('.rs-table tbody tr')).toHaveLength(4);

    // best ball is enabled in the demo round, so a team-game box renders
    expect(wrapper.text()).toContain('Team Game Results');
    expect(wrapper.text()).toContain('Best Ball');

    // demo round has bets -> settlement section
    expect(wrapper.text()).toContain('Settlement');
  });

  it('highlights the winning team once both are complete', async () => {
    const store = useRoundStore();
    const { round, players } = demoRound();
    store.setRound(round, players);
    // team1 (Wes/Aaron) shoots much better than team2 (Tito/Q)
    fillCard(store, 'Wes', 4);
    fillCard(store, 'Aaron', 4);
    fillCard(store, 'Tito', 7);
    fillCard(store, 'Q', 7);

    const wrapper = mountResults();
    await nextTick();

    const winner = wrapper.find('.team-box.winner');
    expect(winner.exists()).toBe(true);
    expect(winner.text()).toContain('Bay Cats');
    expect(winner.text()).toContain('Winners');
  });

  it('toggles round completion through the store', async () => {
    const store = useRoundStore();
    const { round, players } = demoRound();
    store.setRound(round, players);

    const wrapper = mountResults();
    expect(wrapper.find('.btn-complete').text()).toContain('Complete round');

    await wrapper.find('.btn-complete').trigger('click');
    expect(store.round?.completed).toBe(true);
    expect(wrapper.find('.btn-complete').text()).toContain('Reopen round');
    expect(wrapper.text()).toContain('Round Complete');
  });
});
