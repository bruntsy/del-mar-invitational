# Del Mar Invitational Rewrite Plan

Created: 2026-06-08
Repo: `bruntsy/del-mar-invitational`
Current app: 3,557-line static `index.html` backed by Supabase
Target app: Vue 3 + TypeScript + Pinia + Vue Router + Vitest

## Goal

Rewrite the app into a typed, modular frontend without losing current feature
parity. The rewrite must preserve current group, round, event, scoring, sharing,
course search, history, stats, and mobile scoring behavior while making scoring
logic testable and data access safer.

The production cutover is allowed only after the new app can run old-vs-new
golden scoring comparisons and complete a full multi-device round flow.

## Architecture

Data flow:

```text
User action
  -> Pinia store action
  -> Pure scoring or typed service call
  -> Supabase / local persistence
  -> Reactive Vue screen render
```

Boundaries:

- `src/types`: data contracts and normalized shapes.
- `src/migrations`: old JSON and localStorage adapters.
- `src/scoring`: pure functions only. No Vue, Pinia, DOM, Supabase, or
  localStorage imports.
- `src/services`: Supabase, realtime sync, course search, persistence, and share
  links.
- `src/stores`: app state and typed actions.
- `src/components`: screen and UI rendering.

## Key Decisions

### Branch and Cutover

Build on a `rewrite` branch in the same repo. The current `main` branch remains
the working production app until cutover. At cutover, archive the old static app
as `legacy/index.html`.

### Hosting

Use Vercel preview deployments for the rewrite branch. GitHub Pages remains the
fallback until production cutover.

### Auth and Access Model

Use Supabase Anonymous Auth for zero-friction identity.

Do not rely on client-side room-code validation for secure joins. Membership
gating needs a server-side join primitive:

```sql
join_group_by_room_code(code text)
```

This RPC should be `SECURITY DEFINER`, validate the room code inside Postgres,
insert the caller into `group_members`, and return the group. This preserves the
current social room-code flow while allowing `groups`, `rounds`, and `events` to
be membership-gated by RLS.

### Score Cell Migration

Existing rows store score-like values as arrays:

```json
"scores": { "Robbie": [5, 4, null] }
```

The rewrite should support timestamped cells:

```json
"scores": { "Robbie": [{ "v": 5, "t": "2026-06-08T..." }] }
```

All scoring functions should consume normalized scalar values through helpers
such as `cellValue(cell)` and `scoreAt(matrix, player, hole)`. Writers should
use a single timestamped write helper. Legacy arrays must be migrated on read and
saved back on the next write.

## Execution Phases

### Phase 0: Baseline and Handoff Trail

Tasks:

- Confirm current repo state and upstream branch.
- Keep a `CHECKPOINTS.md` file updated with each meaningful stopping point.
- Run the existing event scoring test before changing behavior.
- Record current production assumptions from `README.md`.

Exit criteria:

- `node scripts/event-format-tests.js` passes on the old app.
- Rewrite plan is committed or at least present on the rewrite branch.
- Next-agent handoff notes exist.

Checkpoint note:

- Include branch, latest commit, dirty files, tests run, and next recommended
  command.

### Phase 1: Vite Foundation

Tasks:

- Create `rewrite` branch.
- Scaffold Vite + Vue 3 + TypeScript at repo root.
- Install runtime dependencies:
  - `vue`
  - `vue-router`
  - `pinia`
  - `@supabase/supabase-js`
- Install dev dependencies:
  - `typescript`
  - `vite`
  - `vitest`
  - `@vitejs/plugin-vue`
  - `@vue/test-utils`
  - `jsdom`
- Configure `vite.config.ts`, `tsconfig.json`, and basic scripts.
- Preserve the old app temporarily as `legacy/index.html` on the rewrite branch.
- Add a minimal Vue shell that compiles and renders.

Exit criteria:

- `npm run build` passes.
- `npm run test:run` passes, even if only smoke tests exist.
- Local dev server renders the skeleton.

Checkpoint note:

- Document install status, package manager files, dev URL, and any generated
  files.

### Phase 2: Types, Normalization, and Golden Fixtures

Tasks:

- Define all core domain types.
- Port normalization helpers before porting UI:
  - games
  - group players
  - rounds
  - event config
  - playing groups
  - legacy courses
  - timestamped score cells
- Build fixtures from known current shapes.
- Convert the existing event regression harness into Vitest.
- Add golden tests for old-array and new-cell score formats.

Exit criteria:

- Typecheck passes.
- Normalization tests pass.
- Existing event-format assertions pass in Vitest.
- Scoring code can read old and new score matrix shapes.

Checkpoint note:

- Identify which old functions have been ported and which remain in legacy.

### Phase 3: Pure Scoring Engine

Tasks:

- Port scoring into pure modules:
  - handicap
  - skins
  - best ball
  - pair match
  - scramble
  - two ball
  - aggy
  - head-to-head
  - stableford
  - three-man Nassau
  - wolf
  - putt poker
  - event round scoring
  - settlement
- Avoid any app state imports. Every function receives explicit inputs.
- Add tests for complete, partial, and malformed rounds.

Exit criteria:

- All scoring tests pass.
- No scoring module imports Vue, Pinia, Supabase, DOM, or browser globals.
- Golden outputs match the old app for representative rounds.

Checkpoint note:

- List tested game formats and remaining coverage gaps.

### Phase 4: Supabase Services, Auth, RLS, and Sync

Tasks:

- Add anonymous auth service.
- Add typed Supabase client wrapper.
- Design SQL migration for:
  - `group_members`
  - performance indexes
  - membership RLS policies
  - `join_group_by_room_code(code text)` RPC
- Implement service methods:
  - create group
  - join group by room code
  - load active round
  - save group
  - save round
  - load/save event
  - course search
- Implement realtime sync around timestamped cells.
- Add merge conflict tests.

Exit criteria:

- Two anonymous users cannot read each other's groups before joining.
- Join by room code grants membership.
- Two tabs can edit different score cells without losing data.
- RLS test checklist is documented, even if dashboard SQL is applied manually.

Checkpoint note:

- Include exact SQL applied or pending.

### Phase 5: Stores

Tasks:

- Build Pinia stores:
  - auth
  - group
  - round
  - event
  - setup
  - ui
- Keep persistence explicit and testable.
- Make setup wizard resumable after reload.
- Keep derived scoring values in getters or composables, not in components.

Exit criteria:

- Stores can create/join groups, build a round, enter scores, and compute
  results without final UI parity.
- Store tests cover state transitions and persistence.

Checkpoint note:

- Document store APIs so a later agent can wire screens without re-reading all
  internals.

### Phase 6: Screens Part 1

Tasks:

- Port:
  - home
  - hub
  - setup course
  - setup players
  - setup teams/matchups
  - setup games
  - setup confirm
  - scorecard
  - results
- Preserve mobile score entry behavior.
- Keep visual changes restrained until parity is proven.

Exit criteria:

- Happy path works: create group -> setup round -> enter scores -> results.
- Desktop and mobile layouts are usable.
- Current feature behavior is either preserved or documented as intentionally
  changed.

Checkpoint note:

- Include screenshots or browser QA notes for desktop and mobile.

### Phase 7: Screens Part 2 and Cutover

Tasks:

- Port:
  - event builder
  - event round config
  - event leaderboard
  - history
  - stats
  - share links
- Add old localStorage migration.
- Add existing data migration instructions for membership rows.
- Verify end-to-end event flow.
- Archive legacy app.
- Deploy preview, then production.

Exit criteria:

- Feature parity with current app.
- Tests and build pass.
- Multi-device sync is verified.
- Existing data remains accessible after membership migration.

Checkpoint note:

- Include cutover checklist and rollback path.

## Running Handoff Checklist

At every checkpoint, update `CHECKPOINTS.md` with:

- Date and time.
- Branch and commit hash.
- Dirty worktree summary.
- Files changed.
- Tests run and result.
- Manual QA performed.
- Known risks.
- Exact next steps.

## Current Known Risks

- RLS room-code join flow must be server-side or the app will either leak group
  metadata or block legitimate joins.
- Timestamped score cells must be abstracted behind helpers or the scoring port
  will become brittle.
- The old app has many implicit repair functions around event rosters. These
  should become explicit normalization rules and store actions.
- The original five-session estimate is likely optimistic. Plan for several
  checkpointed work sessions.
