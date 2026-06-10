import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { nextTick } from 'vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ResultsScreen from '@/components/screens/ResultsScreen.vue';
import { cloneDefaultGames } from '@/domain/games';
import { defaultEventConfig } from '@/domain/events';
import { demoRound } from '@/fixtures/demoRound';
import { useEventStore } from '@/stores/event';
import { useRoundStore } from '@/stores/round';

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

let pinia: ReturnType<typeof createPinia>;

function mountResults() {
  return mount(ResultsScreen, { global: { plugins: [pinia] } });
}

function fillCard(store: ReturnType<typeof useRoundStore>, player: string, gross: number) {
  for (let hole = 0; hole < 18; hole += 1) store.setScore(player, hole, gross);
}

beforeEach(() => {
  vi.restoreAllMocks();
  pinia = createPinia();
  setActivePinia(pinia);
  localStorage.clear();
});

describe('ResultsScreen', () => {
  it('shows an empty state with no active round', () => {
    const wrapper = mountResults();
    expect(wrapper.text()).toContain('No active round');
  });

  it('renders team scores, leaderboard, and team game breakdowns', () => {
    const store = useRoundStore();
    const { round, players } = demoRound();
    store.setRound(round, players);
    for (const player of ['Wes', 'Aaron', 'Tito', 'Q']) fillCard(store, player, 5);

    const wrapper = mountResults();

    // team scores section with both team names
    expect(wrapper.text()).toContain('Team Scores');
    expect(wrapper.text()).toContain('Bay Cats');
    expect(wrapper.text()).toContain('Hill Dogs');

    // leaderboard has one row per player
    expect(wrapper.findAll('.rs-table tbody tr')).toHaveLength(4);

    // best ball is enabled in the demo round, so a team-game box renders
    expect(wrapper.text()).toContain('Team Game Results');
    expect(wrapper.text()).toContain('Best Ball');

    // demo round has bets -> settlement section
    expect(wrapper.text()).toContain('Settlement');
  });

  it('emphasizes settlement payments and shows losses with a minus sign', async () => {
    const store = useRoundStore();
    const { round, players } = demoRound();
    store.setRound(round, players);
    fillCard(store, 'Wes', 4);
    fillCard(store, 'Aaron', 4);
    fillCard(store, 'Tito', 7);
    fillCard(store, 'Q', 7);

    const wrapper = mountResults();
    await nextTick();

    const payments = wrapper.find('.settle-list');
    const netSummary = wrapper.find('.pnl-table');
    expect(payments.exists()).toBe(true);
    expect(payments.text()).toContain('pays');
    expect(payments.element.compareDocumentPosition(netSummary.element) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(netSummary.text()).toContain('-$');
  });

  it('keeps reset visually secondary to completion', () => {
    const store = useRoundStore();
    const { round, players } = demoRound();
    store.setRound(round, players);

    const wrapper = mountResults();

    expect(wrapper.find('.btn-complete').text()).toContain('Complete round');
    expect(wrapper.find('.btn-reset-secondary').text()).toContain('Reset round');
    expect(wrapper.find('.rs-actions').text().indexOf('Reset round')).toBeGreaterThan(
      wrapper.find('.rs-actions').text().indexOf('Complete round'),
    );
  });

  it('highlights the winning team once both are complete', async () => {
    const store = useRoundStore();
    const { round, players } = demoRound();
    store.setRound(round, players);
    // team1 (Wes/Aaron) shoots much better than team2 (Tito/Q)
    fillCard(store, 'Wes', 4);
    fillCard(store, 'Aaron', 4);
    fillCard(store, 'Tito', 7);
    fillCard(store, 'Q', 7);

    const wrapper = mountResults();
    await nextTick();

    const winner = wrapper.find('.team-box.winner');
    expect(winner.exists()).toBe(true);
    expect(winner.text()).toContain('Bay Cats');
    expect(winner.text()).toContain('Winners');
  });

  it('does not lead match-play team games with stroke-total team scores', async () => {
    const store = useRoundStore();
    const { round, players } = demoRound();
    round.games.bestBallAggy.enabled = true;
    round.games.bestBallAggy.scoringMode = 'match';
    round.pairMatches = [{ a: ['Wes', 'Aaron'], b: ['Tito', 'Q'] }];
    store.setRound(round, players);
    for (const player of ['Wes', 'Aaron', 'Tito', 'Q']) fillCard(store, player, 5);

    const wrapper = mountResults();
    await nextTick();

    expect(wrapper.text()).not.toContain('Team Scores');
    expect(wrapper.text()).toContain('Best Ball + Aggy');
    expect(wrapper.text()).toContain('Match play');
  });

  it('does not lead linked event match play with stroke-total team scores', async () => {
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
      scoringMode: 'matchPlay',
      roundId: 'event-round-1',
      pairMatches: [{ a: ['Wes', 'Aaron'], b: ['Tito', 'Q'] }],
    };
    eventStore.event = { id: 'event-1', groupId: 'g1', name: 'Event Test', status: 'active', config };

    fillCard(roundStore, 'Wes', 4);
    fillCard(roundStore, 'Aaron', 5);
    fillCard(roundStore, 'Tito', 5);
    fillCard(roundStore, 'Q', 6);

    const wrapper = mountResults();
    await nextTick();

    expect(wrapper.text()).not.toContain('Team Scores');
    expect(wrapper.text()).toContain('High Ball / Low Ball');
    expect(wrapper.text()).toContain('Match play');
    expect(wrapper.text()).toContain('Low Ball');
    expect(wrapper.text()).toContain('High Ball');
    expect(wrapper.text()).toContain('Front');
    expect(wrapper.findAll('.hbl-card')).toHaveLength(2);
    expect(wrapper.find('.hbl-card').text()).toContain('Wes + Aaron wins');
    expect(wrapper.findAll('.hbl-segment')).toHaveLength(6);
    expect(wrapper.findAll('.hbl-toggle')).toHaveLength(2);
    expect(wrapper.find('.hbl-timeline').exists()).toBe(false);

    await wrapper.find('.hbl-toggle').trigger('click');
    await nextTick();

    expect(wrapper.find('.hbl-timeline').exists()).toBe(true);
    expect(wrapper.findAll('.hbl-hole')).toHaveLength(18);
    expect(wrapper.find('.hbl-legend').text()).toContain('AS = all square');
    expect(wrapper.find('.hbl-hole').text()).toContain('Hole 1');
  });

  it('renders wolf standings and Nassau segments', async () => {
    const store = useRoundStore();
    const { round, players } = demoRound();
    round.games.wolf.enabled = true;
    round.games.wolf.type = 'gross';
    round.games.wolf.nassau = true;
    store.setRound(round, players);
    store.setWolfHole(0, 'wolf', 'Wes');
    store.setWolfHole(0, 'mode', 'solo');
    store.setScore('Wes', 0, 4);
    store.setScore('Aaron', 0, 5);
    store.setScore('Tito', 0, 6);
    store.setScore('Q', 0, 6);

    const wrapper = mountResults();
    await nextTick();

    expect(wrapper.text()).toContain('Wolf');
    expect(wrapper.find('.wolf-standings').exists()).toBe(true);
    expect(wrapper.find('.wolf-segments').exists()).toBe(true);
    expect(wrapper.find('.wolf-holes').text()).toContain('Wes wins');
    expect(wrapper.find('.wolf-holes').text()).toContain('Wes +2');
  });

  it('renders the putt poker panel per group with coin holder and pot', async () => {
    const store = useRoundStore();
    const { round, players } = demoRound();
    round.games.puttPoker.enabled = true;
    round.games.puttPoker.pot = 5;
    store.setRound(round, players);
    store.setPutt('Wes', 0, 3); // 3-putt → coin moves to Wes, pot +1

    const wrapper = mountResults();
    await nextTick();

    expect(wrapper.text()).toContain('Putt Poker');
    expect(wrapper.find('.pp-groups').exists()).toBe(true);
    // coin holder is shown
    expect(wrapper.find('.pp-coin strong').text()).toBe('Wes');
    // pot line is present
    expect(wrapper.find('.pp-pot').text()).toContain('$');
  });

  it('toggles round completion through the store', async () => {
    const store = useRoundStore();
    const { round, players } = demoRound();
    store.setRound(round, players);

    const wrapper = mountResults();
    expect(wrapper.find('.btn-complete').text()).toContain('Complete round');

    await wrapper.find('.btn-complete').trigger('click');
    expect(store.round?.completed).toBe(true);
    expect(wrapper.find('.btn-complete').text()).toContain('Reopen round');
    expect(wrapper.text()).toContain('Round Complete');
  });

  it('does not complete the round when completion confirmation is canceled', async () => {
    const store = useRoundStore();
    const { round, players } = demoRound();
    store.setRound(round, players);
    vi.spyOn(window, 'confirm').mockReturnValue(false);

    const wrapper = mountResults();
    await wrapper.find('.btn-complete').trigger('click');

    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('Complete this round?'));
    expect(store.round?.completed).toBe(false);
  });
});
