import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SetupScreen from '@/components/screens/SetupScreen.vue';
import { useRoundStore } from '@/stores/round';

const { mockSearchCourses } = vi.hoisted(() => ({ mockSearchCourses: vi.fn() }));

const push = vi.fn();
vi.mock('vue-router', () => ({
  useRouter: () => ({ push }),
}));
vi.mock('@/services/courseSearch', () => ({
  searchCourses: mockSearchCourses,
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
  mockSearchCourses.mockReset();
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

  it('fills course fields from selected search tee', async () => {
    const store = useRoundStore();
    mockSearchCourses.mockResolvedValue([
      {
        id: 'course-1',
        clubName: 'Del Mar Country Club',
        courseName: 'Championship',
        location: 'Del Mar, CA',
        tees: {
          male: [
            {
              name: 'Black',
              gender: 'Men',
              rating: 74.2,
              slope: 138,
              parTotal: 72,
              yards: 7011,
              holes: Array.from({ length: 18 }, (_, index) => ({
                par: index % 6 === 2 ? 3 : index % 6 === 4 ? 5 : 4,
                yardage: 350 + index,
                si: index === 0 ? 7 : index,
              })),
            },
          ],
        },
      },
    ]);
    const wrapper = mountSetup();

    await wrapper.find('.course-search-input').setValue('Del Mar');
    await wrapper.find('.course-search-btn').trigger('click');
    await flushPromises();
    await wrapper.find('.course-result').trigger('click');
    await wrapper.find('.tee-result').trigger('click');

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
    await wrapper.find('.btn-primary').trigger('click');

    expect(mockSearchCourses).toHaveBeenCalledWith('Del Mar');
    expect(store.round?.course).toMatchObject({
      id: 'course-1',
      clubName: 'Del Mar Country Club',
      courseName: 'Championship',
      location: 'Del Mar, CA',
      tee: { name: 'Black', gender: 'Men', rating: 74.2, slope: 138, parTotal: 72, yards: 7011 },
    });
    expect(store.round?.course?.par).toHaveLength(18);
    expect(store.round?.course?.si).toEqual(Array.from({ length: 18 }, (_, index) => index + 1));
    expect(store.round?.course?.yds[0]).toBe(350);
  });

  it('keeps manual course setup available when search fails', async () => {
    mockSearchCourses.mockRejectedValue(new Error('Course search failed.'));
    const wrapper = mountSetup();

    await wrapper.find('.course-search-input').setValue('Pebble');
    await wrapper.find('.course-search-btn').trigger('click');
    await flushPromises();

    expect(wrapper.text()).toContain('Course search failed.');
    expect(wrapper.find('label input[placeholder="Del Mar Country Club"]').exists()).toBe(true);
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

  it('configures pair match play and default pairings', async () => {
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

    const pairRow = wrapper.findAll('.game-row').find((row) => row.text().includes('Pair Match Play'));
    expect(pairRow).toBeDefined();
    await pairRow!.find('input[type="checkbox"]').setValue(true);
    await pairRow!.find('input[type="number"]').setValue('2');
    await pairRow!.find('select').setValue('gross');

    expect(wrapper.find('.pair-match-builder').exists()).toBe(true);
    await wrapper.find('.btn-primary').trigger('click');

    expect(store.round?.games.pairMatch).toMatchObject({ enabled: true, pointsPerHole: 2, type: 'gross' });
    expect(store.round?.pairMatches).toEqual([{ a: ['Ann', 'Bea'], b: ['Cal', 'Dan'] }]);
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
