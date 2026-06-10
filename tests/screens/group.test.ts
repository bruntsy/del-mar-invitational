import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import GroupScreen from '@/components/screens/GroupScreen.vue';
import { defaultEventConfig } from '@/domain/events';
import { demoRound } from '@/fixtures/demoRound';
import { useEventStore } from '@/stores/event';
import { useGroupStore } from '@/stores/group';
import { emptyRound, useRoundStore } from '@/stores/round';

const { routeQuery, onlineState } = vi.hoisted(() => ({
  routeQuery: { value: {} as Record<string, string> },
  onlineState: { value: false },
}));
const push = vi.fn();
vi.mock('vue-router', () => ({
  useRouter: () => ({ push }),
  useRoute: () => ({ query: routeQuery.value }),
}));
vi.mock('@/services/supabase', () => ({
  supabase: null,
  hasSupabase: () => onlineState.value,
}));

let pinia: ReturnType<typeof createPinia>;

function mountGroup() {
  return mount(GroupScreen, { global: { plugins: [pinia] } });
}

function fillCard(store: ReturnType<typeof useRoundStore>, player: string, gross: number) {
  for (let hole = 0; hole < 18; hole += 1) store.setScore(player, hole, gross);
}

beforeEach(() => {
  pinia = createPinia();
  setActivePinia(pinia);
  localStorage.clear();
  push.mockClear();
  routeQuery.value = {};
  onlineState.value = false;
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

  it('shows the groups list when requested even with an active group', async () => {
    const store = useGroupStore();
    await store.createGroup('Current Group');
    routeQuery.value = { view: 'groups' };

    const wrapper = mountGroup();
    await flushPromises();

    expect(wrapper.text()).toContain('Current group');
    expect(wrapper.text()).toContain('Create group');
    expect(wrapper.text()).toContain('Recent groups');
    expect(wrapper.text()).not.toContain('Ad hoc rounds');
  });

  it('opens the groups list from the active group dashboard', async () => {
    const store = useGroupStore();
    await store.createGroup('Current Group');
    const wrapper = mountGroup();
    await flushPromises();

    const back = wrapper.findAll('button').find((button) => button.text().includes('Back to groups'));
    expect(back).toBeDefined();
    await back!.trigger('click');

    expect(push).toHaveBeenCalledWith({ path: '/group', query: { view: 'groups' } });
  });

  it('renders the team event dashboard with score labels, stateful round actions, and de-emphasized archive', async () => {
    const group = useGroupStore();
    await group.createGroup('Event Group');
    onlineState.value = true;

    const event = useEventStore();
    const { round } = demoRound();
    const config = defaultEventConfig(['Wes', 'Aaron', 'Tito', 'Q']);
    config.teamNames = { team1: 'Seattle', team2: 'Cali' };
    config.team1 = ['Wes', 'Aaron'];
    config.team2 = ['Tito', 'Q'];
    config.winPoints = 15.5;
    config.rounds[0] = {
      ...config.rounds[0],
      name: 'Round 1',
      format: 'twoManHighBallLowBall',
      course: round.course,
      roundId: 'event-round-1',
      pairMatches: [{ a: ['Wes', 'Aaron'], b: ['Tito', 'Q'] }],
      pointsResult: { team1: 7, team2: 5 },
    };
    config.rounds[1] = {
      ...config.rounds[1],
      name: 'Round 2',
      format: 'twoManHighBallLowBall',
      course: round.course,
      pairMatches: [{ a: ['Wes', 'Aaron'], b: ['Tito', 'Q'] }],
    };
    config.rounds[2] = {
      ...config.rounds[2],
      name: 'Round 3',
      format: 'twoManHighBallLowBall',
      course: null,
      pairMatches: [{ a: ['Wes', 'Aaron'], b: ['Tito', 'Q'] }],
    };
    event.event = { id: 'event-1', groupId: 'g1', name: 'Event Test 6.10', status: 'active', config };

    const wrapper = mountGroup();
    await flushPromises();

    expect(wrapper.find('.event-name').text()).toBe('Event Test 6.10');
    expect(wrapper.find('.event-scoreboard').text()).toContain('Event score');
    expect(wrapper.find('.event-scoreboard').text()).toContain('Seattle');
    expect(wrapper.find('.event-scoreboard').text()).toContain('7');
    expect(wrapper.find('.event-scoreboard').text()).toContain('Cali');
    expect(wrapper.find('.event-scoreboard').text()).toContain('5');
    expect(wrapper.find('.event-scoreboard').text()).toContain('15.5 points to win');
    expect(wrapper.find('.event-teams').text()).toContain('Wes · Aaron');
    expect(wrapper.find('.event-teams').text()).toContain('Tito · Q');
    expect(wrapper.text()).toContain('Edit event');
    expect(wrapper.find('.event-header').text()).not.toContain('Archive event');
    expect(wrapper.find('.event-settings').text()).toContain('Archive event');
    expect(wrapper.text()).toContain('Ready to launch');
    expect(wrapper.text()).toContain('Launch round');
    expect(wrapper.text()).toContain('Finish setup');
    expect(wrapper.text()).toContain('Missing course');
    expect(wrapper.text()).toContain('No completed event rounds yet. Completed rounds will appear here after they are finished.');
  });

  it('keeps event match details collapsed until requested', async () => {
    const group = useGroupStore();
    await group.createGroup('Event Group');
    onlineState.value = true;

    const roundStore = useRoundStore();
    const event = useEventStore();
    const { round, players } = demoRound();
    round.id = 'event-round-1';
    round.games.highBallLowBall.enabled = true;
    round.games.highBallLowBall.scoringMode = 'match';
    round.pairMatches = [{ a: ['Wes', 'Aaron'], b: ['Tito', 'Q'] }];
    roundStore.setRound(round, players);
    fillCard(roundStore, 'Wes', 4);
    fillCard(roundStore, 'Aaron', 5);
    fillCard(roundStore, 'Tito', 5);
    fillCard(roundStore, 'Q', 6);

    const config = defaultEventConfig(['Wes', 'Aaron', 'Tito', 'Q']);
    config.teamNames = { team1: 'Seattle', team2: 'Cali' };
    config.team1 = ['Wes', 'Aaron'];
    config.team2 = ['Tito', 'Q'];
    config.rounds = [{
      ...config.rounds[0],
      name: 'Round 1',
      format: 'twoManHighBallLowBall',
      course: round.course,
      roundId: 'event-round-1',
      pairMatches: [{ a: ['Wes', 'Aaron'], b: ['Tito', 'Q'] }],
    }];
    event.event = { id: 'event-1', groupId: 'g1', name: 'Event Test 6.10', status: 'active', config };

    const wrapper = mountGroup();
    await flushPromises();

    expect(wrapper.text()).toContain('Open round');
    expect(wrapper.find('.event-detail-toggle').exists()).toBe(true);
    expect(wrapper.find('.comp-chip').exists()).toBe(false);

    await wrapper.find('.event-detail-toggle').trigger('click');
    await flushPromises();

    expect(wrapper.find('.comp-chip').exists()).toBe(true);
    expect(wrapper.find('.comp-chip').text()).toContain('Seattle');
  });
});
