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

- `index.html`: all frontend HTML, CSS, and JavaScript.
- Supabase Postgres: `groups`, `events`, `rounds`, and `courses_cache`.
- Supabase Realtime: live sync for active rounds.
- Supabase Edge Functions: course search proxy/cache.
- GolfCourseAPI: course/tee data source.
- GitHub Pages: static production hosting from `main`.

There is no frontend build step and no runtime package install required for the static app.

## Repository Layout

```text
.
├── index.html
├── README.md
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
- `package-lock.json` is not required for the app.

## Local Development

Run a local static server from the repo root:

```bash
python3 -m http.server 5173
```

Open:

```text
http://localhost:5173/
```

You can also open `index.html` directly, but a local HTTP server is closer to production behavior.

Run event format regression tests:

```bash
node scripts/event-format-tests.js
```

## Dependencies

### Browser

The app loads Supabase JS from CDN in `index.html`.

No npm dependencies are required for the frontend.

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
    wolf: { enabled, amount, type },
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

Wolf scoring support exists in state/results and can be enabled, with per-hole choices on scorecard. Larger Wolf UX improvements are intentionally deferred.

### Putt Poker

- Optional per-person buy-in/pot.
- Card count starts at 2.
- 0-putt adds 2 cards.
- 1-putt adds 1 card.
- 3-putt moves the coin and adds $1 to the pot.
- 4+ putt moves the coin and adds $2 to the pot.

## Realtime Sync

Sync target:

```text
rounds.state
```

Mechanics:

- Local edits write immediately to localStorage.
- Remote push is debounced by about 600ms.
- Supabase Realtime listens for `rounds` changes filtered by `group_id`.
- A 10-second polling fallback also refreshes active round state.
- Score and putt merge logic avoids remote nulls wiping out local non-null values.

For multi-device testing, use two browsers/devices joined to the same group code.

## Deployment

### App

Commit and push to `main`:

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
