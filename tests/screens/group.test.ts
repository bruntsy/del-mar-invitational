import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import GroupScreen from '@/components/screens/GroupScreen.vue';
import { useGroupStore } from '@/stores/group';

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
    expect(wrapper.text()).toContain('Idx 10.5');
    expect(store.group?.players.Ann).toEqual({ name: 'Ann', handicapIndex: 10.5 });

    await wrapper.find('.roster-row .btn-ghost').trigger('click');
    const editInputs = wrapper.find('.roster-row').findAll('input');
    await editInputs[0].setValue('Annie');
    await editInputs[1].setValue('9');
    await wrapper.find('.roster-row .btn-ghost').trigger('click');
    await flushPromises();

    expect(wrapper.text()).toContain('Annie');
    expect(wrapper.text()).toContain('Idx 9');
    expect(store.group?.players.Annie).toEqual({ name: 'Annie', handicapIndex: 9 });
    expect(store.group?.players.Ann).toBeUndefined();

    const remove = wrapper.findAll('.roster-row .btn-ghost').find((button) => button.text() === 'Remove');
    expect(remove).toBeDefined();
    await remove!.trigger('click');
    await flushPromises();

    expect(wrapper.text()).toContain('No players yet.');
    expect(store.group?.players.Annie).toBeUndefined();
  });
});
