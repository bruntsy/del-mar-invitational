import { mount } from '@vue/test-utils';
import { createPinia } from 'pinia';
import { describe, expect, it, vi } from 'vitest';
import HomeScreen from '@/components/screens/HomeScreen.vue';

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

describe('HomeScreen', () => {
  it('renders the rewrite preview shell', () => {
    const wrapper = mount(HomeScreen, { global: { plugins: [createPinia()] } });

    expect(wrapper.text()).toContain('Del Mar Invitational');
    expect(wrapper.text()).toContain('Start demo round');
  });
});
