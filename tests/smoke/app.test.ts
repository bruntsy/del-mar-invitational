import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import HomeScreen from '@/components/screens/HomeScreen.vue';

describe('HomeScreen', () => {
  it('renders the rewrite preview shell', () => {
    const wrapper = mount(HomeScreen);

    expect(wrapper.text()).toContain('Del Mar Invitational');
    expect(wrapper.text()).toContain('Foundation scaffold is running.');
  });
});
