import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SetupScreen from '@/components/screens/SetupScreen.vue';
import { useRoundStore } from '@/stores/round';

const push = vi.fn();
vi.mock('vue-router', () => ({
  useRouter: () => ({ push }),
}));

let pinia: ReturnType<typeof createPinia>;

function mountSetup() {
  return mount(SetupScreen, { global: { plugins: [pinia] } });
}

beforeEach(() => {
  pinia = createPinia();
  setActivePinia(pinia);
  localStorage.clear();
  push.mockClear();
});

describe('SetupScreen', () => {
  it('blocks starting until both teams have a player', () => {
    const wrapper = mountSetup();
    const start = wrapper.find('.btn-primary');

    // default form has empty player names -> teams empty -> disabled
    expect(start.attributes('disabled')).toBeDefined();
    expect(wrapper.text()).toContain('needs at least one player');
  });

  it('flags duplicate player names', async () => {
    const wrapper = mountSetup();
    const names = wrapper.findAll('.player-row .form-input');
    await names[0].setValue('Sam');
    await names[3].setValue('Sam'); // second row's name field (index 3 = 4th input pair start)

    expect(wrapper.text()).toContain('unique');
  });

  it('builds a round from the form and routes to the scorecard', async () => {
    const store = useRoundStore();
    const wrapper = mountSetup();

    const rows = wrapper.findAll('.player-row');
    // each row: [name, index, select, remove]
    const setRow = async (row: ReturnType<typeof wrapper.findAll>[number], name: string, idx: string) => {
      const inputs = row.findAll('input');
      await inputs[0].setValue(name);
      await inputs[1].setValue(idx);
    };
    await setRow(rows[0], 'Ann', '10');
    await setRow(rows[1], 'Bea', '12');
    await setRow(rows[2], 'Cal', '6');
    await setRow(rows[3], 'Dan', '20');

    await wrapper.find('.btn-primary').trigger('click');

    expect(store.round).not.toBeNull();
    expect(store.round?.team1).toEqual(['Ann', 'Bea']);
    expect(store.round?.team2).toEqual(['Cal', 'Dan']);
    expect(store.playerNames).toEqual(['Ann', 'Bea', 'Cal', 'Dan']);
    // h2h matchups zip team1[i] vs team2[i]
    expect(store.round?.matchups).toEqual([
      { t1: 'Ann', t2: 'Cal' },
      { t1: 'Bea', t2: 'Dan' },
    ]);
    // handicap map drives course handicaps
    expect(store.courseHandicaps.Ann).toBeGreaterThan(store.courseHandicaps.Cal);
    expect(push).toHaveBeenCalledWith('/scorecard');
  });

  it('includes 4-man scramble config in the created round', async () => {
    const store = useRoundStore();
    const wrapper = mountSetup();

    const rows = wrapper.findAll('.player-row');
    const setRow = async (row: ReturnType<typeof wrapper.findAll>[number], name: string, idx: string) => {
      const inputs = row.findAll('input');
      await inputs[0].setValue(name);
      await inputs[1].setValue(idx);
    };
    await setRow(rows[0], 'Ann', '10');
    await setRow(rows[1], 'Bea', '12');
    await setRow(rows[2], 'Cal', '6');
    await setRow(rows[3], 'Dan', '20');

    const scrambleRow = wrapper.findAll('.game-row').find((row) => row.text().includes('4-Man Scramble'));
    expect(scrambleRow).toBeDefined();
    await scrambleRow!.find('input[type="checkbox"]').setValue(true);
    const money = scrambleRow!.findAll('input[type="number"]');
    await money[0].setValue('5');
    await money[1].setValue('5');
    await money[2].setValue('10');

    await wrapper.find('.btn-primary').trigger('click');

    expect(store.round?.games.scramble4).toMatchObject({
      enabled: true,
      front: 5,
      back: 5,
      total: 10,
      type: 'gross',
    });
  });

  it('adds and removes player rows', async () => {
    const wrapper = mountSetup();
    expect(wrapper.findAll('.player-row')).toHaveLength(4);

    await wrapper.find('.setup-card:nth-of-type(2) .btn-ghost').trigger('click');
    expect(wrapper.findAll('.player-row')).toHaveLength(5);

    await wrapper.findAll('.btn-remove')[0].trigger('click');
    expect(wrapper.findAll('.player-row')).toHaveLength(4);
  });
});
