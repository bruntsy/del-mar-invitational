import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { nextTick } from 'vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ScorecardScreen from '@/components/screens/ScorecardScreen.vue';
import { defaultEventConfig } from '@/domain/events';
import { cloneDefaultGames } from '@/domain/games';
import { demoRound } from '@/fixtures/demoRound';
import { twoManScrambleTeamKey } from '@/scoring/twoManScramble';
import { useEventStore } from '@/stores/event';
import { useRoundStore } from '@/stores/round';

const push = vi.fn();
vi.mock('vue-router', () => ({
  useRouter: () => ({ push }),
}));

let pinia: ReturnType<typeof createPinia>;

function mountScorecard() {
  return mount(ScorecardScreen, { global: { plugins: [pinia] } });
}

beforeEach(() => {
  pinia = createPinia();
  setActivePinia(pinia);
  localStorage.clear();
  vi.unstubAllGlobals();
  push.mockClear();
});

function stubMobileViewport() {
  vi.stubGlobal('matchMedia', vi.fn((query: string) => ({
    matches: query.includes('max-width: 760px'),
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })));
}

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
    expect(wrapper.find('.sc-topbar-actions').text()).not.toContain('Mobile');
    expect(wrapper.find('.sc-topbar-actions').text()).not.toContain('Hole view');
    expect(wrapper.find('.sc-topbar-actions .btn-primary').text()).toContain('Results');
    // one score input per player per hole = 4 players * 18 holes
    expect(wrapper.findAll('.score-cell input')).toHaveLength(72);
  });

  it('does not duplicate identical club and course names in the header', () => {
    const store = useRoundStore();
    const { round, players } = demoRound();
    round.course = {
      ...round.course!,
      clubName: 'Salish Cliffs Golf Club',
      courseName: 'Salish Cliffs Golf Club',
      location: 'Shelton, WA',
    };
    store.setRound(round, players);

    const wrapper = mountScorecard();

    expect(wrapper.find('.sc-title').text()).toBe('Salish Cliffs Golf Club');
    expect(wrapper.find('.sc-title').text()).not.toContain(' — ');
    expect(wrapper.find('.sc-sub').text()).toContain('Shelton, WA');
    expect(wrapper.find('.sc-sub').text()).toContain('Blue tees');
  });

  it('shows a scorecard legend for the full scorecard table', () => {
    const store = useRoundStore();
    const { round, players } = demoRound();
    store.setRound(round, players);

    const wrapper = mountScorecard();
    const legend = wrapper.find('.score-legend');

    expect(legend.exists()).toBe(true);
    expect(legend.text()).toContain('Green = birdie');
    expect(legend.text()).toContain('Dot = stroke received');
    expect(legend.text()).toContain('SKN');
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

  it('nests a collapsible skins drawer near the scorecard', async () => {
    const store = useRoundStore();
    const { round, players } = demoRound();
    round.games.skins.enabled = true;
    round.games.skins.type = 'gross';
    store.setRound(round, players);
    store.setScore('Wes', 0, 3);
    store.setScore('Aaron', 0, 4);
    store.setScore('Tito', 0, 4);
    store.setScore('Q', 0, 4);
    for (const player of ['Wes', 'Aaron', 'Tito', 'Q']) store.setScore(player, 1, 4);

    const wrapper = mountScorecard();
    await nextTick();

    const drawer = wrapper.find('.skins-drawer');
    expect(drawer.exists()).toBe(true);
    expect(drawer.element.compareDocumentPosition(wrapper.find('.sc-table-wrap').element) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(drawer.text()).toContain('Skins');
    expect(drawer.text()).toContain('Wes 1');
    expect(drawer.find('.skins-drawer-body').exists()).toBe(false);

    await drawer.find('.skins-drawer-toggle').trigger('click');
    await nextTick();

    expect(drawer.find('.skins-drawer-body').exists()).toBe(true);
    expect(drawer.text()).toContain('Front 9');
    expect(drawer.text()).toContain('Hole 1');
    expect(drawer.text()).toContain('Wes');
    expect(drawer.text()).toContain('Par 4 · Gross birdie');
    expect(drawer.find('.skins-drawer-tile.tied').text()).toContain('Par 5 · No skin');
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

  it('renders two-man scramble pair rows in the main scorecard and writes team scores', async () => {
    const store = useRoundStore();
    const { round, players } = demoRound();
    round.games = cloneDefaultGames();
    round.games.twoManScramble.enabled = true;
    round.pairMatches = [{ a: ['Wes', 'Aaron'], b: ['Tito', 'Q'] }];
    round.playingGroups = [];
    store.setRound(round, players);

    const wrapper = mountScorecard();
    expect(wrapper.text()).toContain('Match 1 — Two-Man Scramble');
    expect(wrapper.text()).toContain('Wes + Aaron');
    expect(wrapper.text()).toContain('Tito + Q');
    expect(wrapper.findAll('.row-player')).toHaveLength(0);
    expect(wrapper.findAll('.score-cell input')).toHaveLength(36);

    const firstPairRow = wrapper.findAll('.row-format').find((row) => row.text().includes('Wes + Aaron'));
    expect(firstPairRow).toBeDefined();
    await firstPairRow!.find('.score-cell input').setValue('4');

    expect(store.readTeamScore(twoManScrambleTeamKey(0, 'a'), 0)).toBe(4);
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

  it('does not show settlement on the live scorecard', () => {
    const store = useRoundStore();
    const { round, players } = demoRound();
    store.setRound(round, players);

    const wrapper = mountScorecard();

    expect(store.hasBets).toBe(true);
    expect(wrapper.find('.sc-settlement').exists()).toBe(false);
    expect(wrapper.text()).not.toContain('Settlement');
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
    expect(wrapper.find('.sc-title').text()).toBe('Event Round 1');
    expect(wrapper.find('.sc-sub').text()).toContain('Round 1');
    expect(wrapper.find('.event-score-banner').text()).toContain('Round points');
    expect(wrapper.find('.event-score-banner').text()).toContain('Team A 2 - 0 Team B');
    expect(wrapper.find('.sc-topbar-actions').text()).toContain('Edit round');
    expect(wrapper.find('.sc-topbar-actions').text()).toContain('Back to event');
    expect(wrapper.find('.event-live').text()).toContain('Event Round 1');
    expect(wrapper.find('.event-live').text()).toContain('2v2 High Ball / Low Ball');
    expect(wrapper.find('.event-live').text()).toContain('Wes + Aaron vs Tito + Q');
    expect(wrapper.find('.event-live').text()).toContain('Low Ball Front: Wes + Aaron 1-0');
    expect(wrapper.find('.event-live').text()).toContain('High Ball Front: Wes + Aaron 1-0');
    expect(wrapper.find('.mp-live').exists()).toBe(true);
    expect(wrapper.find('.mp-live').text()).toContain('High Ball / Low Ball');
    expect(wrapper.find('.mp-live').text()).toContain('Low Ball');
    expect(wrapper.find('.mp-live').text()).toContain('High Ball');
    expect(wrapper.find('.mp-live').text()).toContain('Front');
    expect(wrapper.find('.mp-live').text()).toContain('Wes + Aaron');
    expect(wrapper.find('.mp-live').text()).toContain('9-0');
    expect(wrapper.find('.mp-table').text()).toContain('Wes + Aaron');
    expect(wrapper.find('.mp-table').text()).toContain('Tito + Q');
  });

  it('renders the putt poker panel and reflects the base pot', () => {
    const store = useRoundStore();
    const { round, players } = demoRound();
    store.setRound(round, players);

    const wrapper = mountScorecard();

    expect(wrapper.find('.sc-puttpoker').exists()).toBe(true);
    expect(wrapper.text()).toContain('Putt Poker');
    // demo buy-in is $2 over 4 players -> $8 base pot, every player starts with 2 cards
    expect(wrapper.text()).toContain('Pot is $8');
    expect(wrapper.text()).toContain('Coin state');
    expect(wrapper.text()).toContain('No 3 putts yet');
    expect(wrapper.text()).toContain('Cards');
    expect(wrapper.text()).not.toContain('Card lives remaining');
    expect(wrapper.findAll('.pp-card-count')).toHaveLength(4);
    expect(wrapper.find('.pp-card-count').text()).toContain('2 cards');
    expect(wrapper.find('.pp-card-count').text()).not.toContain('left');
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
    expect(filter.text()).toContain('Playing group');
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

  it('mobile viewport uses hole-by-hole scoring and keeps the full scorecard secondary', async () => {
    stubMobileViewport();
    const store = useRoundStore();
    const { round, players } = demoRound();
    store.setRound(round, players);

    const wrapper = mountScorecard();
    await nextTick();

    expect(wrapper.find('.mobile-card').exists()).toBe(true);
    expect(wrapper.find('.sc-table-wrap').exists()).toBe(false);
    expect(wrapper.text()).toContain('View full scorecard');
    expect(wrapper.find('.mobile-card-actions').text()).toContain('Results');

    await wrapper.find('.mobile-full-toggle').trigger('click');
    await nextTick();

    expect(wrapper.find('.sc-table-wrap').exists()).toBe(true);
    expect(wrapper.text()).toContain('Hide full scorecard');
  });

  it('mobile event scorecard defaults to one playing group with team context', async () => {
    stubMobileViewport();
    const roundStore = useRoundStore();
    const eventStore = useEventStore();
    const { round, players } = demoRound();
    round.id = 'event-round-1';
    round.groupId = 'g1';
    round.games = cloneDefaultGames();
    round.teamNames = { team1: 'Seattle', team2: 'Cali' };
    round.team1 = ['Wes', 'Aaron'];
    round.team2 = ['Tito', 'Q'];
    round.pairMatches = [{ a: ['Wes', 'Aaron'], b: ['Tito', 'Q'] }];
    round.playingGroups = [
      { name: 'Group 1', players: ['Wes', 'Tito'] },
      { name: 'Group 2', players: ['Aaron', 'Q'] },
    ];
    roundStore.setRound(round, players);

    const config = defaultEventConfig(['Wes', 'Aaron', 'Tito', 'Q']);
    config.teamNames = { team1: 'Seattle', team2: 'Cali' };
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

    expect(wrapper.find('.mobile-card').exists()).toBe(true);
    expect(wrapper.find('.group-filter').text()).toContain('Playing group');
    expect(wrapper.findAll('.group-filter .gf-btn')).toHaveLength(2);
    expect(wrapper.find('.mobile-event-context').text()).toContain('Group 1');
    expect(wrapper.find('.mobile-event-context').text()).toContain('Seattle vs Cali');
    expect(wrapper.find('.mobile-event-context').text()).toContain('Seattle');
    expect(wrapper.find('.mobile-event-context').text()).toContain('Cali');
    expect(wrapper.find('.mobile-event-context').text()).not.toContain('Round points');
    expect(wrapper.find('.mobile-match-status').text()).not.toContain('High Ball / Low Ball');
    expect(wrapper.find('.mobile-match-status').text()).toContain('Low Ball');
    expect(wrapper.find('.mobile-match-status').text()).toContain('Wes + Aaron vs Tito + Q');
    expect(wrapper.find('.mp-live').exists()).toBe(false);
    expect(wrapper.findAll('.mobile-player-row')).toHaveLength(2);
    expect(wrapper.find('.mobile-player-row').text()).toContain('Wes');
    expect(wrapper.findAll('.mobile-player-row')[1].text()).toContain('Tito');
  });

  it('mobile match Open shows a focused match scorecard dialog', async () => {
    stubMobileViewport();
    const roundStore = useRoundStore();
    const eventStore = useEventStore();
    const { round, players } = demoRound();
    round.id = 'event-round-1';
    round.groupId = 'g1';
    round.games = cloneDefaultGames();
    round.teamNames = { team1: 'Seattle', team2: 'Cali' };
    round.team1 = ['Wes', 'Aaron'];
    round.team2 = ['Tito', 'Q'];
    round.pairMatches = [{ a: ['Wes', 'Aaron'], b: ['Tito', 'Q'] }];
    round.playingGroups = [{ name: 'Group 1', players: ['Wes', 'Tito'] }];
    roundStore.setRound(round, players);

    const config = defaultEventConfig(['Wes', 'Aaron', 'Tito', 'Q']);
    config.teamNames = { team1: 'Seattle', team2: 'Cali' };
    config.rounds[0] = {
      ...config.rounds[0],
      name: 'Round 1',
      format: 'twoManHighBallLowBall',
      roundId: 'event-round-1',
      pairMatches: [{ a: ['Wes', 'Aaron'], b: ['Tito', 'Q'] }],
    };
    eventStore.event = { id: 'event-1', groupId: 'g1', name: 'Event Test', status: 'active', config };
    roundStore.setScore('Wes', 0, 4);
    roundStore.setScore('Aaron', 0, 5);
    roundStore.setScore('Tito', 0, 5);
    roundStore.setScore('Q', 0, 6);
    roundStore.setScore('Wes', 1, 5);
    roundStore.setScore('Aaron', 1, 5);
    roundStore.setScore('Tito', 1, 4);
    roundStore.setScore('Q', 1, 6);
    roundStore.setScore('Wes', 2, 3);
    roundStore.setScore('Aaron', 2, 4);
    roundStore.setScore('Tito', 2, 5);
    roundStore.setScore('Q', 2, 5);

    const wrapper = mountScorecard();
    await nextTick();

    expect(wrapper.find('.mobile-match-dialog').exists()).toBe(false);
    await wrapper.find('.mobile-match-open').trigger('click');
    await nextTick();

    expect(wrapper.find('.mobile-match-dialog').exists()).toBe(true);
    expect(wrapper.find('.mobile-match-dialog').text()).toContain('High Ball / Low Ball');
    expect(wrapper.find('.mobile-match-dialog').text()).toContain('Low Ball');
    expect(wrapper.find('.mobile-match-dialog').text()).toContain('Wes + Aaron vs Tito + Q');
    expect(wrapper.find('.mobile-match-dialog .mp-table').exists()).toBe(true);
    expect(wrapper.findAll('.mobile-match-dialog .mp-segment-card')).toHaveLength(3);
    expect(wrapper.find('.mobile-match-dialog').text()).toContain('Front');
    expect(wrapper.find('.mobile-match-dialog').text()).toContain('Back');
    expect(wrapper.find('.mobile-match-dialog').text()).toContain('Overall');
    expect(wrapper.find('.mobile-match-dialog').text()).toContain('Wes + Aaron');
    expect(wrapper.find('.mobile-match-dialog').text()).toContain('2 up thru 3');
    expect(wrapper.find('.mobile-match-dialog .mp-table').text()).toContain('Match');
    expect(wrapper.find('.mobile-match-dialog .mp-table').text()).not.toContain('Thru');
    const matchCells = wrapper.findAll('.mobile-match-dialog .mp-thru').map((cell) => cell.text());
    expect(matchCells).toContain('W+A +1');
    expect(matchCells.some((text) => /^[AB]\d+$/.test(text))).toBe(false);

    await wrapper.find('.mobile-dialog-head button').trigger('click');
    await nextTick();
    expect(wrapper.find('.mobile-match-dialog').exists()).toBe(false);
  });

  it('mobile event scorecard saves par scores and two putts for the visible playing group', async () => {
    stubMobileViewport();
    const roundStore = useRoundStore();
    const eventStore = useEventStore();
    const { round, players } = demoRound();
    round.id = 'event-round-1';
    round.groupId = 'g1';
    round.games = cloneDefaultGames();
    round.teamNames = { team1: 'Seattle', team2: 'Cali' };
    round.team1 = ['Wes', 'Aaron'];
    round.team2 = ['Tito', 'Q'];
    round.pairMatches = [{ a: ['Wes', 'Aaron'], b: ['Tito', 'Q'] }];
    round.playingGroups = [
      { name: 'Group 1', players: ['Wes', 'Tito'] },
      { name: 'Group 2', players: ['Aaron', 'Q'] },
    ];
    roundStore.setRound(round, players);

    const config = defaultEventConfig(['Wes', 'Aaron', 'Tito', 'Q']);
    config.teamNames = { team1: 'Seattle', team2: 'Cali' };
    config.rounds[0] = {
      ...config.rounds[0],
      name: 'Round 1',
      format: 'twoManHighBallLowBall',
      roundId: 'event-round-1',
      pairMatches: [{ a: ['Wes', 'Aaron'], b: ['Tito', 'Q'] }],
    };
    eventStore.event = { id: 'event-1', groupId: 'g1', name: 'Event Test', status: 'active', config };

    const wrapper = mountScorecard();
    await nextTick();

    expect(wrapper.find('.mobile-event-context').text()).toContain('Group 1');
    expect(wrapper.find('.mobile-hole-status').text()).toContain('Hole complete');
    expect(wrapper.find('.mobile-hole-status').text()).toContain('2 of 2 entered');
    expect(roundStore.readScore('Wes', 0)).toBe(4);
    expect(roundStore.readScore('Tito', 0)).toBe(4);
    expect(roundStore.readPutt('Wes', 0)).toBe(2);
    expect(roundStore.readPutt('Tito', 0)).toBe(2);
    expect(roundStore.readScore('Aaron', 0)).toBeNull();
    expect(roundStore.readPutt('Aaron', 0)).toBeNull();
  });

  it('mobile hole card shows players, score steppers, and hole navigation', async () => {
    stubMobileViewport();
    const store = useRoundStore();
    const { round, players } = demoRound();
    store.setRound(round, players);

    const wrapper = mountScorecard();
    await nextTick();

    expect(wrapper.find('.mobile-hole-num').text()).toBe('Hole 1');
    expect(wrapper.findAll('.mobile-player-row')).toHaveLength(4);
    expect(wrapper.find('.mobile-hole-status').text()).toContain('Hole complete');
    expect(wrapper.find('.mobile-score-key').text()).toContain('Stroke');
    expect(wrapper.find('.mobile-entry-header').text()).toContain('Score');
    expect(wrapper.find('.mobile-entry-header').text()).toContain('Putts');
    expect(wrapper.findAll('.mobile-score-block')).toHaveLength(8);
    expect(store.readScore('Wes', 0)).toBe(4);
    expect(store.readPutt('Wes', 0)).toBe(2);

    // navigate to hole 2
    const navBtns = wrapper.find('.mobile-hole-nav').findAll('button');
    await navBtns[1].trigger('click'); // → next
    await nextTick();

    expect(wrapper.find('.mobile-hole-num').text()).toBe('Hole 2');
  });

  it('mobile hole status marks complete holes and next jumps to the next open hole', async () => {
    stubMobileViewport();
    const store = useRoundStore();
    const { round, players } = demoRound();
    store.setRound(round, players);
    for (const player of store.playerNames) {
      store.setScore(player, 0, 4);
      store.setScore(player, 1, 4);
    }

    const wrapper = mountScorecard();
    await nextTick();

    expect(wrapper.find('.mobile-hole-num').text()).toBe('Hole 1');
    expect(wrapper.find('.mobile-hole-status').text()).toContain('Hole complete');
    expect(wrapper.find('.mobile-hole-status').text()).toContain('4 of 4 entered');
    expect(wrapper.find('.mobile-next-hole').text()).toContain('Next open: 3');

    await wrapper.find('.mobile-next-hole').trigger('click');
    await nextTick();

    expect(wrapper.find('.mobile-hole-num').text()).toBe('Hole 3');
    expect(wrapper.find('.mobile-hole-status').text()).toContain('Hole complete');
    expect(store.readScore('Wes', 2)).toBe(3);
  });

  it('mobile score stepper increments from the default par score', async () => {
    stubMobileViewport();
    const store = useRoundStore();
    const { round, players } = demoRound();
    store.setRound(round, players);

    const wrapper = mountScorecard();
    await nextTick();

    // The first player is Wes (Bay Cats team1[0])
    const firstRow = wrapper.find('.mobile-player-row');
    const plusBtn = firstRow.findAll('.stepper-btn')[1]; // + button
    await plusBtn.trigger('click');
    await plusBtn.trigger('click');
    await plusBtn.trigger('click');
    await wrapper.vm.$nextTick();

    expect(store.readScore('Wes', 0)).toBe(7);
  });

  it('mobile rows always include putt entry and default putts to two', async () => {
    stubMobileViewport();
    const store = useRoundStore();
    const { round, players } = demoRound();
    store.setRound(round, players);

    const wrapper = mountScorecard();
    await nextTick();

    const firstRow = wrapper.find('.mobile-player-row');
    expect(firstRow.classes()).toContain('mobile-player-row-putts');
    expect(firstRow.find('.mobile-entry-controls').exists()).toBe(true);

    const blocks = firstRow.findAll('.mobile-score-block');
    expect(blocks).toHaveLength(2);
    expect(wrapper.find('.mobile-entry-header').text()).toContain('Score');
    expect(wrapper.find('.mobile-entry-header').text()).toContain('Putts');
    expect(store.readPutt('Wes', 0)).toBe(2);

    const puttPlus = blocks[1].findAll('.stepper-btn')[1];
    await puttPlus.trigger('click');
    await puttPlus.trigger('click');
    await nextTick();

    expect(store.readPutt('Wes', 0)).toBe(4);
  });

  it('mobile defaults preserve existing score and putt values', async () => {
    stubMobileViewport();
    const store = useRoundStore();
    const { round, players } = demoRound();
    store.setRound(round, players);
    store.setScore('Wes', 0, 3);
    store.setPutt('Wes', 0, 1);

    const wrapper = mountScorecard();
    await nextTick();

    expect(store.readScore('Wes', 0)).toBe(3);
    expect(store.readPutt('Wes', 0)).toBe(1);
    expect(store.readScore('Aaron', 0)).toBe(4);
    expect(store.readPutt('Aaron', 0)).toBe(2);
    expect(store.readScore('Tito', 0)).toBe(4);
    expect(store.readScore('Q', 0)).toBe(4);
    expect(wrapper.find('.mobile-hole-status').text()).toContain('Hole complete');
    expect(wrapper.find('.mobile-fill-par').exists()).toBe(false);
  });

  it('mobile two-man scramble scores pair rows instead of individual players', async () => {
    stubMobileViewport();
    const store = useRoundStore();
    const { round, players } = demoRound();
    round.games = cloneDefaultGames();
    round.games.twoManScramble.enabled = true;
    round.pairMatches = [{ a: ['Wes', 'Aaron'], b: ['Tito', 'Q'] }];
    round.playingGroups = [];
    store.setRound(round, players);

    const wrapper = mountScorecard();
    await nextTick();

    expect(wrapper.find('.mobile-score-key').text()).toContain('Team score per side');
    expect(wrapper.findAll('.mobile-scramble-row')).toHaveLength(2);
    expect(wrapper.findAll('.mobile-player-row')).toHaveLength(2);
    expect(wrapper.find('.mobile-scramble-row').text()).toContain('Wes + Aaron');

    const plusBtn = wrapper.find('.mobile-scramble-row').findAll('.stepper-btn')[1];
    await plusBtn.trigger('click');
    await plusBtn.trigger('click');
    await nextTick();

    expect(store.readTeamScore(twoManScrambleTeamKey(0, 'a'), 0)).toBe(6);
    expect(store.readScore('Wes', 0)).toBeNull();
    expect(wrapper.find('.mobile-hole-strip .strip-btn').classes()).toContain('filled');
  });

  it('mobile defaults write two-man scramble team scores', async () => {
    stubMobileViewport();
    const store = useRoundStore();
    const { round, players } = demoRound();
    round.games = cloneDefaultGames();
    round.games.twoManScramble.enabled = true;
    round.pairMatches = [{ a: ['Wes', 'Aaron'], b: ['Tito', 'Q'] }];
    round.playingGroups = [];
    store.setRound(round, players);

    const wrapper = mountScorecard();
    await nextTick();

    expect(store.readTeamScore(twoManScrambleTeamKey(0, 'a'), 0)).toBe(4);
    expect(store.readTeamScore(twoManScrambleTeamKey(0, 'b'), 0)).toBe(4);
    expect(store.readScore('Wes', 0)).toBeNull();
    expect(wrapper.find('.mobile-hole-status').text()).toContain('Hole complete');
  });

  it('mobile hole strip marks filled holes and allows quick navigation', async () => {
    stubMobileViewport();
    const store = useRoundStore();
    const { round, players } = demoRound();
    store.setRound(round, players);
    store.setScore('Wes', 4, 5); // hole 5 has a score

    const wrapper = mountScorecard();
    await nextTick();

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
    expect(wrapper.find('.pp-state-grid').text()).toContain('Coin is with Wes');
    expect(wrapper.text()).toContain('Pot is $9');
    expect(wrapper.text()).toContain('1x 3-putt');
  });
});
