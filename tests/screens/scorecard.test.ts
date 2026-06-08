import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { nextTick } from 'vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ScorecardScreen from '@/components/screens/ScorecardScreen.vue';
import { demoRound } from '@/fixtures/demoRound';
import { useRoundStore } from '@/stores/round';

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

let pinia: ReturnType<typeof createPinia>;

function mountScorecard() {
  return mount(ScorecardScreen, { global: { plugins: [pinia] } });
}

beforeEach(() => {
  pinia = createPinia();
  setActivePinia(pinia);
  localStorage.clear();
});

describe('ScorecardScreen', () => {
  it('shows an empty state with no active round', () => {
    const wrapper = mountScorecard();

    expect(wrapper.text()).toContain('No active round');
    expect(wrapper.find('button').text()).toContain('Load demo round');
  });

  it('renders the demo round roster and course header', () => {
    const store = useRoundStore();
    const { round, players } = demoRound();
    store.setRound(round, players);

    const wrapper = mountScorecard();

    expect(wrapper.text()).toContain('Del Mar Country Club');
    expect(wrapper.text()).toContain('Bay Cats');
    expect(wrapper.text()).toContain('Hill Dogs');
    expect(wrapper.text()).toContain('Wes');
    expect(wrapper.text()).toContain('Q');
    // one score input per player per hole = 4 players * 18 holes
    expect(wrapper.findAll('.score-cell input')).toHaveLength(72);
  });

  it('writes scores through the store and updates totals', async () => {
    const store = useRoundStore();
    const { round, players } = demoRound();
    store.setRound(round, players);

    const wrapper = mountScorecard();
    const firstInput = wrapper.find('.row-player .score-cell input');
    await firstInput.setValue('4');

    // the store received the edit as a timestamped cell
    expect(store.readScore('Wes', 0)).toBe(4);

    // fill the rest of Wes's card to surface a total
    for (let hole = 1; hole < 18; hole += 1) store.setScore('Wes', hole, 4);
    await nextTick();

    const wesRow = wrapper.findAll('.row-player').find((row) => row.text().includes('Wes'));
    expect(wesRow?.find('.total-col').text()).toBe('72');
    // net total reflects Wes's allocated strokes
    expect(store.playerTotals.Wes.net).toBeLessThan(72);
  });

  it('shows the settlement section once bets exist', () => {
    const store = useRoundStore();
    const { round, players } = demoRound();
    store.setRound(round, players);

    const wrapper = mountScorecard();

    expect(wrapper.find('.sc-settlement').exists()).toBe(true);
    expect(wrapper.text()).toContain('Settlement');
  });
});
