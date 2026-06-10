import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SetupScreen from '@/components/screens/SetupScreen.vue';
import { cloneDefaultGames } from '@/domain/games';
import { defaultEventConfig } from '@/domain/events';
import { useEventStore } from '@/stores/event';
import { useRoundStore } from '@/stores/round';

const { mockSearchCourses, routeQuery } = vi.hoisted(() => ({
  mockSearchCourses: vi.fn(),
  routeQuery: { value: {} as Record<string, string> },
}));

const push = vi.fn();
vi.mock('vue-router', () => ({
  useRouter: () => ({ push }),
  useRoute: () => ({ query: routeQuery.value }),
}));
vi.mock('@/services/courseSearch', () => ({
  searchCourses: mockSearchCourses,
}));
vi.mock('@/services/supabase', () => ({
  supabase: null,
  hasSupabase: () => false,
}));

let pinia: ReturnType<typeof createPinia>;

function mountSetup() {
  return mount(SetupScreen, { global: { plugins: [pinia] } });
}

function persistGroup(players: Record<string, { name: string; handicapIndex: number }>) {
  localStorage.setItem('dmi_group', JSON.stringify({
    id: 'g1',
    roomCode: 'TEST',
    name: 'Test Group',
    players,
  }));
}

function inputValue(input: ReturnType<ReturnType<typeof mountSetup>['find']>) {
  return (input.element as HTMLInputElement).value;
}

async function fillDefaultPlayers(wrapper: ReturnType<typeof mountSetup>) {
  const rows = wrapper.findAll('.player-row');
  const setRow = async (row: ReturnType<typeof wrapper.findAll>[number], name: string, idx: string) => {
    const inputs = row.findAll('input');
    await inputs[0].setValue(name);
    await inputs[1].setValue(idx);
  };
  await setRow(rows[0], 'Ann', '10');
  await setRow(rows[1], 'Bea', '12');
  await setRow(rows[2], 'Cal', '6');
  await setRow(rows[3], 'Dan', '20');
}

beforeEach(() => {
  pinia = createPinia();
  setActivePinia(pinia);
  localStorage.clear();
  push.mockClear();
  mockSearchCourses.mockReset();
  routeQuery.value = {};
});

describe('SetupScreen', () => {
  it('blocks starting until both teams have a player', () => {
    const wrapper = mountSetup();
    const start = wrapper.find('.btn-primary');

    // default form has empty player names -> teams empty -> disabled
    expect(start.attributes('disabled')).toBeDefined();
    expect(wrapper.text()).toContain('needs at least one player');
  });

  it('flags duplicate player names', async () => {
    const wrapper = mountSetup();
    const names = wrapper.findAll('.player-row .form-input');
    await names[0].setValue('Sam');
    await names[3].setValue('Sam'); // second row's name field (index 3 = 4th input pair start)

    expect(wrapper.text()).toContain('unique');
  });

  it('prefills players from the active group roster', async () => {
    persistGroup({
      Cal: { name: 'Cal', handicapIndex: 6 },
      Ann: { name: 'Ann', handicapIndex: 10 },
      Bea: { name: 'Bea', handicapIndex: 12 },
      Dan: { name: 'Dan', handicapIndex: 20 },
    });
    const wrapper = mountSetup();

    await flushPromises();

    const rows = wrapper.findAll('.player-row');
    expect(rows).toHaveLength(4);
    expect(inputValue(rows[0].findAll('input')[0])).toBe('Ann');
    expect(inputValue(rows[1].findAll('input')[0])).toBe('Bea');
    expect(inputValue(rows[2].findAll('input')[0])).toBe('Cal');
    expect(inputValue(rows[3].findAll('input')[0])).toBe('Dan');
    expect((wrapper.findAll('.team-select')[0].element as HTMLSelectElement).value).toBe('team1');
    expect((wrapper.findAll('.team-select')[2].element as HTMLSelectElement).value).toBe('team2');
  });

  it('allows round-local roster edits after group prefill', async () => {
    persistGroup({
      Ann: { name: 'Ann', handicapIndex: 10 },
      Bea: { name: 'Bea', handicapIndex: 12 },
      Cal: { name: 'Cal', handicapIndex: 6 },
      Dan: { name: 'Dan', handicapIndex: 20 },
    });
    const store = useRoundStore();
    const wrapper = mountSetup();
    await flushPromises();

    const firstRow = wrapper.findAll('.player-row')[0];
    await firstRow.findAll('input')[0].setValue('Avery');
    await firstRow.findAll('input')[1].setValue('8.5');
    await wrapper.find('.setup-actions .btn-primary').trigger('click');
    await flushPromises();

    expect(store.round?.team1).toEqual(['Avery', 'Bea']);
    expect(store.players.Avery).toEqual({ name: 'Avery', handicapIndex: 8.5 });
    expect(store.players.Ann).toBeUndefined();
  });

  it('builds a round from the form and routes to the scorecard', async () => {
    const store = useRoundStore();
    const wrapper = mountSetup();

    await fillDefaultPlayers(wrapper);

    await wrapper.find('.btn-primary').trigger('click');

    expect(store.round).not.toBeNull();
    expect(store.round?.team1).toEqual(['Ann', 'Bea']);
    expect(store.round?.team2).toEqual(['Cal', 'Dan']);
    expect(store.playerNames).toEqual(['Ann', 'Bea', 'Cal', 'Dan']);
    // h2h matchups zip team1[i] vs team2[i]
    expect(store.round?.matchups).toEqual([
      { t1: 'Ann', t2: 'Cal' },
      { t1: 'Bea', t2: 'Dan' },
    ]);
    // handicap map drives course handicaps
    expect(store.courseHandicaps.Ann).toBeGreaterThan(store.courseHandicaps.Cal);
    expect(push).toHaveBeenCalledWith('/scorecard');
  });

  it('previews course handicaps and stroke holes from the current course', async () => {
    const wrapper = mountSetup();

    await fillDefaultPlayers(wrapper);

    const rows = wrapper.findAll('.hcp-preview-row');
    expect(rows).toHaveLength(4);
    expect(rows[0].text()).toContain('Ann');
    expect(rows[0].text()).toContain('Idx 10');
    expect(rows[0].text()).toContain('Course 10');
    expect(rows[0].text()).toContain('+4');
    expect(rows[0].text()).toContain('Holes 2, 11, 7, 13');
    expect(rows[2].text()).toContain('Low');
    expect(rows[2].text()).toContain('No strokes');
  });

  it('fills course fields from selected search tee', async () => {
    const store = useRoundStore();
    mockSearchCourses.mockResolvedValue([
      {
        id: 'course-1',
        clubName: 'Del Mar Country Club',
        courseName: 'Championship',
        location: 'Del Mar, CA',
        tees: {
          male: [
            {
              name: 'Black',
              gender: 'Men',
              rating: 74.2,
              slope: 138,
              parTotal: 72,
              yards: 7011,
              holes: Array.from({ length: 18 }, (_, index) => ({
                par: index % 6 === 2 ? 3 : index % 6 === 4 ? 5 : 4,
                yardage: 350 + index,
                si: index === 0 ? 7 : index,
              })),
            },
          ],
        },
      },
    ]);
    const wrapper = mountSetup();

    await wrapper.find('.course-search-input').setValue('Del Mar');
    await wrapper.find('.course-search-btn').trigger('click');
    await flushPromises();
    await wrapper.find('.course-result').trigger('click');
    await wrapper.find('.tee-result').trigger('click');

    await fillDefaultPlayers(wrapper);
    await wrapper.find('.btn-primary').trigger('click');

    expect(mockSearchCourses).toHaveBeenCalledWith('Del Mar');
    expect(store.round?.course).toMatchObject({
      id: 'course-1',
      clubName: 'Del Mar Country Club',
      courseName: 'Championship',
      location: 'Del Mar, CA',
      tee: { name: 'Black', gender: 'Men', rating: 74.2, slope: 138, parTotal: 72, yards: 7011 },
    });
    expect(store.round?.course?.par).toHaveLength(18);
    expect(store.round?.course?.si).toEqual(Array.from({ length: 18 }, (_, index) => index + 1));
    expect(store.round?.course?.yds[0]).toBe(350);
  });

  it('updates the handicap preview when a searched tee is selected', async () => {
    mockSearchCourses.mockResolvedValue([
      {
        id: 'course-1',
        clubName: 'Del Mar Country Club',
        courseName: 'Championship',
        location: 'Del Mar, CA',
        tees: {
          male: [
            {
              name: 'Black',
              gender: 'Men',
              rating: 74.2,
              slope: 138,
              parTotal: 72,
              yards: 7011,
              holes: Array.from({ length: 18 }, (_, index) => ({
                par: 4,
                yardage: 350 + index,
                si: index + 1,
              })),
            },
          ],
        },
      },
    ]);
    const wrapper = mountSetup();

    await fillDefaultPlayers(wrapper);
    expect(wrapper.findAll('.hcp-preview-row')[0].text()).toContain('Course 10');

    await wrapper.find('.course-search-input').setValue('Del Mar');
    await wrapper.find('.course-search-btn').trigger('click');
    await flushPromises();
    await wrapper.find('.course-result').trigger('click');
    await wrapper.find('.tee-result').trigger('click');

    expect(wrapper.findAll('.hcp-preview-row')[0].text()).toContain('Course 14');
    expect(wrapper.findAll('.hcp-preview-row')[3].text()).toContain('+17');
    expect(wrapper.findAll('.hcp-preview-row')[3].text()).toContain('Holes 1, 2, 3');
  });

  it('keeps manual course setup available when search fails', async () => {
    mockSearchCourses.mockRejectedValue(new Error('Course search failed.'));
    const wrapper = mountSetup();

    await wrapper.find('.course-search-input').setValue('Pebble');
    await wrapper.find('.course-search-btn').trigger('click');
    await flushPromises();

    expect(wrapper.text()).toContain('Course search failed.');
    // Fallback: the search UI stays available so the user can retry.
    expect(wrapper.find('.course-search-input').exists()).toBe(true);
    expect(wrapper.find('.course-search-btn').exists()).toBe(true);
  });

  it('includes 4-man scramble config in the created round', async () => {
    const store = useRoundStore();
    const wrapper = mountSetup();

    await fillDefaultPlayers(wrapper);

    const scrambleRow = wrapper.findAll('.game-row').find((row) => row.text().includes('4-Man Scramble'));
    expect(scrambleRow).toBeDefined();
    await scrambleRow!.find('input[type="checkbox"]').setValue(true);
    const money = scrambleRow!.findAll('input[type="number"]');
    await money[0].setValue('5');
    await money[1].setValue('5');
    await money[2].setValue('10');

    await wrapper.find('.btn-primary').trigger('click');

    expect(store.round?.games.scramble4).toMatchObject({
      enabled: true,
      front: 5,
      back: 5,
      total: 10,
      type: 'gross',
    });
  });

  it('shows playing groups preview after players are entered', async () => {
    const wrapper = mountSetup();
    await fillDefaultPlayers(wrapper);

    const pg = wrapper.find('.pg-list');
    expect(pg.exists()).toBe(true);
    // 4 players, auto-split into 1 group of 4 (or 2 of 2 depending on pair match)
    const chips = pg.findAll('.pg-player-chip');
    expect(chips).toHaveLength(4);
    expect(pg.text()).toContain('Ann');
    expect(pg.text()).toContain('Dan');
  });

  it('includes playingGroups in the created round', async () => {
    const store = useRoundStore();
    const wrapper = mountSetup();
    await fillDefaultPlayers(wrapper);
    await wrapper.find('.btn-primary').trigger('click');

    expect(store.round?.playingGroups).toBeDefined();
    expect(store.round!.playingGroups.length).toBeGreaterThan(0);
    const allPlayers = store.round!.playingGroups.flatMap((g) => g.players);
    expect(allPlayers).toContain('Ann');
    expect(allPlayers).toContain('Dan');
  });

  it('allows renaming a playing group before starting the round', async () => {
    const store = useRoundStore();
    const wrapper = mountSetup();
    await fillDefaultPlayers(wrapper);

    const nameInput = wrapper.find('.pg-name-input');
    await nameInput.setValue('Bay Boys');

    await wrapper.find('.btn-primary').trigger('click');

    expect(store.round?.playingGroups[0].name).toBe('Bay Boys');
  });

  it('builds pair matches when a team game is enabled', async () => {
    const store = useRoundStore();
    const wrapper = mountSetup();
    await fillDefaultPlayers(wrapper);

    const aggyRow = wrapper.findAll('.game-row').find((row) => row.text().includes('Best Ball + Aggy'));
    expect(aggyRow).toBeDefined();
    await aggyRow!.find('input[type="checkbox"]').setValue(true);
    await flushPromises();

    // Match builder appears and a default match is seeded (whole team1 vs team2).
    expect(wrapper.find('.pair-match-builder').exists()).toBe(true);
    expect(wrapper.text()).toContain('Match 1 — Ann / Bea vs Cal / Dan');

    await wrapper.find('.btn-primary').trigger('click');

    expect(store.round?.pairMatches).toEqual([{ a: ['Ann', 'Bea'], b: ['Cal', 'Dan'] }]);
  });

  it('uses event round config as read-only launch source and preserves the main game', async () => {
    persistGroup({
      Ann: { name: 'Ann', handicapIndex: 10 },
      Bea: { name: 'Bea', handicapIndex: 12 },
      Cal: { name: 'Cal', handicapIndex: 6 },
      Dan: { name: 'Dan', handicapIndex: 20 },
    });
    const eventStore = useEventStore();
    const roundStore = useRoundStore();
    const config = defaultEventConfig(['Ann', 'Bea', 'Cal', 'Dan']);
    config.rounds[0] = {
      ...config.rounds[0],
      format: 'twoManBestBallAggy',
      scoringMode: 'matchPlay',
      bestBallBet: { front: 5, back: 5, total: 10, type: 'gross' },
      skins: { enabled: true, pot: 3, type: 'net' },
    };
    eventStore.event = { id: 'e1', groupId: 'g1', name: 'Cup', status: 'active', config };
    eventStore.setPendingRoundLink(0);

    const wrapper = mountSetup();
    await flushPromises();

    expect(wrapper.findAll('.player-row')).toHaveLength(0);
    expect(wrapper.find('.event-roster-preview').text()).toContain('Ann');
    expect(wrapper.text()).not.toContain('+ Add player');

    await wrapper.find('.setup-actions .btn-primary').trigger('click');
    await flushPromises();

    expect(roundStore.round?.games.bestBall.enabled).toBe(false);
    expect(roundStore.round?.games.bestBallAggy).toMatchObject({
      enabled: true,
      scoreBasis: 'gross',
      scoringMode: 'match',
      stake: { front: 5, back: 5, overall: 10 },
    });
    expect(roundStore.round?.games.skins).toMatchObject({ enabled: true, pot: 3, type: 'net' });
  });

  it('no longer renders a global scoring-mode toggle', async () => {
    const wrapper = mountSetup();
    await fillDefaultPlayers(wrapper);
    expect(wrapper.text()).not.toContain('Scoring Mode');
  });

  it('prefills a read-only course scorecard with a Change action in edit mode', async () => {
    routeQuery.value = { edit: '1' };
    const store = useRoundStore();
    store.setRound(
      {
        id: 'r1',
        groupId: null,
        course: {
          id: 'c1',
          clubName: 'Pebble Beach',
          courseName: 'Links',
          location: 'CA',
          tee: { name: 'Gold', gender: 'Men', rating: 75, slope: 144, parTotal: 72, yards: 7000 },
          par: [5, 4, 3, 4, 4, 3, 5, 4, 4, 4, 4, 3, 5, 4, 4, 3, 5, 4],
          si: [1, 7, 15, 5, 11, 17, 3, 9, 13, 8, 2, 16, 4, 12, 10, 18, 6, 14],
          yds: Array(18).fill(400),
        },
        team1: ['Al'],
        team2: ['Bo'],
        teamNames: { team1: 'T1', team2: 'T2' },
        pairMatches: [],
        playingGroups: [{ name: 'Group 1', players: ['Al', 'Bo'] }],
        matchups: [],
        games: { ...cloneDefaultGames(), skins: { enabled: true, pot: 3, type: 'net', carry: false } },
        scores: {},
        putts: {},
        teamScores: {},
        wolf: { holes: {} },
        completed: false,
      } as unknown as Parameters<typeof store.setRound>[0],
      { Al: { name: 'Al', handicapIndex: 7 }, Bo: { name: 'Bo', handicapIndex: 14 } },
    );

    const wrapper = mountSetup();
    await flushPromises();

    // Prefill must run to completion past the reactive games clone, so the
    // read-only scorecard + Change action appear (regression: structuredClone
    // on the reactive games proxy used to throw and abort the prefill).
    expect(wrapper.find('.cs-card').exists()).toBe(true);
    expect(wrapper.text()).toContain('Pebble Beach — Links');
    expect(wrapper.text()).toContain('Change course');
    const names = wrapper.findAll('.player-row input').map((i) => (i.element as HTMLInputElement).value);
    expect(names).toContain('Al');
    expect(names).toContain('Bo');
  });

  it('adds and removes player rows', async () => {
    const wrapper = mountSetup();
    expect(wrapper.findAll('.player-row')).toHaveLength(4);

    await wrapper.find('.setup-card:nth-of-type(2) .btn-ghost').trigger('click');
    expect(wrapper.findAll('.player-row')).toHaveLength(5);

    await wrapper.findAll('.btn-remove')[0].trigger('click');
    expect(wrapper.findAll('.player-row')).toHaveLength(4);
  });
});
