# Rewrite Checkpoints

This file is the handoff trail for the Del Mar Invitational rewrite. Each
checkpoint should be enough for another agent to resume without relying on chat
history.

## Checkpoint 0: Baseline Plan

Date: 2026-06-08

Branch:

- `main`
- Upstream: `origin/main`
- Current HEAD before rewrite work: `b98c6db Fix mobile layout overflow on hub and roster screens`

Local worktree notes:

- Existing untracked `.playwright-cli/` directory was present before rewrite
  work and should be ignored unless browser artifacts are needed.
- Added `REWRITE_PLAN.md`.
- Added this `CHECKPOINTS.md`.

Baseline app shape:

- Current app is a static monolith at `index.html`.
- `index.html` is 3,557 lines.
- Existing regression harness is `scripts/event-format-tests.js`.
- Supabase functions live under `supabase/functions`.
- Current production host in `README.md` is GitHub Pages.

Baseline verification:

- `node scripts/event-format-tests.js` passed on 2026-06-08.

Key plan corrections:

- Use server-side `join_group_by_room_code(code text)` RPC for membership-gated
  room-code joins.
- Put score-cell timestamp migration behind compatibility helpers before
  porting scoring.
- Treat scoring parity and RLS verification as hard gates before UI cutover.

Next recommended steps:

1. Create or switch to branch `rewrite`.
2. Preserve the old app as `legacy/index.html` on the rewrite branch.
3. Scaffold Vite + Vue + TypeScript at repo root.
4. Run build and test smoke checks.

## Checkpoint 1: Vite Scaffold and Cell Compatibility Foundation

Date: 2026-06-08

Branch:

- `rewrite`
- Base commit: `b98c6db`
- No rewrite commit has been created yet.

Files changed:

- Added repo execution docs:
  - `REWRITE_PLAN.md`
  - `CHECKPOINTS.md`
- Added `.gitignore`.
- Copied old static app to `legacy/index.html`.
- Replaced root `index.html` with Vite entry markup.
- Added Vue/TypeScript scaffold:
  - `package.json`
  - `package-lock.json`
  - `vite.config.ts`
  - `tsconfig.json`
  - `tsconfig.node.json`
  - `src/main.ts`
  - `src/App.vue`
  - `src/router/index.ts`
  - `src/components/screens/HomeScreen.vue`
  - `src/styles/main.css`
- Added domain type foundations under `src/types`.
- Added score-cell compatibility helpers in `src/scoring/cells.ts`.
- Added tests:
  - `tests/smoke/app.test.ts`
  - `tests/scoring/cells.test.ts`
- Updated `scripts/event-format-tests.js` to run as ESM and read
  `legacy/index.html`.

Verification:

- `node scripts/event-format-tests.js`: passed.
- `npm run test:run`: passed, 2 files, 7 tests.
- `npm run build`: passed.
- Browser QA: Vite dev server at `http://127.0.0.1:5173/` rendered the Vue
  shell with heading `Del Mar Invitational` and status
  `Foundation scaffold is running.`

Install notes:

- `npm install` completed and generated `package-lock.json`.
- NPM reported 5 vulnerabilities, 4 moderate and 1 critical. No forced audit
  fix was run because scaffold stability matters more than taking breaking
  dependency changes blindly.

Current worktree notes:

- `node_modules/`, `dist/`, `.playwright-cli/`, and `output/playwright/` are
  ignored.
- The Vite dev server was stopped after browser QA.

Next recommended steps:

1. Port `DEFAULT_GAMES` and `normalizeGames` into typed modules.
2. Port event config normalization into pure helpers with tests.
3. Convert the legacy event-format assertions into first-class Vitest tests
   that use the new pure event scoring modules, while keeping the legacy script
   as an oracle until parity is proven.
4. Start extracting handicap and player score helpers before full game modules.

## Checkpoint 2: Game Config Normalization

Date: 2026-06-08

Branch:

- `rewrite`
- Base commit: `b98c6db`
- No rewrite commit has been created yet.

Files changed since Checkpoint 1:

- Added `src/domain/games.ts`.
- Added `tests/domain/games.test.ts`.

Implementation notes:

- Ported `DEFAULT_GAMES` from the legacy monolith into a typed module.
- Added `cloneDefaultGames()`.
- Added `normalizeGames()`.
- `normalizeGames()` is explicit per game key instead of using a generic
  assignment, because TypeScript correctly rejects assigning across the union of
  game config shapes.
- Stableford point config is deep-merged so partial point overrides keep default
  values for omitted outcomes.

Verification:

- `node scripts/event-format-tests.js`: passed.
- `npm run test:run`: passed, 3 files, 11 tests.
- `npm run build`: passed.

Next recommended steps:

1. Add `src/domain/players.ts` for `normalizedGroupPlayers()` and
   `groupPlayerNames()` equivalents.
2. Add `src/domain/playingGroups.ts` for auto/normalize playing group helpers.
3. Add `src/scoring/handicap.ts` for `computeWHSCourseHcp()` and
   `getsStroke()`.
4. Begin porting event config normalization once players and playing groups are
   available.

## Checkpoint 3: Player, Playing Group, and Handicap Helpers

Date: 2026-06-08

Branch:

- `rewrite`
- Previous pushed checkpoint commit: `3619448 Add Vue rewrite foundation`

Files changed since Checkpoint 2:

- Added `src/domain/players.ts`.
- Added `src/domain/playingGroups.ts`.
- Added `src/scoring/handicap.ts`.
- Added tests:
  - `tests/domain/players.test.ts`
  - `tests/domain/playingGroups.test.ts`
  - `tests/scoring/handicap.test.ts`

Implementation notes:

- Ported legacy player normalization behavior for modern player objects and old
  string-based player entries.
- Ported automatic playing-group helpers:
  - chunk players into fours
  - interleave two teams
  - derive groups from pair matches
  - repair invalid/missing group assignments
- Ported handicap primitives:
  - `computeWHSCourseHcp()`
  - `getsStroke()`
  - relative net stroke allocation

Verification:

- `node scripts/event-format-tests.js`: passed.
- `npm run test:run`: passed, 6 files, 26 tests.
- `npm run build`: passed.

Next recommended steps:

1. Port event format labels/default event round config into `src/domain/events.ts`.
2. Port `normalizeEventConfig()` using the new player and playing-group helpers.
3. Add tests for default event config, pair-match repair, duplicate team removal,
   and win-point calculation.
4. After event config normalization passes, begin extracting event round scoring.
