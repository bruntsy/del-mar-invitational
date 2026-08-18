import { mount } from '@vue/test-utils';
import { createPinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import HomeScreen from '@/components/screens/HomeScreen.vue';

const push = vi.fn();
vi.mock('vue-router', () => ({
  useRouter: () => ({ push }),
}));

beforeEach(() => {
  push.mockClear();
});

describe('HomeScreen', () => {
  it('renders the rewrite preview shell', () => {
    const wrapper = mount(HomeScreen, { global: { plugins: [createPinia()] } });

    expect(wrapper.text()).toContain('Del Mar Invitational');
    expect(wrapper.text()).toContain('Start demo round');
  });

  it('opens the groups list from the home Groups action', async () => {
    const wrapper = mount(HomeScreen, { global: { plugins: [createPinia()] } });

    await wrapper.find('.btn-primary').trigger('click');

    expect(push).toHaveBeenCalledWith({ path: '/group', query: { view: 'groups' } });
  });
});
