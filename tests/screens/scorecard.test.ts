import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { nextTick } from 'vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ScorecardScreen from '@/components/screens/ScorecardScreen.vue';
import { defaultEventConfig } from '@/domain/events';
import { cloneDefaultGames } from '@/domain/games';
import { demoRound } from '@/fixtures/demoRound';
import { useEventStore } from '@/stores/event';
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
    expect(wrapper.text()).toContain('Best Ball');
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

  it('renders derived best-ball rows from player scores', async () => {
    const store = useRoundStore();
    const { round, players } = demoRound();
    store.setRound(round, players);

    const wrapper = mountScorecard();
    expect(wrapper.findAll('.row-format')).toHaveLength(2);

    for (let hole = 0; hole < 18; hole += 1) {
      store.setScore('Wes', hole, 4);
      store.setScore('Aaron', hole, 5);
    }
    await nextTick();

    const bayRows = wrapper.findAll('.row-format').filter((row) => row.text().includes('Best Ball'));
    expect(bayRows).toHaveLength(2);
    expect(bayRows[0].find('.total-col').text()).not.toBe('—');
  });

  it('renders scramble team rows and writes team scores', async () => {
    const store = useRoundStore();
    const { round, players } = demoRound();
    round.games.scramble4.enabled = true;
    store.setRound(round, players);

    const wrapper = mountScorecard();
    expect(wrapper.findAll('.row-format')).toHaveLength(4);
    expect(wrapper.text()).toContain('4-man scramble');

    const firstTeamRow = wrapper.findAll('.row-format').find((row) => row.text().includes('4-man scramble'));
    expect(firstTeamRow).toBeDefined();
    const firstTeamInput = firstTeamRow!.find('.score-cell input');
    await firstTeamInput.setValue('4');

    expect(store.readTeamScore('team1', 0)).toBe(4);

    for (let hole = 1; hole < 18; hole += 1) store.setTeamScore('team1', hole, 4);
    await nextTick();

    expect(firstTeamRow!.find('.total-col').text()).toBe('72');
  });

  it('renders and updates the wolf live panel', async () => {
    const store = useRoundStore();
    const { round, players } = demoRound();
    round.games.wolf.enabled = true;
    round.games.wolf.type = 'gross';
    store.setRound(round, players);

    const wrapper = mountScorecard();
    expect(wrapper.find('.wolf-live').exists()).toBe(true);
    expect(wrapper.text()).toContain('Wolf');

    const firstWolfRow = wrapper.find('.wolf-table tbody tr');
    const selects = firstWolfRow.findAll('select');
    await selects[1].setValue('solo');

    store.setScore('Wes', 0, 4);
    store.setScore('Aaron', 0, 5);
    store.setScore('Tito', 0, 6);
    store.setScore('Q', 0, 6);
    await nextTick();

    expect(wrapper.find('.wolf-live-total').text()).toContain('1 hole settled');
    expect(firstWolfRow.text()).toContain('Wes wins');
    expect(firstWolfRow.text()).toContain('Wes +2');
  });

  it('shows the settlement section once bets exist', () => {
    const store = useRoundStore();
    const { round, players } = demoRound();
    store.setRound(round, players);

    const wrapper = mountScorecard();

    expect(wrapper.find('.sc-settlement').exists()).toBe(true);
    expect(wrapper.text()).toContain('Settlement');
  });

  it('shows linked event round status even when round games are missing the event game', async () => {
    const roundStore = useRoundStore();
    const eventStore = useEventStore();
    const { round, players } = demoRound();
    round.id = 'event-round-1';
    round.groupId = 'g1';
    round.games = cloneDefaultGames();
    round.pairMatches = [{ a: ['Wes', 'Aaron'], b: ['Tito', 'Q'] }];
    roundStore.setRound(round, players);

    const config = defaultEventConfig(['Wes', 'Aaron', 'Tito', 'Q']);
    config.rounds[0] = {
      ...config.rounds[0],
      name: 'Round 1',
      format: 'twoManHighBallLowBall',
      roundId: 'event-round-1',
      pairMatches: [{ a: ['Wes', 'Aaron'], b: ['Tito', 'Q'] }],
    };
    eventStore.event = { id: 'event-1', groupId: 'g1', name: 'Event Test', status: 'active', config };

    for (let hole = 0; hole < 9; hole += 1) {
      roundStore.setScore('Wes', hole, 4);
      roundStore.setScore('Aaron', hole, 5);
      roundStore.setScore('Tito', hole, 5);
      roundStore.setScore('Q', hole, 6);
    }

    const wrapper = mountScorecard();
    await nextTick();

    expect(wrapper.find('.event-live').exists()).toBe(true);
    expect(wrapper.find('.event-live').text()).toContain('Event Round 1');
    expect(wrapper.find('.event-live').text()).toContain('2v2 High Ball / Low Ball');
    expect(wrapper.find('.event-live').text()).toContain('Wes + Aaron vs Tito + Q');
    expect(wrapper.find('.event-live').text()).toContain('Low Ball Front');
    expect(wrapper.find('.event-live').text()).toContain('High Ball Front');
  });

  it('renders the putt poker panel and reflects the base pot', () => {
    const store = useRoundStore();
    const { round, players } = demoRound();
    store.setRound(round, players);

    const wrapper = mountScorecard();

    expect(wrapper.find('.sc-puttpoker').exists()).toBe(true);
    expect(wrapper.text()).toContain('Putt Poker');
    // demo buy-in is $2 over 4 players -> $8 base pot, every player starts with 2 cards
    expect(wrapper.text()).toContain('Pot: $8');
    expect(wrapper.findAll('.pp-card-count')).toHaveLength(4);
    expect(wrapper.find('.pp-card-count').text()).toContain('2');
  });

  it('shows group filter buttons when playing groups are defined', async () => {
    const store = useRoundStore();
    const { round, players } = demoRound();
    round.playingGroups = [
      { name: 'Group 1', players: ['Wes', 'Tito'] },
      { name: 'Group 2', players: ['Aaron', 'Q'] },
    ];
    store.setRound(round, players);

    const wrapper = mountScorecard();
    const filter = wrapper.find('.group-filter');
    expect(filter.exists()).toBe(true);
    // All + 2 group buttons
    expect(filter.findAll('.gf-btn')).toHaveLength(3);
    expect(filter.text()).toContain('Group 1');
    expect(filter.text()).toContain('Group 2');
  });

  it('group filter hides players not in the selected group', async () => {
    const store = useRoundStore();
    const { round, players } = demoRound();
    round.playingGroups = [
      { name: 'Group 1', players: ['Wes', 'Tito'] },
      { name: 'Group 2', players: ['Aaron', 'Q'] },
    ];
    store.setRound(round, players);

    const wrapper = mountScorecard();
    // click "Group 1" button
    const g1btn = wrapper.findAll('.gf-btn').find((b) => b.text() === 'Group 1');
    await g1btn!.trigger('click');
    await wrapper.vm.$nextTick();

    expect(wrapper.text()).toContain('Wes');
    expect(wrapper.text()).toContain('Tito');
    expect(wrapper.findAll('.row-player').find((r) => r.text().includes('Aaron'))).toBeUndefined();
    expect(wrapper.findAll('.row-player').find((r) => r.text().includes('Q'))).toBeUndefined();
  });

  it('group filter "All" restores all players', async () => {
    const store = useRoundStore();
    const { round, players } = demoRound();
    round.playingGroups = [
      { name: 'Group 1', players: ['Wes', 'Tito'] },
      { name: 'Group 2', players: ['Aaron', 'Q'] },
    ];
    store.setRound(round, players);

    const wrapper = mountScorecard();
    await wrapper.findAll('.gf-btn')[1].trigger('click'); // Group 1
    await wrapper.findAll('.gf-btn')[0].trigger('click'); // All
    await wrapper.vm.$nextTick();

    expect(wrapper.findAll('.row-player')).toHaveLength(4);
  });

  it('mobile mode toggle hides the table and shows the hole card', async () => {
    const store = useRoundStore();
    const { round, players } = demoRound();
    store.setRound(round, players);

    const wrapper = mountScorecard();
    expect(wrapper.find('.mobile-card').exists()).toBe(false);
    expect(wrapper.find('.sc-table-wrap').exists()).toBe(true);

    await wrapper.find('button.btn-ghost').trigger('click'); // Mobile button is first
    await wrapper.vm.$nextTick();

    expect(wrapper.find('.mobile-card').exists()).toBe(true);
    expect(wrapper.find('.sc-table-wrap').exists()).toBe(false);
  });

  it('mobile hole card shows players, score steppers, and hole navigation', async () => {
    const store = useRoundStore();
    const { round, players } = demoRound();
    store.setRound(round, players);

    const wrapper = mountScorecard();
    // toggle to mobile mode
    await wrapper.find('button.btn-ghost').trigger('click');
    await wrapper.vm.$nextTick();

    expect(wrapper.find('.mobile-hole-num').text()).toBe('Hole 1');
    expect(wrapper.findAll('.mobile-player-row')).toHaveLength(4);

    // navigate to hole 2
    const navBtns = wrapper.find('.mobile-hole-nav').findAll('button');
    await navBtns[1].trigger('click'); // → next
    await wrapper.vm.$nextTick();

    expect(wrapper.find('.mobile-hole-num').text()).toBe('Hole 2');
  });

  it('mobile score stepper increments the score via the store', async () => {
    const store = useRoundStore();
    const { round, players } = demoRound();
    store.setRound(round, players);

    const wrapper = mountScorecard();
    await wrapper.find('button.btn-ghost').trigger('click');
    await wrapper.vm.$nextTick();

    // The first player is Wes (Bay Cats team1[0])
    const firstRow = wrapper.find('.mobile-player-row');
    const plusBtn = firstRow.findAll('.stepper-btn')[1]; // + button
    await plusBtn.trigger('click');
    await plusBtn.trigger('click');
    await plusBtn.trigger('click');
    await wrapper.vm.$nextTick();

    // base 0 + 3 increments → max(1, 3) = 3
    expect(store.readScore('Wes', 0)).toBe(3);
  });

  it('mobile hole strip marks filled holes and allows quick navigation', async () => {
    const store = useRoundStore();
    const { round, players } = demoRound();
    store.setRound(round, players);
    store.setScore('Wes', 4, 5); // hole 5 has a score

    const wrapper = mountScorecard();
    await wrapper.find('button.btn-ghost').trigger('click');
    await wrapper.vm.$nextTick();

    const strip = wrapper.find('.mobile-hole-strip');
    expect(strip.exists()).toBe(true);

    // click hole 5 (index 4 = 5th button)
    await strip.findAll('.strip-btn')[4].trigger('click');
    await wrapper.vm.$nextTick();

    expect(wrapper.find('.mobile-hole-num').text()).toBe('Hole 5');
    expect(strip.findAll('.strip-btn')[4].classes()).toContain('active');
    expect(strip.findAll('.strip-btn')[4].classes()).toContain('filled');
  });

  it('toggles a putt row and records putts that drive the coin and pot', async () => {
    const store = useRoundStore();
    const { round, players } = demoRound();
    store.setRound(round, players);

    const wrapper = mountScorecard();
    expect(wrapper.find('.row-putts').exists()).toBe(false);

    await wrapper.find('.putt-toggle').trigger('click');
    expect(wrapper.find('.row-putts').exists()).toBe(true);

    const firstPutt = wrapper.find('.row-putts .putt-cell input');
    await firstPutt.setValue('3'); // a three-putt for Wes on hole 1
    expect(store.readPutt('Wes', 0)).toBe(3);

    await nextTick();
    // coin moves to Wes and the pot grows by $1 over the $8 base
    expect(wrapper.find('.pp-coin').text()).toContain('Wes');
    expect(wrapper.text()).toContain('Pot: $9');
    expect(wrapper.text()).toContain('1x 3-putt');
  });
});
