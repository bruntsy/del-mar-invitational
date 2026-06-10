import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import EventConfigEditor from '@/components/EventConfigEditor.vue';
import { defaultEventConfig } from '@/domain/events';
import type { Event } from '@/types/event';

function testEvent(): Event {
  const config = defaultEventConfig(['Joe', 'Mike', 'Cole', 'Eric']);
  config.teamNames = { team1: 'Seattle', team2: 'Cali' };
  config.rounds[0].format = 'twoManHighBallLowBall';
  config.rounds[0].course = {
    clubName: 'Alderbrook Golf & Yacht Club',
    courseName: 'Alderbrook Golf & Yacht Club',
    location: 'Union, WA',
    tee: { name: 'Black', gender: 'Men', rating: 70.2, slope: 119, parTotal: 72 },
    par: Array(18).fill(4),
    si: Array.from({ length: 18 }, (_, index) => index + 1),
    yds: Array(18).fill(390),
  };

  return {
    id: 'event-1',
    groupId: 'group-1',
    name: 'Event Test',
    status: 'active',
    config,
  };
}

function mountEditor(event = testEvent()) {
  return mount(EventConfigEditor, {
    props: {
      event,
      groupPlayers: ['Joe', 'Mike', 'Cole', 'Eric'],
    },
    global: {
      stubs: {
        CourseScorecard: { template: '<div class="scorecard-stub">Scorecard table</div>' },
      },
    },
  });
}

describe('EventConfigEditor', () => {
  it('renders a structured event setup flow with mobile-safe roster assignment', () => {
    const wrapper = mountEditor();

    expect(wrapper.text()).toContain('Event details');
    expect(wrapper.text()).toContain('Teams & rosters');
    expect(wrapper.text()).toContain('Player assignment');
    expect(wrapper.text()).toContain('Seattle: 2');
    expect(wrapper.text()).toContain('Cali: 2');
    expect(wrapper.findAll('.ece-assignment-row')).toHaveLength(4);
    expect(wrapper.findAll('.ece-assignment-row')[0].text()).toContain('Seattle');
    expect(wrapper.findAll('.ece-assignment-row')[0].text()).toContain('Cali');
  });

  it('summarizes course and hides the full scorecard until requested', async () => {
    const wrapper = mountEditor();

    expect(wrapper.text()).toContain('Alderbrook Golf & Yacht Club');
    expect(wrapper.text()).not.toContain('Alderbrook Golf & Yacht Club - Alderbrook Golf & Yacht Club');
    expect(wrapper.find('.scorecard-stub').exists()).toBe(false);

    const toggle = wrapper.findAll('button').find((button) => button.text() === 'View scorecard');
    expect(toggle).toBeDefined();
    await toggle!.trigger('click');

    expect(wrapper.find('.scorecard-stub').exists()).toBe(true);
  });

  it('separates event points from money games and labels pair matches by team', () => {
    const wrapper = mountEditor();

    expect(wrapper.text()).toContain('Event points');
    expect(wrapper.text()).toContain('Team event points, not dollars.');
    expect(wrapper.text()).toContain('Total available: 6 points');
    expect(wrapper.text()).toContain('Money games / side games');
    expect(wrapper.text()).toContain('Best Ball bet');
    expect(wrapper.text()).toContain('Seattle pair');
    expect(wrapper.text()).toContain('Cali pair');
  });

  it('disables save and shows validation when required names are blank', async () => {
    const wrapper = mountEditor();
    const inputs = wrapper.findAll('input[type="text"]');

    await inputs[0].setValue('');

    expect(wrapper.text()).toContain('Event name is required.');
    expect(wrapper.find('.ece-actions .btn-primary').attributes('disabled')).toBeDefined();

    await wrapper.find('.ece-actions .btn-primary').trigger('click');
    expect(wrapper.emitted('save')).toBeUndefined();
  });

  it('confirms before canceling dirty edits', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const wrapper = mountEditor();

    await wrapper.find('input[type="text"]').setValue('Changed Event');
    await wrapper.find('.ece-actions .btn-ghost').trigger('click');

    expect(confirm).toHaveBeenCalledWith('Discard changes?\n\nYour event edits have not been saved.');
    expect(wrapper.emitted('cancel')).toBeUndefined();

    confirm.mockRestore();
  });
});
