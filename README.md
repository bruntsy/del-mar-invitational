# Del Mar Invitational

Live golf scorecard and games app for Del Mar Invitational groups.

Production: https://bruntsy.github.io/del-mar-invitational/

## Overview

This is a single-page application for creating a golf group, building rounds, scoring live with multiple devices, and settling common golf games. The app is intentionally lightweight: the browser owns the UI and round logic, Supabase stores group/round state, and GitHub Pages serves the static app.

The current product model is:

- A **Group** is the persistent home for a roster and group code.
- A **Round** belongs to one group and contains the selected course, teams, games, scores, putts, and completion status.
- A group can have one active round and many completed rounds.
- Completed rounds feed history and all-time stats scoped to that group.

## Stack

- Vue 3, TypeScript, Pinia, Vue Router, and Vite for the rewrite UI.
- `src/scoring`: pure scoring modules ported from the legacy app.
- `src/stores/round.ts`: local round state, derived scoring getters, and
  persistence.
- `legacy/index.html`: preserved monolith used as the parity oracle during the
  migration.
- Supabase Postgres: `groups`, `events`, `rounds`, and `courses_cache`.
- Supabase Realtime: live sync for active rounds.
- Supabase Edge Functions: course search proxy/cache.
- GolfCourseAPI: course/tee data source.
- GitHub Pages: static production hosting from `main`.

The `rewrite` branch is now a Vite app. The old static app remains in
`legacy/index.html` until rewrite parity is complete.

## Repository Layout

```text
.
├── index.html              # Vite entry
├── legacy/index.html       # old static app / parity oracle
├── src
│   ├── components/screens
│   ├── domain
│   ├── fixtures
│   ├── scoring
│   ├── stores
│   └── types
├── tests
├── README.md
├── CHECKPOINTS.md
└── supabase
    ├── config.toml
    └── functions
        ├── course-search
        │   └── index.ts
        └── ghin-lookup
            └── index.ts
```

Notes:

- `course-search` is the active Edge Function.
- `ghin-lookup` is disabled for production. It returns HTTP 410 and makes no GHIN/API calls, so players are added manually.
- `CHECKPOINTS.md` is the rewrite handoff trail and should be updated before
  each pushed checkpoint.

## Local Development

Install dependencies once:

```bash
npm install
```

Configure Supabase credentials. Copy the example env file and fill in the
project URL and publishable anon key (read by the rewrite via
`import.meta.env`):

```bash
cp .env.example .env
```

The committed `.env.example` lists the required `VITE_SUPABASE_URL` and
`VITE_SUPABASE_ANON_KEY` keys. `.env` is gitignored. With both vars set,
`src/services/supabase.ts` constructs the client; when either is missing the
client is `null` and `hasSupabase()` returns `false`, so callers fall back to
local-only behavior.

Run the Vite dev server:

```bash
npm run dev
```

Open:

```text
http://localhost:5173/
```

Run regression and build checks:

```bash
node scripts/event-format-tests.js
npm run test:run
npm run build
```

The legacy static app can still be served directly for parity checks:

```bash
python3 -m http.server 5174
```

## Dependencies

### Browser

The rewrite frontend uses the packages listed in `package.json`.

### Supabase Edge Function

`supabase/functions/course-search/index.ts` runs on Supabase Edge Runtime / Deno and imports:

```ts
https://deno.land/std@0.168.0/http/server.ts
https://esm.sh/@supabase/supabase-js@2
```

### External Services

- Supabase project: `dhpkeueubhpmvaungjfj`
- GolfCourseAPI: used only by the `course-search` function

## Supabase Configuration

`supabase/config.toml` makes course search public:

```toml
[functions.course-search]
verify_jwt = false
```

This is intentional because the public static app calls the function directly from the browser.

## Required Supabase Secrets

The course-search function requires:

```bash
supabase secrets set GOLF_COURSE_API_KEY=...
```

Supabase injects these automatically for deployed Edge Functions:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

The service role key is used only inside the Edge Function to read/write `courses_cache`.

## Database Schema

The app expects these tables and policies.

```sql
create table if not exists groups (
  id         uuid primary key default gen_random_uuid(),
  room_code  text unique not null,
  name       text not null default '',
  players    jsonb not null default '{}',
  created_at timestamptz not null default now()
);

alter table groups enable row level security;

create policy "anon full access"
on groups
for all
using (true)
with check (true);

create table if not exists rounds (
  id           uuid primary key default gen_random_uuid(),
  code         text not null,
  group_id     uuid references groups(id),
  state        jsonb not null default '{}',
  completed    boolean not null default false,
  completed_at timestamptz,
  created_at   timestamptz not null default now()
);

alter table rounds enable row level security;

create policy "anon full access"
on rounds
for all
using (true)
with check (true);

create index if not exists rounds_group_id_idx on rounds(group_id);

create table if not exists events (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references groups(id) on delete cascade,
  name text not null default '',
  config jsonb not null default '{}',
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table events enable row level security;

create policy "events are publicly readable and writable"
on events
for all
using (true)
with check (true);

create index if not exists events_group_id_idx on events(group_id);
create index if not exists events_status_idx on events(status);

create table if not exists courses_cache (
  cache_key  text primary key,
  data       jsonb not null,
  cached_at  timestamptz not null default now()
);

alter table courses_cache enable row level security;

create policy "anon full access"
on courses_cache
for all
using (true)
with check (true);
```

Realtime must include `rounds` and `events`:

```sql
alter publication supabase_realtime add table rounds;
alter publication supabase_realtime add table events;
```

If schema changes do not appear immediately:

```sql
notify pgrst, 'reload schema';
```

## Security Model

This is a public invite-style app, not an authenticated app.

- The browser uses the Supabase publishable key.
- RLS policies currently allow anonymous full access.
- Group codes provide lightweight obscurity, not hard security.
- Do not store sensitive data in group/round state.

If this becomes a broader public product, add authentication and tighten RLS by group membership.

## State Model

### Local Storage Keys

- `dmi_group`: current group state
- `dmi_round`: current active round state
- `dmi_recent_groups`: recent groups opened on this browser for quick switching
- `dmi_mobile_hole_*`: last selected mobile scoring hole for a round
- `golf_scorecard_v1`: legacy key used only for migration fallback

### Group Object

Persisted in Supabase `groups.players` and localStorage:

```js
GROUP = {
  id,
  roomCode,
  name,
  players: {
    [name]: {
      name,
      handicapIndex
    }
  }
}
```

### Round Object

Persisted as `rounds.state` JSONB and localStorage:

```js
ROUND = {
  id,
  groupId,
  course: {
    id,
    clubName,
    courseName,
    location,
    tee: {
      name,
      gender,
      rating,
      slope,
      parTotal,
      yards
    },
    par: [18 values],
    si: [18 stroke index values],
    yds: [18 values]
  },
  team1: [],
  team2: [],
  teamNames: {
    team1: 'Team 1',
    team2: 'Team 2'
  },
  matchups: [
    { t1, t2 }
  ],
  pairMatches: [
    {
      a: ['Team 1 player', 'Team 1 player'],
      b: ['Team 2 player', 'Team 2 player']
    }
  ],
  games: {
    skins: { enabled, pot, type, carry },
    bestBall: { enabled, front, back, total, balls, type },
    pairMatch: { enabled, pointsPerHole, type },
    twoBall: { enabled, front, back, total, type },
    aggy: { enabled, front, back, total, type },
    h2h: { enabled, perMatchup, type },
    stableford: { enabled, buyIn, type, points },
    wolf: { enabled, amount, type, nassau },
    puttPoker: { enabled, pot }
  },
  scores: {
    [player]: [18 values]
  },
  putts: {
    [player]: [18 values]
  },
  wolf: {
    holes: {
      [holeIndex]: { wolf, mode, partner }
    }
  },
  completed
}
```

### Legacy Compatibility

Legacy course constants are kept in `index.html` for old completed rounds and migrated localStorage data. New rounds use searched course objects from GolfCourseAPI.

## Course Search

Course search is browser -> Supabase Edge Function -> GolfCourseAPI.

Function:

```text
supabase/functions/course-search/index.ts
```

Behavior:

- Requires query text.
- Checks `courses_cache` first.
- Cache TTL is 30 days.
- Calls GolfCourseAPI when cache is absent/stale.
- Normalizes course, location, tee, and hole data for the frontend.

Deploy:

```bash
supabase functions deploy course-search --no-verify-jwt
```

## Round Flow

1. Home screen: create or join a group.
2. Group hub: view active round, roster, team event, history, and stats.
3. Course setup: search course, select tee, preview WHS course handicap.
4. Player setup: add/remove manual players.
5. Team setup: assign players to two teams and set team names.
6. Games setup: enable game formats and configure amounts/scoring.
7. Scorecard: enter scores/putts.
8. Results: view standings, game results, and settlement.
9. Complete round: saves as historical completed round.

## Team Events

The group hub can create one active configurable event stored in `events.config`.
Events define team names, player-team assignments, any number of rounds, round
formats, pairings, point values, side games, and manual event-point results.

Event rounds still launch as normal `rounds` rows. That keeps the existing
scorecard, bets, player PnL, and settlement logic intact.

Supported event round formats include:

- 2v2 net best ball Nassau
- 2v2 two-man scramble Nassau configuration
- Team A vs Team B 4-man scramble
- Custom round setup

Skins can be enabled per event round and still run across the round's players.
Putt poker can be enabled per event round and is displayed by playing group.

## Handicap Logic

Course handicap uses the WHS formula:

```text
round(handicapIndex * slope / 113 + rating - par)
```

Stroke dots and net scores are relative to the lowest course handicap in the match:

```text
player strokes = player course handicap - lowest course handicap
```

## Game Mechanics

All games are disabled by default for a new round. The setup screen has presets, but users can enable games individually.

### Skins

- Pot model.
- Each player contributes `pot`.
- Tied holes award no skin.
- No carry-forward.
- Final pot is split evenly by number of skins won.

### Best Ball

- Team game.
- Uses low score per team per hole.
- Supports front/back/total amounts.
- Supports net or gross.

### Pair Match Play

- Two-person best-ball match play.
- Explicit pairing builder in setup.
- Each match selects up to two players from each team.
- Points per hole are configurable.
- Points roll up across all pair matches to team totals.
- Supports net or gross.

Event rounds can also use pair match play via the event builder.

### 4-Man Scramble

- Team game.
- Uses one gross team score per hole for each side.
- Supports front/back/total amounts.
- Settlement pays/charges every player on the winning/losing team.

### 2-Ball

- Team game.
- Uses sum of two low scores per team per hole.
- Supports front/back/total amounts.
- Supports net or gross.

### Aggy

- Team aggregate.
- Every player on the team counts.
- Supports front/back/total amounts.
- Supports net or gross.

### Head-to-Head

- Individual matchup list from team setup.
- Team 2 order can be rearranged to set matchups.
- Supports net or gross.

### Stableford

Default points:

- Double bogey or worse: 0
- Bogey: 1
- Par: 2
- Birdie: 3
- Eagle: 4
- Albatross or better: 5

Current settlement model is winner-take-pot among highest Stableford points, split on ties.

### Wolf

- Per-hole wolf, partner/solo choice, and partner state are persisted under `round.wolf.holes`.
- Pure scoring helpers compute hole results, segment points, segment winners, and settlement.
- Winning solo players receive 2 points; winning two-player sides receive 1 point per player.
- Pushes award no points and do not carry.
- Settlement is winner-take-pot by segment, split on ties.
- `nassau` switches settlement/results from overall only to front/back/overall.
- Larger Wolf UX improvements are intentionally deferred.

### Putt Poker

- Optional per-person buy-in/pot.
- Card count starts at 2.
- 0-putt adds 2 cards.
- 1-putt adds 1 card.
- 3-putt moves the coin and adds $1 to the pot.
- 4+ putt moves the coin and adds $2 to the pot.
- Pure scoring helpers compute card counts, coin holder, pot, and per-player
  3-putt/4+ putt penalty counts.
- The coin follows the most recent penalty putt in hole order, then player order.
- Putt poker is a standalone pot and does not feed the settlement P&L ledger.

### Settlement

- Pure helpers aggregate every money game into a per-player profit/loss map and
  reduce it to a minimal "who pays who" transfer list.
- `computePlayerPnL()` composes skins, best ball, scramble, two-ball, aggy,
  head-to-head, Stableford, three-man Nassau, and Wolf results.
- `computeSettlement()` greedily matches the largest debtor to the largest
  creditor until everyone is square.
- Putt poker and pair match play are not part of the P&L, matching the legacy
  monolith. `gamesHaveBets()` still counts putt poker when deciding whether to
  show the settlement section.

### Round Store (rewrite)

- `src/stores/round.ts` is the Pinia store that the rewrite UI builds on.
- It holds the active `RoundState` plus the player handicap-index map and
  persists both to `localStorage` under `dmi_round`.
- Derived getters mirror the legacy globals: `playerNames` (team1 then team2),
  `courseHandicaps` (`computeWHSCourseHcp`), `strokes` (`allocateNetStrokes`),
  and a `scoreContext` consumed by every pure scoring module.
- Scoring/results getters (`skins`, `settlement`, `playerTotals`,
  `leaderboard`, `teamNetTotals`, `teamGameResults`, `pairMatchResult`,
  `wolfResult`, `stablefordResult`, `threeManNassauResult`, `puttPokerGroups`,
  `puttPokerFor`, `hasBets`) wire the pure modules to the live round.
- Score, putt, and team-score mutations write timestamped cells via
  `writeCell()` so concurrent edits stay sync-friendly.
- `setCompleted()` marks a round complete or reopens it locally, then schedules
  the same debounced Supabase round-state sync as score edits.

### Scorecard Screen (rewrite)

- `src/components/screens/ScorecardScreen.vue` is the first real rewrite screen,
  routed at `/scorecard`.
- It renders the player rows, par/stroke-index rows, per-hole score inputs with
  birdie/bogey color coding and net-stroke dots, OUT/IN/TOT/NET/SKN columns, and
  a live settlement panel.
- When 4-man scramble is enabled, it renders one gross team-score row per side
  and writes those scores to `round.teamScores`.
- When Best Ball or 2-Ball are enabled, it renders read-only derived team rows
  from the player score matrix.
- When Pair Match Play is enabled, it renders live match cards backed by
  `store.pairMatchResult`.
- When Wolf is enabled, it renders an editable per-hole Wolf panel backed by
  `store.wolfResult` and `store.setWolfHole`.
- All scoring is read from the round store getters; the component does no
  scoring math of its own beyond display formatting.
- `src/fixtures/demoRound.ts` seeds a ready-to-score sample round so the screen
  is reachable from the home screen before the full setup flow exists.
- Each player row has a collapsible putt-tracking row (green for 0-1 putts,
  neutral for 2, red for 3+), and a putt poker panel renders per playing group
  with coin holder, card counts, penalty notes, and the running pot — all read
  from `store.puttPokerFor`.
- A **group filter bar** appears when the round has more than one playing group.
  Clicking a group name limits the main table to that group's players; "All"
  restores the full view. The filter also constrains the mobile player list.
- A **Mobile mode** toggle swaps the 18-column table for a per-hole card:
  hole number/par/SI header, per-player score and putt steppers (−/input/+),
  and an 18-button hole strip for quick navigation. The current hole is persisted
  to `dmi_mobile_hole_<roundId|local>` in localStorage.

### Setup Screen (rewrite)

- `src/components/screens/SetupScreen.vue`, routed at `/setup`, creates a round
  without the demo fixture.
- Sections: course search/manual course fields (club/course/location, tee
  rating/slope, editable par + SI + yardage grids), teams and players (name +
  handicap index + team per row), and a games config covering skins, best ball,
  pair match play, 4-man scramble, two-ball, aggy, head-to-head, Stableford,
  three-man Nassau, Wolf, and putt poker.
- Course search calls the public `course-search` Edge Function through
  `src/services/courseSearch.ts`. `src/domain/courseSearch.ts` filters usable
  18-hole tees, collapses duplicate tee sets, repairs invalid stroke indexes,
  and maps selected tees into the round `Course` shape. Selecting a tee fills
  rating, slope, par, SI/stroke index, and yardage before handicap/stroke
  getters run. Selected courses render a compact tee marker plus par, yardage,
  rating, and slope badges before the front/back-nine summary.
- The player section previews each named player's handicap index, WHS course
  handicap, relative strokes, and SI-based stroke-hole list using the shared
  handicap helpers. The preview updates immediately when course rating, slope,
  par, SI, player indexes, or a searched tee changes.
- When an active group has roster players, setup pre-fills player rows from
  that roster, split evenly across the two teams. The setup roster remains
  round-local after prefill, so one-off edits do not mutate the group roster.
- "Start round" validates (par present, both teams populated, unique names),
  builds the `RoundState` + player handicap map, generates head-to-head matchups
  by zipping `team1[i]` vs `team2[i]` (as legacy did), writes through
  `store.startRound`, and routes to the scorecard.
- When an online Supabase-backed group is active, `store.startRound` inserts a
  `rounds` row and keeps the returned DB id on the active round so realtime sync
  can push score edits. Without a remote group id or Supabase credentials, setup
  keeps the existing local-only behavior.
- Manual course entry remains available when Supabase is unconfigured or course
  search fails.
- A **Playing Groups** section previews the auto-assigned groups (derived from
  pair-match pairings when Pair Match Play is enabled, otherwise interleaved
  team order) and allows renaming each group before the round starts. Group names
  and assignments are written into `round.playingGroups` and drive the scorecard
  group filter and putt poker per-group panel.

### Results Screen (rewrite)

- `src/components/screens/ResultsScreen.vue`, routed at `/results`, renders the
  first rewrite results view.
- It shows team net scores, an individual leaderboard sorted by net score,
  a share-ready story-of-round summary, settlement P&L and transfer rows,
  enabled team-game front/back/total breakdowns, pair-match results, Wolf
  standings/detail tables, a Stableford points table (best-first, leader
  highlighted), a 3-Man Nassau segment table (solo vs best-ball of side,
  Front/Back/Overall, with invalid-roster note when the round has ≠ 3 players),
  a per-group Putt Poker summary (coin holder, card counts, penalties, final
  pot), and a skins breakdown.
- High Ball / Low Ball results use prominent Front 9 / Back 9 / Overall cards
  that show the segment score and winner before the compact hole-by-hole detail.
- The screen uses round-store getters for all scoring and formatting inputs; it
  does not recompute game math in the component.
- Rounds can be marked complete or reopened locally from the results screen.
- Home and scorecard screens now link to results.
- All legacy per-game detail panels have now been ported. Completed-round
  history persistence is wired via the group/history stores (Checkpoint 29).

### Group Membership (rewrite)

- `src/stores/group.ts` is the Pinia group store, porting the legacy
  create/join/leave/rename and recent-group helpers. It holds the active
  `Group`, the per-browser recent-groups list, and a status/busy state, and
  persists to `localStorage` under `dmi_group` / `dmi_recent_groups`.
- `src/domain/group.ts` holds the pure mappers `normalizeGroup` (DB row →
  camelCase `Group`), `groupForDb` (`Group` → DB columns), and `generateCode()`
  (4-char room code).
- The store is local-first with a graceful no-credentials fallback via
  `hasSupabase()`: when Supabase is unconfigured, `createGroup` makes an offline
  group (null DB id) and `joinGroup` reports that remote join is unavailable
  instead of throwing. With credentials, create inserts a `groups` row (retrying
  on code collision), join selects by `room_code`, and group saves sync the
  name plus roster.
- The group store exposes roster actions to add, update, and remove players.
  Roster changes persist locally and update `groups.players` when the active
  group has a Supabase id.
- `src/components/screens/GroupScreen.vue`, routed at `/group` and linked from
  the home screen, renders create / join-by-code / recent-groups when there is
  no active group, and the group code, editable name, roster editor, Leave, and
  a "Past rounds" history section when there is one.

### Round History (rewrite)

- `src/domain/round.ts` holds the DB↔domain mappers: `normalizeRoundRow` parses
  a `rounds` row (handling JSON string or object `state`, letting the row's
  `id`/`group_id`/`completed` win over stale copies in the blob), and
  `summarizeRound` reduces a completed round to per-player net + skins sorted by
  net. `normalizeRoundState` (moved here from the round store) is the shared
  repair helper used by both the local load path and the DB row mapper.
- `src/stores/round.ts` has a new `loadActiveRound(groupId)` action that fetches
  the group's latest incomplete round from Supabase and makes it active. It fires
  automatically on every `joinGroup` call (legacy `loadActiveRound`).
- `src/stores/history.ts` is the Pinia history store: `loadHistory(groupId)`
  selects all completed rounds for a group (newest first) and maps each through
  `normalizeRoundRow` → `summarizeRound` into a `RoundSummary[]`. Clears rather
  than throwing when offline.
- `GroupScreen.vue` loads history on mount and after join/switch, and renders a
  per-round card (course name, completed date, player net/skins table) when a
  group is active and Supabase is configured.
- `src/stores/stats.ts` is the Pinia all-time stats store: `loadStats(groupId)`
  queries the same completed rounds as history and aggregates per-player metrics
  (rounds played, avg gross, avg net, total skins) from `rounds.state.players`
  snapshots — stable even if the live roster changes. `GroupScreen.vue` renders
  the stats panel below history when Supabase is configured and data exists.
- `src/stores/event.ts` is the Pinia event store. It fetches the active `events`
  row for a group (`loadEvent`), creates events with `defaultEventConfig`
  (`createEvent`), saves/archives, and owns the round-launch link flow:
  `setPendingRoundLink(index)` before navigating to /setup; `linkRound(roundId)`
  after `startRound` writes the new round ID into `config.rounds[N].roundId`.
  `loadLinkedRounds()` fetches round states for all linked IDs into `cachedRounds`.
  `subscribeToEvent(groupId)` subscribes to Postgres `events` changes and refreshes
  the local config + cache on any remote update. `standings` getter sums
  `pointsResult` across rounds.
- `src/composables/useEventLeaderboard.ts` is a reactive composable that computes
  per-round `EventRoundResult` values from live round store context (when the active
  round ID matches a linked round) or from `cachedRounds` (for completed rounds).
  Totals prefer stored `pointsResult` when set. `GroupScreen.vue` renders the full
  leaderboard: live standings with leading-team highlight, per-round breakdown cards
  with Front/Back/Overall match tables, Launch buttons for unlinked rounds, and
  event leader cards for contributed points, closing points, skins won, holes
  won, best pair record, most valuable match, and best net average. Event team
  games use team-colored match scoreboard cards for Best Ball, Best Ball +
  Aggy, High Ball / Low Ball, and scramble formats so segment winners are
  named directly instead of encoded as ambiguous score chips. The scorecard
  live-event chip view also names the winning pair inside the same colored chip
  as the segment score.

## Realtime Sync

- `src/domain/round.ts` exposes `roundForDb()` and `mergeRoundData()` so
  Supabase round-state writes and realtime reads use the same pure mapping and
  legacy cell-level merge behavior.
- `src/stores/round.ts` owns the sync lifecycle: local edits still persist to
  `localStorage` immediately, then `scheduleSync()` debounces `pushToSupabase()`
  by about 600ms for active rounds that have a DB id.
- `startRound(round, players, groupId)` inserts a new `rounds` row when a
  Supabase-backed group is active, then normalizes the returned row into the
  active store state. Insert failures fall back to a local round with a visible
  sync error.
- `pushToSupabase()` first reads the current `rounds` row, merges any remote
  non-null score/putt/team-score cells, then updates `rounds.state` and
  `rounds.completed`.
- `subscribeToGroup(groupId)` opens a Supabase Realtime channel filtered by
  `group_id`; updates for the active round are merged into the store, inserts of
  incomplete rounds become the active round, and local echo payloads are ignored
  with a last-pushed guard.
- `startPolling()` keeps a 10-second active-round polling fallback while a group
  subscription is open. `stopGroupSubscription()` clears the channel, debounce
  timer, and polling timer on leave/reset.
- Group create/join starts the subscription when Supabase is configured; leaving
  a group stops it. Offline/no-credential mode remains a no-op.
- Score, putt, and team-score merge logic avoids remote nulls wiping out local
  non-null values.

For multi-device testing, use two browsers/devices joined to the same group code.

## Deployment

### App

Production is currently the old static app on `main`. The rewrite branch is
also configured as the Vercel production-tracked branch during migration, so
push rewrite checkpoints frequently:

```bash
git push origin rewrite
```

For the legacy GitHub Pages app, commit and push to `main`:

```bash
git add index.html README.md
git commit -m "Describe change"
git push
```

GitHub Pages deploys automatically from `main`.

Check latest Pages build:

```bash
gh api repos/bruntsy/del-mar-invitational/pages/builds/latest
```

### Edge Function

Deploy course search:

```bash
supabase functions deploy course-search --no-verify-jwt
```

Set/update GolfCourseAPI key:

```bash
supabase secrets set GOLF_COURSE_API_KEY=...
```

## Production / Event Day

### Hosting

The rewrite is deployed to Vercel. The production URL is the same domain as the
Vercel project linked to the `rewrite` branch. Push the branch to trigger a new
deployment:

```bash
git push origin rewrite
```

`vercel.json` contains an SPA rewrite rule so all client-side routes
(`/group`, `/setup`, `/scorecard`, `/results`) respond with `index.html`
when hit directly or refreshed.

The legacy static app remains live at https://bruntsy.github.io/del-mar-invitational/
served from the `main` branch via GitHub Pages. Once the rewrite is confirmed
primary, redirect or remove the legacy URL.

### Schema Migration (fresh Supabase project)

Run these SQL statements in the Supabase SQL editor in order:

1. Create the tables and enable RLS (copy the full schema from the **Database Schema** section above).
2. Add the realtime publication:

```sql
alter publication supabase_realtime add table rounds;
alter publication supabase_realtime add table events;
```

3. Deploy the course-search edge function:

```bash
supabase functions deploy course-search --no-verify-jwt
supabase secrets set GOLF_COURSE_API_KEY=<key>
```

4. Copy `.env.example` to `.env` and fill in `VITE_SUPABASE_URL` and
   `VITE_SUPABASE_ANON_KEY` with the new project's values.

### Security Notes

All four tables use broad anonymous RLS (`using (true) with check (true)`).
This is intentional for a closed invite-style event — group codes provide
lightweight access control. Do **not** store sensitive personal data in group
or round state. If the app expands beyond a private event group, tighten RLS
by adding authentication and scoping policies to authenticated users.

The one meaningful risk on the current model: any anonymous client can DELETE
any row (groups, rounds, or events). For the Del Mar event this is acceptable
because the player list is small and known. If you want to reduce the blast
radius, replace the `for all` policies with separate `SELECT/INSERT/UPDATE`
policies (omitting DELETE).

### Event Day Flow

1. **Before the event**: create the group, add the full roster, and create the
   event (set team names and assign players to teams).
2. **Round launch**: from the group hub, click **Launch** next to a round slot.
   The setup screen pre-fills the event roster split across the two teams.
   Select the course, configure games, and start the round. The new round ID
   is automatically linked back into the event.
3. **Live scoring**: all players join the same group code on their devices.
   Scores sync in realtime; the event leaderboard in the group hub updates
   as each round completes.
4. **After each round**: mark the round complete from the results screen.
   Recorded event points flow into the leaderboard standings.
5. **End of event**: archive the event from the group hub to close it out.
   Completed rounds remain in group history and all-time stats.

## Testing Checklist

### Smoke Test

- Load production URL.
- Create a group.
- Add players.
- Search a course.
- Select tee.
- Build teams.
- Name teams.
- Enable games.
- Start round.

### Sync Test

- Open the same group on two devices/browsers.
- Enter scores from both.
- Confirm both scorecards converge.
- Confirm results reflect all scores.

### Game Test

Test at least:

- Skins only
- Best Ball
- Pair Match Play with custom pairings
- Aggy
- H2H
- Putt Poker

### Mobile Test

- Games setup cards
- Sticky setup actions
- Mobile hole-entry panel
- Scorecard horizontal scrolling
- Results readability

## Known Limitations

- No authentication.
- GHIN lookup is disabled for production to avoid GHIN/API usage limits and paid access.
- Wolf UX needs more work before heavy use.
- Pair Match Play supports multiple matches, but the app does not yet model physical foursomes, tee times, or a full 12-group event board.
- Larger event architecture should add `foursomes` and `matches` as explicit concepts.

## Future Architecture Direction

For larger events, move from a single-round/two-team model toward:

- Event/group roster
- Round course and games
- Foursomes with tee order / tee time
- Matches assigned to foursomes
- Match formats: four-ball, singles, alternate shot, scramble, stableford, skins
- Event scoreboard aggregating all match points by team

This would support scenarios like 12 physical groups going out across two large teams with multiple simultaneous match types.
