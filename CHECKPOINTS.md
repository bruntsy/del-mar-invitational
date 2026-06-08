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

## Checkpoint 4: Event Config Normalization

Date: 2026-06-08

Branch:

- `rewrite`
- Previous pushed checkpoint commit: `28723c4 Add core domain helpers`

Files changed since Checkpoint 3:

- Added `src/domain/events.ts`.
- Added `tests/domain/events.test.ts`.

Implementation notes:

- Ported event labels and scoring mode labels.
- Ported default event round construction.
- Ported event available-points and win-point calculation.
- Ported `defaultEventConfig()`.
- Ported `normalizeEventConfig()` as a pure function. It receives group player
  names as an argument rather than reading global `GROUP`.
- Preserved legacy behavior where players found in pair matches are pulled into
  event teams when missing.
- Pair matches are repaired to side-valid players and capped at two players per
  side.
- Events are clamped to 1-12 rounds.

Verification:

- `node scripts/event-format-tests.js`: passed.
- `npm run test:run`: passed, 7 files, 34 tests.
- `npm run build`: passed.

Next recommended steps:

1. Start extracting low-level scoring helpers that event scoring depends on:
   `playerHoleScore`, `pairBestBallScore`, `pairSegmentHoles`, and related
   range-score helpers.
2. Port `bestBallAggyHoleComponent()` and `eventRoundAvailablePoints()` parity
   assertions from the legacy event regression script.
3. Convert the existing legacy event-format regression cases into Vitest cases
   against the new pure event scoring module.

## Checkpoint 5: Pure Event Round Scoring

Date: 2026-06-08

Branch:

- `rewrite`
- Previous pushed checkpoint commit: `811c39e Add event config normalization`

Files changed since Checkpoint 4:

- Added `src/scoring/round.ts`.
- Added `src/scoring/eventRound.ts`.
- Added `tests/scoring/eventRound.test.ts`.

Implementation notes:

- Added pure score helpers for:
  - player hole score
  - player range score
  - pair best-ball score
  - pair aggregate score
  - pair range score
  - best-ball range score
  - pair match range wins
  - pair segment summaries
- Added pure event round scoring for:
  - best-ball Nassau style rounds
  - two-man best ball + aggy rounds
  - scramble event branches
- Ported the existing best-ball + aggy regression cases from the legacy script
  into Vitest against the new TypeScript scoring module.
- Event scoring now receives an explicit `EventRoundInput` instead of reading
  global `ROUND` or `EVENT`.

Verification:

- `node scripts/event-format-tests.js`: passed.
- `npm run test:run`: passed, 8 files, 43 tests.
- `npm run build`: passed.

Next recommended steps:

1. Add more event scoring coverage for best-ball Nassau, scramble match play,
   and stroke-play branches.
2. Port skins scoring as the next standalone game module.
3. Continue porting one scoring module at a time with golden tests before
   stores or UI consume them.

## Checkpoint 6: Event Scoring Branch Coverage

Date: 2026-06-08

Branch:

- `rewrite`
- Previous pushed checkpoint commit: `a86019e Add pure event round scoring`

Files changed since Checkpoint 5:

- Updated `tests/scoring/eventRound.test.ts`.

Implementation notes:

- Added event scoring tests for:
  - best-ball Nassau match play
  - best-ball Nassau stroke play
  - four-man scramble match play
  - four-man scramble stroke play
- Corrected test expectations around Nassau overall points after validating
  front/back/overall scoring math.

Verification:

- `node scripts/event-format-tests.js`: passed.
- `npm run test:run`: passed, 8 files, 47 tests.
- `npm run build`: passed.

Next recommended steps:

1. Port skins scoring as `src/scoring/skins.ts`.
2. Include tests for gross/net skins, incomplete holes, tied holes, and the
   current legacy no-carry result behavior.
3. Then move to best-ball/two-ball/aggy team game modules.

## Checkpoint 7: Skins Scoring

Date: 2026-06-08

Branch:

- `rewrite`
- Previous pushed checkpoint commit: `3ca99ff Expand event scoring coverage`

Files changed since Checkpoint 6:

- Added `src/scoring/skins.ts`.
- Added `tests/scoring/skins.test.ts`.

Implementation notes:

- Ported the current legacy skins behavior as a pure function.
- Current parity behavior is net-only skins, matching legacy `computeSkins()`.
  The legacy UI has a skins type config, but the old scoring helper does not
  currently branch on gross vs net.
- Skins stop at the first incomplete hole.
- Tied holes award no skin and do not carry a pending pot in the current parity
  implementation.

Verification:

- `node scripts/event-format-tests.js`: passed.
- `npm run test:run`: passed, 9 files, 52 tests.
- `npm run build`: passed.

Next recommended steps:

1. Port best-ball, two-ball, and aggy team scoring totals.
2. Add tests for partial rounds and completed front/back/overall totals.
3. Decide later whether to intentionally fix gross skins/carry behavior after
   parity is fully protected.
