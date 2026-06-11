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

## Checkpoint 8: Team Game Scoring

Date: 2026-06-08

Branch:

- `rewrite`
- Previous pushed checkpoint commit: `bc8fdbc Add skins scoring module`
- Empty Vercel trigger commit was pushed as `bc036bd Trigger Vercel rewrite preview`

Files changed since Checkpoint 7:

- Added `src/scoring/teamGames.ts`.
- Added `tests/scoring/teamGames.test.ts`.

Implementation notes:

- Ported best-ball, two-ball, and aggy team game helpers.
- Supports gross and net score modes.
- Preserves legacy partial-round behavior: totals include completed holes and
  skip incomplete holes.
- Returns `null` totals when no complete holes exist.

Verification:

- `node scripts/event-format-tests.js`: passed.
- `npm run test:run`: passed, 10 files, 59 tests.
- `npm run build`: passed.

Next recommended steps:

1. Port pair match play and head-to-head helpers.
2. Port Stableford scoring.
3. Continue keeping each scoring module pure and covered before stores/UI use it.

## Checkpoint 9: Pair Match and Head-to-Head Scoring

Date: 2026-06-08

Branch:

- `rewrite`
- Previous pushed checkpoint commit: `29894d7 Add team game scoring`

Files changed since Checkpoint 8:

- Added `src/scoring/pairMatch.ts`.
- Added `src/scoring/headToHead.ts`.
- Added `tests/scoring/pairMatch.test.ts`.
- Added `tests/scoring/headToHead.test.ts`.

Implementation notes:

- Ported pair-match repair/default generation behavior.
- Ported best-ball pair match scoring with configurable points per hole and
  gross/net modes.
- Added support for the best-ball + aggy point mode used by event rounds.
- Ported head-to-head total comparison with gross/net scoring.

Verification:

- `node scripts/event-format-tests.js`: passed.
- `npm run test:run`: passed, 12 files, 67 tests.
- `npm run build`: passed.

Next recommended steps:

1. Port Stableford scoring with configurable point map.
2. Port three-man Nassau.
3. Port Wolf and putt poker after the simpler scoring modules are covered.

## Checkpoint 10: Stableford Scoring

Date: 2026-06-08

Branch:

- `rewrite`
- Previous pushed checkpoint commit: `c764bab Add pair match and head-to-head scoring`

Files changed since Checkpoint 9:

- Added `src/scoring/stableford.ts`.
- Added `tests/scoring/stableford.test.ts`.

Implementation notes:

- Ported Stableford point mapping from the legacy monolith.
- Added pure per-player Stableford totals with configurable point maps.
- Preserved legacy behavior where incomplete holes are skipped and the player
  still receives totals for completed holes.
- Supports gross and net scoring by reusing the shared player-hole score helper.

Verification:

- `node scripts/event-format-tests.js`: passed.
- `npm run test:run`: passed, 13 files, 73 tests.
- `npm run build`: passed.

Next recommended steps:

1. Port three-man Nassau.
2. Port Wolf scoring after three-man Nassau is covered.
3. Port putt poker and then begin wiring pure modules into Pinia stores/UI.

## Checkpoint 11: Three-Man Nassau Scoring

Date: 2026-06-08

Branch:

- `rewrite`
- Current pushed commit: `29d14f1 Add stableford scoring`

Files changed since Checkpoint 10:

- Added `src/scoring/threeManNassau.ts`.
- Added `tests/scoring/threeManNassau.test.ts`.

Implementation notes:

- Ported three-man Nassau scoring from the legacy monolith as pure helpers.
- Added the front, back, and overall segment definitions.
- Scores each player as solo against the other two players' best ball.
- Preserves legacy partial-round behavior: incomplete solo or side segments
  remain open, while completed side holes require both side players.
- Supports gross and net scoring by reusing the shared range scoring helpers.
- Added a pure settlement helper for the legacy amount-per-opponent payout
  behavior.

Verification:

- `node scripts/event-format-tests.js`: passed.
- `npm run test:run`: passed, 14 files, 81 tests.
- `npm run build`: passed.

Next recommended steps:

1. Port Wolf scoring.
2. Port putt poker after Wolf scoring is covered.
3. Begin wiring pure modules into Pinia stores/UI once remaining scoring
   helpers are protected.

## Checkpoint 12: Wolf Scoring

Date: 2026-06-08

Branch:

- `rewrite`
- Current pushed commit: `c66d9f4 Update three-man Nassau handoff`

Files changed since Checkpoint 11:

- Added `src/scoring/wolf.ts`.
- Added `tests/scoring/wolf.test.ts`.
- Updated `README.md`.

Implementation notes:

- Ported Wolf scoring from the legacy monolith as pure helpers.
- Added default per-hole Wolf config generation, preserving the rotating wolf
  and first available partner behavior.
- Added per-hole result scoring for partner and solo modes.
- Added overall-only and Nassau front/back/overall segment helpers.
- Added segment winner detection and pure settlement for the winner-take-pot
  behavior, split on ties.
- Preserved legacy behavior where pushes do not carry and incomplete holes
  award no points.
- Supports gross and net scoring by reusing the shared player-hole score helper.

Verification:

- `node scripts/event-format-tests.js`: passed.
- `npm run test:run`: passed, 15 files, 91 tests.
- `npm run build`: passed.

Next recommended steps:

1. Port putt poker.
2. Begin wiring pure modules into Pinia stores/UI once putt poker is covered.
3. Keep README and CHECKPOINTS current before handing off.

## Checkpoint 13: Putt Poker Scoring

Date: 2026-06-08

Branch:

- `rewrite`
- Previous pushed commit: `71bf1ce Clarify Wolf handoff status`

Files changed since Checkpoint 12:

- Added `src/scoring/puttPoker.ts`.
- Added `tests/scoring/puttPoker.test.ts`.
- Updated `README.md`.

Implementation notes:

- Ported putt poker from the legacy monolith as pure helpers. The actual legacy
  oracle is `computePuttPoker()` and `puttPenaltyNote()` (the handoff's named
  `puttPokerCards()` / `bestPokerHand()` / `renderPuttPokerPanel()` helpers do
  not exist in `legacy/index.html`; there is no poker-hand evaluation in the
  current app).
- `computePuttPoker(putts, players, pot)` returns card counts, the coin holder,
  the running pot, and per-player 3-putt/4+ putt counts.
- Every player starts with two cards. A no-putt hole adds two cards, a one-putt
  adds one, and a two-putt changes nothing.
- A three-putt hands the coin and adds $1; a four-or-more putt hands the coin
  and adds $2. The coin follows the most recent penalty in hole order, then
  player order, matching the legacy loop.
- Putts are read through the shared `scoreAt`/`cellValue` helpers, so raw
  numbers and timed putt cells both work.
- Parity check against the legacy settlement flow: putt poker is intentionally a
  standalone pot and is **not** part of `computePlayerPnL()` / `computeSettlement()`.
  It only feeds the putt poker panel display, so no settlement P&L helper was
  added.

Verification:

- `node scripts/event-format-tests.js`: passed.
- `npm run test:run`: passed, 16 files, 101 tests.
- `npm run build`: passed.

Next recommended steps:

1. Begin wiring the pure scoring modules into Pinia stores/UI screens.
2. Keep `legacy/index.html` as the parity oracle during UI cutover.
3. Treat scoring parity and RLS verification as hard gates before UI cutover.

## Checkpoint 14: Settlement Aggregation

Date: 2026-06-08

Branch:

- `rewrite`
- Previous pushed commit: `af6964a Add putt poker scoring`

Files changed since Checkpoint 13:

- Added `src/scoring/settlement.ts`.
- Added `tests/scoring/settlement.test.ts`.
- Updated `README.md`.

Implementation notes:

- Discovered a gap while planning the UI phase: the individual game modules were
  all ported, but the legacy `computePlayerPnL()` settlement aggregator and the
  `computeSettlement()` transfer matcher had not been. The results screen needs
  both, so they were ported first.
- `computePlayerPnL(input)` is a pure port that composes the existing skins,
  team game, head-to-head, Stableford, three-man Nassau, and Wolf modules into a
  single per-player profit/loss map. It takes an explicit `SettlementInput`
  instead of reading global `ROUND`.
- Scramble settlement reads the team score matrix directly through `scoreAt`,
  reproducing the legacy `teamScoreRange()` behavior.
- `computeSettlement(pnl)` is a faithful port of the greedy largest-debtor /
  largest-creditor transfer minimizer.
- Parity quirks preserved: putt poker and pair match play are NOT part of the
  P&L. `gamesHaveBets()` was also ported and DOES count putt poker, because the
  legacy results screen uses it only to decide whether to show the settlement
  section.

Verification:

- `node scripts/event-format-tests.js`: passed.
- `npm run test:run`: passed, 17 files, 112 tests.
- `npm run build`: passed.

Next recommended steps:

1. Build the Pinia round store as the UI foundation (state, localStorage
   persistence, derived `players`/`courseHandicaps`/`strokes`/`scoreContext`
   getters, and score/putt mutation with cell timestamps).
2. Expose the pure scoring modules (including settlement) as store getters.
3. Then wire screens one at a time against `legacy/index.html`.

## Checkpoint 15: Pinia Round Store

Date: 2026-06-08

Branch:

- `rewrite`
- Previous pushed commit: `b4c2a88 Add settlement aggregation`

Files changed since Checkpoint 14:

- Added `src/stores/round.ts`.
- Added `tests/stores/round.test.ts`.
- Added `tests/setup.ts` (localStorage polyfill for jsdom).
- Updated `vite.config.ts` to register the test setup file.
- Updated `README.md`.

Implementation notes:

- Added the first Pinia store, `useRoundStore`, as the UI foundation. It holds
  the active `RoundState` plus the player handicap-index `PlayerMap`.
- `emptyRound()` reproduces the legacy default round shape; `normalizeRoundState()`
  reproduces legacy `loadState()`/`normalizeRound()` repair (normalize games,
  backfill wolf/teamNames/pairMatches, re-derive playing groups from the roster).
- Derived getters mirror the legacy globals: `playerNames` (team1 then team2),
  `courseHandicaps` (`computeWHSCourseHcp` with `parTotal || sum(par)` fallback),
  `strokes` (`allocateNetStrokes`), and `scoreContext` for the pure modules.
- Scoring getters wire the pure modules to the live round: `skins`, `settlement`
  (P&L + transfers), `hasBets`, and the `puttPokerFor(groupPlayers)` action.
- `setScore`/`setPutt`/`setTeamScore` write timestamped cells via `writeCell()`
  and grow rows to 18 holes; out-of-range holes are ignored.
- Persistence: the round and player map are serialized together under
  `localStorage` key `dmi_round`. This is the store's own persistence; it is not
  yet byte-compatible with the legacy `dmi_round`/`dmi_group` split or the DB
  `rounds.state` sync shape. That reconciliation is deferred to the sync-wiring
  step. `roundForDb()` in legacy embeds `players` into state, which this store
  mirrors in spirit.
- Test infra: jsdom under Vitest does not expose a working `Storage`, so
  `tests/setup.ts` installs a minimal in-memory `localStorage` polyfill,
  registered via `test.setupFiles`.

Verification:

- `node scripts/event-format-tests.js`: passed.
- `npm run test:run`: passed, 18 files, 122 tests.
- `npm run build`: passed.

Next recommended steps:

1. Wire the first real screen against the store (round setup or the scorecard),
   validating layout/behavior against `legacy/index.html`.
2. Add a group/event store if the chosen screen needs group membership or event
   config beyond the round itself.
3. Reconcile the store's localStorage/DB persistence shape when realtime sync is
   wired.

## Checkpoint 16: Scorecard Screen

Date: 2026-06-08

Branch:

- `rewrite`
- Previous pushed commit: `82ef5d5 Add Pinia round store`

Files changed since Checkpoint 15:

- Added `src/components/screens/ScorecardScreen.vue`.
- Added `src/fixtures/demoRound.ts`.
- Added `tests/screens/scorecard.test.ts`.
- Added a `playerTotals` getter to `src/stores/round.ts`.
- Updated `src/router/index.ts` (added the `/scorecard` route).
- Updated `src/components/screens/HomeScreen.vue` (demo-round entry buttons).
- Updated `tests/smoke/app.test.ts` for the new HomeScreen.
- Updated `README.md`.

Implementation notes:

- First real rewrite screen. It renders player rows, par and stroke-index rows,
  per-hole score inputs with birdie/bogey color coding and net-stroke dots,
  OUT/IN/TOT/NET/SKN columns, and a live settlement panel.
- All scoring is read from round store getters. Added `playerTotals` to the
  store (gross out/in/total, net total, skins) so the component does no scoring
  math beyond display formatting.
- `demoRound.ts` seeds a ready-to-score sample (two teams of two, skins + net
  best-ball + putt poker enabled) so the screen is reachable from the home
  screen before the full setup flow exists.
- Score inputs write through `store.setScore`, which records timestamped cells.
- The smoke test now mocks `vue-router` and installs Pinia, because HomeScreen
  uses the router and store.

Browser verification (Vite dev server, preview tool):

- Home screen renders with "Start demo round" / "Open scorecard".
- Scorecard renders the demo roster, correct WHS course handicaps (e.g. index
  21.0 -> course hcp 25, +20 strokes) and stroke-dot allocation.
- Entering Wes's full front nine updated OUT to 34 live; birdies rendered green.
- Settlement correctly stayed "All square" with only one complete card, since
  team games and skins require every scorer on a hole.

Verification:

- `node scripts/event-format-tests.js`: passed.
- `npm run test:run`: passed, 19 files, 126 tests.
- `npm run build`: passed (scorecard is a lazy-loaded route chunk).

Not yet ported from the legacy scorecard (future checkpoints):

- Scramble / best-ball / two-ball team rows and the pair-match and wolf live
  panels.
- Putt entry rows and the putt poker panel UI.
- Playing-group filtering and the mobile hole-by-hole entry mode.

Next recommended steps:

1. Extend the scorecard with putt entry rows + the putt poker panel (the store
   already exposes `puttPokerFor`), or
2. Build the round setup screen so rounds can be created without the demo
   fixture, then
3. Add a group/event store when a screen needs membership or event config.

## Checkpoint 17: Putt Entry and Putt Poker Panel

Date: 2026-06-08

Branch:

- `rewrite`
- Previous pushed commit: `5f9473a Add scorecard screen`

Files changed since Checkpoint 16:

- Updated `src/components/screens/ScorecardScreen.vue` (collapsible putt rows +
  putt poker panel).
- Added a `readPutt` action to `src/stores/round.ts`.
- Updated `tests/screens/scorecard.test.ts`.
- Updated `README.md`.

Implementation notes:

- Each player row now has a collapsible putt-tracking row, toggled by a chevron
  in the name cell. Putt inputs write through `store.setPutt` (timestamped
  cells) and are colored like legacy: green for 0-1 putts, neutral for 2, red
  for 3+. Putt OUT/IN/TOT sums are shown.
- Added a `readPutt` store action mirroring `readScore`.
- The putt poker panel renders per playing group (falling back to the two teams
  when no groups), showing the coin holder, each player's card count, penalty
  notes via `puttPenaltyNote`, and the running pot. All values come from
  `store.puttPokerFor`; the component does no putt poker math itself.
- The panel and putt rows only render when `games.puttPoker.enabled`.

Browser verification (preview tool, demo round):

- Entered all four cards plus putts including a Wes 3-putt (hole 1) and a Q
  4-putt (hole 7).
- Coin correctly went to Q (latest penalty by hole order); cards showed Wes ×4
  (two 1-putts), others ×2; penalty notes "1x 3-putt" and "1x 4+ putt".
- Pot showed $11 = $8 base ($2 x 4) + $1 (3-putt) + $2 (4-putt).
- Putt cell colors and OUT/IN/TOT putt sums rendered correctly.

Verification:

- `node scripts/event-format-tests.js`: passed.
- `npm run test:run`: passed, 19 files, 128 tests.
- `npm run build`: passed.

Next recommended steps:

1. Build the round setup screen so real rounds can be created without the demo
   fixture (this is the planned Checkpoint 18).
2. Then add scramble/best-ball/two-ball team rows and the pair-match/wolf live
   panels to the scorecard.

## Checkpoint 18: Round Setup Screen

Date: 2026-06-08

Branch:

- `rewrite`
- Previous pushed commit: `1d9fd32 Add putt entry rows and putt poker panel`

Files changed since Checkpoint 17:

- Added `src/components/screens/SetupScreen.vue`.
- Added `tests/screens/setup.test.ts`.
- Updated `src/router/index.ts` (added the `/setup` route).
- Updated `src/components/screens/HomeScreen.vue` ("New round" button).
- Updated `README.md`.

Implementation notes:

- The setup screen creates a round without the demo fixture. Sections: course
  (club/course/location, tee rating/slope, an editable par + SI grid prefilled
  to a par-72 layout), teams and players (name + handicap index + team per row,
  add/remove), and a games config (skins, best ball, two-ball, aggy,
  head-to-head, Stableford, three-man Nassau, Wolf, putt poker).
- "Start round" validates (par present, both teams populated, unique names),
  builds the `RoundState` and player handicap map, generates head-to-head
  matchups by zipping `team1[i]` vs `team2[i]` (matching legacy setup), writes
  through `store.setRound`, and routes to the scorecard.
- The player handicap map is managed directly on the round store; no separate
  group/players store was needed for round creation.

Browser verification (preview tool):

- Filled four players (Ann 10, Bea 12 on Team 1; Cal 6, Dan 20 on Team 2),
  enabled skins ($5) and best ball (net 10/10/20), clicked Start round.
- Landed on the scorecard with correct teams, course handicaps (Ann +4, Bea +6,
  Cal +0, Dan +14 relative to scratch Cal), stroke-dot allocation, the zipped
  matchups (Ann vs Cal, Bea vs Dan), and the settlement section enabled.
- Note: the preview_click tool did not trigger the Vue submit handler on this
  page (a direct DOM `.click()` did); this looks like a preview-harness quirk,
  not an app bug. Component tests cover the submit path.

Verification:

- `node scripts/event-format-tests.js`: passed.
- `npm run test:run`: passed, 20 files, 132 tests.
- `npm run build`: passed (setup is a lazy-loaded route chunk).

Next recommended steps:

1. Add scramble / best-ball / two-ball team rows and the pair-match and wolf
   live panels to the scorecard (and their setup config).
2. Build a results screen (leaderboard, team scores, per-game breakdowns) on top
   of the existing settlement/scoring getters.
3. Consider a group/event store and Supabase wiring when membership, course
   search, or realtime sync are needed.

## Checkpoint 19: Results Screen

Date: 2026-06-08

Branch:

- `rewrite`
- Previous pushed commit: `1f0c6a3 Add round setup screen`

Files changed since Checkpoint 18:

- Added `src/components/screens/ResultsScreen.vue`.
- Added `tests/screens/results.test.ts`.
- Updated `src/router/index.ts` (added the `/results` route).
- Updated `src/components/screens/HomeScreen.vue` (View results button).
- Updated `src/components/screens/ScorecardScreen.vue` (Results navigation).
- Updated `src/stores/round.ts` with results getters and completion action.
- Updated `tests/stores/round.test.ts`.
- Updated `README.md`.

Implementation notes:

- Added the first rewrite results view, routed at `/results`.
- Results shows team net scores, an individual leaderboard, settlement P&L and
  transfers, enabled team-game front/back/total breakdowns, and skins results.
- Store getters now expose:
  - `leaderboard`
  - `teamNetTotals`
  - `teamGameResults`
- `teamGameResults` composes `computeTeamTotals()` for best ball, two-ball, and
  aggy; scramble reads manually entered team scores through `scoreAt()`.
- `setCompleted()` marks a local round complete or reopens it, preserving the
  legacy `completeRound()` interaction shape until Supabase history persistence
  is wired.
- Components continue to read all scoring through the store instead of
  recomputing scoring in the UI.

Verification:

- `node scripts/event-format-tests.js`: passed.
- `npm run test:run`: passed, 21 files, 141 tests.
- `npm run build`: passed (results is a lazy-loaded route chunk).

Not yet ported from legacy results/game detail views:

- Pair-match, Wolf, Stableford, three-man Nassau, and putt-poker specific
  results/detail panels.
- Completed-round save to group history.
- Supabase-backed active/completed round status sync.

Next recommended steps:

1. Extend the scorecard + setup with scramble/team score rows and pair-match
   setup/live panels, or add the missing per-game detail panels to results.
2. Build the group/Supabase layer when membership, course search, history, or
   realtime sync becomes the next priority.
3. Keep README and this checkpoint file current before every push.

## Checkpoint 20: Scramble Setup and Team Score Rows

Date: 2026-06-08

Branch:

- `rewrite`
- Previous pushed commit: `88ced8b Add results screen`

Files changed since Checkpoint 19:

- Updated `src/components/screens/SetupScreen.vue`.
- Updated `src/components/screens/ScorecardScreen.vue`.
- Updated `src/stores/round.ts`.
- Updated `tests/screens/setup.test.ts`.
- Updated `tests/screens/scorecard.test.ts`.
- Updated `README.md`.
- Updated this checkpoint file.

Implementation notes:

- Added 4-man scramble to the setup screen games list with front/back/total
  money fields. The rewrite preserves the legacy gross-only scramble model.
- Added `store.readTeamScore(teamKey, hole)` to mirror `readScore()` and
  `readPutt()` for `round.teamScores`.
- Scorecard now renders one 4-man scramble gross team-score row per side when
  `games.scramble4.enabled` is true.
- Scramble team rows write through `store.setTeamScore()`, use timestamped
  cells, apply the existing gross score color classes, and show OUT/IN/TOT
  summaries.
- Results already consumed `teamScores`, so scramble results and settlement are
  now reachable from normal setup + scorecard entry.

Verification:

- `node scripts/event-format-tests.js`: passed.
- `npm run test:run`: passed, 21 files, 143 tests.
- `npm run build`: passed.
- Browser QA at `http://127.0.0.1:5173/`:
  - `/setup` rendered the 4-Man Scramble row.
  - Created a four-player round with scramble enabled.
  - `/scorecard` rendered two scramble rows.
  - Entering a Team 1 hole score persisted in the row.
  - No page-level horizontal overflow was detected.

Next recommended steps:

1. Add best-ball and two-ball derived team rows to the scorecard.
2. Add pair-match setup configuration and the pair-match live/results panels.
3. Add Wolf live/results UX once pair-match parity is in better shape.
4. Keep README and checkpoints current before each push.

## Checkpoint 21: Derived Team Format Rows

Date: 2026-06-08

Branch:

- `rewrite`
- Previous pushed commit: `5e1beea Add scramble team scoring rows`

Files changed since Checkpoint 20:

- Updated `src/stores/round.ts`.
- Updated `src/components/screens/ScorecardScreen.vue`.
- Updated `tests/stores/round.test.ts`.
- Updated `tests/screens/scorecard.test.ts`.
- Updated `README.md`.
- Updated this checkpoint file.

Implementation notes:

- Added `store.scorecardTeamRowsFor(teamKey)` to expose scorecard-ready derived
  team rows while keeping scoring logic out of the component.
- The store now returns Best Ball and 2-Ball row values from
  `computeTeamHoleStats()` / `computeTeamTotals()` with the active game score
  type.
- Scorecard renders those rows under each team when Best Ball or 2-Ball are
  enabled.
- Rows are read-only, matching the legacy behavior: player score edits drive
  the derived team row values.

Verification:

- `node scripts/event-format-tests.js`: passed.
- `npm run test:run`: passed, 21 files, 145 tests.
- `npm run build`: passed.
- Browser QA at `http://127.0.0.1:5173/`:
  - Demo scorecard rendered Best Ball rows.
  - Entering player scores updated the derived row values.
  - No page-level horizontal overflow was detected.

Next recommended steps:

1. Add pair-match setup configuration.
2. Add pair-match live and results panels.
3. Add Wolf live/results UX.
4. Then move toward group/Supabase course search, membership, history, and
   realtime sync.

## Checkpoint 22: Pair Match Setup, Live Panel, and Results

Date: 2026-06-08

Branch:

- `rewrite`
- Previous pushed commit: `e9ab93b Add derived team scorecard rows`

Files changed since Checkpoint 21:

- Updated `src/stores/round.ts`.
- Updated `src/components/screens/SetupScreen.vue`.
- Updated `src/components/screens/ScorecardScreen.vue`.
- Updated `src/components/screens/ResultsScreen.vue`.
- Updated tests:
  - `tests/stores/round.test.ts`
  - `tests/screens/setup.test.ts`
  - `tests/screens/scorecard.test.ts`
  - `tests/screens/results.test.ts`
- Updated `README.md`.
- Updated this checkpoint file.

Implementation notes:

- Added `store.pairMatchResult`, a store-derived display result that wraps the
  pure `computePairMatchPlay()` scorer and includes front/back/overall segment
  labels for each match.
- Added pair-match setup controls:
  - enable/disable Pair Match Play
  - points per hole
  - net/gross score type
  - explicit two-player-per-side match pairing builder
- New rounds persist repaired/default pair matches from setup.
- Scorecard renders a live Pair Match Play panel with total points/holes, match
  cards, per-hole winner chips, and front/back/total status.
- Results renders a Pair Match Play section with team totals and per-match
  front/back/overall breakdowns.
- Narrow viewport handling keeps the pair-match hole grid and result tables
  scrollable inside their panels instead of widening the page.

Verification:

- `node scripts/event-format-tests.js`: passed.
- `npm run test:run`: passed, 21 files, 149 tests.
- `npm run build`: passed.
- Browser QA at `http://localhost:5173/`:
  - Created a four-player round through `/setup`.
  - Enabled Pair Match Play and confirmed the setup pairing builder appeared.
  - Started the round and confirmed `/scorecard` rendered the live pair-match
    panel.
  - Entered first-hole scores and confirmed the live panel showed Team 1 up
    1-0.
  - Opened `/results` and confirmed the Pair Match Play section showed the
    matching front/overall result.
  - Mobile viewport `390x844`: no page-level horizontal overflow; scorecard
    pair-hole chips scroll inside the card; results pair table stays contained.
  - Browser console errors: none.

Next recommended steps:

1. Add Wolf live/results UX.
2. Add the remaining per-game results panels for Stableford, three-man Nassau,
   putt poker detail, and other legacy detail sections.
3. Start the group/Supabase course search, membership, history, and realtime
   sync layer.
4. Keep reusing store getters/actions; do not recompute scoring in components.

## Checkpoint 23: Wolf Live Panel and Results

Date: 2026-06-08

Branch:

- `rewrite`
- Previous pushed commit: `cdf7246 Add pair match panels`

Files changed since Checkpoint 22:

- Updated `src/stores/round.ts`.
- Updated `src/components/screens/ScorecardScreen.vue`.
- Updated `src/components/screens/ResultsScreen.vue`.
- Updated tests:
  - `tests/stores/round.test.ts`
  - `tests/screens/scorecard.test.ts`
  - `tests/screens/results.test.ts`
- Updated `README.md`.
- Updated this checkpoint file.

Implementation notes:

- Added `store.wolfResult`, a store-derived display result that wraps the pure
  Wolf scorer and exposes:
  - per-hole Wolf config/result rows
  - point standings
  - optional Nassau front/back/overall segments
  - settled-hole count
- Added `store.setWolfHole()` so components can edit wolf/mode/partner state
  without mutating round internals directly.
- Scorecard renders an editable Wolf panel with hole, wolf, choice, partner,
  field, result, and points columns.
- Results renders Wolf standings, optional Nassau segment rows, and the
  hole-by-hole Wolf side / field / result / points table.
- Tables use horizontal containment for narrow screens instead of widening the
  page.

Verification:

- `node scripts/event-format-tests.js`: passed.
- `npm run test:run`: passed, 21 files, 152 tests.
- `npm run build`: passed.
- Browser QA note:
  - In-app browser could inspect pages, but form typing/localStorage seeding was
    blocked by the browser sandbox.
  - The standalone Playwright/Chrome QA path required broad macOS access and was
    rejected intentionally.
  - No broad access is required for this checkpoint; coverage is from unit,
    store, screen, event-format, and build verification.

Next recommended steps:

1. Add the remaining per-game results panels for Stableford, three-man Nassau,
   and putt poker detail.
2. Start the group/Supabase course search, membership, history, and realtime
   sync layer.
3. Keep reusing store getters/actions; do not recompute scoring in components.

## Checkpoint 24: Stableford Results Panel

Date: 2026-06-08

Branch:

- `rewrite`
- Previous pushed commit: `626f420 Add wolf panels`

Files changed since Checkpoint 23:

- Updated `src/stores/round.ts`.
- Updated `src/components/screens/ResultsScreen.vue`.
- Updated tests:
  - `tests/stores/round.test.ts`
  - `tests/screens/results.test.ts`
- Updated `README.md`.
- Updated this checkpoint file.

Implementation notes:

- Added `store.stablefordResult`, a store-derived display result that wraps the
  pure `computeStableford` scorer and exposes:
  - enabled flag, score type, and per-player buy-in
  - per-player rows (points + completed holes) sorted best-first
  - a `leader` flag on the top scorer with completed holes for highlighting
- Results renders a Stableford points table (Player / Points / Holes), placed
  before the Wolf section to match the legacy `renderStablefordResults()` order.
- The component does no scoring math; it reads the getter and formats only.
- The pure `computeStableford` module and its tests already existed
  (Checkpoint 10); this checkpoint only wires the display layer.

Verification:

- `node scripts/event-format-tests.js`: passed.
- `npm run test:run`: passed, 21 files, 154 tests.
- `npm run build`: passed.
- Browser QA note:
  - Seeding a Stableford-enabled round needs form/localStorage input that the
    in-app browser sandbox blocked in prior checkpoints; no broad macOS access
    was requested.
  - Coverage is from the new store getter test and a screen test that mounts the
    real `ResultsScreen` and asserts the rendered Stableford table, plus
    event-format and build verification.

Next recommended steps:

1. Add the remaining per-game results panels for three-man Nassau and putt poker
   detail.
2. Start the group/Supabase course search, membership, history, and realtime
   sync layer.
3. Keep reusing store getters/actions; do not recompute scoring in components.

## Checkpoint 25: 3-Man Nassau Results Panel

Date: 2026-06-08

Branch:

- `rewrite`
- Previous pushed commit: `24b94ce Add stableford results panel`

Files changed since Checkpoint 24:

- Updated `src/stores/round.ts`.
- Updated `src/components/screens/ResultsScreen.vue`.
- Updated tests:
  - `tests/stores/round.test.ts`
  - `tests/screens/results.test.ts`
- Updated `README.md`.
- Updated this checkpoint file.

Implementation notes:

- Added `store.threeManNassauResult`, a store-derived display result that wraps
  the existing pure `threeManNassauResults` scorer and exposes:
  - enabled flag, score type, and per-opponent amount
  - `valid` flag (false when roster ≠ 3 players — the pure module requires
    exactly 3)
  - per-segment rows (Match / Nassau / Solo score / Best Ball / Result) with a
    `resultLabel` string matching the legacy format
- Results renders a 3-Man Nassau section (after Stableford, before Wolf,
  matching legacy order). When the roster is not exactly 3 players it shows a
  "Requires exactly 3 players" note instead of an empty table.
- The component does no scoring math; it reads the getter only.

Verification:

- `node scripts/event-format-tests.js`: passed.
- `npm run test:run`: passed, 21 files, 157 tests.
- `npm run build`: passed.
- Browser QA: blocked by browser sandbox as in prior checkpoints; no broad
  macOS access requested. Coverage is from store getter tests (invalid-roster
  and valid 3-player round) plus a screen test asserting the "Requires exactly
  3 players" note for a 4-player demo round.

Next recommended steps:

1. Add the putt poker detail results panel (the last remaining per-game panel).
2. Start the group/Supabase layer for course search, group membership, history,
   and realtime sync.
3. Keep reusing store getters/actions; do not recompute scoring in components.

## Checkpoint 26: Putt Poker Results Panel

Date: 2026-06-08

Branch:

- `rewrite`
- Previous pushed commit: `70690d7 Add 3-man Nassau results panel`

Files changed since Checkpoint 25:

- Updated `src/stores/round.ts`.
- Updated `src/components/screens/ResultsScreen.vue`.
- Updated tests:
  - `tests/stores/round.test.ts`
  - `tests/screens/results.test.ts`
- Updated `README.md`.
- Updated this checkpoint file.

Implementation notes:

- Added `store.puttPokerGroups` getter that bundles per-playing-group putt
  poker results (name, players, and the `PuttPokerResult` from the existing
  pure `computePuttPoker` helper). Falls back to team rows when no playing
  groups are defined, matching the same fallback the scorecard already uses.
- Added `puttPenaltyNote` import to `ResultsScreen.vue` (reusing the pure
  helper already used in the scorecard).
- Results renders a Putt Poker section (after Wolf, before Skins) showing per
  group: coin holder, card counts × player, 3-putt/4-putt penalty notes, and
  final pot. Identical display logic to the scorecard panel.
- This is the last of the three legacy per-game detail panels (Stableford,
  3-Man Nassau, Putt Poker) that were missing from `/results`.

Verification:

- `node scripts/event-format-tests.js`: passed.
- `npm run test:run`: passed, 21 files, 159 tests.
- `npm run build`: passed.
- Browser QA: blocked by browser sandbox as in prior checkpoints; coverage is
  from store getter tests and a screen test asserting coin holder and pot
  display.

Next recommended steps:

1. Start the group/Supabase layer: course search, group membership, round
   history, and realtime sync.
2. Or continue UX polish: playing-group filtering on the scorecard, mobile
   hole-by-hole entry mode.
3. Keep reusing store getters; do not recompute scoring in components.

## Checkpoint 27: Supabase Foundation

Date: 2026-06-08

Branch: `rewrite`

Goal: lay the groundwork for the group/Supabase layer without shipping any UI or
store wiring. This is the first of four planned steps (27 foundation → 28 group
membership → 29 round history → 30 realtime sync).

What changed:

- Env config. Added `.env.example` (committed) listing `VITE_SUPABASE_URL` and
  `VITE_SUPABASE_ANON_KEY`, and `.env` (gitignored) holding the real values.
  Reuses the existing legacy project `dhpkeueubhpmvaungjfj`; the anon key is the
  publishable client key (legacy hardcoded it at `legacy/index.html:1793-1794`).
- `src/env.d.ts` now declares an `ImportMetaEnv` interface typing the two
  `VITE_SUPABASE_*` vars.
- `src/services/supabase.ts`: thin client. Reads the env vars, exports
  `supabase` (a `createClient` instance, or `null` when either var is missing)
  and `hasSupabase()` so downstream callers can degrade to local-only behavior
  instead of throwing. No queries live here — construction + guard only.
- `src/types/db.ts`: wire-shape row types `GroupRow`, `RoundRow`, `EventRow`
  (snake_case, matching the live schema documented in `README.md`). Re-exported
  from `src/types/index.ts`. The DB ⇄ domain normalize/serialize mapping is
  intentionally deferred to Checkpoint 28.

Deliberately out of scope (later checkpoints): normalizeGroup/groupForDb/
normalizeRound mappers, any group store/screen/join-create flow, round history,
`scheduleSync`/`pushToSupabase`/`subscribeToGroup` realtime, and the
course-search edge-function call.

Verification:

- `node scripts/event-format-tests.js`: passed.
- `npm run test:run`: passed, 22 files, 161 tests (added
  `tests/services/supabase.test.ts` covering the `hasSupabase()` guard).
- `npm run build`: passed; Vite inlines the `VITE_*` vars and the new modules
  type-check.
- No browser QA: nothing renders or calls the network in this checkpoint.

Next: Checkpoint 28 — port `groupCode()` / create / join into a Pinia group
store plus a screen, local-first with a graceful no-credentials fallback via
`hasSupabase()`. Reference legacy `createGroup`/`joinGroup`/`normalizeGroup`
(`legacy/index.html` ~2052, ~2160-2182).

## Checkpoint 28: Group Membership

Date: 2026-06-08

Branch: `rewrite`

Goal: port the legacy group create/join/leave/rename flow into the rewrite as a
Pinia store plus a screen, local-first with a graceful no-credentials fallback.
Second of four steps (27 foundation → 28 group membership → 29 round history →
30 realtime sync). Consumes the Checkpoint 27 client/types.

What changed:

- `src/domain/group.ts`: pure helpers `normalizeGroup` (GroupRow → camelCase
  `Group`), `groupForDb` (`Group` → DB columns), `generateCode()` (4-char code),
  and the `DEFAULT_GROUP_NAME` / `GROUP_COLUMNS` constants. Ports legacy
  `normalizeGroup`/`groupForDb`/`generateCode`.
- `src/stores/group.ts`: Pinia `group` store. State = active `Group`, recent
  groups, status/statusError/busy. Persists to `localStorage`
  (`dmi_group`, `dmi_recent_groups`). Actions: `load`, `persist`, `createGroup`,
  `joinGroup`, `switchToRecentGroup`, `leaveGroup`, `renameGroup`,
  `rememberGroup`, `forgetRecentGroup`. Getters: `groupCode`, `groupName`,
  `hasGroup`.
- Local-first fallback via `hasSupabase()`: offline, `createGroup` makes a group
  with a null DB id and `joinGroup` reports remote join is unavailable instead
  of throwing. Online, create inserts a `groups` row (retrying on the
  `room_code` collision, as legacy did), join selects by `room_code`, rename
  updates the name when the group has a DB id.
- `src/components/screens/GroupScreen.vue` routed at `/group` (`src/router`),
  linked from `HomeScreen.vue` via a new "Groups" button. Shows create /
  join-by-code / recent groups with no active group; group code + editable name
  + Leave with one.
- `tests/stores/group.test.ts`: 9 tests covering offline create/join, online
  create/join/not-found (mocked Supabase), recents, and persistence round-trip.

Deliberately out of scope (later checkpoints): loading a group's active round on
join, round history list/load (29), and `scheduleSync`/`pushToSupabase`/
`subscribeToGroup` realtime (30). The group `players` map is carried but no
roster-editing UI ships yet.

Verification:

- `node scripts/event-format-tests.js`: passed.
- `npm run test:run`: passed, 23 files, 170 tests (+9 in group store).
- `npm run build`: passed (`vue-tsc` clean). The `/group` route is a lazy chunk
  that pulls in `@supabase/supabase-js`, so it only loads when visited.
- Browser QA: dev server preview confirmed Home → "Groups" navigates to
  `/group`, the create/join/recent UI renders on-theme, join field enabled
  (Supabase configured), no console errors. Did not click Create/Join to avoid
  writing to / reading the live production DB; those paths are covered by the
  mocked store tests.

Next: Checkpoint 29 — round history. Load a group's active + completed rounds
(legacy `loadActiveRound`/round-history queries, `normalizeRound`), wiring the
group store to the round store. Then 30 realtime sync.

## Checkpoint 29: Round History

Date: 2026-06-08

Branch: `rewrite`

Goal: load a group's active + completed rounds and wire the group store to the
round store. Third of four steps (27 foundation → 28 group membership → 29 round
history → 30 realtime sync). Online-only, with the same `hasSupabase()` fallback.

What changed:

- `src/domain/round.ts` (new): the round DB ⇄ domain mappers, ported from legacy
  `normalizeRound`. `normalizeRoundState` moved here out of the round store (a
  pure helper now shared by the store's local load and the row mappers, avoiding
  a store ⇄ domain import cycle). `normalizeRoundRow(row)` parses the JSON
  `state` column (string or object), lets the row's `id`/`group_id`/`completed`
  win over stale copies inside the blob, and returns the normalized round plus
  the handicap `players` map embedded by legacy `roundForDb()`. `summarizeRound`
  reduces a completed round to per-player net + skins (legacy `renderHistory` /
  `_stateStrokes` / `_stateSkins`), sorted by net; `courseDisplayName` and the
  `ACTIVE_ROUND_COLUMNS` / `HISTORY_ROUND_COLUMNS` constants live here too.
- `src/stores/round.ts`: new `loadActiveRound(groupId)` action — fetches the
  latest incomplete round (`group_id` + `completed=false`, newest first) and
  makes it active via `setRound`, no-op to `null` when offline / group-less
  (legacy `loadActiveRound`). Now imports `normalizeRoundState`/`normalizeRoundRow`
  from `src/domain/round.ts`.
- `src/stores/history.ts` (new): Pinia `history` store. `loadHistory(groupId)`
  selects every completed round for a group, newest first, and maps each row
  through `normalizeRoundRow` → `summarizeRound` into a `RoundSummary[]`
  (`rounds`, `loading`, `error`, `loadedGroupId`); clears rather than throwing
  offline (legacy `showHistory`).
- `src/stores/group.ts`: `joinGroup` (and so `switchToRecentGroup`) now calls
  `useRoundStore().loadActiveRound(group.id)` after a successful online join —
  the group store → round store wiring.
- `src/components/screens/GroupScreen.vue`: a "Past rounds" section (online +
  active group) renders the history cards — course name, completed date, and a
  per-player Net/Skins table — loaded on mount and after join/open-recent,
  cleared on leave.
- `tests/helpers/mockSupabase.ts` (new): a per-table Supabase test double
  supporting the full `select/eq/order/limit/maybeSingle` chain; the group test
  was refactored onto it (routes `groups` vs `rounds`).
- Tests: `tests/domain/round.test.ts` (6) for `normalizeRoundRow` /
  `summarizeRound` / `courseDisplayName`; `tests/stores/history.test.ts` (4) for
  online mapping, offline, error, and clear; plus the join→`loadActiveRound`
  wiring test in the group suite and an offline `loadActiveRound` test in the
  round suite.

Deliberately out of scope (later checkpoints): realtime `subscribeToGroup` /
push sync (30), the all-time Stats screen (legacy `showStats`), and Supabase
course search. History summaries are self-contained from each round's embedded
`players` map, so no extra roster fetch is needed.

Verification:

- `node scripts/event-format-tests.js`: passed.
- `npm run test:run`: passed, 25 files, 182 tests (+12: 2 new files, plus
  wiring/offline cases).
- `npm run build`: passed (`vue-tsc` clean).
- Browser QA: dev server preview confirmed `/group` renders the join view with
  no console errors after the changes; the history section stays hidden without
  an active group (correct), and its template compiles in the build. Did not
  click Create/Join or load history against the live production DB; those paths
  are covered by the mocked store/domain tests.

Next: Checkpoint 30 — realtime sync. Push round/group writes to Supabase and
subscribe to live updates (legacy `subscribeToGroup` / `scheduleSync`).

## Checkpoint 30: Realtime Sync

Goal: push active-round writes to Supabase and subscribe to group round changes
so score entries on one device appear on another without a manual refresh.
Fourth of four steps (27 foundation → 28 group membership → 29 round history →
30 realtime sync), still guarded by `hasSupabase()` for offline/local-only use.

What changed:

- `src/domain/round.ts`: added `roundForDb(round, players)` (legacy
  `roundForDb`) and `mergeRoundData(local, remote, preferRemote)` with the
  legacy cell-level merge semantics. Remote non-null score/putt/team-score cells
  reconcile into local state, and remote nulls do not wipe local non-null cells
  unless the caller explicitly prefers the remote payload. Wolf data,
  pair-match config, games, and playing groups follow the same legacy merge
  precedence.
- `src/stores/round.ts`: added the realtime/sync lifecycle in the round store:
  `scheduleSync()` debounces pushes by ~600ms; `pushToSupabase()` reads the
  current remote row, merges, then updates `rounds.state` + `rounds.completed`;
  `subscribeToGroup(groupId)` opens a Supabase Realtime channel filtered by
  `group_id`; `applyRemoteRound()` merges remote updates into the active round;
  `startPolling()` keeps the 10-second active-round fallback; and
  `stopGroupSubscription()` clears channel/timers/last-pushed state.
- `src/stores/round.ts`: score, putt, team-score, game, pair-match, Wolf,
  players, and completed-state mutations now persist locally and then schedule a
  remote sync when the active round has a DB id. Offline/no-credentials and
  local-only rounds remain no-ops.
- `src/stores/group.ts`: successful online create/join now subscribes to the
  group channel; leave stops the subscription. `joinGroup` still loads the
  latest active round before subscribing.
- `tests/helpers/mockSupabase.ts`: extended the mock client with query
  operation recording plus Realtime `channel` / `removeChannel` / emit support.
- Tests: `tests/domain/round.test.ts` now covers `roundForDb` and the
  non-null-preserving merge rule; `tests/stores/sync.test.ts` (new) covers
  debounced Supabase updates, realtime merge application, and channel cleanup.

Deliberately out of scope: creating a remote `rounds` row from the rewrite setup
flow (the current local setup still produces local-only rounds), all-time Stats,
Supabase course search, and event realtime sync. This checkpoint syncs rounds
that already have a DB id, such as rounds loaded through group join/history
paths.

Verification:

- `npm run test:run`: passed, 26 files, 187 tests (+5 tests over Checkpoint 29).
- `npm run build`: passed (`vue-tsc` clean).
- `node scripts/event-format-tests.js`: passed.
- No live DB browser write-flow QA was performed to avoid touching the shared
  Supabase project; realtime/push paths are covered by mocked store/domain tests.

Next: create remote `rounds` rows from the rewrite setup flow, or continue with
Supabase course search / all-time Stats depending on priority.

## Checkpoint 31: Remote Round Creation

Goal: make rounds started from the rewrite setup flow participate in Checkpoint
30 realtime sync by inserting a Supabase `rounds` row whenever an online group
is active.

What changed:

- `src/stores/round.ts`: added `startRound(round, players, groupId)`. It
  normalizes the draft round, preserves local-only behavior with no group id or
  no Supabase credentials, and otherwise inserts a `rounds` row with
  `group_id`, generated `code`, embedded `roundForDb()` state, and
  `completed=false`.
- `src/stores/round.ts`: on insert success, the returned row is mapped through
  `normalizeRoundRow()` and becomes the active round, preserving the returned DB
  id/group id so later score writes sync. The store also subscribes to the group
  channel after creation.
- `src/stores/round.ts`: on insert failure, setup falls back to a local round
  and records `syncError` rather than blocking the player from starting.
- `src/components/screens/SetupScreen.vue`: "Start round" now calls
  `store.startRound(..., group.group?.id)` and shows the non-blocking sync error
  if online insert fails.
- `tests/stores/sync.test.ts`: added coverage for online insert success,
  insert-failure local fallback, and no-group local-only start.
- `README.md`: updated setup/realtime docs to describe online row creation.

Deliberately out of scope: Supabase course search and group roster persistence.
Course search is the next priority because searched tee data supplies the
round-specific rating/slope/par/SI inputs that drive course handicaps and stroke
allocation on the correct holes.

Verification:

- Targeted: `npm run test:run -- tests/stores/sync.test.ts tests/screens/setup.test.ts tests/stores/round.test.ts` passed, 35 tests.
- `node scripts/event-format-tests.js`: passed.
- `npm run test:run`: passed, 26 files, 190 tests (+3 tests over Checkpoint 30).
- `npm run build`: passed (`vue-tsc` clean).
- No live Supabase insert/browser QA performed against the shared production
  project; online creation is covered by the mocked Supabase tests.

Next: Supabase course search in rewrite setup. Use the existing public
`course-search` Edge Function so selecting a course/tee populates tee rating,
slope, par, SI/stroke index, yardages, and display metadata; this is required
for accurate WHS course handicap calculation and net strokes on the right holes.

## Current Handoff: Remote Round Creation Complete

Date: 2026-06-08

Branch:

- `rewrite`
- Latest commit: Add remote round creation (Checkpoint 31).
- Worktree status at handoff: clean after pushing Checkpoint 31, except for the
  pre-existing untracked `.claude/` folder.
- Vercel production branch tracking is set to `rewrite`, so pushes to this
  branch create deployments.

Most recent verification:

- `node scripts/event-format-tests.js`: passed.
- `npm run test:run`: passed, 26 files, 190 tests.
- Targeted Checkpoint 31 tests: `npm run test:run -- tests/stores/sync.test.ts tests/screens/setup.test.ts tests/stores/round.test.ts` passed, 35 tests.
- `npm run build`: passed (vue-tsc clean).
- Browser QA:
  - Checkpoint 22 pair-match browser QA passed.
  - Checkpoints 23–26 browser QA blocked by browser-tool sandbox; no broad
    macOS access requested.
  - Checkpoint 27 needs no browser QA (no UI/network); covered by a unit test.
  - Checkpoint 28 group screen verified via dev-server preview (Home → Groups
    nav, create/join/recent UI renders, no console errors).
  - Checkpoint 29 verified via dev-server preview: `/group` renders without
    errors, history section correctly hidden without an active group.
  - Checkpoint 30 did not exercise live DB/browser write flows; realtime and
    push behavior are covered by mocked store/domain tests.
  - Checkpoint 31 did not exercise live DB/browser insert flows; online round
    creation is covered by mocked Supabase store tests.
  - Create/Join and history load not exercised against the live DB; covered by
    mocked store/domain tests.
  - All panels are covered by focused store and screen tests.

Current implementation state:

- The full pure scoring layer plus the Pinia round store are complete and
  covered. All legacy per-game detail panels have been ported to `/results`.
- A real local create-score-results flow works end to end: `/setup` builds a
  round (course, teams, players, games) and `/scorecard` scores it live with
  score entry, net/skins columns, putt rows, the putt poker panel, and
  settlement. `/results` shows team scores, leaderboard, team-game breakdowns,
  pair-match breakdowns, Wolf standings/detail tables, the Stableford points
  table, the 3-Man Nassau segment table, the per-group Putt Poker summary,
  skins, and settlement. 4-man scramble can be enabled from setup, scored
  through team rows on the scorecard, and displayed/settled through results.
  Best Ball and 2-Ball render read-only derived team rows driven by player
  scores. Pair Match Play can be configured from setup and renders live
  scorecard plus results panels. Wolf can be configured from setup, adjusted per
  hole on the scorecard, and shown in results. All scoring is read from store
  getters/actions.
- `HomeScreen.vue` links to Groups (`/group`), New round (`/setup`), Start demo
  round, the scorecard, and results. Routing: `/`, `/group`, `/setup`,
  `/scorecard`, `/results`.
- Supabase foundation is wired (Checkpoint 27): `src/services/supabase.ts`
  client + `hasSupabase()` guard, env config (`.env` / `.env.example`,
  `VITE_SUPABASE_*`), and `src/types/db.ts` row types.
- Group membership is wired (Checkpoint 28): `src/stores/group.ts` Pinia store +
  `src/domain/group.ts` mappers. Create/join/leave/rename + recent groups work,
  local-first with a `hasSupabase()` fallback.
- Round history is wired (Checkpoint 29): `src/domain/round.ts` DB↔domain
  mappers (`normalizeRoundRow`, `summarizeRound`, `courseDisplayName`); the
  round store has `loadActiveRound(groupId)` which fires on every `joinGroup`;
  `src/stores/history.ts` fetches and reduces all completed rounds for a group;
  `GroupScreen.vue` renders history cards (course, date, player net/skins table)
  online once a group is active.
- Realtime sync is wired (Checkpoint 30): `roundForDb` + `mergeRoundData` live
  in `src/domain/round.ts`; `src/stores/round.ts` debounces active-round pushes,
  merges remote rows before updating Supabase, subscribes to group `rounds`
  changes, ignores local echoes, and keeps a 10-second polling fallback;
  `src/stores/group.ts` starts/stops subscriptions on group create/join/leave.
- Remote round creation is wired (Checkpoint 31): rewrite setup calls
  `round.startRound(round, players, groupId)`, which inserts a `rounds` row for
  online groups, normalizes the returned row into the store so it has a DB id,
  and falls back to local-only with a visible sync error if the insert fails.
- The old monolith remains available as the parity oracle at
  `legacy/index.html`.

## Checkpoint 32: Course Search in Rewrite Setup

Files changed since Checkpoint 31:

- Added `src/domain/courseSearch.ts`.
- Added `src/services/courseSearch.ts`.
- Updated `src/components/screens/SetupScreen.vue`.
- Added `tests/domain/courseSearch.test.ts`.
- Updated `tests/screens/setup.test.ts`.
- Updated `README.md` and this file.

What changed:

- Added a typed frontend course-search service that invokes the existing public
  Supabase `course-search` Edge Function through `supabase.functions.invoke`.
  It keeps the same local-first posture as the other Supabase code by returning
  an explicit unavailable error when Supabase credentials are missing.
- Added a pure course-search mapper that:
  - accepts the Edge Function's normalized course/tee payload,
  - filters to usable 18-hole tees with rating and slope,
  - collapses duplicate men/women tee sets while preferring the men's duplicate
    when present, matching legacy behavior,
  - repairs invalid stroke-index arrays to `1..18`, and
  - maps a selected tee into the rewrite `Course` shape with course id,
    club/course/location, tee name/gender/rating/slope/par total/yardage,
    per-hole par, SI, and yardage.
- Setup now has course search above the manual course fields. Search results
  show course metadata and tee counts; selecting a course shows usable tees;
  selecting a tee fills the manual fields and per-hole grids.
- Manual course entry still works when course search is unavailable, fails, or
  returns no results.
- `buildRound()` now preserves selected course id, tee gender, tee total yards,
  and per-hole yardages so round-state handicap/stroke getters receive the
  searched course data.

Verification:

- `npm run test:run -- tests/domain/courseSearch.test.ts tests/screens/setup.test.ts`
  passed: 2 files, 11 tests.
- `node scripts/event-format-tests.js` passed.
- `npm run test:run` passed: 27 files, 195 tests.
- `npm run build` passed (vue-tsc clean).
- Live Supabase course-search/browser QA is still pending; mocked tests cover
  the mapper, UI selection, and offline/error fallback.

Next likely tasks:

- Expand group roster persistence if online group setup should prefill players.
- Continue toward all-time Stats or event realtime sync depending on priority.
- After each step, run:
  - `node scripts/event-format-tests.js`
  - `npm run test:run`
  - `npm run build`
- Add the next checkpoint, then commit and push to `origin/rewrite`.

## Checkpoint 33: Setup Course Handicap Preview

Files changed since Checkpoint 32:

- Updated `src/components/screens/SetupScreen.vue`.
- Updated `tests/screens/setup.test.ts`.
- Updated `README.md` and this file.

What changed:

- Added a compact Course Handicap Preview under the setup player rows.
- The preview reuses shared handicap helpers:
  - `computeWHSCourseHcp()` for WHS course handicap,
  - `allocateNetStrokes()` for relative strokes off the low player, and
  - `getsStroke()` for the SI-based stroke-hole list.
- The preview is driven by current setup form state, so it updates before a
  round exists when player indexes, course rating, slope, par, SI, or a selected
  searched tee changes.
- Each named player now shows:
  - handicap index,
  - computed course handicap,
  - relative strokes (`Low` for the low course handicap), and
  - the stroke holes that will produce scorecard net dots.
- Manual course entry and searched tee selection both feed the same preview
  path.

Verification:

- `npm run test:run -- tests/screens/setup.test.ts` passed: 1 file, 10 tests.
- `node scripts/event-format-tests.js` passed.
- `npm run test:run` passed: 27 files, 197 tests.
- `npm run build` passed (vue-tsc clean).

Next likely tasks:

- Expand group roster persistence if online group setup should prefill players.
- Consider live course-search browser QA against the deployed Edge Function if
  safe to exercise.
- Continue toward all-time Stats or event realtime sync depending on priority.

## Checkpoint 34: Group Roster Source of Truth

Files changed since Checkpoint 33:

- Updated `src/stores/group.ts`.
- Updated `src/components/screens/GroupScreen.vue`.
- Updated `src/components/screens/SetupScreen.vue`.
- Added `tests/screens/group.test.ts`.
- Updated `tests/stores/group.test.ts`.
- Updated `tests/screens/setup.test.ts`.
- Updated `README.md` and this file.

What changed:

- Added group-store roster actions:
  - `saveGroup()`
  - `addPlayer(name, handicapIndex)`
  - `updatePlayer(originalName, name, handicapIndex)`
  - `removePlayer(name)`
- Roster changes normalize player objects, prevent duplicate names, persist to
  localStorage, remember the group, and update `groups.players` through
  `groupForDb()` when Supabase is configured and the group has a DB id.
- Group hub now renders a roster editor for active groups:
  - add player name + handicap index,
  - edit player name/index inline,
  - remove players,
  - keep the existing group name, new round, leave, and history sections.
- Setup now loads the active group on mount and pre-fills player rows from the
  group roster when one exists. Players are sorted by name and split evenly
  across Team 1 / Team 2.
- Setup roster edits remain round-local after prefill; changing a player in
  setup affects the new round's embedded player map but does not mutate the
  group roster.

Verification:

- `npm run test:run -- tests/stores/group.test.ts tests/screens/group.test.ts tests/screens/setup.test.ts`
  passed: 3 files, 26 tests.
- `node scripts/event-format-tests.js` passed.
- `npm run test:run` passed: 28 files, 203 tests.
- `npm run build` passed (vue-tsc clean).
- Browser/Playwright QA skipped by choice for this checkpoint; use automated
  tests/build as the reliable verification path.

Next likely tasks:

- Live Flow Reliability: add deterministic coverage around online create group,
  roster save, course selection, remote round start, scoring, results, and
  two-client merge behavior without relying on Playwright.
- Playing Groups + Mobile Scoring UX.

## Checkpoint 35: Live Flow Reliability

Files changed since Checkpoint 34:

- Added `tests/flows/online-flow.test.ts`.

What changed:

- Added a new `tests/flows/` directory with a pure store-level integration test
  covering the full online round lifecycle without any DOM mounting or Playwright.
- Tests cover:
  - **Group create online**: DB row id is reflected in the group store.
  - **Roster add online**: `addPlayer` dispatches an update to Supabase with the
    correct players payload.
  - **Round start online**: `startRound` with a group id inserts a rounds row,
    gets back the DB id, and opens the realtime channel.
  - **Score debounce sync**: `setScore` does not write immediately; after 600 ms
    the updated score matrix is pushed via `update`.
  - **Putt debounce sync**: same debounce path for `setPutt`.
  - **Completion sync**: `setCompleted(true)` schedules a sync that writes
    `completed: true` to Supabase.
  - **Two-client realtime merge**: local hole survives; remote holes from a
    different player or different hole index are applied; putts are merged
    identically.
  - **INSERT follow-the-leader**: a realtime INSERT event makes all group
    members switch to the new round (correct legacy behavior).
  - **UPDATE for wrong round id**: ignored; active round unchanged.
  - **Polling fallback**: `startPolling` fires every 10 s, fetches the rounds
    row, and merges scores without clobbering local extra cells.
  - **Join group with active round**: `joinGroup` populates the round store with
    scores from the active round row.
  - **Join group with no active round**: round store stays empty.
- Clarified INSERT semantics in a comment in the test: all group members follow
  a new INSERT, which is the correct group-sync design.

Verification:

- `node scripts/event-format-tests.js` passed.
- `npm run test:run` passed: 29 files, 217 tests.
- `npm run build` passed (vue-tsc clean).

Next likely tasks:

- Playing Groups + Mobile Scoring UX:
  - Setup controls for creating/editing playing groups.
  - Scorecard playing-group filter.
  - Mobile hole-by-hole score + putt entry mode.
  - Persist selected mobile hole using `dmi_mobile_hole_*` key.

## Checkpoint 36: Playing Groups + Mobile Scoring UX

Files changed since Checkpoint 35:

- Updated `src/components/screens/SetupScreen.vue`.
- Updated `src/components/screens/ScorecardScreen.vue`.
- Updated `tests/screens/setup.test.ts`.
- Updated `tests/screens/scorecard.test.ts`.
- Updated `README.md` and this file.

What changed:

**Setup — Playing Groups section:**
- Imported `autoPlayingGroupsFromPairMatches` and `normalizePlayingGroups` from
  `src/domain/playingGroups.ts`.
- Added `form.playingGroupNames` to hold user-supplied group name overrides.
- Added `previewPlayingGroups` computed: auto-derives groups from current pair
  matches, falling back to interleaved team order when no matches are configured.
- Added a "Playing Groups" section to the setup card (shown when ≥2 players are
  named): displays each auto-group's roster as chips and provides a text input
  for renaming.
- `buildRound()` now calls `normalizePlayingGroups` with the user name overrides
  and writes `playingGroups` into the new `RoundState`.

**Scorecard — Group filter:**
- Added `playingGroups` computed: uses defined groups from round state, falling
  back to team rows when none are set.
- Added `selectedGroupIndex` ref (−1 = all) driven by a `.group-filter` button
  row (visible only when >1 playing group exists).
- Added `filteredTeamRows` computed: filters player rows to only those in the
  selected group; team divider/scramble rows are only shown when the team has at
  least one visible player.
- The main table uses `filteredTeamRows` instead of `teamRows`.

**Scorecard — Mobile hole-by-hole mode:**
- Added `mobileMode` toggle button in the topbar ("Mobile" / "Full card").
- Mobile mode hides the wide table and shows a `.mobile-card` with:
  - Hole header (number, par, SI) with ← → navigation buttons.
  - Per-player row: name, course handicap, stroke dot, score stepper (− input +),
    and optional putt stepper when Putt Poker is enabled.
  - Hole strip: 18 numbered buttons for quick hole-jumping; filled holes are
    visually distinguished.
- `mobileHole` persists to `localStorage` under key
  `dmi_mobile_hole_<roundId|'local'>` and reloads on mount.
- `mobilePlayers` respects the active group filter.
- Score/putt steppers clamp at min 1 (scores) and 0 (putts).

Verification:

- `node scripts/event-format-tests.js` passed.
- `npm run test:run` passed: 29 files, 227 tests.
- `npm run build` passed (vue-tsc clean).

Next likely tasks:

- All-time Stats: derive per-player metrics from completed round snapshots.
- Event/tournament core: event store, group hub UI, event builder, round launch.

---

## Checkpoint 37 — All-time Stats

### What changed

- **`src/stores/stats.ts`** — New Pinia store. Queries all completed `rounds`
  rows for a group (same DB query as history), derives per-player metrics from
  `rounds.state.players` snapshots (not the current group roster), and exposes
  a sorted `PlayerStats[]` array.
  - Metrics: rounds played, avg gross score (1 dp), avg net score (1 dp),
    total skins won.
  - Rounds with no `course` in state are skipped gracefully.
  - `clear()` resets store; `loadedGroupId` tracks which group was last loaded.

- **`src/components/screens/GroupScreen.vue`** — Stats panel added below the
  history section (online-only, hidden when no data). `loadStats` is called
  alongside `loadHistory` on mount, group switch, and leave. Panel renders an
  `<table>` matching the history card style.

- **`tests/stores/stats.test.ts`** — 8 new tests covering: offline no-op, null
  groupId, DB error, single-round computation, multi-round accumulation, missing
  course skip, loadedGroupId tracking, and clear().

### Verification

- `node scripts/event-format-tests.js` passed.
- `npm run test:run` passed: 30 files, 235 tests.
- `npm run build` passed (vue-tsc clean).

### Next likely tasks

- Event/tournament core: event store, group hub UI, event builder, round launch.
- Event leaderboard + realtime standings.

---

## Checkpoint 38 — Event/Tournament Core

### What changed

- **`src/stores/event.ts`** — New Pinia event store.
  - `loadEvent(groupId)` fetches the active `events` row for a group.
  - `createEvent(groupId, name, playerNames)` inserts a new event using
    `defaultEventConfig` and stores it.
  - `saveEvent()` / `archiveEvent()` update the `events` row.
  - `setPendingRoundLink(roundIndex)` / `linkRound(roundId)` handle the
    launch-then-link flow: the round index is stashed before navigating to
    /setup; after `startRound` succeeds, `linkRound` writes the new round ID
    back into `config.rounds[N].roundId` and saves.
  - `updateRoundResult(roundIndex, team1, team2)` writes scored points back
    into the event config (consumed by the standings getter).
  - `standings` getter sums `pointsResult` across all rounds.
  - `roundsWithStatus` getter annotates each round with `linked: boolean`.

- **`src/components/screens/SetupScreen.vue`** — After `startRound` resolves,
  checks `event.pendingRoundLink` and calls `event.linkRound(created.id)` if
  set. Adds `useEventStore` import.

- **`src/components/screens/GroupScreen.vue`** — New "Team Event" section
  (online-only, above history). Shows create form when no event exists; shows
  event name, team rosters, live standings (pts – pts, X to win), and a round
  list with Launch / "Round linked" per round. Archive button removes the event.
  Loads/clears event store alongside history and stats on mount, group switch,
  and leave.

- **`tests/stores/event.test.ts`** — 18 new tests covering loadEvent
  (offline, null groupId, no-event, normalizes row, DB error), createEvent
  (offline, success, insert error), archiveEvent (no event, success), round link
  flow (setPending, clear, linkRound success/no-pending), standings getter, 
  updateRoundResult, and clear.

### Verification

- `node scripts/event-format-tests.js` passed.
- `npm run test:run` passed: 31 files, 253 tests.
- `npm run build` passed (vue-tsc clean).

### Next likely tasks

- Event leaderboard + realtime: subscribe to `events` table, recompute standings
  live from linked rounds as scores change.
- Event config editor: edit team assignments, round formats, points, pair matches.
- Production hardening / cutover.

---

## Checkpoint 39 — Event Leaderboard + Realtime

### What changed

- **`src/stores/event.ts`** — Extended with:
  - `cachedRounds: Record<string, CachedRound>` — stores `{ round, players }`
    keyed by round ID for all linked rounds.
  - `loadLinkedRounds()` — queries `rounds` where id IN (linked IDs) and
    populates `cachedRounds`. Safe to call repeatedly.
  - `subscribeToEvent(groupId)` — subscribes to Postgres changes on the
    `events` table filtered by `group_id`. On UPDATE: refreshes the local
    event config and calls `loadLinkedRounds`. On archived status: clears the
    event. Uses the same realtime pattern as the round store.
  - `stopEventSubscription()` — removes the channel; called by `clear()`.
  - `roundsWithStatus` getter gains a `cached: boolean` flag.
  - `linkedRoundIds` getter returns all non-null roundIds from config.

- **`src/composables/useEventLeaderboard.ts`** — New reactive composable.
  Accepts lazy getters for `EventConfig`, `cachedRounds`, the active round
  store state, and the active players map. Returns a `leaderboard` computed
  with `rounds[]`, `team1Total`, `team2Total`, `team1Name`, `team2Name`, and
  `winPoints`. Per-round: uses the live round store context when the linked
  round ID matches the active round (live updates as scores are entered),
  falls back to cached round state for completed rounds, and emits an empty
  placeholder for rounds with no data yet. For totals: prefers stored
  `pointsResult` when present (persisted across reloads), falls back to the
  live computed result.

- **`src/components/screens/GroupScreen.vue`** — `loadGroupData` helper now
  calls `loadLinkedRounds` and `subscribeToEvent` after loading the event.
  The event panel now renders the full leaderboard: live standings with a
  `leading` class on the ahead team, and per-round breakdown cards with a
  match-result table (Front/Back/Overall per pair, winner-highlighted cells).
  Launch button only shows on unlinked rounds.

- **`tests/composables/useEventLeaderboard.test.ts`** — 8 new composable
  tests covering: null config, no-data rounds, live round context, cached
  round context, stored-pointsResult override, multi-round totals, team
  names/winPoints, and reactivity to config changes.

- **`tests/stores/event.test.ts`** — 8 new subscription/cache tests covering:
  channel creation, remote event update applied, archived status clears event,
  stopEventSubscription removes channel, loadLinkedRounds populates cache,
  no-op when no linked IDs, and clear resets cachedRounds.

### Verification

- `node scripts/event-format-tests.js` passed.
- `npm run test:run` passed: 32 files, 267 tests.
- `npm run build` passed (vue-tsc clean).

### Next likely tasks

- Production hardening / cutover.
- Event config editor: team reassignment, round format/points/pair-match editing.

---

## Checkpoint 40 — Production hardening / cutover (2026-06-09)

### Summary

Completed the production hardening milestone. The rewrite is ready to be the
primary app for event day.

### Changes

- **`vercel.json`** — Added SPA rewrite rule: all routes fall back to
  `index.html` so `/group`, `/setup`, `/scorecard`, and `/results` work when
  hit directly or refreshed on Vercel.

- **`README.md`** — Added **Production / Event Day** section covering:
  - Hosting: Vercel rewrite branch, GitHub Pages legacy URL, push-to-deploy.
  - Schema migration steps for a fresh Supabase project.
  - Security notes on the broad anon RLS policies and the acceptable risk
    for a closed invite-style event. Notes the DELETE exposure and the
    mitigation if needed.
  - Event day flow (roster → round launch → live scoring → mark complete →
    archive).

- **Legacy references in `src/`** — Audited. All occurrences are inline
  comments documenting that a function or shape is a port of the
  corresponding `legacy/index.html` helper. No functional coupling to the
  legacy app exists in rewrite source. No changes required.

- **`vite.config.ts` base path** — Confirmed correct. The rewrite deploys to
  Vercel at the root path (`/`); no `base` override is needed.

### Verification

- `node scripts/event-format-tests.js` passed.
- `npm run test:run` passed: 32 files, 267 tests.
- `npm run build` passed (vue-tsc clean).

### Next likely tasks

- Event config editor: team reassignment, team name edits, round format /
  points / pair-match editing per round.
- Legacy cleanup: once the rewrite is confirmed primary on event day, archive
  or redirect `legacy/index.html` and the GitHub Pages main-branch URL.

---

## Checkpoint 41 — Event config editor (2026-06-09)

### Summary

Added inline event config editor to the group hub. Users can now edit the
event name, team names, team rosters, and per-round settings without
archiving and recreating the event.

### Changes

- **`src/components/EventConfigEditor.vue`** — New component. Receives the
  active `Event` and the group's `groupPlayers` list. Maintains a local
  deep-copy draft so edits are staged before save. Sections:
  - Event name and team names (text inputs).
  - Team rosters — each player on the left or right team has a → / ← button
    to move them across. Moving a player purges them from any pair-match
    slots in all rounds and recomputes playing groups.
  - Per-round accordion — one collapsible card per round. Fields: name,
    format (all five formats selectable), points (front/back/total, hidden
    for `twoManBestBallAggy` which uses its own 36-pt model), pair match
    builder (add/remove matches, two player slots per side via dropdowns,
    scoped to the correct team), skins (toggle + pot + gross/net), and putt
    poker (toggle + buy-in).
  - Save / Cancel actions. Save runs `normalizeEventConfig` on the draft
    before emitting, ensuring pair matches are valid for the current rosters.

- **`src/components/screens/GroupScreen.vue`** — Wired the editor:
  - Added `editingEvent` and `savingEvent` refs.
  - Event header now has an **Edit** button alongside Archive. Clicking
    toggles `editingEvent`; Cancel also clears it.
  - `EventConfigEditor` renders inline (below the header) when
    `editingEvent` is true.
  - The team roster display, standings, and round breakdown cards are hidden
    while the editor is open (no visual overlap).
  - `saveEventConfig(config, name)` mutates `eventStore.event` in place and
    calls `eventStore.saveEvent()`, then closes the editor.
  - Added `event-header-actions` CSS for the two-button header layout.

### Verification

- `node scripts/event-format-tests.js` passed.
- `npm run test:run` passed: 32 files, 267 tests.
- `npm run build` passed (vue-tsc clean).
- Dev server loaded with no console errors.

### Next likely tasks

- Test the editor end-to-end on Vercel with a live event.
- Event config editor: bet amounts (bestBallBet / scrambleBet) per round —
  currently not exposed in the editor.
- Manual winPoints override field if event organizer wants to set a custom
  win threshold.

---

## Checkpoint 42 — Story-of-round results summary (2026-06-11)

### Summary

Added a compact story-of-round card near the top of final results. The card is
display-only and derives from existing Results/Event data so it does not change
scoring logic.

### Changes

- **`src/components/screens/ResultsScreen.vue`** — Added a `roundStory`
  computed summary that renders immediately after the Results header.
  Depending on context, it shows:
  - Event round winner and round points for linked event rounds.
  - Team net winner/totals for normal rounds.
  - Top net player(s).
  - Skins leader when skins exist.
  - Biggest event match by point margin when event rows are available.
  - Top settlement payment when money games produce transfers.
- Added compact scoreboard styling for desktop and stacked mobile layouts.

- **`tests/screens/results.test.ts`** — Added coverage for the new summary in
  normal round results and linked event match-play results.

### Verification

- `npm run test:run -- tests/screens/results.test.ts` passed.
- `npm run test:run` passed: 37 files, 341 tests.
- `npm run build` passed (vue-tsc clean).
- Browser smoke on `/results` passed on desktop and 390px mobile viewport:
  story card rendered, no page-level horizontal overflow, no console errors.

### Next likely tasks

- Add longer event stats next: holes won, pair records, clutch holes, and
  transparent MVP-style callouts if the data is reliable.

---

## Checkpoint 43 — Event leader stat expansion (2026-06-11)

### Summary

Expanded the Event leaders section on the group dashboard with two more
transparent stats derived from existing linked-round event results.

### Changes

- **`src/components/screens/GroupScreen.vue`** — Event leaders now include:
  - **Holes won** from match-play event components, excluding Overall so
    Front/Back hole wins are not double-counted.
  - **Best pair record** from each scored event match row's overall winner,
    displayed as wins-losses-pushes.
- The leader-card grid now uses responsive `auto-fit` tracks so three, five,
  or future cards fit cleanly without forcing a fixed column count.

- **`tests/screens/group.test.ts`** — Added assertions for Holes won and Best
  pair record in the existing scored event dashboard fixture.

- **`README.md`** — Updated the event dashboard description to list the
  expanded Event leaders stats.

### Verification

- `npm run test:run -- tests/screens/group.test.ts` passed.
- `npm run test:run` passed: 37 files, 341 tests.
- `npm run build` passed (vue-tsc clean).
- Browser smoke on `/group` passed in local offline mode: route rendered, no
  page-level horizontal overflow, no console errors. Event leader cards are
  covered by the focused Group screen test because the local browser has no
  Supabase-backed event fixture.

### Next likely tasks

- Add clutch holes / most valuable match callouts if the scoring output exposes
  a clear and explainable definition.

---

## Checkpoint 44 — Most valuable match event leader (2026-06-11)

### Summary

Added a display-only Most valuable match card to the group dashboard's Event
leaders section. The callout uses existing linked-round event rows and ranks
the scored match with the largest event-point margin.

### Changes

- **`src/components/screens/GroupScreen.vue`** — Event leaders now include
  **Most valuable match**, showing the winning pair and the match's event-point
  result with round/match context.
- **`tests/screens/group.test.ts`** — Added coverage for the new leader-card
  label in the scored event dashboard fixture.
- **`README.md`** — Updated the event dashboard description to list the new
  callout.

### Verification

- `npm run test:run -- tests/screens/group.test.ts` passed.
- `npm run test:run` passed: 37 files, 341 tests.
- `npm run build` passed (vue-tsc clean).
- Browser smoke on `/group` passed in local offline mode: route rendered, no
  page-level horizontal overflow, no console errors. Event leader cards are
  covered by the focused Group screen test because the local browser has no
  Supabase-backed event fixture.

### Next likely tasks

- Leave clutch holes / closing points deferred unless a clear, reliable
  definition emerges from existing result data.
