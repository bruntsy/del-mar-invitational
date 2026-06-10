import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import GroupScreen from '@/components/screens/GroupScreen.vue';
import { useGroupStore } from '@/stores/group';
import { emptyRound, useRoundStore } from '@/stores/round';

const push = vi.fn();
vi.mock('vue-router', () => ({
  useRouter: () => ({ push }),
}));
vi.mock('@/services/supabase', () => ({
  supabase: null,
  hasSupabase: () => false,
}));

let pinia: ReturnType<typeof createPinia>;

function mountGroup() {
  return mount(GroupScreen, { global: { plugins: [pinia] } });
}

beforeEach(() => {
  pinia = createPinia();
  setActivePinia(pinia);
  localStorage.clear();
  push.mockClear();
});

describe('GroupScreen roster', () => {
  it('adds, edits, and removes group roster players', async () => {
    const store = useGroupStore();
    await store.createGroup('Roster Group');
    const wrapper = mountGroup();

    const addInputs = wrapper.find('.roster-add').findAll('input');
    await addInputs[0].setValue('Ann');
    await addInputs[1].setValue('10.5');
    await wrapper.find('.roster-add .btn-primary').trigger('click');
    await flushPromises();

    expect(wrapper.text()).toContain('Ann');
    expect(wrapper.text()).toContain('Handicap index 10.5');
    expect(store.group?.players.Ann).toEqual({ name: 'Ann', handicapIndex: 10.5 });

    await wrapper.find('.roster-row .btn-ghost').trigger('click');
    const editInputs = wrapper.find('.roster-row').findAll('input');
    await editInputs[0].setValue('Annie');
    await editInputs[1].setValue('9');
    await wrapper.find('.roster-row .btn-ghost').trigger('click');
    await flushPromises();

    expect(wrapper.text()).toContain('Annie');
    expect(wrapper.text()).toContain('Handicap index 9');
    expect(store.group?.players.Annie).toEqual({ name: 'Annie', handicapIndex: 9 });
    expect(store.group?.players.Ann).toBeUndefined();

    const remove = wrapper.findAll('.roster-row button').find((button) => button.text() === 'Remove player');
    expect(remove).toBeDefined();
    await remove!.trigger('click');
    await flushPromises();

    expect(wrapper.text()).toContain('No players yet.');
    expect(store.group?.players.Annie).toBeUndefined();
  });

  it('does not show a resume card for a round from another group', async () => {
    const group = useGroupStore();
    const round = useRoundStore();
    await group.createGroup('Current Group');
    round.setRound({
      ...emptyRound('other-group'),
      course: {
        courseName: 'Wrong Course',
        tee: { name: 'Blue', rating: 72, slope: 113, parTotal: 72 },
        par: Array(18).fill(4),
        si: Array.from({ length: 18 }, (_, index) => index + 1),
        yds: Array(18).fill(400),
      },
      team1: ['Ann'],
      team2: ['Cal'],
      scores: { Ann: [4] as never },
    });

    const wrapper = mountGroup();
    await flushPromises();

    expect(wrapper.find('.resume-card').exists()).toBe(false);
    expect(wrapper.text()).not.toContain('Wrong Course');
  });
});
